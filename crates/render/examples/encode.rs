use std::time::Instant;

fn main() {
    for path in std::env::args().skip(1) {
        let decoder =
            png::Decoder::new(std::io::BufReader::new(std::fs::File::open(&path).unwrap()));
        let mut reader = decoder.read_info().unwrap();
        let mut rgba = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut rgba).unwrap();
        let (width, height) = (info.width, info.height);
        let rgb: Vec<u8> = rgba
            .chunks_exact(4)
            .flat_map(|p| [p[0], p[1], p[2]])
            .collect();
        println!("== {path} {width}x{height}");

        for (label, compression) in [
            ("png fast", png::Compression::Fast),
            ("png default", png::Compression::Balanced),
        ] {
            let started = Instant::now();
            let mut out = Vec::new();
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Rgb);
            encoder.set_compression(compression);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&rgb)
                .unwrap();
            println!(
                "  {label:<22} {:>8} bytes {:?}",
                out.len(),
                started.elapsed()
            );
        }

        for colors in [256, 128] {
            let started = Instant::now();
            let quantizer = color_quant::NeuQuant::new(10, colors, &rgba);
            let palette = quantizer.color_map_rgb();
            let indices: Vec<u8> = rgba
                .chunks_exact(4)
                .map(|p| quantizer.index_of(p) as u8)
                .collect();
            let mut out = Vec::new();
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Indexed);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.set_palette(palette);
            encoder.set_compression(png::Compression::Balanced);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&indices)
                .unwrap();
            std::fs::write(format!("{path}.q{colors}.png"), &out).unwrap();
            println!(
                "  {:<22} {:>8} bytes {:?}",
                format!("png palette {colors}"),
                out.len(),
                started.elapsed()
            );
        }

        let started = Instant::now();
        let mut out = Vec::new();
        image_webp::WebPEncoder::new(&mut out)
            .encode(&rgb, width, height, image_webp::ColorType::Rgb8)
            .unwrap();
        println!(
            "  {:<22} {:>8} bytes {:?}",
            "webp lossless",
            out.len(),
            started.elapsed()
        );

        for quality in [85, 92] {
            let started = Instant::now();
            let mut out = Vec::new();
            jpeg_encoder::Encoder::new(&mut out, quality)
                .encode(
                    &rgb,
                    width as u16,
                    height as u16,
                    jpeg_encoder::ColorType::Rgb,
                )
                .unwrap();
            std::fs::write(format!("{path}.q{quality}.jpg"), &out).unwrap();
            println!(
                "  {:<22} {:>8} bytes {:?}",
                format!("jpeg q{quality}"),
                out.len(),
                started.elapsed()
            );
        }
    }
}
