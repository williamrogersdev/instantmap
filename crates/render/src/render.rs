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
    pub count: u32,
    pub selected: bool,
    pub label: Option<String>,
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
                Paint::Fill { color } => color.color(properties, zoom),
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
                let color = rule.color;
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
        let mut placed: Vec<Bounds> = Vec::new();
        let mut shields: Vec<(String, f32, f32)> = Vec::new();
        for candidate in candidates {
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
        if let Some(dot) = dot {
            let reach = dot.radius + dot.stroke_width + 1.0;
            footprint.left = footprint.left.min(candidate.x - reach);
            footprint.right = footprint.right.max(candidate.x + reach);
            footprint.top = footprint.top.min(candidate.y - reach);
            footprint.bottom = footprint.bottom.max(candidate.y + reach);
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

const PILL_HEIGHT: f32 = 26.0;
const PILL_PADDING: f32 = 10.0;
const PILL_TEXT_SIZE: f32 = 13.0;
const CLUSTER_TEXT_SIZE: f32 = 12.0;
const DOT_RADIUS: f32 = 7.0;
const DOT_RING: f32 = 2.5;
const CLUSTER_RING: f32 = 2.5;
const SHADOW_BLUR: f32 = 6.0;
const SHADOW_OFFSET: f32 = 2.0;
pub const MAX_LABEL_LENGTH: usize = 10;

enum Shape {
    Pill { text: String, width: f32 },
    Dot,
    Cluster { text: String, radius: f32 },
}

fn truncate_label(label: &str) -> String {
    label.chars().take(MAX_LABEL_LENGTH).collect()
}

fn count_text(count: u32) -> String {
    if count >= 10_000 {
        format!("{}k", count / 1000)
    } else if count >= 1000 {
        let tenths = count / 100;
        if tenths.is_multiple_of(10) {
            format!("{}k", tenths / 10)
        } else {
            format!("{}.{}k", tenths / 10, tenths % 10)
        }
    } else {
        count.to_string()
    }
}

impl Shape {
    fn of(marker: &Marker, fonts: Option<&Fonts>) -> Shape {
        if marker.count > 1 {
            return Shape::Cluster {
                text: count_text(marker.count),
                radius: footprint(marker.count as usize, None) as f32,
            };
        }
        let Some(label) = &marker.label else {
            return Shape::Dot;
        };
        let text = truncate_label(label);
        let advance = match fonts {
            Some(fonts) => fonts.get(Font::Medium).measure(&text, PILL_TEXT_SIZE, 0.0),
            None => text.chars().count() as f32 * PILL_TEXT_SIZE * 0.55,
        };
        let width = (advance + PILL_PADDING * 2.0).max(PILL_HEIGHT);
        Shape::Pill { text, width }
    }
}

fn draw_markers(scene: &Scene, pixmap: &mut Pixmap) {
    let ratio = scene.camera.pixel_ratio;
    let style = &scene.theme.markers;
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mut canvas = Canvas {
        data: pixmap.data_mut(),
        width,
        height,
    };
    let mut order: Vec<&Marker> = scene.markers.iter().collect();
    order.sort_by_key(|marker| marker.selected && marker.count <= 1);
    for marker in order {
        let shape = Shape::of(marker, scene.fonts);
        let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
        let (x, y) = (x as f32, y as f32);
        match shape {
            Shape::Pill { text, width } => {
                let (fill, ink) = if marker.selected {
                    (style.selected_fill, style.selected_text)
                } else {
                    (style.pill_fill, style.pill_text)
                };
                let radius = PILL_HEIGHT / 2.0;
                draw_shadow(
                    &mut canvas,
                    (x * ratio, (y + SHADOW_OFFSET) * ratio),
                    (width / 2.0 * ratio, radius * ratio),
                    radius * ratio,
                    style.shadow,
                    SHADOW_BLUR * ratio,
                );
                draw_round_rect(
                    &mut canvas,
                    Bounds {
                        left: x - width / 2.0,
                        top: y - radius,
                        right: x + width / 2.0,
                        bottom: y + radius,
                    },
                    radius,
                    fill,
                    fill,
                    0.0,
                    ratio,
                );
                if let Some(fonts) = scene.fonts {
                    draw_centered_text(&mut canvas, fonts, &text, PILL_TEXT_SIZE, x, y, ink, ratio);
                }
            }
            Shape::Dot => {
                let reach = (DOT_RADIUS + DOT_RING) * ratio;
                draw_shadow(
                    &mut canvas,
                    (x * ratio, (y + SHADOW_OFFSET) * ratio),
                    (reach, reach),
                    reach,
                    style.shadow,
                    SHADOW_BLUR * ratio,
                );
                draw_dot(
                    &mut canvas,
                    x * ratio,
                    y * ratio,
                    Dot {
                        radius: DOT_RADIUS,
                        fill: style.dot_fill,
                        stroke: style.dot_ring,
                        stroke_width: DOT_RING,
                    },
                    ratio,
                );
            }
            Shape::Cluster { text, radius } => {
                let reach = radius * ratio;
                draw_shadow(
                    &mut canvas,
                    (x * ratio, (y + SHADOW_OFFSET) * ratio),
                    (reach, reach),
                    reach,
                    style.shadow,
                    SHADOW_BLUR * ratio,
                );
                draw_dot(
                    &mut canvas,
                    x * ratio,
                    y * ratio,
                    Dot {
                        radius,
                        fill: style.cluster_fill,
                        stroke: style.cluster_ring,
                        stroke_width: CLUSTER_RING,
                    },
                    ratio,
                );
                if let Some(fonts) = scene.fonts {
                    draw_centered_text(
                        &mut canvas,
                        fonts,
                        &text,
                        CLUSTER_TEXT_SIZE,
                        x,
                        y,
                        style.cluster_text,
                        ratio,
                    );
                }
            }
        }
    }
}


#[allow(clippy::too_many_arguments)]
fn draw_centered_text(
    canvas: &mut Canvas,
    fonts: &Fonts,
    text: &str,
    size: f32,
    x: f32,
    y: f32,
    color: Rgba,
    ratio: f32,
) {
    let font = fonts.get(Font::Medium);
    let advance = font.measure(text, size, 0.0);
    draw_text(
        canvas,
        font,
        text,
        (x - advance / 2.0) * ratio,
        (y + size * 0.36) * ratio,
        size * ratio,
        0.0,
        TextPaint {
            color,
            halo: [0, 0, 0, 0],
            halo_width: 0.0,
        },
    );
}

fn draw_shadow(
    canvas: &mut Canvas,
    center: (f32, f32),
    half: (f32, f32),
    corner: f32,
    color: Rgba,
    blur: f32,
) {
    let (x, y) = center;
    let reach_x = half.0 + blur * 2.0;
    let reach_y = half.1 + blur * 2.0;
    let base = f32::from(color[3]) / 255.0;
    let inner = (half.0 - corner, half.1 - corner);
    for row in (y - reach_y).floor() as i32..=(y + reach_y).ceil() as i32 {
        for column in (x - reach_x).floor() as i32..=(x + reach_x).ceil() as i32 {
            let dx = ((column as f32 + 0.5 - x).abs() - inner.0).max(0.0);
            let dy = ((row as f32 + 0.5 - y).abs() - inner.1).max(0.0);
            let distance = dx.hypot(dy) - corner;
            let falloff = 1.0 - ((distance + blur) / (blur * 2.0)).clamp(0.0, 1.0);
            let coverage = falloff * falloff;
            blend_into(
                canvas,
                column,
                row,
                [color[0], color[1], color[2], 255],
                coverage * base,
            );
        }
    }
}

const CLUSTER_ZOOM_LIMIT: u32 = 24;

pub struct Group {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub members: Vec<usize>,
    seed_x: f64,
    seed_y: f64,
    sum_x: f64,
    sum_y: f64,
}

pub fn footprint(count: usize, label: Option<&str>) -> f64 {
    if count > 1 {
        return 10.0 + 3.5 * (count as f64).log2().min(7.0);
    }
    match label {
        Some(label) => 8.0 + 3.5 * (label.chars().count().min(MAX_LABEL_LENGTH)) as f64,
        None => 6.0,
    }
}

fn cluster_x(longitude: f64) -> f64 {
    (longitude + 180.0) / 360.0
}

fn cluster_y(latitude: f64) -> f64 {
    let sine = (latitude.clamp(-85.0511, 85.0511).to_radians()).sin();
    0.5 - ((1.0 + sine) / (1.0 - sine)).ln() / (4.0 * std::f64::consts::PI)
}

fn label_of(markers: &[Marker], group: &Group) -> Option<String> {
    markers[group.members[0]].label.clone()
}

pub fn cluster_at(markers: &[Marker], zoom: u32, distance: f64) -> Vec<Group> {
    let world = TILE_SIZE * 2f64.powi(zoom.min(CLUSTER_ZOOM_LIMIT) as i32);
    let mut groups: Vec<Group> = Vec::new();
    if distance <= 0.0 {
        for (index, marker) in markers.iter().enumerate() {
            let x = cluster_x(marker.longitude) * world;
            let y = cluster_y(marker.latitude) * world;
            groups.push(Group {
                x,
                y,
                radius: footprint(1, marker.label.as_deref()),
                members: vec![index],
                seed_x: x,
                seed_y: y,
                sum_x: x,
                sum_y: y,
            });
        }
        return groups;
    }
    let mut seeds: std::collections::HashMap<(i64, i64), Vec<usize>> =
        std::collections::HashMap::new();
    for (index, marker) in markers.iter().enumerate() {
        let x = cluster_x(marker.longitude) * world;
        let y = cluster_y(marker.latitude) * world;
        let column = (x / distance).floor() as i64;
        let row = (y / distance).floor() as i64;
        let mut joined = None;
        'search: for dy in -1..=1 {
            for dx in -1..=1 {
                let Some(candidates) = seeds.get(&(column + dx, row + dy)) else {
                    continue;
                };
                for &candidate in candidates {
                    let group = &groups[candidate];
                    if (group.seed_x - x).hypot(group.seed_y - y) < distance {
                        joined = Some(candidate);
                        break 'search;
                    }
                }
            }
        }
        match joined {
            Some(candidate) => {
                let group = &mut groups[candidate];
                group.members.push(index);
                group.sum_x += x;
                group.sum_y += y;
            }
            None => {
                seeds.entry((column, row)).or_default().push(groups.len());
                groups.push(Group {
                    x,
                    y,
                    radius: 0.0,
                    members: vec![index],
                    seed_x: x,
                    seed_y: y,
                    sum_x: x,
                    sum_y: y,
                });
            }
        }
    }
    for group in &mut groups {
        let count = group.members.len() as f64;
        group.x = group.sum_x / count;
        group.y = group.sum_y / count;
        group.radius = footprint(
            group.members.len(),
            markers[group.members[0]].label.as_deref(),
        );
    }
    separate(markers, groups)
}

fn separate(markers: &[Marker], groups: Vec<Group>) -> Vec<Group> {
    let mut alive = groups;
    let cell = 2.0 * footprint(128, None) + 2.0;
    loop {
        let mut grid: std::collections::HashMap<(i64, i64), Vec<usize>> =
            std::collections::HashMap::new();
        for (index, group) in alive.iter().enumerate() {
            grid.entry((
                (group.x / cell).floor() as i64,
                (group.y / cell).floor() as i64,
            ))
            .or_default()
            .push(index);
        }
        let mut removed: std::collections::HashSet<usize> = std::collections::HashSet::new();
        let mut merged = false;
        for index in 0..alive.len() {
            if removed.contains(&index) {
                continue;
            }
            let column = (alive[index].x / cell).floor() as i64;
            let row = (alive[index].y / cell).floor() as i64;
            let mut neighbours: Vec<usize> = Vec::new();
            for dy in -1..=1 {
                for dx in -1..=1 {
                    for &other in grid.get(&(column + dx, row + dy)).into_iter().flatten() {
                        if other > index && !removed.contains(&other) {
                            neighbours.push(other);
                        }
                    }
                }
            }
            neighbours.sort_unstable();
            for other in neighbours {
                let (first, second) = (&alive[index], &alive[other]);
                let gap = (first.x - second.x).hypot(first.y - second.y);
                if gap >= first.radius + second.radius + 2.0 {
                    continue;
                }
                let moved = std::mem::take(&mut alive[other].members);
                let (sum_x, sum_y) = (alive[other].sum_x, alive[other].sum_y);
                let target = &mut alive[index];
                target.members.extend(moved);
                target.sum_x += sum_x;
                target.sum_y += sum_y;
                let count = target.members.len() as f64;
                target.x = target.sum_x / count;
                target.y = target.sum_y / count;
                target.radius = footprint(
                    target.members.len(),
                    markers[target.members[0]].label.as_deref(),
                );
                removed.insert(other);
                merged = true;
            }
        }
        if !merged {
            return alive;
        }
        let mut gone: Vec<usize> = removed.into_iter().collect();
        gone.sort_unstable_by(|a, b| b.cmp(a));
        for index in gone {
            alive.remove(index);
        }
    }
}

fn unproject_world(x: f64, y: f64, world: f64) -> (f64, f64) {
    let longitude = x / world * 360.0 - 180.0;
    let latitude = (std::f64::consts::PI * (1.0 - 2.0 * y / world))
        .sinh()
        .atan()
        .to_degrees();
    (longitude, latitude)
}

/// Merges markers closer than `distance` CSS pixels into count bubbles; markers that already carry a count pass through.
pub fn cluster(camera: &Camera, markers: &[Marker], distance: f32) -> Vec<Marker> {
    let zoom = camera.zoom.floor().max(0.0) as u32;
    let world = TILE_SIZE * 2f64.powi(zoom.min(CLUSTER_ZOOM_LIMIT) as i32);
    let (singles, mut result): (Vec<Marker>, Vec<Marker>) = markers
        .iter()
        .cloned()
        .partition(|marker| marker.count <= 1);
    let mut output: Vec<Marker> = cluster_at(&singles, zoom, f64::from(distance))
        .into_iter()
        .map(|group| {
            if group.members.len() == 1 {
                return singles[group.members[0]].clone();
            }
            let (longitude, latitude) = unproject_world(group.x, group.y, world);
            Marker {
                longitude,
                latitude,
                count: group.members.len() as u32,
                selected: false,
                label: label_of(&singles, &group),
            }
        })
        .collect();
    output.append(&mut result);
    output
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

    fn spot(longitude: f64, latitude: f64, label: Option<&str>) -> Marker {
        Marker {
            longitude,
            latitude,
            count: 1,
            selected: false,
            label: label.map(str::to_string),
        }
    }

    fn fixture() -> Vec<Marker> {
        let mut markers = Vec::new();
        for index in 0..6 {
            markers.push(spot(-96.80 + f64::from(index) * 0.01, 32.78, None));
        }
        for index in 0..4 {
            markers.push(spot(
                -96.80 + f64::from(index) * 0.02,
                33.20,
                Some("Pallets"),
            ));
        }
        for index in 0..5 {
            markers.push(spot(-97.30, 32.40 + f64::from(index) * 0.2, None));
        }
        for index in 0..5 {
            markers.push(spot(-95.90 + f64::from(index) * 0.5, 31.60, None));
        }
        markers.push(spot(-100.0, 35.0, None));
        markers.push(spot(-100.0, 35.0, Some("Lubbock")));
        markers.push(spot(-90.0, 29.9, Some("A very long label")));
        markers.push(spot(-89.99, 29.9, None));
        markers.push(spot(-120.0, 40.0, None));
        markers.push(spot(-80.0, 25.8, None));
        markers.push(spot(-80.0, 25.82, None));
        markers.push(spot(-104.0, 33.0, None));
        markers.push(spot(-104.001, 33.0, Some("Roswell")));
        markers.push(spot(-110.0, 45.0, None));
        markers
    }

    fn shape_of(groups: &[Group]) -> Vec<Vec<usize>> {
        groups.iter().map(|group| group.members.clone()).collect()
    }

    #[test]
    fn clusters_hand_placed_markers_at_three_zooms() {
        let markers = fixture();
        assert_eq!(markers.len(), 30);
        let sizes = |zoom: u32, distance: f64| -> Vec<usize> {
            cluster_at(&markers, zoom, distance)
                .iter()
                .map(|group| group.members.len())
                .collect()
        };
        let zoom_four = shape_of(&cluster_at(&markers, 4, 44.0));
        assert_eq!(zoom_four.len(), 8);
        assert_eq!(zoom_four[0], (0..16).collect::<Vec<usize>>());
        assert_eq!(
            zoom_four[1..],
            [
                vec![16, 17, 18, 19],
                vec![20, 21],
                vec![22, 23],
                vec![24],
                vec![25, 26],
                vec![27, 28],
                vec![29]
            ]
        );
        let zoom_eight = shape_of(&cluster_at(&markers, 8, 44.0));
        assert_eq!(zoom_eight.len(), 18);
        assert_eq!(zoom_eight[0], (0..6).collect::<Vec<usize>>());
        assert_eq!(zoom_eight[1], (6..10).collect::<Vec<usize>>());
        assert_eq!(
            sizes(8, 44.0),
            [6, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1]
        );
        let zoom_twelve = shape_of(&cluster_at(&markers, 12, 44.0));
        assert_eq!(zoom_twelve.len(), 28);
        assert!(zoom_twelve.contains(&vec![20, 21]));
        assert!(zoom_twelve.contains(&vec![27, 28]));
        assert!(
            zoom_twelve
                .iter()
                .filter(|members| members.len() > 1)
                .count()
                == 2
        );
        assert_eq!(cluster_at(&markers, 4, 0.0).len(), 30);
    }

    #[test]
    fn footprints_follow_the_shared_formula() {
        assert_eq!(footprint(1, None), 6.0);
        assert_eq!(footprint(1, Some("abc")), 18.5);
        assert_eq!(footprint(1, Some("a very long label")), 43.0);
        assert_eq!(footprint(2, None), 13.5);
        assert_eq!(footprint(128, None), 34.5);
    }

    #[test]
    fn pre_clustered_markers_pass_through() {
        let camera = Camera {
            longitude: -96.8,
            latitude: 32.8,
            zoom: 8.0,
            width: 800,
            height: 600,
            pixel_ratio: 1.0,
        };
        let mut markers = fixture();
        markers.push(Marker {
            longitude: -96.8,
            latitude: 32.8,
            count: 40,
            selected: false,
            label: None,
        });
        let clustered = cluster(&camera, &markers, 44.0);
        assert_eq!(clustered.last().map(|marker| marker.count), Some(40));
        assert_eq!(clustered.iter().map(|marker| marker.count).sum::<u32>(), 70);
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
