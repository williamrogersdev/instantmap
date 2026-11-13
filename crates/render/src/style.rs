use crate::mvt::{GeometryType, Properties};

pub type Rgba = [u8; 4];

pub const fn hex(value: u32) -> Rgba {
    [(value >> 16) as u8, (value >> 8) as u8, value as u8, 255]
}

pub const fn alpha(color: Rgba, opacity: u8) -> Rgba {
    [color[0], color[1], color[2], opacity]
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
            Width::Exponential(stops) => interpolate(stops, zoom, 1.5),
        }
    }
}

pub fn interpolate(stops: &[(f32, f32)], zoom: f32, base: f32) -> f32 {
    let Some(first) = stops.first() else {
        return 0.0;
    };
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
pub type LabelFilter = fn(&Properties, f32) -> bool;
pub type FillColor = fn(&Properties, f32) -> Option<Rgba>;

#[derive(Clone, Copy)]
pub enum Paint {
    Fill {
        color: FillColor,
    },
    Line {
        color: Rgba,
        width: Width,
        dash: Option<(f32, f32)>,
    },
    ShoreShade {
        color: Rgba,
        radius: f32,
        land_layer: &'static str,
    },
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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Font {
    Regular,
    Medium,
    Italic,
}

#[derive(Clone, Copy)]
pub struct Dot {
    pub radius: f32,
    pub fill: Rgba,
    pub stroke: Rgba,
    pub stroke_width: f32,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Placement {
    Point,
    Area,
    Shield {
        fill: Rgba,
        stroke: Rgba,
        spacing: f32,
    },
}

#[derive(Clone, Copy)]
pub struct LabelRule {
    pub source_layer: &'static str,
    pub min_zoom: f32,
    pub max_zoom: f32,
    pub filter: LabelFilter,
    pub text: fn(&Properties) -> Option<String>,
    pub size: fn(&Properties, f32) -> f32,
    pub font: fn(&Properties) -> Font,
    pub uppercase: bool,
    pub letter_spacing: f32,
    pub color: fn(&Properties) -> Rgba,
    pub halo: Rgba,
    pub halo_width: f32,
    pub dot: Option<(Dot, f32)>,
    pub priority: fn(&Properties) -> f32,
    pub padding: f32,
    pub placement: Placement,
}

pub struct MarkerStyle {
    pub shadow: Rgba,
    pub shadow_blur: f32,
    pub shadow_offset: f32,
}

pub struct Theme {
    pub background: Rgba,
    pub layers: Vec<Layer>,
    pub labels: Vec<LabelRule>,
    pub markers: MarkerStyle,
}

pub const PAPER: Rgba = hex(0xf3f1ec);
const WATER: Rgba = hex(0xc9dbe6);
const SHORE: Rgba = hex(0x9fbad0);
const WATER_INK: Rgba = hex(0x5f849f);
const PARK: Rgba = hex(0xe3ead9);
const MAJOR_INK: Rgba = hex(0x3d3a35);
const MINOR_INK: Rgba = hex(0x7a756d);

fn polygon(_: &Properties, geometry: GeometryType) -> bool {
    geometry == GeometryType::Polygon
}

fn line(geometry: GeometryType) -> bool {
    geometry == GeometryType::Line
}

fn surface(properties: &Properties) -> bool {
    !properties.has("is_tunnel")
}

fn highway(properties: &Properties, geometry: GeometryType) -> bool {
    line(geometry)
        && properties.kind_in(&["highway"])
        && !properties.has("is_link")
        && surface(properties)
}

fn major(properties: &Properties, geometry: GeometryType) -> bool {
    line(geometry)
        && properties.kind_in(&["major_road"])
        && !properties.has("is_link")
        && surface(properties)
}

fn minor(properties: &Properties, geometry: GeometryType) -> bool {
    line(geometry) && properties.kind_in(&["minor_road"]) && surface(properties)
}

fn link(properties: &Properties, geometry: GeometryType) -> bool {
    line(geometry) && properties.has("is_link") && surface(properties)
}

fn path(properties: &Properties, geometry: GeometryType) -> bool {
    line(geometry)
        && properties.kind_in(&["other", "path"])
        && properties.str("kind_detail") != Some("pier")
        && surface(properties)
}

fn boundary(properties: &Properties, geometry: GeometryType, kinds: &[&str]) -> bool {
    line(geometry) && properties.kind_in(kinds) && !properties.has("maritime")
}

const HIGHWAY: Width = Width::Exponential(&[
    (5.0, 0.6),
    (8.0, 1.2),
    (10.0, 2.0),
    (14.0, 6.0),
    (18.0, 22.0),
]);
const HIGHWAY_CASING: Width = Width::Exponential(&[
    (8.0, 0.0),
    (8.5, 3.2),
    (10.0, 4.0),
    (14.0, 8.5),
    (18.0, 26.0),
]);
const MAJOR: Width = Width::Exponential(&[
    (7.0, 0.4),
    (10.0, 0.9),
    (12.0, 2.0),
    (15.0, 5.0),
    (18.0, 16.0),
]);
const MAJOR_CASING: Width = Width::Exponential(&[
    (10.5, 0.0),
    (11.0, 2.6),
    (12.0, 3.4),
    (15.0, 7.0),
    (18.0, 19.0),
]);
const MINOR: Width = Width::Exponential(&[(11.0, 0.3), (13.0, 1.4), (15.0, 3.0), (18.0, 12.0)]);
const MINOR_CASING: Width =
    Width::Exponential(&[(12.5, 0.0), (13.0, 2.4), (15.0, 4.6), (18.0, 14.5)]);
const LINK: Width = Width::Exponential(&[(12.0, 0.5), (14.0, 2.0), (18.0, 10.0)]);
const LINK_CASING: Width =
    Width::Exponential(&[(12.5, 0.0), (13.0, 2.2), (14.0, 3.6), (18.0, 12.5)]);

fn landuse(properties: &Properties, zoom: f32) -> Option<Rgba> {
    let kind = properties.str("kind")?;
    let park_opacity = interpolate(&[(8.0, 0.0), (10.0, 160.0), (14.0, 255.0)], zoom, 1.0) as u8;
    match kind {
        "park" | "national_park" | "nature_reserve" | "protected_area" | "garden"
        | "golf_course" | "zoo" | "wood" | "forest" => {
            (park_opacity > 0).then_some(alpha(PARK, park_opacity))
        }
        "cemetery" | "pitch" | "grass" | "village_green" | "playground" if zoom >= 13.0 => {
            Some(hex(0xe6ebdd))
        }
        "beach" | "sand" if zoom >= 11.0 => Some(hex(0xf1ece0)),
        "school" | "university" | "college" | "hospital" if zoom >= 13.0 => Some(hex(0xefebe4)),
        "industrial" | "aerodrome" | "airfield" | "military" | "railway" if zoom >= 13.0 => {
            Some(hex(0xeceae5))
        }
        "runway" | "taxiway" if zoom >= 12.0 => Some(hex(0xe2dfd8)),
        _ => None,
    }
}

fn population(properties: &Properties) -> f64 {
    properties.number("population").unwrap_or(0.0)
}

fn city_threshold(zoom: f32) -> f64 {
    match zoom {
        zoom if zoom < 4.0 => 1_500_000.0,
        zoom if zoom < 5.0 => 600_000.0,
        zoom if zoom < 6.0 => 200_000.0,
        zoom if zoom < 7.0 => 80_000.0,
        zoom if zoom < 8.0 => 25_000.0,
        zoom if zoom < 9.0 => 10_000.0,
        zoom if zoom < 10.0 => 4_000.0,
        _ => 0.0,
    }
}

fn is_major_city(properties: &Properties) -> bool {
    population(properties) >= 250_000.0
}

fn name(properties: &Properties) -> Option<String> {
    properties
        .str("name:en")
        .or_else(|| properties.str("name"))
        .map(str::to_owned)
}

fn shield(properties: &Properties) -> Option<String> {
    let text = properties.str("shield_text")?;
    (!text.is_empty() && text.len() <= 4).then(|| text.to_owned())
}

pub fn paper() -> Theme {
    let layers = vec![
        Layer {
            id: "earth",
            source_layer: "earth",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill {
                color: |_, _| Some(PAPER),
            },
        },
        Layer {
            id: "landuse",
            source_layer: "landuse",
            min_zoom: 8.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill { color: landuse },
        },
        Layer {
            id: "water",
            source_layer: "water",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill {
                color: |_, _| Some(WATER),
            },
        },
        Layer {
            id: "water_shore",
            source_layer: "water",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::ShoreShade {
                color: alpha(SHORE, 120),
                radius: 10.0,
                land_layer: "earth",
            },
        },
        Layer {
            id: "rivers",
            source_layer: "water",
            min_zoom: 9.0,
            max_zoom: 24.0,
            filter: |properties, geometry| {
                line(geometry) && properties.kind_in(&["river", "canal"])
            },
            paint: Paint::Line {
                color: hex(0xb9d0e0),
                width: Width::Exponential(&[(9.0, 0.5), (12.0, 1.2), (18.0, 9.0)]),
                dash: None,
            },
        },
        Layer {
            id: "buildings",
            source_layer: "buildings",
            min_zoom: 14.0,
            max_zoom: 24.0,
            filter: |properties, geometry| {
                geometry == GeometryType::Polygon
                    && properties.kind_in(&["building", "building_part"])
            },
            paint: Paint::Fill {
                color: |_, zoom| {
                    Some(alpha(
                        hex(0xe4e0d8),
                        interpolate(&[(14.0, 0.0), (15.0, 255.0)], zoom, 1.0) as u8,
                    ))
                },
            },
        },
        Layer {
            id: "boundary_country_band",
            source_layer: "boundaries",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| boundary(properties, geometry, &["country"]),
            paint: Paint::Line {
                color: alpha(hex(0xd8cfc2), 150),
                width: Width::Exponential(&[(2.0, 3.5), (6.0, 6.0), (10.0, 8.0)]),
                dash: None,
            },
        },
        Layer {
            id: "boundary_county",
            source_layer: "boundaries",
            min_zoom: 9.0,
            max_zoom: 24.0,
            filter: |properties, geometry| boundary(properties, geometry, &["county"]),
            paint: Paint::Line {
                color: hex(0xdad4ca),
                width: Width::Fixed(0.7),
                dash: Some((3.0, 2.5)),
            },
        },
        Layer {
            id: "boundary_region",
            source_layer: "boundaries",
            min_zoom: 3.0,
            max_zoom: 24.0,
            filter: |properties, geometry| boundary(properties, geometry, &["region"]),
            paint: Paint::Line {
                color: hex(0xb8b0a3),
                width: Width::Exponential(&[(3.0, 0.6), (6.0, 1.0)]),
                dash: None,
            },
        },
        Layer {
            id: "boundary_country",
            source_layer: "boundaries",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| boundary(properties, geometry, &["country"]),
            paint: Paint::Line {
                color: hex(0x9d9384),
                width: Width::Exponential(&[(2.0, 1.0), (6.0, 1.5)]),
                dash: None,
            },
        },
        Layer {
            id: "rail",
            source_layer: "roads",
            min_zoom: 10.0,
            max_zoom: 24.0,
            filter: |properties, geometry| {
                line(geometry)
                    && properties.kind_in(&["rail"])
                    && properties
                        .str("kind_detail")
                        .is_none_or(|detail| detail == "rail")
            },
            paint: Paint::Line {
                color: hex(0xd6d1c9),
                width: Width::Exponential(&[(10.0, 0.5), (14.0, 0.75), (18.0, 1.5)]),
                dash: None,
            },
        },
        Layer {
            id: "path",
            source_layer: "roads",
            min_zoom: 14.0,
            max_zoom: 24.0,
            filter: path,
            paint: Paint::Line {
                color: hex(0xe0dbd2),
                width: Width::Exponential(&[(14.0, 0.6), (18.0, 2.5)]),
                dash: Some((2.0, 1.5)),
            },
        },
        Layer {
            id: "minor_casing",
            source_layer: "roads",
            min_zoom: 12.5,
            max_zoom: 24.0,
            filter: minor,
            paint: Paint::Line {
                color: hex(0xe2ddd5),
                width: MINOR_CASING,
                dash: None,
            },
        },
        Layer {
            id: "link_casing",
            source_layer: "roads",
            min_zoom: 12.5,
            max_zoom: 24.0,
            filter: link,
            paint: Paint::Line {
                color: hex(0xcfc8bd),
                width: LINK_CASING,
                dash: None,
            },
        },
        Layer {
            id: "major_casing",
            source_layer: "roads",
            min_zoom: 10.5,
            max_zoom: 24.0,
            filter: major,
            paint: Paint::Line {
                color: hex(0xd9d4cc),
                width: MAJOR_CASING,
                dash: None,
            },
        },
        Layer {
            id: "highway_casing",
            source_layer: "roads",
            min_zoom: 8.0,
            max_zoom: 24.0,
            filter: highway,
            paint: Paint::Line {
                color: hex(0xc4bdb1),
                width: HIGHWAY_CASING,
                dash: None,
            },
        },
        Layer {
            id: "minor",
            source_layer: "roads",
            min_zoom: 11.0,
            max_zoom: 24.0,
            filter: minor,
            paint: Paint::Line {
                color: hex(0xffffff),
                width: MINOR,
                dash: None,
            },
        },
        Layer {
            id: "link",
            source_layer: "roads",
            min_zoom: 12.0,
            max_zoom: 24.0,
            filter: link,
            paint: Paint::Line {
                color: hex(0xffffff),
                width: LINK,
                dash: None,
            },
        },
        Layer {
            id: "major_low",
            source_layer: "roads",
            min_zoom: 7.0,
            max_zoom: 10.5,
            filter: major,
            paint: Paint::Line {
                color: hex(0xdfd9cf),
                width: MAJOR,
                dash: None,
            },
        },
        Layer {
            id: "major",
            source_layer: "roads",
            min_zoom: 10.5,
            max_zoom: 24.0,
            filter: major,
            paint: Paint::Line {
                color: hex(0xffffff),
                width: MAJOR,
                dash: None,
            },
        },
        Layer {
            id: "highway_low",
            source_layer: "roads",
            min_zoom: 5.0,
            max_zoom: 8.0,
            filter: highway,
            paint: Paint::Line {
                color: hex(0xcfc8bc),
                width: HIGHWAY,
                dash: None,
            },
        },
        Layer {
            id: "highway",
            source_layer: "roads",
            min_zoom: 8.0,
            max_zoom: 24.0,
            filter: highway,
            paint: Paint::Line {
                color: hex(0xffffff),
                width: HIGHWAY,
                dash: None,
            },
        },
    ];

    let halo = PAPER;
    let city_dot = Dot {
        radius: 1.6,
        fill: hex(0x8a857c),
        stroke: alpha(PAPER, 0),
        stroke_width: 0.0,
    };
    let labels = vec![
        LabelRule {
            source_layer: "water",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, _| properties.kind_in(&["ocean", "sea", "gulf"]),
            text: name,
            size: |_, zoom| interpolate(&[(1.0, 11.0), (5.0, 14.0)], zoom, 1.0),
            font: |_| Font::Italic,
            uppercase: false,
            letter_spacing: 0.2,
            color: |_| WATER_INK,
            halo: alpha(WATER, 0),
            halo_width: 0.0,
            dot: None,
            priority: |_| -300.0,
            padding: 6.0,
            placement: Placement::Area,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 0.0,
            max_zoom: 6.0,
            filter: |properties, _| properties.kind_in(&["country"]),
            text: name,
            size: |properties, zoom| {
                let large = properties.number("population_rank").unwrap_or(0.0) >= 14.0;
                interpolate(
                    if large {
                        &[(2.0, 13.0), (5.0, 16.0)]
                    } else {
                        &[(2.0, 10.5), (5.0, 13.0)]
                    },
                    zoom,
                    1.0,
                )
            },
            font: |_| Font::Medium,
            uppercase: true,
            letter_spacing: 0.18,
            color: |_| hex(0x4a463f),
            halo,
            halo_width: 1.6,
            dot: None,
            priority: |properties| {
                -200.0 - properties.number("population_rank").unwrap_or(0.0) as f32
            },
            padding: 8.0,
            placement: Placement::Area,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 3.5,
            max_zoom: 9.0,
            filter: |properties, _| properties.kind_in(&["region"]),
            text: name,
            size: |_, zoom| interpolate(&[(3.5, 9.0), (6.0, 10.5), (8.0, 12.0)], zoom, 1.0),
            font: |_| Font::Regular,
            uppercase: true,
            letter_spacing: 0.24,
            color: |_| hex(0x9a948a),
            halo,
            halo_width: 1.4,
            dot: None,
            priority: |properties| {
                -100.0 - properties.number("population_rank").unwrap_or(0.0) as f32
            },
            padding: 8.0,
            placement: Placement::Area,
        },
        LabelRule {
            source_layer: "roads",
            min_zoom: 7.0,
            max_zoom: 24.0,
            filter: |properties, _| {
                properties.kind_in(&["highway", "major_road"])
                    && matches!(properties.str("network"), Some("US:I") | Some("US:US"))
            },
            text: shield,
            size: |_, _| 9.5,
            font: |_| Font::Medium,
            uppercase: false,
            letter_spacing: 0.0,
            color: |_| hex(0x5c564e),
            halo: [0, 0, 0, 0],
            halo_width: 0.0,
            dot: None,
            priority: |properties| {
                if properties.str("network") == Some("US:I") {
                    40.0
                } else {
                    60.0
                }
            },
            padding: 6.0,
            placement: Placement::Shield {
                fill: hex(0xffffff),
                stroke: hex(0xbdb6aa),
                spacing: 260.0,
            },
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 2.0,
            max_zoom: 24.0,
            filter: |properties, zoom| {
                properties.kind_in(&["locality"])
                    && matches!(
                        properties.str("kind_detail"),
                        Some("city") | Some("town") | None
                    )
                    && population(properties) >= city_threshold(zoom)
                    && (zoom >= 9.0 || properties.str("kind_detail") != Some("town"))
            },
            text: name,
            size: |properties, zoom| {
                if is_major_city(properties) {
                    interpolate(
                        &[(3.0, 12.0), (6.0, 13.5), (10.0, 15.0), (14.0, 17.0)],
                        zoom,
                        1.0,
                    )
                } else {
                    interpolate(&[(4.0, 10.5), (8.0, 11.0), (12.0, 12.5)], zoom, 1.0)
                }
            },
            font: |properties| {
                if is_major_city(properties) {
                    Font::Medium
                } else {
                    Font::Regular
                }
            },
            uppercase: false,
            letter_spacing: 0.01,
            color: |properties| {
                if is_major_city(properties) {
                    MAJOR_INK
                } else {
                    MINOR_INK
                }
            },
            halo,
            halo_width: 1.6,
            dot: Some((city_dot, 6.0)),
            priority: |properties| -(population(properties).max(1.0).log10() as f32) * 10.0,
            padding: 8.0,
            placement: Placement::Point,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 11.0,
            max_zoom: 24.0,
            filter: |properties, _| {
                properties.kind_in(&["locality"])
                    && matches!(
                        properties.str("kind_detail"),
                        Some("village") | Some("hamlet") | Some("suburb")
                    )
            },
            text: name,
            size: |_, zoom| interpolate(&[(11.0, 10.5), (15.0, 12.0)], zoom, 1.0),
            font: |_| Font::Regular,
            uppercase: false,
            letter_spacing: 0.01,
            color: |_| MINOR_INK,
            halo,
            halo_width: 1.4,
            dot: None,
            priority: |properties| 200.0 - population(properties).max(1.0).log10() as f32,
            padding: 8.0,
            placement: Placement::Point,
        },
        LabelRule {
            source_layer: "places",
            min_zoom: 12.0,
            max_zoom: 24.0,
            filter: |properties, _| properties.kind_in(&["neighbourhood", "macrohood"]),
            text: name,
            size: |_, zoom| interpolate(&[(12.0, 9.5), (16.0, 11.5)], zoom, 1.0),
            font: |_| Font::Medium,
            uppercase: true,
            letter_spacing: 0.16,
            color: |_| hex(0xa39c90),
            halo,
            halo_width: 1.4,
            dot: None,
            priority: |properties| 300.0 + properties.number("min_zoom").unwrap_or(14.0) as f32,
            padding: 8.0,
            placement: Placement::Area,
        },
        LabelRule {
            source_layer: "water",
            min_zoom: 6.0,
            max_zoom: 24.0,
            filter: |properties, _| {
                properties.kind_in(&["bay", "strait", "fjord", "lake", "water", "reservoir"])
            },
            text: name,
            size: |_, zoom| interpolate(&[(6.0, 10.5), (12.0, 12.0)], zoom, 1.0),
            font: |_| Font::Italic,
            uppercase: false,
            letter_spacing: 0.06,
            color: |_| WATER_INK,
            halo: alpha(WATER, 220),
            halo_width: 1.0,
            dot: None,
            priority: |properties| 150.0 + properties.number("min_zoom").unwrap_or(10.0) as f32,
            padding: 6.0,
            placement: Placement::Area,
        },
    ];

    Theme {
        background: WATER,
        layers,
        labels,
        markers: MarkerStyle {
            shadow: alpha(hex(0x2b2418), 60),
            shadow_blur: 3.0,
            shadow_offset: 1.5,
        },
    }
}
