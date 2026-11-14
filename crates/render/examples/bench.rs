//! Native benchmark for the renderer.
//!
//! Usage: bench [--json] [--iterations N] [--scene NAME] [--seconds S]

use std::hint::black_box;
use std::time::{Duration, Instant};

use instantmap_render::glyphs::FontStack;
use instantmap_render::mvt::Tile;
use instantmap_render::style::{Palette, theme};
use instantmap_render::{Camera, Fonts, Format, Marker, Scene, TileId, cluster, encode, render};

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures");
const WARMUP: usize = 3;

struct Spec {
    name: &'static str,
    camera: Camera,
    markers: Vec<Marker>,
    cluster_distance: Option<f32>,
}

fn tile_camera(z: u32, x: u32, y: u32, ratio: f32) -> Camera {
    Camera::for_tile(TileId { z, x, y }, ratio)
}

fn static_camera(longitude: f64, latitude: f64, zoom: f64, w: u32, h: u32, ratio: f32) -> Camera {
    Camera {
        longitude,
        latitude,
        zoom,
        width: w,
        height: h,
        pixel_ratio: ratio,
    }
}

fn synthetic_markers(camera: &Camera, count: usize) -> Vec<Marker> {
    let mut seed: u64 = 0x9e37_79b9_7f4a_7c15;
    let mut random = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        (seed >> 11) as f64 / (1_u64 << 53) as f64
    };
    let spread =
        360.0 / (512.0 * 2f64.powf(camera.zoom)) * f64::from(camera.width.max(camera.height));
    (0..count)
        .map(|index| {
            let distance = random().powf(1.6) * spread * 0.6;
            let angle = random() * std::f64::consts::TAU;
            Marker {
                longitude: camera.longitude + distance * angle.cos(),
                latitude: camera.latitude + distance * angle.sin() * 0.8,
                count: 1,
                selected: false,
                label: (index % 10 == 0).then(|| format!("${}", 10 + index % 90)),
            }
        })
        .collect()
}

fn specs() -> Vec<Spec> {
    let city_static = static_camera(-96.80, 32.79, 12.0, 960, 540, 2.0);
    let plain = |name, camera| Spec {
        name,
        camera,
        markers: Vec::new(),
        cluster_distance: None,
    };
    vec![
        plain("tile-city-1x", tile_camera(12, 946, 1652, 1.0)),
        plain("tile-city-2x", tile_camera(12, 946, 1652, 2.0)),
        plain("tile-metro-2x", tile_camera(9, 117, 206, 2.0)),
        plain("tile-region-2x", tile_camera(7, 29, 51, 2.0)),
        plain("tile-world-2x", tile_camera(3, 1, 2, 2.0)),
        plain("static-city-2x", city_static),
        Spec {
            name: "static-city-2x-400-markers",
            camera: city_static,
            markers: synthetic_markers(&city_static, 400),
            cluster_distance: Some(44.0),
        },
        plain(
            "static-national-1x",
            static_camera(-98.5, 38.5, 3.0, 1280, 800, 1.0),
        ),
    ]
}

fn font(name: &str) -> FontStack {
    let bytes = std::fs::read(format!("{FIXTURES}/{name}-0-255.pbf")).expect("font fixture");
    FontStack::from_pbf_ranges([bytes.as_slice()]).expect("font parse")
}

#[derive(Clone, Copy)]
struct Stats {
    median: f64,
    p90: f64,
    min: f64,
}

fn stats(samples: &[f64]) -> Stats {
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let at = |q: f64| {
        let rank = (q * sorted.len() as f64).ceil() as usize;
        sorted[rank.clamp(1, sorted.len()) - 1]
    };
    let median = if sorted.len() % 2 == 1 {
        sorted[sorted.len() / 2]
    } else {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    };
    Stats {
        median,
        p90: at(0.9),
        min: sorted[0],
    }
}

fn ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

struct Result {
    name: &'static str,
    width: u32,
    height: u32,
    pixel_ratio: f32,
    tiles: usize,
    markers: usize,
    decode: Stats,
    render: Stats,
    jpeg: Stats,
    png: Stats,
    total: Stats,
    jpeg_bytes: usize,
    png_bytes: usize,
}

struct Prepared<'a> {
    spec: &'a Spec,
    owned: Vec<(TileId, Vec<u8>)>,
    clustered: Vec<Marker>,
    quality: u8,
}

fn prepare(spec: &Spec) -> Prepared<'_> {
    let owned = spec
        .camera
        .tiles(256.0)
        .into_iter()
        .filter_map(|placement| {
            let id = placement.id;
            std::fs::read(format!("{FIXTURES}/{}-{}-{}.mvt", id.z, id.x, id.y))
                .ok()
                .map(|bytes| (id, bytes))
        })
        .collect();
    let clustered = match spec.cluster_distance {
        Some(distance) => cluster(&spec.camera, &spec.markers, distance),
        None => cluster(&spec.camera, &spec.markers, 44.0),
    };
    Prepared {
        spec,
        owned,
        clustered,
        quality: if spec.camera.pixel_ratio >= 2.0 {
            72
        } else {
            86
        },
    }
}

fn decode_all(owned: &[(TileId, Vec<u8>)]) -> Vec<(TileId, Tile<'_>)> {
    owned
        .iter()
        .map(|(id, bytes)| (*id, Tile::decode(bytes).expect("decode")))
        .collect()
}

/// Decode, render, JPEG encode. Returns (decode, render, jpeg) times and the JPEG size.
fn pipeline(
    prepared: &Prepared<'_>,
    theme: &instantmap_render::style::Theme,
    fonts: &Fonts,
) -> (Duration, Duration, Duration, usize) {
    let started = Instant::now();
    let tiles = black_box(decode_all(&prepared.owned));
    let decoded = started.elapsed();
    let scene = Scene {
        camera: prepared.spec.camera,
        theme,
        tiles: &tiles,
        fonts: Some(fonts),
        markers: &prepared.clustered,
    };
    let started = Instant::now();
    let pixmap = black_box(render(&scene).expect("render"));
    let rendered = started.elapsed();
    let started = Instant::now();
    let jpeg = black_box(
        encode(
            &pixmap,
            Format::Jpeg {
                quality: prepared.quality,
            },
        )
        .expect("jpeg"),
    );
    let jpeg_time = started.elapsed();
    (decoded, rendered, jpeg_time, jpeg.len())
}

fn measure(
    prepared: &Prepared<'_>,
    theme: &instantmap_render::style::Theme,
    fonts: &Fonts,
    iterations: usize,
) -> Result {
    for _ in 0..WARMUP {
        black_box(pipeline(prepared, theme, fonts));
        let tiles = decode_all(&prepared.owned);
        let scene = Scene {
            camera: prepared.spec.camera,
            theme,
            tiles: &tiles,
            fonts: Some(fonts),
            markers: &prepared.clustered,
        };
        let pixmap = render(&scene).expect("render");
        black_box(encode(&pixmap, Format::Png));
    }
    let (mut decode, mut rendr, mut jpeg, mut png, mut total) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut jpeg_bytes, mut png_bytes) = (0, 0);
    for _ in 0..iterations {
        let started = Instant::now();
        let tiles = black_box(decode_all(&prepared.owned));
        let decoded = started.elapsed();
        let scene = Scene {
            camera: prepared.spec.camera,
            theme,
            tiles: &tiles,
            fonts: Some(fonts),
            markers: &prepared.clustered,
        };
        let started = Instant::now();
        let pixmap = black_box(render(&scene).expect("render"));
        let rendered = started.elapsed();
        let started = Instant::now();
        let jpeg_out = black_box(
            encode(
                &pixmap,
                Format::Jpeg {
                    quality: prepared.quality,
                },
            )
            .expect("jpeg"),
        );
        let jpeg_time = started.elapsed();
        let started = Instant::now();
        let png_out = black_box(encode(&pixmap, Format::Png).expect("png"));
        let png_time = started.elapsed();
        jpeg_bytes = jpeg_out.len();
        png_bytes = png_out.len();
        decode.push(ms(decoded));
        rendr.push(ms(rendered));
        jpeg.push(ms(jpeg_time));
        png.push(ms(png_time));
        total.push(ms(decoded + rendered + jpeg_time));
    }
    let camera = prepared.spec.camera;
    Result {
        name: prepared.spec.name,
        width: camera.width,
        height: camera.height,
        pixel_ratio: camera.pixel_ratio,
        tiles: prepared.owned.len(),
        markers: prepared.spec.markers.len(),
        decode: stats(&decode),
        render: stats(&rendr),
        jpeg: stats(&jpeg),
        png: stats(&png),
        total: stats(&total),
        jpeg_bytes,
        png_bytes,
    }
}

fn stats_json(s: Stats) -> String {
    format!(
        "{{\"median\":{:.3},\"p90\":{:.3},\"min\":{:.3}}}",
        s.median, s.p90, s.min
    )
}

fn scene_json(r: &Result) -> String {
    format!(
        "{{\"name\":\"{}\",\"width\":{},\"height\":{},\"pixelRatio\":{},\"tiles\":{},\"markers\":{},\"decodeMs\":{},\"renderMs\":{},\"jpegMs\":{},\"pngMs\":{},\"totalJpegMs\":{},\"jpegBytes\":{},\"pngBytes\":{}}}",
        r.name,
        r.width,
        r.height,
        r.pixel_ratio,
        r.tiles,
        r.markers,
        stats_json(r.decode),
        stats_json(r.render),
        stats_json(r.jpeg),
        stats_json(r.png),
        stats_json(r.total),
        r.jpeg_bytes,
        r.png_bytes
    )
}

fn print_table(results: &[Result], iterations: usize) {
    println!("iterations: {iterations} (median / p90 / min, ms)");
    println!(
        "{:<28} {:>9} {:>5} {:>4} {:>19} {:>19} {:>19} {:>19} {:>19} {:>9} {:>9}",
        "scene",
        "size",
        "tiles",
        "mrk",
        "decode",
        "render",
        "jpeg",
        "png",
        "total(jpeg)",
        "jpegB",
        "pngB"
    );
    let cell = |s: Stats| format!("{:.2}/{:.2}/{:.2}", s.median, s.p90, s.min);
    for r in results {
        println!(
            "{:<28} {:>9} {:>5} {:>4} {:>19} {:>19} {:>19} {:>19} {:>19} {:>9} {:>9}",
            r.name,
            format!("{}x{}", r.width, r.height),
            r.tiles,
            r.markers,
            cell(r.decode),
            cell(r.render),
            cell(r.jpeg),
            cell(r.png),
            cell(r.total),
            r.jpeg_bytes,
            r.png_bytes
        );
    }
}

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mut json = false;
    let mut iterations = 30usize;
    let mut only: Option<String> = None;
    let mut seconds: Option<f64> = None;
    let mut index = 0;
    let value = |index: usize, flag: &str| -> String {
        arguments.get(index + 1).cloned().unwrap_or_else(|| {
            eprintln!("{flag} needs a value");
            std::process::exit(2);
        })
    };
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--json" => json = true,
            "--iterations" => {
                iterations = value(index, "--iterations").parse().unwrap_or_else(|_| {
                    eprintln!("--iterations needs a positive integer");
                    std::process::exit(2);
                });
                iterations = iterations.max(1);
                index += 1;
            }
            "--scene" => {
                only = Some(value(index, "--scene"));
                index += 1;
            }
            "--seconds" => {
                seconds = Some(value(index, "--seconds").parse().unwrap_or_else(|_| {
                    eprintln!("--seconds needs a number");
                    std::process::exit(2);
                }));
                index += 1;
            }
            other => {
                eprintln!("unknown argument {other}");
                std::process::exit(2);
            }
        }
        index += 1;
    }

    let all = specs();
    let selected: Vec<&Spec> = match &only {
        Some(name) => {
            let found: Vec<&Spec> = all.iter().filter(|spec| spec.name == name).collect();
            if found.is_empty() {
                let names: Vec<&str> = all.iter().map(|spec| spec.name).collect();
                eprintln!("unknown scene {name}; scenes: {}", names.join(", "));
                std::process::exit(2);
            }
            found
        }
        None => all.iter().collect(),
    };

    let fonts = Fonts {
        regular: font("noto-sans-regular"),
        medium: font("noto-sans-medium"),
        italic: font("noto-sans-italic"),
    };
    let theme = theme(&Palette::daylight());

    if let Some(seconds) = seconds {
        for spec in selected {
            let prepared = prepare(spec);
            let deadline = Duration::from_secs_f64(seconds.max(0.0));
            let started = Instant::now();
            let mut count = 0u64;
            while count == 0 || started.elapsed() < deadline {
                black_box(pipeline(&prepared, &theme, &fonts));
                count += 1;
            }
            eprintln!(
                "{}: {count} iterations in {:.2}s",
                spec.name,
                started.elapsed().as_secs_f64()
            );
        }
        return;
    }

    let results: Vec<Result> = selected
        .iter()
        .map(|spec| measure(&prepare(spec), &theme, &fonts, iterations))
        .collect();
    if json {
        let scenes: Vec<String> = results.iter().map(scene_json).collect();
        println!(
            "{{\"iterations\":{iterations},\"scenes\":[{}]}}",
            scenes.join(",")
        );
    } else {
        print_table(&results, iterations);
    }
}
