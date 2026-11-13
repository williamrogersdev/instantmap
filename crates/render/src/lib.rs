pub mod glyphs;
pub mod mvt;
pub mod pbf;
pub mod render;
pub mod style;

pub use render::{Camera, Fonts, Marker, Scene, TileId, render};

pub fn render_png(scene: &Scene) -> Option<Vec<u8>> {
    render::render(scene)?.encode_png().ok()
}
