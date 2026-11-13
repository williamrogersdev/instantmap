use tiny_skia::{FillRule, LineCap, LineJoin, PathBuilder, Pixmap, Stroke, StrokeDash, Transform};

use crate::glyphs::{Canvas, FontStack, TextPaint, draw_text};
use crate::mvt::{GeometryType, Tile};
use crate::style::{Font, Paint, Rgba, Theme};

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

impl Camera {
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

    pub fn tiles(&self, margin: f64) -> Vec<(TileId, f64, f64, f64)> {
        let z = self.tile_zoom();
        let count = 1_u32 << z;
        let size = TILE_SIZE * 2f64.powf(self.zoom - f64::from(z));
        let (left, top) = self.origin();
        let first_column = ((left - margin) / size).floor() as i64;
        let last_column = ((left + f64::from(self.width) + margin) / size).floor() as i64;
        let first_row = ((top - margin) / size).floor().max(0.0) as i64;
        let last_row = ((top + f64::from(self.height) + margin) / size).floor().min(f64::from(count - 1)) as i64;
        let mut tiles = Vec::new();
        for row in first_row..=last_row {
            for column in first_column..=last_column {
                let wrapped = column.rem_euclid(i64::from(count)) as u32;
                tiles.push((
                    TileId { z, x: wrapped, y: row as u32 },
                    column as f64 * size - left,
                    row as f64 * size - top,
                    size,
                ));
            }
        }
        tiles
    }
}

pub struct Fonts {
    pub regular: FontStack,
    pub medium: FontStack,
}

impl Fonts {
    fn get(&self, font: Font) -> &FontStack {
        match font {
            Font::Medium if !self.medium.is_empty() => &self.medium,
            _ => &self.regular,
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
struct Placed {
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
}

impl Placed {
    fn overlaps(&self, other: &Placed) -> bool {
        self.left < other.right && other.left < self.right && self.top < other.bottom && other.top < self.bottom
    }
}

pub fn render(scene: &Scene) -> Option<Pixmap> {
    let camera = scene.camera;
    let ratio = camera.pixel_ratio;
    let width = (camera.width as f32 * ratio).round() as u32;
    let height = (camera.height as f32 * ratio).round() as u32;
    let mut pixmap = Pixmap::new(width, height)?;
    let background = scene.theme.background;
    pixmap.fill(tiny_skia::Color::from_rgba8(background[0], background[1], background[2], background[3]));
    let placements = camera.tiles(0.0);
    let zoom = camera.zoom as f32;

    for layer in &scene.theme.layers {
        if zoom < layer.min_zoom || zoom >= layer.max_zoom {
            continue;
        }
        let mut batches: Vec<(Rgba, PathBuilder)> = Vec::new();
        for (id, left, top, size) in &placements {
            let Some((_, tile)) = scene.tiles.iter().find(|(tile_id, _)| tile_id == id) else { continue };
            let Some(source) = tile.layer(layer.source_layer) else { continue };
            let scale = (*size / f64::from(source.extent)) as f32 * ratio;
            let (offset_x, offset_y) = (*left as f32 * ratio, *top as f32 * ratio);
            for feature in &source.features {
                let properties = source.properties(feature);
                if !(layer.filter)(&properties, feature.geometry_type) {
                    continue;
                }
                let color = match layer.paint {
                    Paint::Fill { color } => color(&properties),
                    Paint::Line { color, .. } => color,
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
                    let mut points = path.iter().map(|[x, y]| (offset_x + x * scale, offset_y + y * scale));
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
        }
        for (color, builder) in batches {
            let Some(path) = builder.finish() else { continue };
            match layer.paint {
                Paint::Fill { .. } => {
                    pixmap.fill_path(&path, &paint(color), FillRule::Winding, Transform::identity(), None);
                }
                Paint::Line { width, gap, dash, .. } => {
                    let line_width = width.at(zoom) + gap.map_or(0.0, |gap| gap.at(zoom) + width.at(zoom));
                    if line_width <= 0.05 {
                        continue;
                    }
                    let stroke_width = line_width * ratio;
                    let stroke = Stroke {
                        width: stroke_width,
                        line_cap: LineCap::Round,
                        line_join: LineJoin::Round,
                        dash: dash.and_then(|(on, off)| StrokeDash::new(vec![on * stroke_width, off * stroke_width], 0.0)),
                        ..Stroke::default()
                    };
                    pixmap.stroke_path(&path, &paint(color), &stroke, Transform::identity(), None);
                }
            }
        }
    }

    let mut placed: Vec<Placed> = Vec::new();
    for marker in scene.markers {
        let (x, y) = camera.project(marker.longitude, marker.latitude);
        let radius = marker.radius + marker.stroke_width;
        placed.push(Placed { left: x as f32 - radius, top: y as f32 - radius, right: x as f32 + radius, bottom: y as f32 + radius });
    }
    if let Some(fonts) = scene.fonts {
        draw_labels(scene, fonts, &mut pixmap, &mut placed);
    }
    draw_markers(scene, &mut pixmap);
    Some(pixmap)
}

struct Candidate<'a> {
    text: String,
    x: f32,
    y: f32,
    size: f32,
    font: &'a FontStack,
    rule: usize,
    priority: f32,
}

fn draw_labels(scene: &Scene, fonts: &Fonts, pixmap: &mut Pixmap, placed: &mut Vec<Placed>) {
    let camera = scene.camera;
    let zoom = camera.zoom as f32;
    let mut candidates: Vec<Candidate> = Vec::new();
    for (id, left, top, size) in camera.tiles(TILE_SIZE / 2.0) {
        let Some((_, tile)) = scene.tiles.iter().find(|(tile_id, _)| *tile_id == id) else { continue };
        for (rule_index, rule) in scene.theme.labels.iter().enumerate() {
            if zoom < rule.min_zoom {
                continue;
            }
            let Some(source) = tile.layer(rule.source_layer) else { continue };
            let scale = size / f64::from(source.extent);
            for feature in &source.features {
                if feature.geometry_type != GeometryType::Point {
                    continue;
                }
                let properties = source.properties(feature);
                if !(rule.filter)(&properties, feature.geometry_type) {
                    continue;
                }
                let Some(name) = properties.str("name:en").or_else(|| properties.str("name")) else { continue };
                let Some([x, y]) = feature.first_point() else { continue };
                let text = if rule.uppercase { name.to_uppercase() } else { name.to_owned() };
                candidates.push(Candidate {
                    text,
                    x: (left + f64::from(x) * scale) as f32,
                    y: (top + f64::from(y) * scale) as f32,
                    size: (rule.size)(&properties, zoom),
                    font: fonts.get((rule.font)(&properties)),
                    rule: rule_index,
                    priority: (rule.priority)(&properties),
                });
            }
        }
    }
    candidates.sort_by(|a, b| a.priority.total_cmp(&b.priority));
    let ratio = camera.pixel_ratio;
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mut canvas = Canvas { data: pixmap.data_mut(), width, height };
    let mut drawn_texts: Vec<(String, f32, f32)> = Vec::new();
    for candidate in candidates {
        if candidate.size <= 1.0 {
            continue;
        }
        if drawn_texts.iter().any(|(text, x, y)| *text == candidate.text && (x - candidate.x).abs() < 200.0 && (y - candidate.y).abs() < 200.0) {
            continue;
        }
        let rule = &scene.theme.labels[candidate.rule];
        let letter_spacing = rule.letter_spacing;
        let text_width = candidate.font.measure(&candidate.text, candidate.size, letter_spacing);
        let text_height = candidate.size * 1.2;
        let padding = 2.0;
        let with_dot = zoom < rule.dot_below_zoom;
        let offset = candidate.size * 0.3 + if with_dot { 3.0 } else { 0.0 };
        let anchors: &[(f32, f32)] = if with_dot {
            &[(-0.5, -1.0), (0.0, -0.5), (-1.0, -0.5), (-0.5, 0.0)]
        } else {
            &[(-0.5, -0.5)]
        };
        let mut chosen = None;
        for &(anchor_x, anchor_y) in anchors {
            let shift_x = if with_dot { if anchor_x == 0.0 { offset } else if anchor_x == -1.0 { -offset } else { 0.0 } } else { 0.0 };
            let shift_y = if with_dot { if anchor_y == 0.0 { offset } else if anchor_y == -1.0 { -offset } else { 0.0 } } else { 0.0 };
            let left = candidate.x + shift_x + anchor_x * text_width;
            let top = candidate.y + shift_y + anchor_y * text_height;
            let bounds = Placed { left: left - padding, top: top - padding, right: left + text_width + padding, bottom: top + text_height + padding };
            let inside = bounds.left >= 0.0 && bounds.top >= 0.0 && bounds.right <= camera.width as f32 && bounds.bottom <= camera.height as f32;
            if inside && !placed.iter().any(|other| other.overlaps(&bounds)) {
                chosen = Some((left, top, bounds));
                break;
            }
        }
        let Some((left, top, bounds)) = chosen else { continue };
        placed.push(bounds);
        if with_dot {
            let dot = 2.5;
            placed.push(Placed { left: candidate.x - dot, top: candidate.y - dot, right: candidate.x + dot, bottom: candidate.y + dot });
            draw_dot(&mut canvas, candidate.x * ratio, candidate.y * ratio, dot * ratio, rule.color, rule.halo);
        }
        let baseline = top + candidate.size * 0.95;
        draw_text(
            &mut canvas,
            candidate.font,
            &candidate.text,
            left * ratio,
            baseline * ratio,
            candidate.size * ratio,
            letter_spacing,
            TextPaint { color: rule.color, halo: rule.halo, halo_width: 1.2 * ratio },
        );
        drawn_texts.push((candidate.text, candidate.x, candidate.y));
    }
}

fn draw_dot(canvas: &mut Canvas, x: f32, y: f32, radius: f32, fill: Rgba, ring: Rgba) {
    let outer = radius + 1.0;
    for row in (y - outer).floor() as i32..=(y + outer).ceil() as i32 {
        for column in (x - outer).floor() as i32..=(x + outer).ceil() as i32 {
            let distance = ((column as f32 + 0.5 - x).powi(2) + (row as f32 + 0.5 - y).powi(2)).sqrt();
            let ring_coverage = (outer - distance + 0.5).clamp(0.0, 1.0);
            let fill_coverage = (radius - distance + 0.5).clamp(0.0, 1.0);
            if ring[3] > 0 {
                blend_into(canvas, column, row, ring, ring_coverage);
            }
            blend_into(canvas, column, row, fill, fill_coverage);
        }
    }
}

fn blend_into(canvas: &mut Canvas, x: i32, y: i32, color: Rgba, coverage: f32) {
    if x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || coverage <= 0.0 {
        return;
    }
    let alpha = coverage * f32::from(color[3]) / 255.0;
    let index = ((y * canvas.width + x) * 4) as usize;
    for channel in 0..3 {
        let value = f32::from(color[channel]) * alpha + f32::from(canvas.data[index + channel]) * (1.0 - alpha);
        canvas.data[index + channel] = value.round() as u8;
    }
    canvas.data[index + 3] = (alpha * 255.0 + f32::from(canvas.data[index + 3]) * (1.0 - alpha)).round() as u8;
}

fn draw_markers(scene: &Scene, pixmap: &mut Pixmap) {
    let ratio = scene.camera.pixel_ratio;
    for marker in scene.markers {
        let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
        let (x, y) = (x as f32 * ratio, y as f32 * ratio);
        let Some(circle) = PathBuilder::from_circle(x, y, marker.radius * ratio) else { continue };
        pixmap.fill_path(&circle, &paint(marker.fill), FillRule::Winding, Transform::identity(), None);
        if marker.stroke_width > 0.0 {
            let stroke = Stroke { width: marker.stroke_width * ratio, ..Stroke::default() };
            pixmap.stroke_path(&circle, &paint(marker.stroke), &stroke, Transform::identity(), None);
        }
    }
    let Some(fonts) = scene.fonts else { return };
    let (width, height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mut canvas = Canvas { data: pixmap.data_mut(), width, height };
    for marker in scene.markers {
        let Some(label) = &marker.label else { continue };
        let (x, y) = scene.camera.project(marker.longitude, marker.latitude);
        let size = 12.0;
        let text_width = fonts.medium.measure(label, size, 0.0);
        let left = x as f32 - text_width / 2.0;
        let baseline = y as f32 + size * 0.36;
        draw_text(
            &mut canvas,
            fonts.get(Font::Medium),
            label,
            left * ratio,
            baseline * ratio,
            size * ratio,
            0.0,
            TextPaint { color: marker.label_color, halo: [0, 0, 0, 0], halo_width: 0.0 },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_center_to_middle() {
        let camera = Camera { longitude: -96.8, latitude: 32.8, zoom: 7.0, width: 800, height: 600, pixel_ratio: 1.0 };
        let (x, y) = camera.project(-96.8, 32.8);
        assert!((x - 400.0).abs() < 1e-6 && (y - 300.0).abs() < 1e-6);
    }

    #[test]
    fn covers_viewport_with_wrapped_tiles() {
        let camera = Camera { longitude: 179.0, latitude: 0.0, zoom: 2.0, width: 1024, height: 512, pixel_ratio: 1.0 };
        let tiles = camera.tiles(0.0);
        assert!(tiles.iter().any(|(id, ..)| id.x == 0));
        assert!(tiles.iter().any(|(id, ..)| id.x == 3));
        assert!(tiles.iter().all(|(id, ..)| id.z == 2 && id.y < 4));
    }
}
