use std::time::Instant;

use instantmap_render::glyphs::FontStack;
use instantmap_render::mvt::Tile;
use instantmap_render::style::{hex, paper};
use instantmap_render::{Camera, Fonts, Marker, Scene, TileId, render};

fn font(fixtures: &str, name: &str) -> FontStack {
    let bytes = std::fs::read(format!("{fixtures}/{name}-0-255.pbf")).unwrap();
    FontStack::from_pbf_ranges([bytes.as_slice()]).unwrap()
}

fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let fixtures = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures");
    let (longitude, latitude, zoom) = match arguments.get(1).map(String::as_str) {
        Some("national") => (-98.5, 38.5, 3.0),
        Some("city") => (-96.80, 32.79, 12.0),
        Some("metro") => (-96.95, 32.85, 9.5),
        _ => (-96.8, 32.8, 7.0),
    };
    let pixel_ratio = arguments
        .get(3)
        .and_then(|value| value.parse().ok())
        .unwrap_or(1.0);
    let width = arguments
        .get(4)
        .and_then(|value| value.parse().ok())
        .unwrap_or(1280);
    let height = arguments
        .get(5)
        .and_then(|value| value.parse().ok())
        .unwrap_or(800);
    let synthetic: usize = arguments
        .get(6)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let camera = Camera {
        longitude,
        latitude,
        zoom,
        width,
        height,
        pixel_ratio,
    };
    let mut owned = Vec::new();
    for placement in camera.tiles(256.0) {
        let id = placement.id;
        let path = format!("{fixtures}/{}-{}-{}.mvt", id.z, id.x, id.y);
        match std::fs::read(&path) {
            Ok(bytes) => owned.push((id, bytes)),
            Err(_) => eprintln!("missing {path}"),
        }
    }
    let started = Instant::now();
    let tiles: Vec<(TileId, Tile)> = owned
        .iter()
        .map(|(id, bytes)| (*id, Tile::decode(bytes).unwrap()))
        .collect();
    let decoded = started.elapsed();
    let fonts = Fonts {
        regular: font(fixtures, "noto-sans-regular"),
        medium: font(fixtures, "noto-sans-medium"),
        italic: font(fixtures, "noto-sans-italic"),
    };
    let theme = paper();
    let orange = hex(0xee7904);
    let mut markers = vec![
        Marker {
            longitude: -96.8,
            latitude: 32.78,
            radius: 16.0,
            fill: orange,
            stroke: hex(0xffffff),
            stroke_width: 2.5,
            label: Some("$42".into()),
            label_color: hex(0xffffff),
        },
        Marker {
            longitude: -97.33,
            latitude: 32.75,
            radius: 8.0,
            fill: hex(0xffffff),
            stroke: orange,
            stroke_width: 2.5,
            label: None,
            label_color: hex(0x14263d),
        },
    ];
    let mut seed: u64 = 0x9e37_79b9_7f4a_7c15;
    let mut random = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        (seed >> 11) as f64 / (1_u64 << 53) as f64
    };
    let spread = 360.0 / (512.0 * 2f64.powf(zoom)) * f64::from(width.max(height));
    for _ in 0..synthetic {
        let distance = random().powf(1.6) * spread * 0.6;
        let angle = random() * std::f64::consts::TAU;
        markers.push(Marker {
            longitude: longitude + distance * angle.cos(),
            latitude: latitude + distance * angle.sin() * 0.8,
            radius: 5.0,
            fill: orange,
            stroke: hex(0xffffff),
            stroke_width: 1.5,
            label: None,
            label_color: hex(0xffffff),
        });
    }
    let markers = instantmap_render::cluster(&camera, &markers, 44.0);
    let scene = Scene {
        camera,
        theme: &theme,
        tiles: &tiles,
        fonts: Some(&fonts),
        markers: &markers,
    };
    let started = Instant::now();
    let pixmap = render(&scene).unwrap();
    let rendered = started.elapsed();
    let png = pixmap.encode_png().unwrap();
    println!(
        "tiles {} decode {:?} render {:?} encode {:?} png {} bytes",
        tiles.len(),
        decoded,
        rendered,
        started.elapsed() - rendered,
        png.len()
    );
    std::fs::write(arguments.get(2).cloned().unwrap_or("out.png".into()), png).unwrap();
}
