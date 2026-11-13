use tiny_skia::{
    FillRule, LineCap, LineJoin, Mask, PathBuilder, Pixmap, Rect, Stroke, StrokeDash, Transform,
};

use crate::glyphs::{Canvas, FontStack, TextPaint, draw_text};
use crate::mvt::{GeometryType, Tile};
use crate::style::{Dot, Font, Layer, Paint, Placement as LabelPlacement, Rgba, Theme};

pub const TILE_SIZE: f64 = 512.0;
pub const MAX_TILE_ZOOM: u32 = 15;
const MAX_LATITUDE: f64 = 85.051_128_779_806_59;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Camera {
    pub longitude: f64,
    pub latitude: f64,
    pub zoom: f64,
    pub width: u32,
    pub height: u32,
    pub pixel_ratio: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TileId {
    pub z: u32,
    pub x: u32,
    pub y: u32,
}

pub fn mercator_x(longitude: f64) -> f64 {
    (longitude + 180.0) / 360.0
}

pub fn mercator_y(latitude: f64) -> f64 {
    let latitude = latitude.clamp(-MAX_LATITUDE, MAX_LATITUDE).to_radians();
    (1.0 - (latitude.tan() + 1.0 / latitude.cos()).ln() / std::f64::consts::PI) / 2.0
}

pub struct Placement {
    pub id: TileId,
    pub left: f64,
    pub top: f64,
    pub size: f64,
}

impl Camera {
    pub fn for_tile(id: TileId, pixel_ratio: f32) -> Camera {
        let count = f64::from(1_u32 << id.z);
        let longitude = (f64::from(id.x) + 0.5) / count * 360.0 - 180.0;
        let y = (f64::from(id.y) + 0.5) / count;
        let latitude = (std::f64::consts::PI * (1.0 - 2.0 * y))
            .sinh()
            .atan()
            .to_degrees();
        Camera {
            longitude,
            latitude,
            zoom: f64::from(id.z),
            width: TILE_SIZE as u32,
            height: TILE_SIZE as u32,
            pixel_ratio,
        }
    }

    pub fn tile_zoom(&self) -> u32 {
        (self.zoom.floor().max(0.0) as u32).min(MAX_TILE_ZOOM)
    }

    fn world_size(&self) -> f64 {
        TILE_SIZE * 2f64.powf(self.zoom)
    }

    fn origin(&self) -> (f64, f64) {
        let world = self.world_size();
        (
            mercator_x(self.longitude) * world - f64::from(self.width) / 2.0,
            mercator_y(self.latitude) * world - f64::from(self.height) / 2.0,
        )
    }

    pub fn project(&self, longitude: f64, latitude: f64) -> (f64, f64) {
        let world = self.world_size();
        let (left, top) = self.origin();
        let mut x = mercator_x(longitude) * world - left;
        let center = f64::from(self.width) / 2.0;
        if x - center > world / 2.0 {
            x -= world;
        } else if center - x > world / 2.0 {
            x += world;
        }
        (x, mercator_y(latitude) * world - top)
    }

    pub fn tiles(&self, margin: f64) -> Vec<Placement> {
        let z = self.tile_zoom();
        let count = 1_u32 << z;
        let size = TILE_SIZE * 2f64.powf(self.zoom - f64::from(z));
        let (left, top) = self.origin();
        let epsilon = 1e-6;
        let first_column = ((left - margin) / size + epsilon).floor() as i64;
        let last_column = ((left + f64::from(self.width) + margin) / size - epsilon).floor() as i64;
        let first_row = ((top - margin) / size + epsilon).floor().max(0.0) as i64;
        let last_row = ((top + f64::from(self.height) + margin) / size - epsilon)
            .floor()
            .min(f64::from(count - 1)) as i64;
        let mut tiles = Vec::new();
        for row in first_row..=last_row {
            for column in first_column..=last_column {
                tiles.push(Placement {
                    id: TileId {
                        z,
                        x: column.rem_euclid(i64::from(count)) as u32,
                        y: row as u32,
                    },
                    left: column as f64 * size - left,
                    top: row as f64 * size - top,
                    size,
                });
            }
        }
        tiles
    }
}

pub struct Fonts {
    pub regular: FontStack,
    pub medium: FontStack,
    pub italic: FontStack,
}

impl Fonts {
    fn get(&self, font: Font) -> &FontStack {
        let preferred = match font {
            Font::Regular => &self.regular,
            Font::Medium => &self.medium,
            Font::Italic => &self.italic,
        };
        if preferred.is_empty() {
            &self.regular
        } else {
            preferred
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Marker {
    pub longitude: f64,
    pub latitude: f64,
    pub radius: f32,
    pub fill: Rgba,
    pub stroke: Rgba,
    pub stroke_width: f32,
    pub label: Option<String>,
    pub label_color: Rgba,
}

pub struct Scene<'a> {
    pub camera: Camera,
    pub theme: &'a Theme,
    pub tiles: &'a [(TileId, Tile<'a>)],
    pub fonts: Option<&'a Fonts>,
    pub markers: &'a [Marker],
}

fn paint(color: Rgba) -> tiny_skia::Paint<'static> {
    let mut paint = tiny_skia::Paint::default();
    paint.set_color_rgba8(color[0], color[1], color[2], color[3]);
    paint.anti_alias = true;
    paint
}

#[derive(Clone, Copy)]
struct Bounds {
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
}

impl Bounds {
    fn overlaps(&self, other: &Bounds) -> bool {
        self.left < other.right
            && other.left < self.right
            && self.top < other.bottom
            && other.top < self.bottom
    }

    fn contains(&self, other: &Bounds) -> bool {
        other.left >= self.left
            && other.top >= self.top
            && other.right <= self.right
            && other.bottom <= self.bottom
    }
}

fn find<'s, 'a>(scene: &'s Scene<'a>, id: TileId) -> Option<&'s Tile<'a>> {
    scene
        .tiles
        .iter()
        .find(|(tile_id, _)| *tile_id == id)
        .map(|(_, tile)| tile)
}

pub fn render(scene: &Scene) -> Option<Pixmap> {
    let camera = scene.camera;
    let ratio = camera.pixel_ratio;
    let width = (camera.width as f32 * ratio).round() as u32;
    let height = (camera.height as f32 * ratio).round() as u32;
    let mut pixmap = Pixmap::new(width, height)?;
    let background = scene.theme.background;
    pixmap.fill(tiny_skia::Color::from_rgba8(
        background[0],
        background[1],
        background[2],
        background[3],
    ));
    let zoom = camera.zoom as f32;
    let placements = camera.tiles(0.0);
    let active: Vec<&Layer> = scene
        .theme
        .layers
        .iter()
        .filter(|layer| zoom >= layer.min_zoom && zoom < layer.max_zoom)
        .collect();
    let mut clip = Mask::new(width, height)?;
    for segment in active.split_inclusive(|layer| matches!(layer.paint, Paint::ShoreShade { .. })) {
        for placement in &placements {
            let Some(tile) = find(scene, placement.id) else {
                continue;
            };
            set_clip(&mut clip, placement, ratio);
            for layer in segment {
                if !matches!(layer.paint, Paint::ShoreShade { .. }) {
                    draw_layer(&mut pixmap, &clip, tile, layer, placement, zoom, ratio);
                }
            }
        }
        if let Some(Layer {
            paint:
                Paint::ShoreShade {
                    color,
                    radius,
                    land_layer,
                },
            source_layer,
            filter,
            ..
        }) = segment.last().copied()
        {
            shore_shade(
                &mut pixmap,
                scene,
                source_layer,
                land_layer,
                *filter,
                *color,
                *radius * ratio,
            );
        }
    }
    if let Some(fonts) = scene.fonts {
        draw_labels(scene, fonts, &mut pixmap);
    }
    draw_markers(scene, &mut pixmap);
    Some(pixmap)
}

fn set_clip(clip: &mut Mask, placement: &Placement, ratio: f32) {
    clip.data_mut().fill(0);
    let left = (placement.left as f32 * ratio).round();
    let top = (placement.top as f32 * ratio).round();
    let right = ((placement.left + placement.size) as f32 * ratio).round();
    let bottom = ((placement.top + placement.size) as f32 * ratio).round();
    if let Some(rect) = Rect::from_ltrb(left, top, right, bottom) {
        clip.fill_path(
            &PathBuilder::from_rect(rect),
            FillRule::Winding,
            false,
            Transform::identity(),
        );
    }
}

fn tile_paths(
    tile: &Tile,
    source_layer: &str,
    placement: &Placement,
    ratio: f32,
    mut accept: impl FnMut(&crate::mvt::Properties, GeometryType) -> Option<Rgba>,
) -> Vec<(Rgba, PathBuilder)> {
    let mut batches: Vec<(Rgba, PathBuilder)> = Vec::new();
    let Some(source) = tile.layer(source_layer) else {
        return batches;
    };
    let scale = (placement.size / f64::from(source.extent)) as f32 * ratio;
    let (offset_x, offset_y) = (placement.left as f32 * ratio, placement.top as f32 * ratio);
    for feature in &source.features {
        let properties = source.properties(feature);
        let Some(color) = accept(&properties, feature.geometry_type) else {
            continue;
        };
        let index = match batches.iter().position(|(existing, _)| *existing == color) {
            Some(index) => index,
            None => {
                batches.push((color, PathBuilder::new()));
                batches.len() - 1
            }
        };
        let builder = &mut batches[index].1;
        let _ = feature.for_each_path(|path, closed| {
            let mut points = path
                .iter()
                .map(|[x, y]| (offset_x + x * scale, offset_y + y * scale));
            if let Some((x, y)) = points.next() {
                builder.move_to(x, y);
                for (x, y) in points {
                    builder.line_to(x, y);
                }
                if closed {
                    builder.close();
                }
            }
        });
    }
    batches
}

fn draw_layer(
    pixmap: &mut Pixmap,
    clip: &Mask,
    tile: &Tile,
    layer: &Layer,
    placement: &Placement,
    zoom: f32,
    ratio: f32,
) {
    let batches = tile_paths(
        tile,
        layer.source_layer,
        placement,
        ratio,
        |properties, geometry| {
            if !(layer.filter)(properties, geometry) {
                return None;
            }
            match layer.paint {
                Paint::Fill { color } => color(properties, zoom),
                Paint::Line { color, .. } => Some(color),
                Paint::ShoreShade { .. } => None,
            }
        },
    );
    for (color, builder) in batches {
        let Some(path) = builder.finish() else {
            continue;
        };
        match layer.paint {
            Paint::Fill { .. } => {
                pixmap.fill_path(
                    &path,
                    &paint(color),
                    FillRule::Winding,
                    Transform::identity(),
                    Some(clip),
                );
            }
            Paint::Line { width, dash, .. } => {
                let line_width = width.at(zoom);
                if line_width <= 0.05 {
                    continue;
                }
                let stroke_width = line_width * ratio;
                let stroke = Stroke {
                    width: stroke_width,
                    line_cap: if dash.is_some() {
                        LineCap::Butt
                    } else {
                        LineCap::Round
                    },
                    line_join: LineJoin::Round,
                    dash: dash.and_then(|(on, off)| {
                        StrokeDash::new(
                            vec![on * stroke_width.max(ratio), off * stroke_width.max(ratio)],
                            0.0,
                        )
                    }),
                    ..Stroke::default()
                };
                pixmap.stroke_path(
                    &path,
                    &paint(color),
                    &stroke,
                    Transform::identity(),
                    Some(clip),
                );
            }
            Paint::ShoreShade { .. } => {}
        }
    }
}

fn box_blur(values: &mut [u8], width: usize, height: usize, radius: usize) {
    if radius == 0 {
        return;
    }
    let mut scratch = vec![0_u8; values.len()];
    let window = (2 * radius + 1) as u32;
    for _ in 0..3 {
        for row in 0..height {
            let line = &values[row * width..(row + 1) * width];
            let out = &mut scratch[row * width..(row + 1) * width];
            let mut sum: u32 = (0..=radius)
                .map(|i| u32::from(line[i.min(width - 1)]))
                .sum::<u32>()
                + radius as u32 * u32::from(line[0]);
            for column in 0..width {
                out[column] = (sum / window) as u8;
                let add = line[(column + radius + 1).min(width - 1)];
                let remove = line[column.saturating_sub(radius)];
                sum = sum + u32::from(add) - u32::from(remove);
            }
        }
        for column in 0..width {
            let at = |row: usize| scratch[row.min(height - 1) * width + column];
            let mut sum: u32 = (0..=radius).map(|i| u32::from(at(i))).sum::<u32>()
                + radius as u32 * u32::from(at(0));
            for row in 0..height {
                values[row * width + column] = (sum / window) as u8;
                let add = at(row + radius + 1);
                let remove = at(row.saturating_sub(radius));
                sum = sum + u32::from(add) - u32::from(remove);
            }
        }
    }
}

fn shore_shade(
    pixmap: &mut Pixmap,
    scene: &Scene,
    source_layer: &str,
    land_layer: &str,
    filter: crate::style::Filter,
    color: Rgba,
    radius: f32,
) {
    let (width, height) = (pixmap.width(), pixmap.height());
    let Some(mut water) = Mask::new(width, height) else {
        return;
    };
    let Some(mut land) = Mask::new(width, height) else {
        return;
    };
    let ratio = scene.camera.pixel_ratio;
    let mut any_land = false;
    for placement in scene.camera.tiles(TILE_SIZE / 4.0) {
        let Some(tile) = find(scene, placement.id) else {
            continue;
        };
        let batches = tile_paths(
            tile,
            source_layer,
            &placement,
            ratio,
            |properties, geometry| filter(properties, geometry).then_some([0, 0, 0, 255]),
        );
        for (_, builder) in batches {
            if let Some(path) = builder.finish() {
                water.fill_path(&path, FillRule::Winding, true, Transform::identity());
            }
        }
        let batches = tile_paths(tile, land_layer, &placement, ratio, |_, geometry| {
            (geometry == GeometryType::Polygon).then_some([0, 0, 0, 255])
        });
        for (_, builder) in batches {
            if let Some(path) = builder.finish() {
                any_land = true;
                land.fill_path(&path, FillRule::Winding, true, Transform::identity());
            }
        }
    }
    if any_land {
        for (water_value, land_value) in water.data_mut().iter_mut().zip(land.data()) {
            *water_value = (*water_value).max(255 - land_value);
        }
    }
    let coverage = water.data().to_vec();
    if coverage.iter().all(|value| *value == 0) {
        return;
    }
    let mut blurred = coverage.clone();
    box_blur(
        &mut blurred,
        width as usize,
        height as usize,
        (radius / 2.0).round().max(1.0) as usize,
    );
    let data = pixmap.data_mut();
    let strength = f32::from(color[3]) / 255.0;
    for index in 0..coverage.len() {
        let inside = f32::from(coverage[index]) / 255.0;
        if inside == 0.0 {
            continue;
        }
        let depth = f32::from(blurred[index]) / 255.0;
        let shade = ((1.0 - depth) * 2.0).clamp(0.0, 1.0);
        let alpha = shade * shade * inside * strength;
        if alpha <= 0.0 {
            continue;
        }
        let pixel = &mut data[index * 4..index * 4 + 4];
        for channel in 0..3 {
            let value =
                f32::from(color[channel]) * alpha + f32::from(pixel[channel]) * (1.0 - alpha);
            pixel[channel] = value.round() as u8;
        }
    }
}

struct Candidate<'a> {
    text: String,
    x: f32,
    y: f32,
    size: f32,
    font: &'a FontStack,
    color: Rgba,
    rule: usize,
    priority: f32,
}

const SMALL_MARKER_RADIUS: f32 = 8.0;
const LANDMARK_PRIORITY: f32 = -50.0;

fn marker_bounds(scene: &Scene, small: bool) -> Vec<Bounds> {
    scene
        .markers
        .iter()
        .filter(|marker| (marker.radius < SMALL_MARKER_RADIUS) == small)
        .map(|marker| {
            let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
            let reach = marker.radius + marker.stroke_width + 2.0;
            Bounds {
                left: x as f32 - reach,
                top: y as f32 - reach,
                right: x as f32 + reach,
                bottom: y as f32 + reach,
            }
        })
        .collect()
}

fn shield_points(
    path: &[[f32; 2]],
    scale: f32,
    spacing: f32,
    extent: f32,
    mut visit: impl FnMut(f32, f32),
) {
    let mut travelled = 0.0;
    let mut next = spacing / 2.0;
    for pair in path.windows(2) {
        let ([x0, y0], [x1, y1]) = (pair[0], pair[1]);
        let length = ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt() * scale;
        while length > 0.0 && travelled + length >= next {
            let progress = (next - travelled) / length;
            let (x, y) = (x0 + (x1 - x0) * progress, y0 + (y1 - y0) * progress);
            if x >= 0.0 && y >= 0.0 && x < extent && y < extent {
                visit(x, y);
            }
            next += spacing;
        }
        travelled += length;
    }
}

fn draw_labels(scene: &Scene, fonts: &Fonts, pixmap: &mut Pixmap) {
    let camera = scene.camera;
    let zoom = camera.zoom as f32;
    let ratio = camera.pixel_ratio;
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mut canvas = Canvas {
        data: pixmap.data_mut(),
        width,
        height,
    };
    let large_markers = marker_bounds(scene, false);
    let small_markers = marker_bounds(scene, true);
    for placement in camera.tiles(0.0) {
        let Some(tile) = find(scene, placement.id) else {
            continue;
        };
        let cell = Bounds {
            left: placement.left as f32,
            top: placement.top as f32,
            right: (placement.left + placement.size) as f32,
            bottom: (placement.top + placement.size) as f32,
        };
        let mut candidates: Vec<Candidate> = Vec::new();
        for (rule_index, rule) in scene.theme.labels.iter().enumerate() {
            if zoom < rule.min_zoom || zoom >= rule.max_zoom {
                continue;
            }
            let Some(source) = tile.layer(rule.source_layer) else {
                continue;
            };
            let scale = placement.size / f64::from(source.extent);
            let extent = source.extent as f32;
            for feature in &source.features {
                let shield = matches!(rule.placement, LabelPlacement::Shield { .. });
                let wanted = if shield {
                    GeometryType::Line
                } else {
                    GeometryType::Point
                };
                if feature.geometry_type != wanted {
                    continue;
                }
                let properties = source.properties(feature);
                if !(rule.filter)(&properties, zoom) {
                    continue;
                }
                let Some(text) = (rule.text)(&properties) else {
                    continue;
                };
                let text = if rule.uppercase {
                    text.to_uppercase()
                } else {
                    text
                };
                let size = (rule.size)(&properties, zoom);
                let font = fonts.get((rule.font)(&properties));
                let color = (rule.color)(&properties);
                let priority = (rule.priority)(&properties);
                let mut push = |x: f32, y: f32| {
                    candidates.push(Candidate {
                        text: text.clone(),
                        x: (placement.left + f64::from(x) * scale) as f32,
                        y: (placement.top + f64::from(y) * scale) as f32,
                        size,
                        font,
                        color,
                        rule: rule_index,
                        priority,
                    });
                };
                if let LabelPlacement::Shield { spacing, .. } = rule.placement {
                    let _ = feature.for_each_path(|path, _| {
                        shield_points(path, scale as f32, spacing, extent, &mut push)
                    });
                } else {
                    let Some([x, y]) = feature.first_point() else {
                        continue;
                    };
                    if x < 0.0 || y < 0.0 || x >= extent || y >= extent {
                        continue;
                    }
                    push(x, y);
                }
            }
        }
        candidates.sort_by(|a, b| {
            a.priority
                .total_cmp(&b.priority)
                .then_with(|| a.text.cmp(&b.text))
        });
        let mut placed: Vec<Bounds> = large_markers
            .iter()
            .copied()
            .filter(|bounds| bounds.overlaps(&cell))
            .collect();
        let small: Vec<Bounds> = small_markers
            .iter()
            .copied()
            .filter(|bounds| bounds.overlaps(&cell))
            .collect();
        let mut shields: Vec<(String, f32, f32)> = Vec::new();
        let mut landmarks = true;
        for candidate in candidates {
            if landmarks && candidate.priority >= LANDMARK_PRIORITY {
                landmarks = false;
                placed.extend_from_slice(&small);
            }
            place_label(
                scene,
                &mut canvas,
                &cell,
                &mut placed,
                &mut shields,
                candidate,
                zoom,
                ratio,
            );
        }
    }
}

const SHIELD_PADDING_X: f32 = 4.0;
const SHIELD_HEIGHT: f32 = 14.0;

#[allow(clippy::too_many_arguments)]
fn place_label(
    scene: &Scene,
    canvas: &mut Canvas,
    cell: &Bounds,
    placed: &mut Vec<Bounds>,
    shields: &mut Vec<(String, f32, f32)>,
    candidate: Candidate,
    zoom: f32,
    ratio: f32,
) {
    if candidate.size <= 1.0 {
        return;
    }
    let rule = &scene.theme.labels[candidate.rule];
    let letter_spacing = rule.letter_spacing;
    let text_width = candidate
        .font
        .measure(&candidate.text, candidate.size, letter_spacing)
        - letter_spacing * candidate.size;
    let text_height = candidate.size * 1.15;
    let padding = rule.padding;

    if let LabelPlacement::Shield {
        fill,
        stroke,
        spacing,
    } = rule.placement
    {
        if shields.iter().any(|(text, x, y)| {
            *text == candidate.text && (x - candidate.x).hypot(y - candidate.y) < spacing * 0.9
        }) {
            return;
        }
        let box_width = (text_width + SHIELD_PADDING_X * 2.0).max(SHIELD_HEIGHT + 2.0);
        let left = candidate.x - box_width / 2.0;
        let top = candidate.y - SHIELD_HEIGHT / 2.0;
        let shape = Bounds {
            left,
            top,
            right: left + box_width,
            bottom: top + SHIELD_HEIGHT,
        };
        let bounds = Bounds {
            left: left - padding,
            top: top - padding,
            right: shape.right + padding,
            bottom: shape.bottom + padding,
        };
        if !cell.contains(&shape) || placed.iter().any(|other| other.overlaps(&bounds)) {
            return;
        }
        placed.push(bounds);
        shields.push((candidate.text.clone(), candidate.x, candidate.y));
        draw_round_rect(canvas, shape, 3.5, fill, stroke, 1.0, ratio);
        let baseline = candidate.y + candidate.size * 0.36;
        draw_text(
            canvas,
            candidate.font,
            &candidate.text,
            (candidate.x - text_width / 2.0) * ratio,
            baseline * ratio,
            candidate.size * ratio,
            letter_spacing,
            TextPaint {
                color: candidate.color,
                halo: [0, 0, 0, 0],
                halo_width: 0.0,
            },
        );
        return;
    }

    let dot = rule
        .dot
        .filter(|(_, below)| zoom < *below)
        .map(|(dot, _)| dot);
    let gap = dot.map_or(0.0, |dot| dot.radius + dot.stroke_width + 3.0);
    let area = rule.placement == LabelPlacement::Area;
    let anchors: &[(f32, f32)] = if dot.is_some() {
        &[(1.0, 0.0), (-1.0, 0.0), (0.0, -1.0), (0.0, 1.0)]
    } else if area {
        &[(0.0, 0.0)]
    } else {
        &[(0.0, 0.0), (0.0, -1.0), (0.0, 1.0), (1.0, 0.0), (-1.0, 0.0)]
    };
    let gap = if dot.is_some() {
        gap
    } else {
        text_height * 2.2
    };
    let mut chosen = None;
    for &(direction_x, direction_y) in anchors {
        let mut left = match direction_x {
            1.0 => candidate.x + gap,
            -1.0 => candidate.x - gap - text_width,
            _ => candidate.x - text_width / 2.0,
        };
        let mut top = match direction_y {
            1.0 => candidate.y + gap,
            -1.0 => candidate.y - gap - text_height,
            _ => candidate.y - text_height / 2.0,
        };
        if dot.is_none() && direction_x != 0.0 {
            top = candidate.y - text_height / 2.0;
        }
        if area {
            let inner = Bounds {
                left: cell.left + padding,
                top: cell.top + padding,
                right: cell.right - padding,
                bottom: cell.bottom - padding,
            };
            let shift_x = (inner.left - left).max(0.0) - (left + text_width - inner.right).max(0.0);
            let shift_y = (inner.top - top).max(0.0) - (top + text_height - inner.bottom).max(0.0);
            if shift_x.abs() <= text_width / 2.0 && shift_y.abs() <= text_height {
                left += shift_x;
                top += shift_y;
            }
        }
        let bounds = Bounds {
            left: left - padding,
            top: top - padding,
            right: left + text_width + padding,
            bottom: top + text_height + padding,
        };
        let mut footprint = Bounds {
            left,
            top,
            right: left + text_width,
            bottom: top + text_height,
        };
        if dot.is_some() {
            footprint.left = footprint.left.min(candidate.x - gap);
            footprint.right = footprint.right.max(candidate.x + gap);
            footprint.top = footprint.top.min(candidate.y - gap);
            footprint.bottom = footprint.bottom.max(candidate.y + gap);
        }
        if cell.contains(&footprint) && !placed.iter().any(|other| other.overlaps(&bounds)) {
            chosen = Some((left, top, bounds));
            break;
        }
    }
    let Some((left, top, bounds)) = chosen else {
        return;
    };
    placed.push(bounds);
    if let Some(dot) = dot {
        let reach = dot.radius + dot.stroke_width;
        placed.push(Bounds {
            left: candidate.x - reach,
            top: candidate.y - reach,
            right: candidate.x + reach,
            bottom: candidate.y + reach,
        });
        draw_dot(canvas, candidate.x * ratio, candidate.y * ratio, dot, ratio);
    }
    let baseline = top + candidate.size * 0.88;
    draw_text(
        canvas,
        candidate.font,
        &candidate.text,
        left * ratio,
        baseline * ratio,
        candidate.size * ratio,
        letter_spacing,
        TextPaint {
            color: candidate.color,
            halo: rule.halo,
            halo_width: rule.halo_width * ratio,
        },
    );
}

fn draw_round_rect(
    canvas: &mut Canvas,
    shape: Bounds,
    radius: f32,
    fill: Rgba,
    stroke: Rgba,
    stroke_width: f32,
    ratio: f32,
) {
    let (left, top, right, bottom) = (
        shape.left * ratio,
        shape.top * ratio,
        shape.right * ratio,
        shape.bottom * ratio,
    );
    let radius = radius * ratio;
    let border = stroke_width * ratio;
    let (center_x, center_y) = ((left + right) / 2.0, (top + bottom) / 2.0);
    let (half_width, half_height) = ((right - left) / 2.0 - radius, (bottom - top) / 2.0 - radius);
    for row in (top - 1.0).floor() as i32..=(bottom + 1.0).ceil() as i32 {
        for column in (left - 1.0).floor() as i32..=(right + 1.0).ceil() as i32 {
            let dx = ((column as f32 + 0.5 - center_x).abs() - half_width).max(0.0);
            let dy = ((row as f32 + 0.5 - center_y).abs() - half_height).max(0.0);
            let distance = dx.hypot(dy) - radius;
            blend_into(
                canvas,
                column,
                row,
                stroke,
                (0.5 - distance).clamp(0.0, 1.0),
            );
            blend_into(
                canvas,
                column,
                row,
                fill,
                (0.5 - distance - border).clamp(0.0, 1.0),
            );
        }
    }
}

fn draw_dot(canvas: &mut Canvas, x: f32, y: f32, dot: Dot, ratio: f32) {
    let inner = dot.radius * ratio;
    let outer = (dot.radius + dot.stroke_width) * ratio;
    for row in (y - outer - 1.0).floor() as i32..=(y + outer + 1.0).ceil() as i32 {
        for column in (x - outer - 1.0).floor() as i32..=(x + outer + 1.0).ceil() as i32 {
            let distance =
                ((column as f32 + 0.5 - x).powi(2) + (row as f32 + 0.5 - y).powi(2)).sqrt();
            blend_into(
                canvas,
                column,
                row,
                dot.stroke,
                (outer - distance + 0.5).clamp(0.0, 1.0),
            );
            blend_into(
                canvas,
                column,
                row,
                dot.fill,
                (inner - distance + 0.5).clamp(0.0, 1.0),
            );
        }
    }
}

fn blend_into(canvas: &mut Canvas, x: i32, y: i32, color: Rgba, coverage: f32) {
    if x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || coverage <= 0.0 {
        return;
    }
    let alpha = coverage * f32::from(color[3]) / 255.0;
    let index = ((y * canvas.width + x) * 4) as usize;
    let pixel = &mut canvas.data[index..index + 4];
    for (channel, value) in pixel.iter_mut().take(3).enumerate() {
        *value =
            (f32::from(color[channel]) * alpha + f32::from(*value) * (1.0 - alpha)).round() as u8;
    }
    pixel[3] = (alpha * 255.0 + f32::from(pixel[3]) * (1.0 - alpha)).round() as u8;
}

fn draw_markers(scene: &Scene, pixmap: &mut Pixmap) {
    let ratio = scene.camera.pixel_ratio;
    let style = &scene.theme.markers;
    for marker in scene.markers {
        let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
        let (x, y) = (x as f32 * ratio, y as f32 * ratio);
        let outer = (marker.radius + marker.stroke_width / 2.0) * ratio;
        draw_shadow(
            pixmap,
            x,
            y + style.shadow_offset * ratio,
            outer,
            style.shadow,
            style.shadow_blur * ratio,
        );
        let Some(circle) = PathBuilder::from_circle(x, y, marker.radius * ratio) else {
            continue;
        };
        pixmap.fill_path(
            &circle,
            &paint(marker.fill),
            FillRule::Winding,
            Transform::identity(),
            None,
        );
        if marker.stroke_width > 0.0 {
            let stroke = Stroke {
                width: marker.stroke_width * ratio,
                ..Stroke::default()
            };
            pixmap.stroke_path(
                &circle,
                &paint(marker.stroke),
                &stroke,
                Transform::identity(),
                None,
            );
        }
    }
    let Some(fonts) = scene.fonts else { return };
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mut canvas = Canvas {
        data: pixmap.data_mut(),
        width,
        height,
    };
    for marker in scene.markers {
        let Some(label) = &marker.label else { continue };
        let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
        let size = 12.0;
        let font = fonts.get(Font::Medium);
        let text_width = font.measure(label, size, 0.0);
        draw_text(
            &mut canvas,
            font,
            label,
            (x as f32 - text_width / 2.0) * ratio,
            (y as f32 + size * 0.36) * ratio,
            size * ratio,
            0.0,
            TextPaint {
                color: marker.label_color,
                halo: [0, 0, 0, 0],
                halo_width: 0.0,
            },
        );
    }
}

fn draw_shadow(pixmap: &mut Pixmap, x: f32, y: f32, radius: f32, color: Rgba, blur: f32) {
    let reach = radius + blur * 2.0;
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let data = pixmap.data_mut();
    let base = f32::from(color[3]) / 255.0;
    for row in (y - reach).floor() as i32..=(y + reach).ceil() as i32 {
        for column in (x - reach).floor() as i32..=(x + reach).ceil() as i32 {
            if column < 0 || row < 0 || column >= width || row >= height {
                continue;
            }
            let distance =
                ((column as f32 + 0.5 - x).powi(2) + (row as f32 + 0.5 - y).powi(2)).sqrt();
            let falloff = 1.0 - ((distance - (radius - blur)) / (blur * 2.0)).clamp(0.0, 1.0);
            let alpha = base * falloff * falloff;
            if alpha <= 0.0 {
                continue;
            }
            let index = ((row * width + column) * 4) as usize;
            for channel in 0..3 {
                let value = f32::from(color[channel]) * alpha
                    + f32::from(data[index + channel]) * (1.0 - alpha);
                data[index + channel] = value.round() as u8;
            }
        }
    }
}

/// Merges markers closer than `distance` CSS pixels into one count bubble.
pub fn cluster(camera: &Camera, markers: &[Marker], distance: f32) -> Vec<Marker> {
    struct Group {
        x: f64,
        y: f64,
        longitude: f64,
        latitude: f64,
        members: Vec<usize>,
    }
    let mut cells: std::collections::HashMap<(i64, i64), Vec<usize>> =
        std::collections::HashMap::new();
    let mut groups: Vec<Group> = Vec::new();
    let reach = f64::from(distance);
    for (index, marker) in markers.iter().enumerate() {
        let (x, y) = camera.project(marker.longitude, marker.latitude);
        let cell = ((x / reach).floor() as i64, (y / reach).floor() as i64);
        let mut joined = None;
        'search: for row in cell.1 - 1..=cell.1 + 1 {
            for column in cell.0 - 1..=cell.0 + 1 {
                for &group_index in cells.get(&(column, row)).into_iter().flatten() {
                    let group = &groups[group_index];
                    if (group.x - x).hypot(group.y - y) < reach {
                        joined = Some(group_index);
                        break 'search;
                    }
                }
            }
        }
        match joined {
            Some(group_index) => {
                let group = &mut groups[group_index];
                let count = group.members.len() as f64;
                group.longitude = (group.longitude * count + marker.longitude) / (count + 1.0);
                group.latitude = (group.latitude * count + marker.latitude) / (count + 1.0);
                group.members.push(index);
            }
            None => {
                cells.entry(cell).or_default().push(groups.len());
                groups.push(Group {
                    x,
                    y,
                    longitude: marker.longitude,
                    latitude: marker.latitude,
                    members: vec![index],
                });
            }
        }
    }
    let bubble = |count: usize| {
        if count == 1 {
            6.0
        } else {
            10.0 + 3.0 * (count as f64).log2().min(5.0)
        }
    };
    loop {
        let mut merged = false;
        'outer: for first in 0..groups.len() {
            for second in first + 1..groups.len() {
                let (a, b) = (&groups[first], &groups[second]);
                if (a.x - b.x).hypot(a.y - b.y)
                    < bubble(a.members.len()) + bubble(b.members.len()) + 2.0
                    && a.members.len() + b.members.len() > 2
                {
                    let removed = groups.swap_remove(second);
                    let target = &mut groups[first];
                    let (left, right) = (target.members.len() as f64, removed.members.len() as f64);
                    let total = left + right;
                    target.x = (target.x * left + removed.x * right) / total;
                    target.y = (target.y * left + removed.y * right) / total;
                    target.longitude =
                        (target.longitude * left + removed.longitude * right) / total;
                    target.latitude = (target.latitude * left + removed.latitude * right) / total;
                    target.members.extend(removed.members);
                    merged = true;
                    break 'outer;
                }
            }
        }
        if !merged {
            break;
        }
    }
    groups
        .into_iter()
        .map(|group| {
            let first = &markers[group.members[0]];
            if group.members.len() == 1 {
                return first.clone();
            }
            let count = group.members.len();
            let fill = group
                .members
                .iter()
                .map(|index| markers[*index].fill)
                .find(|fill| *fill != [255, 255, 255, 255])
                .unwrap_or(first.stroke);
            Marker {
                longitude: group.longitude,
                latitude: group.latitude,
                radius: 10.0 + 3.0 * (count as f32).log2().min(5.0),
                fill,
                stroke: [255, 255, 255, 255],
                stroke_width: 2.0,
                label: Some(if count >= 1000 {
                    format!("{}k", count / 1000)
                } else {
                    count.to_string()
                }),
                label_color: [255, 255, 255, 255],
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_center_to_middle() {
        let camera = Camera {
            longitude: -96.8,
            latitude: 32.8,
            zoom: 7.0,
            width: 800,
            height: 600,
            pixel_ratio: 1.0,
        };
        let (x, y) = camera.project(-96.8, 32.8);
        assert!((x - 400.0).abs() < 1e-6 && (y - 300.0).abs() < 1e-6);
    }

    #[test]
    fn covers_viewport_with_wrapped_tiles() {
        let camera = Camera {
            longitude: 179.0,
            latitude: 0.0,
            zoom: 2.0,
            width: 1024,
            height: 512,
            pixel_ratio: 1.0,
        };
        let tiles = camera.tiles(0.0);
        assert!(tiles.iter().any(|placement| placement.id.x == 0));
        assert!(tiles.iter().any(|placement| placement.id.x == 3));
        assert!(
            tiles
                .iter()
                .all(|placement| placement.id.z == 2 && placement.id.y < 4)
        );
    }

    #[test]
    fn clusters_nearby_markers() {
        let camera = Camera {
            longitude: 0.0,
            latitude: 0.0,
            zoom: 10.0,
            width: 800,
            height: 600,
            pixel_ratio: 1.0,
        };
        let marker = |longitude: f64| Marker {
            longitude,
            latitude: 0.0,
            radius: 5.0,
            fill: [238, 121, 4, 255],
            stroke: [255, 255, 255, 255],
            stroke_width: 1.5,
            label: None,
            label_color: [255, 255, 255, 255],
        };
        let clustered = cluster(&camera, &[marker(0.0), marker(0.0001), marker(0.5)], 30.0);
        assert_eq!(clustered.len(), 2);
        assert_eq!(clustered[0].label.as_deref(), Some("2"));
        assert!(clustered[1].label.is_none());
    }

    #[test]
    fn tile_camera_covers_exactly_one_tile() {
        let id = TileId { z: 7, x: 29, y: 52 };
        let tiles = Camera::for_tile(id, 1.0).tiles(0.0);
        assert_eq!(tiles.len(), 1);
        assert_eq!(tiles[0].id, id);
        assert!(tiles[0].left.abs() < 1e-6 && tiles[0].top.abs() < 1e-6);
    }
}
