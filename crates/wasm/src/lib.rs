use instantmap_render::glyphs::FontStack;
use instantmap_render::mvt::Tile;
use instantmap_render::render::TILE_SIZE;
use instantmap_render::style::{Rgba, Theme, paper};
use instantmap_render::{Camera, Fonts, Format, Marker, Scene, TileId, cluster, render_image};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Renderer {
    fonts: Fonts,
    theme: Theme,
}

fn rgba(value: f64) -> Rgba {
    let packed = value as u32;
    [
        (packed >> 24) as u8,
        (packed >> 16) as u8,
        (packed >> 8) as u8,
        packed as u8,
    ]
}

fn camera_from(values: &[f64]) -> Result<Camera, JsError> {
    let [longitude, latitude, zoom, width, height, pixel_ratio] =
        <[f64; 6]>::try_from(values).map_err(|_| JsError::new("camera needs 6 numbers"))?;
    if !(1.0..=2048.0).contains(&width)
        || !(1.0..=2048.0).contains(&height)
        || !(1.0..=3.0).contains(&pixel_ratio)
    {
        return Err(JsError::new("camera size out of range"));
    }
    if !longitude.is_finite() || !latitude.is_finite() || !zoom.is_finite() {
        return Err(JsError::new("camera must be finite"));
    }
    Ok(Camera {
        longitude,
        latitude: latitude.clamp(-85.0, 85.0),
        zoom: zoom.clamp(0.0, 20.0),
        width: width as u32,
        height: height as u32,
        pixel_ratio: pixel_ratio as f32,
    })
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(regular: &[u8], medium: &[u8], italic: &[u8]) -> Result<Renderer, JsError> {
        let load = |bytes: &[u8]| {
            FontStack::from_pbf_ranges([bytes]).map_err(|error| JsError::new(&error.to_string()))
        };
        Ok(Renderer {
            fonts: Fonts {
                regular: load(regular)?,
                medium: load(medium)?,
                italic: load(italic)?,
            },
            theme: paper(),
        })
    }

    /// camera: [longitude, latitude, zoom, width, height, pixelRatio]
    /// tileIds: [z, x, y, ...] matching tileLengths; tileData: the tiles' bytes concatenated
    /// markers: [longitude, latitude, radius, fillRGBA, strokeRGBA, strokeWidth, labelRGBA, ...] (7 per marker)
    /// labels: one line per marker, empty for none
    /// clusterDistance: CSS pixels within which markers merge into a count bubble, 0 to keep every marker
    /// quality: 0 for PNG, 1..=100 for JPEG
    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &self,
        camera: &[f64],
        tile_ids: &[u32],
        tile_lengths: &[u32],
        tile_data: &[u8],
        markers: &[f64],
        labels: &str,
        cluster_distance: f32,
        quality: u8,
    ) -> Result<Vec<u8>, JsError> {
        let camera = camera_from(camera)?;
        if tile_ids.len() != tile_lengths.len() * 3 {
            return Err(JsError::new("tileIds must hold 3 numbers per tile"));
        }
        let mut tiles = Vec::with_capacity(tile_lengths.len());
        let mut offset = 0_usize;
        for (index, length) in tile_lengths.iter().enumerate() {
            let end = offset + *length as usize;
            let bytes = tile_data
                .get(offset..end)
                .ok_or_else(|| JsError::new("tileData shorter than tileLengths"))?;
            offset = end;
            let id = TileId {
                z: tile_ids[index * 3],
                x: tile_ids[index * 3 + 1],
                y: tile_ids[index * 3 + 2],
            };
            let tile = Tile::decode(bytes).map_err(|error| {
                JsError::new(&format!("tile {}/{}/{}: {error}", id.z, id.x, id.y))
            })?;
            tiles.push((id, tile));
        }
        let mut label_lines = labels.split('\n');
        let markers: Vec<Marker> = markers
            .chunks_exact(7)
            .map(|values| Marker {
                longitude: values[0],
                latitude: values[1],
                radius: values[2] as f32,
                fill: rgba(values[3]),
                stroke: rgba(values[4]),
                stroke_width: values[5] as f32,
                label: label_lines
                    .next()
                    .filter(|text| !text.is_empty())
                    .map(str::to_owned),
                label_color: rgba(values[6]),
            })
            .collect();
        let markers = if cluster_distance > 0.0 {
            cluster(&camera, &markers, cluster_distance)
        } else {
            markers
        };
        let scene = Scene {
            camera,
            theme: &self.theme,
            tiles: &tiles,
            fonts: Some(&self.fonts),
            markers: &markers,
        };
        let format = if quality == 0 {
            Format::Png
        } else {
            Format::Jpeg {
                quality: quality.min(100),
            }
        };
        render_image(&scene, format).ok_or_else(|| JsError::new("render failed"))
    }
}

/// [z, x, y, ...] of the source tiles a camera needs, including the margin the shoreline shade reads.
#[wasm_bindgen(js_name = tilesFor)]
pub fn tiles_for(camera: &[f64]) -> Result<Vec<u32>, JsError> {
    let camera = camera_from(camera)?;
    let mut ids: Vec<TileId> = camera
        .tiles(TILE_SIZE / 4.0)
        .into_iter()
        .map(|placement| placement.id)
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids.into_iter().flat_map(|id| [id.z, id.x, id.y]).collect())
}

/// The camera that renders exactly tile z/x/y: [longitude, latitude, zoom, 512, 512, pixelRatio].
#[wasm_bindgen(js_name = tileCamera)]
pub fn tile_camera(z: u32, x: u32, y: u32, pixel_ratio: f32) -> Vec<f64> {
    let camera = Camera::for_tile(TileId { z, x, y }, pixel_ratio);
    vec![
        camera.longitude,
        camera.latitude,
        camera.zoom,
        f64::from(camera.width),
        f64::from(camera.height),
        f64::from(pixel_ratio),
    ]
}
