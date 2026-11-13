pub mod glyphs;
pub mod mvt;
pub mod pbf;
pub mod render;
pub mod style;

pub use render::{Camera, Fonts, Marker, Placement, Scene, TileId, render};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Png,
    Jpeg { quality: u8 },
}

pub fn encode(pixmap: &tiny_skia::Pixmap, format: Format) -> Option<Vec<u8>> {
    match format {
        Format::Png => pixmap.encode_png().ok(),
        Format::Jpeg { quality } => {
            let rgb: Vec<u8> = pixmap
                .data()
                .chunks_exact(4)
                .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
                .collect();
            let mut out = Vec::with_capacity(rgb.len() / 8);
            let mut encoder = jpeg_encoder::Encoder::new(&mut out, quality.clamp(1, 100));
            encoder.set_progressive(true);
            encoder
                .encode(
                    &rgb,
                    u16::try_from(pixmap.width()).ok()?,
                    u16::try_from(pixmap.height()).ok()?,
                    jpeg_encoder::ColorType::Rgb,
                )
                .ok()?;
            Some(out)
        }
    }
}

pub fn render_image(scene: &Scene, format: Format) -> Option<Vec<u8>> {
    encode(&render(scene)?, format)
}
