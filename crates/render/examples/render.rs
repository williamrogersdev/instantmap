use std::time::Instant;

use instantmap_render::glyphs::FontStack;
use instantmap_render::mvt::Tile;
use instantmap_render::style::{hex, repackify_light};
use instantmap_render::{Camera, Fonts, Marker, Scene, TileId, render_png};

fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let fixtures = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures");
    let (longitude, latitude, zoom) = match arguments.get(1).map(String::as_str) {
        Some("national") => (-98.5, 38.5, 3.0),
        _ => (-96.8, 32.8, 7.0),
    };
    let camera = Camera { longitude, latitude, zoom, width: 1280, height: 800, pixel_ratio: 1.0 };
    let mut owned = Vec::new();
    for (id, ..) in camera.tiles(256.0) {
        let path = format!("{fixtures}/{}-{}-{}.mvt", id.z, id.x, id.y);
        match std::fs::read(&path) {
            Ok(bytes) => owned.push((id, bytes)),
            Err(_) => eprintln!("missing {path}"),
        }
    }
    let started = Instant::now();
    let tiles: Vec<(TileId, Tile)> = owned.iter().map(|(id, bytes)| (*id, Tile::decode(bytes).unwrap())).collect();
    let decoded = started.elapsed();
    let regular = std::fs::read(format!("{fixtures}/noto-sans-regular-0-255.pbf")).unwrap();
    let medium = std::fs::read(format!("{fixtures}/noto-sans-medium-0-255.pbf")).unwrap();
    let fonts = Fonts { regular: FontStack::from_pbf_ranges([regular.as_slice()]).unwrap(), medium: FontStack::from_pbf_ranges([medium.as_slice()]).unwrap() };
    let theme = repackify_light();
    let markers = vec![
        Marker { longitude: -96.8, latitude: 32.78, radius: 18.0, fill: hex(0xee7904), stroke: hex(0xffffff), stroke_width: 3.0, label: Some("$42".into()), label_color: hex(0x14263d) },
        Marker { longitude: -97.33, latitude: 32.75, radius: 9.0, fill: hex(0xffffff), stroke: hex(0xee7904), stroke_width: 2.5, label: None, label_color: hex(0x14263d) },
    ];
    let scene = Scene { camera, theme: &theme, tiles: &tiles, fonts: Some(&fonts), markers: &markers };
    let started = Instant::now();
    let png = render_png(&scene).unwrap();
    println!("tiles {} decode {:?} render+encode {:?} png {} bytes", tiles.len(), decoded, started.elapsed(), png.len());
    std::fs::write(arguments.get(2).cloned().unwrap_or("out.png".into()), png).unwrap();
}
