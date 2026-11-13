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

#[derive(Clone, Copy)]
pub enum Paint {
    Fill {
        color: FillStyle,
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
    pub color: Rgba,
    pub halo: Rgba,
    pub halo_width: f32,
    pub dot: Option<(Dot, f32)>,
    pub priority: fn(&Properties) -> f32,
    pub padding: f32,
    pub placement: Placement,
}

pub struct MarkerStyle {
    pub pill_fill: Rgba,
    pub pill_text: Rgba,
    pub dot_fill: Rgba,
    pub dot_ring: Rgba,
    pub cluster_fill: Rgba,
    pub cluster_text: Rgba,
    pub cluster_ring: Rgba,
    pub selected_fill: Rgba,
    pub selected_text: Rgba,
    pub shadow: Rgba,
}

pub struct Theme {
    pub background: Rgba,
    pub layers: Vec<Layer>,
    pub labels: Vec<LabelRule>,
    pub markers: MarkerStyle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    pub land: Rgba,
    pub water: Rgba,
    pub water_line: Rgba,
    pub water_label: Rgba,
    pub park: Rgba,
    pub landuse: Rgba,
    pub sand: Rgba,
    pub building: Rgba,
    pub road: Rgba,
    pub road_casing: Rgba,
    pub major_road: Rgba,
    pub major_road_casing: Rgba,
    pub highway: Rgba,
    pub highway_casing: Rgba,
    pub rail: Rgba,
    pub path: Rgba,
    pub boundary: Rgba,
    pub country_boundary: Rgba,
    pub label: Rgba,
    pub label_minor: Rgba,
    pub label_halo: Rgba,
    pub neighbourhood: Rgba,
    pub region: Rgba,
    pub shield: Rgba,
    pub shield_text: Rgba,
    pub shield_line: Rgba,
    pub interstate: Rgba,
    pub interstate_text: Rgba,
    pub marker: Rgba,
    pub marker_text: Rgba,
    pub accent: Rgba,
    pub cluster: Rgba,
    pub cluster_text: Rgba,
    pub selected: Rgba,
    pub selected_text: Rgba,
    pub shadow: Rgba,
}

const fn hex_word(word: u32) -> Rgba {
    [
        (word >> 24) as u8,
        (word >> 16) as u8,
        (word >> 8) as u8,
        word as u8,
    ]
}

impl Palette {
    pub const SLOTS: usize = 36;

    pub fn from_words(words: &[u32]) -> Option<Palette> {
        if words.len() != Self::SLOTS {
            return None;
        }
        let mut colors = words.iter().map(|word| hex_word(*word));
        Some(Palette {
            land: colors.next()?,
            water: colors.next()?,
            water_line: colors.next()?,
            water_label: colors.next()?,
            park: colors.next()?,
            landuse: colors.next()?,
            sand: colors.next()?,
            building: colors.next()?,
            road: colors.next()?,
            road_casing: colors.next()?,
            major_road: colors.next()?,
            major_road_casing: colors.next()?,
            highway: colors.next()?,
            highway_casing: colors.next()?,
            rail: colors.next()?,
            path: colors.next()?,
            boundary: colors.next()?,
            country_boundary: colors.next()?,
            label: colors.next()?,
            label_minor: colors.next()?,
            label_halo: colors.next()?,
            neighbourhood: colors.next()?,
            region: colors.next()?,
            shield: colors.next()?,
            shield_text: colors.next()?,
            shield_line: colors.next()?,
            interstate: colors.next()?,
            interstate_text: colors.next()?,
            marker: colors.next()?,
            marker_text: colors.next()?,
            accent: colors.next()?,
            cluster: colors.next()?,
            cluster_text: colors.next()?,
            selected: colors.next()?,
            selected_text: colors.next()?,
            shadow: colors.next()?,
        })
    }

    pub fn paper() -> Palette {
        Palette {
            land: hex_word(0xf3f1ecff),
            water: hex_word(0xd0dee8ff),
            water_line: hex_word(0xb9d0e0ff),
            water_label: hex_word(0x5f849fff),
            park: hex_word(0xe3ead9ff),
            landuse: hex_word(0xeceae5ff),
            sand: hex_word(0xf1ece0ff),
            building: hex_word(0xe4e0d8ff),
            road: hex_word(0xffffffff),
            road_casing: hex_word(0xdfd9cfff),
            major_road: hex_word(0xffffffff),
            major_road_casing: hex_word(0xd2cbc0ff),
            highway: hex_word(0xecdcbdff),
            highway_casing: hex_word(0xb3a790ff),
            rail: hex_word(0xd6d1c9ff),
            path: hex_word(0xe2ddd5ff),
            boundary: hex_word(0xc9c1b4ff),
            country_boundary: hex_word(0x9d9384ff),
            label: hex_word(0x3d3a35ff),
            label_minor: hex_word(0x7a756dff),
            label_halo: hex_word(0xf3f1ecff),
            neighbourhood: hex_word(0x857f75ff),
            region: hex_word(0x9a948aff),
            shield: hex_word(0xffffffff),
            shield_text: hex_word(0x5c564eff),
            shield_line: hex_word(0xbdb6aaff),
            interstate: hex_word(0x4a5563ff),
            interstate_text: hex_word(0xffffffff),
            marker: hex_word(0xfffdf8ff),
            marker_text: hex_word(0x2f2b26ff),
            accent: hex_word(0xc2410cff),
            cluster: hex_word(0x2f2b26ff),
            cluster_text: hex_word(0xfffdf8ff),
            selected: hex_word(0xc2410cff),
            selected_text: hex_word(0xffffffff),
            shadow: hex_word(0x2b24184d),
        }
    }

    pub fn daylight() -> Palette {
        Palette {
            land: hex_word(0xf6f5f2ff),
            water: hex_word(0xa9d4f1ff),
            water_line: hex_word(0x8cc2e6ff),
            water_label: hex_word(0x3a76a6ff),
            park: hex_word(0xd5ebcfff),
            landuse: hex_word(0xefede8ff),
            sand: hex_word(0xf4ecd6ff),
            building: hex_word(0xe7e4deff),
            road: hex_word(0xffffffff),
            road_casing: hex_word(0xdfdad2ff),
            major_road: hex_word(0xffffffff),
            major_road_casing: hex_word(0xd3cdc3ff),
            highway: hex_word(0xfde2a4ff),
            highway_casing: hex_word(0xe6bb63ff),
            rail: hex_word(0xcbc7c0ff),
            path: hex_word(0xe5e1daff),
            boundary: hex_word(0xbdb6c8ff),
            country_boundary: hex_word(0x9a93a8ff),
            label: hex_word(0x272a2fff),
            label_minor: hex_word(0x5b6068ff),
            label_halo: hex_word(0xffffffff),
            neighbourhood: hex_word(0x7b8089ff),
            region: hex_word(0x8b8794ff),
            shield: hex_word(0xffffffff),
            shield_text: hex_word(0x3f434aff),
            shield_line: hex_word(0xc9c3b8ff),
            interstate: hex_word(0x3d4b63ff),
            interstate_text: hex_word(0xffffffff),
            marker: hex_word(0xffffffff),
            marker_text: hex_word(0x1c1f24ff),
            accent: hex_word(0xe5484dff),
            cluster: hex_word(0x1c1f24ff),
            cluster_text: hex_word(0xffffffff),
            selected: hex_word(0x1c1f24ff),
            selected_text: hex_word(0xffffffff),
            shadow: hex_word(0x0000004d),
        }
    }

    pub fn midnight() -> Palette {
        Palette {
            land: hex_word(0x11151cff),
            water: hex_word(0x0a1d31ff),
            water_line: hex_word(0x173452ff),
            water_label: hex_word(0x5d8db8ff),
            park: hex_word(0x122319ff),
            landuse: hex_word(0x141922ff),
            sand: hex_word(0x1c1b17ff),
            building: hex_word(0x1a2029ff),
            road: hex_word(0x232a35ff),
            road_casing: hex_word(0x11151cff),
            major_road: hex_word(0x2c3543ff),
            major_road_casing: hex_word(0x11151cff),
            highway: hex_word(0x3b485bff),
            highway_casing: hex_word(0x161b23ff),
            rail: hex_word(0x2a313cff),
            path: hex_word(0x1d232cff),
            boundary: hex_word(0x3d4656ff),
            country_boundary: hex_word(0x5a6479ff),
            label: hex_word(0xe2e7eeff),
            label_minor: hex_word(0x9ba5b3ff),
            label_halo: hex_word(0x11151cff),
            neighbourhood: hex_word(0x7e8896ff),
            region: hex_word(0x6d7786ff),
            shield: hex_word(0x2c3543ff),
            shield_text: hex_word(0xc9d1dcff),
            shield_line: hex_word(0x3b485bff),
            interstate: hex_word(0x3a6ea5ff),
            interstate_text: hex_word(0xffffffff),
            marker: hex_word(0xf4f6f9ff),
            marker_text: hex_word(0x11151cff),
            accent: hex_word(0x4cc2ffff),
            cluster: hex_word(0x4cc2ffff),
            cluster_text: hex_word(0x05121fff),
            selected: hex_word(0x4cc2ffff),
            selected_text: hex_word(0x05121fff),
            shadow: hex_word(0x00000099),
        }
    }
}

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
    (5.0, 0.8),
    (8.0, 1.6),
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

#[derive(Clone, Copy)]
pub enum FillStyle {
    Solid(Rgba),
    Landuse {
        park: Rgba,
        sand: Rgba,
        landuse: Rgba,
    },
    Fade {
        color: Rgba,
        from: f32,
        to: f32,
    },
}

impl FillStyle {
    pub fn color(&self, properties: &Properties, zoom: f32) -> Option<Rgba> {
        match *self {
            FillStyle::Solid(color) => Some(color),
            FillStyle::Fade { color, from, to } => {
                let opacity = interpolate(&[(from, 0.0), (to, 255.0)], zoom, 1.0) as u8;
                Some(alpha(color, opacity))
            }
            FillStyle::Landuse {
                park,
                sand,
                landuse,
            } => landuse_color(properties, zoom, park, sand, landuse),
        }
    }
}

fn landuse_color(
    properties: &Properties,
    zoom: f32,
    park: Rgba,
    sand: Rgba,
    landuse: Rgba,
) -> Option<Rgba> {
    let kind = properties.str("kind")?;
    let park_opacity = interpolate(&[(8.0, 0.0), (10.0, 160.0), (14.0, 255.0)], zoom, 1.0) as u8;
    match kind {
        "park" | "national_park" | "nature_reserve" | "protected_area" | "garden"
        | "golf_course" | "zoo" | "wood" | "forest" => {
            (park_opacity > 0).then_some(alpha(park, park_opacity))
        }
        "cemetery" | "pitch" | "grass" | "village_green" | "playground" if zoom >= 13.0 => {
            Some(park)
        }
        "beach" | "sand" if zoom >= 11.0 => Some(sand),
        "school" | "university" | "college" | "hospital" | "industrial" | "aerodrome"
        | "airfield" | "military" | "railway" | "runway" | "taxiway"
            if zoom >= 13.0 =>
        {
            Some(landuse)
        }
        _ => None,
    }
}

fn luminance(color: Rgba) -> f32 {
    0.299 * f32::from(color[0]) + 0.587 * f32::from(color[1]) + 0.114 * f32::from(color[2])
}

fn further_from(base: Rgba, first: Rgba, second: Rgba) -> Rgba {
    let distance = |color: Rgba| (luminance(color) - luminance(base)).abs();
    if distance(second) > distance(first) {
        second
    } else {
        first
    }
}

fn shade(color: Rgba, percent: u32) -> Rgba {
    let scale = |channel: u8| (u32::from(channel) * percent / 100).min(255) as u8;
    [scale(color[0]), scale(color[1]), scale(color[2]), color[3]]
}

fn population(properties: &Properties) -> f64 {
    properties.number("population").unwrap_or(0.0)
}

fn city_threshold(zoom: f32) -> f64 {
    match zoom {
        zoom if zoom < 4.0 => 1_000_000.0,
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

const GREAT_CITY_POPULATION: f64 = 1_000_000.0;
const GREAT_CITY_PRIORITY: f32 = 40.0;

fn city_priority(properties: &Properties) -> f32 {
    let population = population(properties);
    let base = -(population.max(1.0).log10() as f32) * 10.0;
    if population >= GREAT_CITY_POPULATION {
        base - GREAT_CITY_PRIORITY
    } else {
        base
    }
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

pub fn theme(palette: &Palette) -> Theme {
    let low_major = further_from(palette.land, palette.road, palette.major_road_casing);
    let low_highway = further_from(palette.land, palette.highway, palette.highway_casing);
    let layers = vec![
        Layer {
            id: "earth",
            source_layer: "earth",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill {
                color: FillStyle::Solid(palette.land),
            },
        },
        Layer {
            id: "landuse",
            source_layer: "landuse",
            min_zoom: 8.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill {
                color: FillStyle::Landuse {
                    park: palette.park,
                    sand: palette.sand,
                    landuse: palette.landuse,
                },
            },
        },
        Layer {
            id: "water",
            source_layer: "water",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::Fill {
                color: FillStyle::Solid(palette.water),
            },
        },
        Layer {
            id: "water_shore",
            source_layer: "water",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: polygon,
            paint: Paint::ShoreShade {
                color: alpha(palette.water_line, 170),
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
                color: palette.water_line,
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
                color: FillStyle::Fade {
                    color: palette.building,
                    from: 14.0,
                    to: 15.0,
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
                color: alpha(palette.country_boundary, 70),
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
                color: palette.boundary,
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
                color: palette.boundary,
                width: Width::Exponential(&[(3.0, 0.6), (6.0, 0.8)]),
                dash: Some((4.0, 2.0)),
            },
        },
        Layer {
            id: "boundary_country",
            source_layer: "boundaries",
            min_zoom: 0.0,
            max_zoom: 24.0,
            filter: |properties, geometry| boundary(properties, geometry, &["country"]),
            paint: Paint::Line {
                color: palette.country_boundary,
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
                color: palette.rail,
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
                color: palette.path,
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
                color: palette.road_casing,
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
                color: palette.major_road_casing,
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
                color: palette.major_road_casing,
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
                color: palette.highway_casing,
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
                color: palette.road,
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
                color: palette.road,
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
                color: low_major,
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
                color: palette.major_road,
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
                color: low_highway,
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
                color: palette.highway,
                width: HIGHWAY,
                dash: None,
            },
        },
    ];

    let halo = palette.label_halo;
    let city_dot = Dot {
        radius: 1.6,
        fill: palette.label_minor,
        stroke: alpha(palette.label_halo, 0),
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
            color: palette.water_label,
            halo: alpha(palette.water, 0),
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
            filter: |properties, zoom| {
                properties.kind_in(&["country"])
                    && (zoom >= 4.0 || properties.number("population_rank").unwrap_or(0.0) >= 13.0)
            },
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
            color: palette.label,
            halo,
            halo_width: 1.6,
            dot: None,
            priority: |properties| {
                let rank = properties.number("population_rank").unwrap_or(0.0) as f32;
                if rank >= 13.0 {
                    -200.0 - rank
                } else {
                    -20.0 - rank
                }
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
            color: palette.region,
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
                    && properties.str("network") == Some("US:I")
            },
            text: shield,
            size: |_, _| 9.5,
            font: |_| Font::Medium,
            uppercase: false,
            letter_spacing: 0.0,
            color: palette.interstate_text,
            halo: [0, 0, 0, 0],
            halo_width: 0.0,
            dot: None,
            priority: |_| 40.0,
            padding: 6.0,
            placement: Placement::Shield {
                fill: palette.interstate,
                stroke: shade(palette.interstate, 80),
                spacing: 260.0,
            },
        },
        LabelRule {
            source_layer: "roads",
            min_zoom: 8.0,
            max_zoom: 24.0,
            filter: |properties, _| {
                properties.kind_in(&["highway", "major_road"])
                    && properties.str("network") == Some("US:US")
            },
            text: shield,
            size: |_, _| 9.5,
            font: |_| Font::Medium,
            uppercase: false,
            letter_spacing: 0.0,
            color: palette.shield_text,
            halo: [0, 0, 0, 0],
            halo_width: 0.0,
            dot: None,
            priority: |_| 60.0,
            padding: 6.0,
            placement: Placement::Shield {
                fill: palette.shield,
                stroke: palette.shield_line,
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
                    && is_major_city(properties)
                    && (zoom >= 9.0 || properties.str("kind_detail") != Some("town"))
            },
            text: name,
            size: |_, zoom| {
                interpolate(
                    &[(3.0, 12.0), (6.0, 13.5), (10.0, 15.0), (14.0, 17.0)],
                    zoom,
                    1.0,
                )
            },
            font: |_| Font::Medium,
            uppercase: false,
            letter_spacing: 0.01,
            color: palette.label,
            halo,
            halo_width: 1.6,
            dot: Some((city_dot, 6.0)),
            priority: city_priority,
            padding: 8.0,
            placement: Placement::Point,
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
                    && !is_major_city(properties)
                    && (zoom >= 9.0 || properties.str("kind_detail") != Some("town"))
            },
            text: name,
            size: |_, zoom| interpolate(&[(4.0, 10.5), (8.0, 11.0), (12.0, 12.5)], zoom, 1.0),
            font: |_| Font::Regular,
            uppercase: false,
            letter_spacing: 0.01,
            color: palette.label_minor,
            halo,
            halo_width: 1.6,
            dot: Some((city_dot, 6.0)),
            priority: city_priority,
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
            color: palette.label_minor,
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
            color: palette.neighbourhood,
            halo,
            halo_width: 1.6,
            dot: None,
            priority: |properties| 300.0 + properties.number("min_zoom").unwrap_or(14.0) as f32,
            padding: 8.0,
            placement: Placement::Area,
        },
        LabelRule {
            source_layer: "water",
            min_zoom: 3.0,
            max_zoom: 24.0,
            filter: |properties, _| {
                properties.kind_in(&["bay", "strait", "fjord", "lake", "water", "reservoir"])
            },
            text: name,
            size: |_, zoom| interpolate(&[(3.0, 10.0), (6.0, 10.5), (12.0, 12.0)], zoom, 1.0),
            font: |_| Font::Italic,
            uppercase: false,
            letter_spacing: 0.06,
            color: palette.water_label,
            halo: alpha(palette.water, 220),
            halo_width: 1.0,
            dot: None,
            priority: |properties| 150.0 + properties.number("min_zoom").unwrap_or(10.0) as f32,
            padding: 6.0,
            placement: Placement::Area,
        },
    ];

    Theme {
        background: palette.water,
        layers,
        labels,
        markers: MarkerStyle {
            pill_fill: palette.marker,
            pill_text: palette.marker_text,
            dot_fill: palette.accent,
            dot_ring: palette.land,
            cluster_fill: palette.cluster,
            cluster_text: palette.cluster_text,
            cluster_ring: palette.land,
            selected_fill: palette.selected,
            selected_text: palette.selected_text,
            shadow: palette.shadow,
        },
    }
}
