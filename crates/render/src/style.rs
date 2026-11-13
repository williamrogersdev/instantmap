use crate::mvt::{GeometryType, Properties};

pub type Rgba = [u8; 4];

pub const fn hex(value: u32) -> Rgba {
    [(value >> 16) as u8, (value >> 8) as u8, value as u8, 255]
}

#[derive(Clone, Copy)]
pub enum Width {
    Fixed(f32),
    Exponential(&'static [(f32, f32)]),
}

impl Width {
    pub fn at(&self, zoom: f32) -> f32 {
        match *self {
            Width::Fixed(value) => value,
            Width::Exponential(stops) => interpolate(stops, zoom, 1.6),
        }
    }
}

pub fn interpolate(stops: &[(f32, f32)], zoom: f32, base: f32) -> f32 {
    let Some(first) = stops.first() else { return 0.0 };
    if zoom <= first.0 {
        return first.1;
    }
    for pair in stops.windows(2) {
        let (lower, upper) = (pair[0], pair[1]);
        if zoom <= upper.0 {
            let span = upper.0 - lower.0;
            let progress = if (base - 1.0).abs() < f32::EPSILON {
                (zoom - lower.0) / span
            } else {
                (base.powf(zoom - lower.0) - 1.0) / (base.powf(span) - 1.0)
            };
            return lower.1 + (upper.1 - lower.1) * progress;
        }
    }
    stops[stops.len() - 1].1
}

pub type Filter = fn(&Properties, GeometryType) -> bool;
pub type ColorFor = fn(&Properties) -> Rgba;

#[derive(Clone, Copy)]
pub enum Paint {
    Fill { color: ColorFor },
    Line { color: Rgba, width: Width, gap: Option<Width>, dash: Option<(f32, f32)> },
}

#[derive(Clone, Copy)]
pub struct Layer {
    pub id: &'static str,
    pub source_layer: &'static str,
    pub min_zoom: f32,
    pub max_zoom: f32,
    pub filter: Filter,
    pub paint: Paint,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Font {
    Regular,
    Medium,
}

#[derive(Clone, Copy)]
pub struct LabelRule {
    pub source_layer: &'static str,
    pub min_zoom: f32,
    pub filter: Filter,
    pub size: fn(&Properties, f32) -> f32,
    pub font: fn(&Properties) -> Font,
    pub uppercase: bool,
    pub letter_spacing: f32,
    pub color: Rgba,
    pub halo: Rgba,
    pub dot_below_zoom: f32,
    pub priority: fn(&Properties) -> f32,
}

pub struct Theme {
    pub background: Rgba,
    pub layers: Vec<Layer>,
    pub labels: Vec<LabelRule>,
}

fn polygon(_: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Polygon
}

fn not_bridge_or_tunnel(properties: &Properties) -> bool {
    !properties.has("is_tunnel") && !properties.has("is_bridge")
}

fn road_highway(properties: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Line && properties.kind_in(&["highway"]) && !properties.has("is_link")
}

fn road_major(properties: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Line && properties.kind_in(&["major_road"])
}

fn road_minor(properties: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Line && properties.kind_in(&["minor_road"])
}

fn road_link(properties: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Line && properties.has("is_link")
}

fn road_other(properties: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Line
        && properties.kind_in(&["other", "path"])
        && properties.str("kind_detail") != Some("pier")
        && not_bridge_or_tunnel(properties)
}

const HIGHWAY_WIDTH: Width = Width::Exponential(&[(3.0, 0.0), (6.0, 1.1), (12.0, 1.6), (15.0, 5.0), (18.0, 15.0)]);
const MAJOR_WIDTH: Width = Width::Exponential(&[(6.0, 0.0), (12.0, 1.6), (15.0, 3.0), (18.0, 13.0)]);
const MINOR_WIDTH: Width = Width::Exponential(&[(11.0, 0.0), (12.5, 0.5), (15.0, 2.0), (18.0, 11.0)]);
const LINK_WIDTH: Width = Width::Exponential(&[(13.0, 0.0), (13.5, 1.0), (18.0, 11.0)]);

pub fn repackify_light() -> Theme {
    const EARTH: Rgba = hex(0xf4f4f2);
    const PARK: Rgba = hex(0xe5ebde);
    let layers = vec![
        Layer { id: "earth", source_layer: "earth", min_zoom: 0.0, max_zoom: 24.0, filter: polygon, paint: Paint::Fill { color: |_| EARTH } },
        Layer {
            id: "landcover",
            source_layer: "landcover",
            min_zoom: 0.0,
            max_zoom: 7.0,
            filter: polygon,
            paint: Paint::Fill {
                color: |properties| match properties.str("kind") {
                    Some("barren") => hex(0xeeeeea),
                    Some("farmland") => hex(0xeef0e7),
                    Some("glacier") => hex(0xf4f4f2),
                    Some("grassland") => hex(0xebefe4),
                    Some("scrub") => hex(0xe9eee2),
                    Some("urban_area") => hex(0xf0f0ed),
                    _ => hex(0xe3eadc),
                },
            },
        },
        Layer {
            id: "landuse",
            source_layer: "landuse",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| {
                geometry == GeometryType::Polygon
                    && properties.kind_in(&[
                        "national_park", "park", "cemetery", "protected_area", "nature_reserve", "forest", "golf_course",
                        "wood", "scrub", "grassland", "grass", "glacier", "sand", "military", "allotments",
                        "village_green", "playground", "hospital", "industrial", "school", "university", "college",
                        "beach", "zoo", "aerodrome", "runway", "taxiway", "pedestrian", "dam", "pier",
                    ])
            },
            paint: Paint::Fill {
                color: |properties| match properties.str("kind") {
                    Some("hospital") => hex(0xf3eeee),
                    Some("industrial") | Some("military") | Some("aerodrome") => hex(0xefefec),
                    Some("school") | Some("university") | Some("college") => hex(0xf1f0ec),
                    Some("beach") | Some("sand") => hex(0xf1efe8),
                    Some("runway") | Some("taxiway") => hex(0xe4e4e1),
                    Some("pedestrian") | Some("dam") | Some("pier") | Some("glacier") => EARTH,
                    _ => PARK,
                },
            },
        },
        Layer { id: "water", source_layer: "water", min_zoom: 0.0, max_zoom: 24.0, filter: polygon, paint: Paint::Fill { color: |_| hex(0xcddbe6) } },
        Layer {
            id: "water_river",
            source_layer: "water",
            min_zoom: 9.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Line && properties.kind_in(&["river"]),
            paint: Paint::Line { color: hex(0xcddbe6), width: Width::Exponential(&[(9.0, 0.0), (9.5, 1.0), (18.0, 12.0)]), gap: None, dash: None },
        },
        Layer {
            id: "water_stream",
            source_layer: "water",
            min_zoom: 14.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Line && properties.kind_in(&["stream"]),
            paint: Paint::Line { color: hex(0xcddbe6), width: Width::Fixed(0.5), gap: None, dash: None },
        },
        Layer {
            id: "buildings",
            source_layer: "buildings",
            min_zoom: 13.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Polygon && properties.kind_in(&["building", "building_part"]),
            paint: Paint::Fill { color: |_| hex(0xe8e8e5) },
        },
        Layer {
            id: "roads_minor_casing",
            source_layer: "roads",
            min_zoom: 12.0,
            max_zoom: 24.0,
            filter: road_minor,
            paint: Paint::Line { color: hex(0xe4e4e1), width: Width::Exponential(&[(12.0, 0.0), (12.5, 1.0)]), gap: Some(MINOR_WIDTH), dash: None },
        },
        Layer {
            id: "roads_link_casing",
            source_layer: "roads",
            min_zoom: 13.0,
            max_zoom: 24.0,
            filter: road_link,
            paint: Paint::Line { color: hex(0xdcdcd8), width: Width::Exponential(&[(13.0, 0.0), (13.5, 1.5)]), gap: Some(LINK_WIDTH), dash: None },
        },
        Layer {
            id: "roads_major_casing",
            source_layer: "roads",
            min_zoom: 9.0,
            max_zoom: 24.0,
            filter: road_major,
            paint: Paint::Line { color: hex(0xd6d6d2), width: Width::Exponential(&[(9.0, 0.0), (9.5, 1.0)]), gap: Some(MAJOR_WIDTH), dash: None },
        },
        Layer {
            id: "roads_highway_casing",
            source_layer: "roads",
            min_zoom: 7.0,
            max_zoom: 24.0,
            filter: road_highway,
            paint: Paint::Line { color: hex(0xd9cbbd), width: Width::Exponential(&[(7.0, 0.0), (7.5, 1.0), (20.0, 15.0)]), gap: Some(HIGHWAY_WIDTH), dash: None },
        },
        Layer {
            id: "roads_other",
            source_layer: "roads",
            min_zoom: 14.0,
            max_zoom: 24.0,
            filter: road_other,
            paint: Paint::Line { color: hex(0xffffff), width: Width::Exponential(&[(14.0, 0.5), (20.0, 12.0)]), gap: None, dash: None },
        },
        Layer { id: "roads_link", source_layer: "roads", min_zoom: 13.0, max_zoom: 24.0, filter: road_link, paint: Paint::Line { color: hex(0xffffff), width: LINK_WIDTH, gap: None, dash: None } },
        Layer { id: "roads_minor", source_layer: "roads", min_zoom: 11.0, max_zoom: 24.0, filter: road_minor, paint: Paint::Line { color: hex(0xffffff), width: MINOR_WIDTH, gap: None, dash: None } },
        Layer { id: "roads_major", source_layer: "roads", min_zoom: 6.0, max_zoom: 24.0, filter: road_major, paint: Paint::Line { color: hex(0xffffff), width: MAJOR_WIDTH, gap: None, dash: None } },
        Layer { id: "roads_highway", source_layer: "roads", min_zoom: 3.0, max_zoom: 24.0, filter: road_highway, paint: Paint::Line { color: hex(0xfdf1e6), width: HIGHWAY_WIDTH, gap: None, dash: None } },
        Layer {
            id: "roads_rail",
            source_layer: "roads",
            min_zoom: 3.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Line && properties.kind_in(&["rail"]),
            paint: Paint::Line { color: hex(0xcfcfcb), width: Width::Exponential(&[(3.0, 0.0), (6.0, 0.15), (18.0, 9.0)]), gap: None, dash: None },
        },
        Layer {
            id: "boundaries_country",
            source_layer: "boundaries",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Line && properties.number("kind_detail").is_some_and(|level| level <= 2.0),
            paint: Paint::Line { color: hex(0xc4c4c0), width: Width::Fixed(0.7), gap: None, dash: Some((2.0, 1.0)) },
        },
        Layer {
            id: "boundaries",
            source_layer: "boundaries",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| geometry == GeometryType::Line && properties.number("kind_detail").is_some_and(|level| level > 2.0),
            paint: Paint::Line { color: hex(0xc4c4c0), width: Width::Fixed(0.4), gap: None, dash: Some((2.0, 1.0)) },
        },
    ];
    let labels = vec![
        LabelRule {
            source_layer: "places",
            min_zoom: 0.0,
            filter: |properties, _| properties.kind_in(&["country"]),
            size: |properties, zoom| {
                let large = properties.number("population_rank").unwrap_or(0.0) >= 10.0;
                interpolate(if large { &[(2.0, 12.0), (6.0, 18.0), (8.0, 20.0)] } else { &[(2.0, 8.0), (6.0, 10.0), (8.0, 11.0)] }, zoom, 1.0)
            },
            font: |_| Font::Medium,
            uppercase: true,
            letter_spacing: 0.0,
            color: hex(0x8a8a87),
            halo: hex(0xf4f4f2),
            dot_below_zoom: 0.0,
            priority: |properties| properties.number("sort_key").or_else(|| properties.number("min_zoom")).unwrap_or(0.0) as f32 - 1000.0,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 3.0,
            filter: |properties, _| properties.kind_in(&["region"]),
            size: |_, zoom| interpolate(&[(3.0, 11.0), (7.0, 16.0)], zoom, 1.0),
            font: |_| Font::Regular,
            uppercase: true,
            letter_spacing: 0.0,
            color: hex(0xa3a3a0),
            halo: hex(0xf4f4f2),
            dot_below_zoom: 0.0,
            priority: |properties| properties.number("sort_key").unwrap_or(0.0) as f32 - 500.0,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 0.0,
            filter: |properties, _| properties.kind_in(&["locality"]),
            size: |properties, zoom| {
                let rank = properties.number("population_rank").unwrap_or(0.0);
                let stops: [(f32, f32); 6] = [
                    (2.0, if rank < 13.0 { 8.0 } else { 13.0 }),
                    (4.0, if rank < 13.0 { 10.0 } else { 15.0 }),
                    (6.0, if rank < 12.0 { 11.0 } else { 17.0 }),
                    (8.0, if rank < 11.0 { 11.0 } else { 18.0 }),
                    (10.0, if rank < 9.0 { 12.0 } else { 20.0 }),
                    (15.0, if rank < 8.0 { 12.0 } else { 22.0 }),
                ];
                interpolate(&stops, zoom, 1.0)
            },
            font: |properties| if properties.number("min_zoom").is_some_and(|zoom| zoom <= 5.0) { Font::Medium } else { Font::Regular },
            uppercase: false,
            letter_spacing: 0.0,
            color: hex(0x3b3b39),
            halo: hex(0xffffff),
            dot_below_zoom: 8.0,
            priority: |properties| properties.number("sort_key").or_else(|| properties.number("min_zoom")).unwrap_or(0.0) as f32,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 12.0,
            filter: |properties, _| properties.kind_in(&["neighbourhood", "macrohood"]),
            size: |_, zoom| interpolate(&[(11.0, 8.0), (14.0, 14.0), (18.0, 24.0)], zoom, 1.2),
            font: |_| Font::Regular,
            uppercase: true,
            letter_spacing: 0.1,
            color: hex(0x7a7a77),
            halo: hex(0xf4f4f2),
            dot_below_zoom: 0.0,
            priority: |properties| properties.number("sort_key").or_else(|| properties.number("min_zoom")).unwrap_or(0.0) as f32 + 100.0,
        },
        LabelRule {
            source_layer: "water",
            min_zoom: 0.0,
            filter: |properties, geometry| geometry == GeometryType::Point && properties.kind_in(&["sea", "ocean", "bay", "strait", "fjord", "lake", "water"]),
            size: |_, _| 12.0,
            font: |_| Font::Regular,
            uppercase: false,
            letter_spacing: 0.05,
            color: hex(0x7f98ab),
            halo: [0, 0, 0, 0],
            dot_below_zoom: 0.0,
            priority: |properties| properties.number("min_zoom").unwrap_or(0.0) as f32 + 50.0,
        },
    ];
    Theme { background: EARTH, layers, labels }
}
