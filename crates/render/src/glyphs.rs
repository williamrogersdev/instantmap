use std::collections::HashMap;

use crate::pbf::{Reader, Result, zigzag};

pub const SDF_SIZE: f32 = 24.0;
pub const SDF_BUFFER: i32 = 3;
const BASELINE_OFFSET: i32 = 25;
const SDF_RADIUS: f32 = 8.0;
const SDF_EDGE: f32 = 0.75;

#[derive(Debug, Clone, Default)]
pub struct Glyph {
    pub bitmap: Vec<u8>,
    pub width: i32,
    pub height: i32,
    pub left: i32,
    pub top: i32,
    pub advance: i32,
}

#[derive(Debug, Default, Clone)]
pub struct FontStack {
    glyphs: HashMap<u32, Glyph>,
}

impl FontStack {
    pub fn from_pbf_ranges<'a>(ranges: impl IntoIterator<Item = &'a [u8]>) -> Result<Self> {
        let mut stack = FontStack::default();
        for bytes in ranges {
            stack.add_range(bytes)?;
        }
        Ok(stack)
    }

    pub fn add_range(&mut self, bytes: &[u8]) -> Result<()> {
        let mut reader = Reader::new(bytes);
        while !reader.done() {
            match reader.tag()? {
                (1, 2) => {
                    let mut stack = Reader::new(reader.bytes()?);
                    while !stack.done() {
                        match stack.tag()? {
                            (3, 2) => {
                                let (id, glyph) = decode_glyph(stack.bytes()?)?;
                                self.glyphs.insert(id, glyph);
                            }
                            (_, wire) => stack.skip(wire)?,
                        }
                    }
                }
                (_, wire) => reader.skip(wire)?,
            }
        }
        Ok(())
    }

    pub fn glyph(&self, character: char) -> Option<&Glyph> {
        self.glyphs.get(&u32::from(character))
    }

    pub fn is_empty(&self) -> bool {
        self.glyphs.is_empty()
    }

    pub fn measure(&self, text: &str, size: f32, letter_spacing: f32) -> f32 {
        let scale = size / SDF_SIZE;
        text.chars()
            .filter_map(|character| self.glyph(character))
            .map(|glyph| glyph.advance as f32 * scale + letter_spacing * size)
            .sum()
    }
}

fn decode_glyph(bytes: &[u8]) -> Result<(u32, Glyph)> {
    let mut reader = Reader::new(bytes);
    let mut id = 0_u32;
    let mut glyph = Glyph::default();
    while !reader.done() {
        match reader.tag()? {
            (1, 0) => id = reader.varint()? as u32,
            (2, 2) => glyph.bitmap = reader.bytes()?.to_vec(),
            (3, 0) => glyph.width = reader.varint()? as i32,
            (4, 0) => glyph.height = reader.varint()? as i32,
            (5, 0) => glyph.left = zigzag(reader.varint()?) as i32,
            (6, 0) => glyph.top = zigzag(reader.varint()?) as i32,
            (7, 0) => glyph.advance = reader.varint()? as i32,
            (_, wire) => reader.skip(wire)?,
        }
    }
    Ok((id, glyph))
}

#[derive(Clone, Copy)]
pub struct TextPaint {
    pub color: [u8; 4],
    pub halo: [u8; 4],
    pub halo_width: f32,
}

pub struct Canvas<'p> {
    pub data: &'p mut [u8],
    pub width: i32,
    pub height: i32,
}

impl Canvas<'_> {
    fn blend(&mut self, x: i32, y: i32, color: [u8; 4], coverage: f32) {
        if x < 0 || y < 0 || x >= self.width || y >= self.height || coverage <= 0.0 {
            return;
        }
        let alpha = coverage.min(1.0) * f32::from(color[3]) / 255.0;
        let index = ((y * self.width + x) * 4) as usize;
        let pixel = &mut self.data[index..index + 4];
        for channel in 0..3 {
            let source = f32::from(color[channel]) * alpha;
            pixel[channel] = (source + f32::from(pixel[channel]) * (1.0 - alpha)).round() as u8;
        }
        pixel[3] = (alpha * 255.0 + f32::from(pixel[3]) * (1.0 - alpha)).round() as u8;
    }
}

fn sample(glyph: &Glyph, x: f32, y: f32) -> f32 {
    let width = glyph.width + 2 * SDF_BUFFER;
    let height = glyph.height + 2 * SDF_BUFFER;
    let x = x - 0.5;
    let y = y - 0.5;
    let (x0, y0) = (x.floor() as i32, y.floor() as i32);
    let (fraction_x, fraction_y) = (x - x0 as f32, y - y0 as f32);
    let at = |column: i32, row: i32| -> f32 {
        if column < 0 || row < 0 || column >= width || row >= height {
            return 0.0;
        }
        glyph
            .bitmap
            .get((row * width + column) as usize)
            .copied()
            .unwrap_or(0) as f32
            / 255.0
    };
    let top = at(x0, y0) * (1.0 - fraction_x) + at(x0 + 1, y0) * fraction_x;
    let bottom = at(x0, y0 + 1) * (1.0 - fraction_x) + at(x0 + 1, y0 + 1) * fraction_x;
    top * (1.0 - fraction_y) + bottom * fraction_y
}

pub fn draw_text(
    canvas: &mut Canvas,
    font: &FontStack,
    text: &str,
    left: f32,
    baseline: f32,
    size: f32,
    letter_spacing: f32,
    paint: TextPaint,
) {
    let scale = size / SDF_SIZE;
    let per_pixel = 1.0 / (SDF_RADIUS * scale);
    let passes: [(f32, [u8; 4]); 2] = [
        (SDF_EDGE - paint.halo_width * per_pixel, paint.halo),
        (SDF_EDGE, paint.color),
    ];
    for (pass_index, (edge, color)) in passes.into_iter().enumerate() {
        if pass_index == 0 && (paint.halo_width <= 0.0 || paint.halo[3] == 0) {
            continue;
        }
        let mut pen = left;
        for character in text.chars() {
            let Some(glyph) = font.glyph(character) else {
                continue;
            };
            if glyph.width > 0 && glyph.height > 0 && !glyph.bitmap.is_empty() {
                let x0 = pen + (glyph.left - SDF_BUFFER) as f32 * scale;
                let y0 = baseline - (BASELINE_OFFSET + glyph.top + SDF_BUFFER) as f32 * scale;
                let box_width = (glyph.width + 2 * SDF_BUFFER) as f32 * scale;
                let box_height = (glyph.height + 2 * SDF_BUFFER) as f32 * scale;
                for row in y0.floor() as i32..(y0 + box_height).ceil() as i32 {
                    for column in x0.floor() as i32..(x0 + box_width).ceil() as i32 {
                        let distance = sample(
                            glyph,
                            (column as f32 + 0.5 - x0) / scale,
                            (row as f32 + 0.5 - y0) / scale,
                        );
                        let coverage = ((distance - edge) / per_pixel + 0.5).clamp(0.0, 1.0);
                        canvas.blend(column, row, color, coverage);
                    }
                }
            }
            pen += glyph.advance as f32 * scale + letter_spacing * size;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_noto_latin_range() {
        let bytes = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/noto-sans-regular-0-255.pbf"
        ))
        .unwrap();
        let stack = FontStack::from_pbf_ranges([bytes.as_slice()]).unwrap();
        let glyph = stack.glyph('A').expect("A glyph");
        assert!(glyph.width > 0 && glyph.advance > 0);
        assert_eq!(
            glyph.bitmap.len() as i32,
            (glyph.width + 6) * (glyph.height + 6)
        );
        assert!(stack.measure("Dallas", 12.0, 0.0) > 30.0);
    }
}
