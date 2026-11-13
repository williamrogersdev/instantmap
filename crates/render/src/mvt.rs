use crate::pbf::{DecodeError, Packed, Reader, Result, zigzag};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Value<'a> {
    String(&'a str),
    Float(f64),
    Int(i64),
    Bool(bool),
    Null,
}

impl<'a> Value<'a> {
    pub fn as_str(&self) -> Option<&'a str> {
        match self {
            Value::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match *self {
            Value::Float(number) => Some(number),
            Value::Int(number) => Some(number as f64),
            Value::Bool(flag) => Some(if flag { 1.0 } else { 0.0 }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GeometryType {
    Unknown,
    Point,
    Line,
    Polygon,
}

pub struct Tile<'a> {
    pub layers: Vec<Layer<'a>>,
}

pub struct Layer<'a> {
    pub name: &'a str,
    pub extent: u32,
    keys: Vec<&'a str>,
    values: Vec<Value<'a>>,
    pub features: Vec<Feature<'a>>,
}

pub struct Feature<'a> {
    pub geometry_type: GeometryType,
    tags: &'a [u8],
    geometry: &'a [u8],
}

pub struct Properties<'l, 'a> {
    layer: &'l Layer<'a>,
    feature: &'l Feature<'a>,
}

impl<'a> Tile<'a> {
    pub fn decode(bytes: &'a [u8]) -> Result<Self> {
        let mut reader = Reader::new(bytes);
        let mut layers = Vec::new();
        while !reader.done() {
            let (field, wire) = reader.tag()?;
            if field == 3 && wire == 2 {
                layers.push(Layer::decode(reader.bytes()?)?);
            } else {
                reader.skip(wire)?;
            }
        }
        Ok(Self { layers })
    }

    pub fn layer(&self, name: &str) -> Option<&Layer<'a>> {
        self.layers.iter().find(|layer| layer.name == name)
    }
}

fn utf8(bytes: &[u8]) -> &str {
    std::str::from_utf8(bytes).unwrap_or("")
}

impl<'a> Layer<'a> {
    fn decode(bytes: &'a [u8]) -> Result<Self> {
        let mut reader = Reader::new(bytes);
        let mut layer = Layer {
            name: "",
            extent: 4096,
            keys: Vec::new(),
            values: Vec::new(),
            features: Vec::new(),
        };
        while !reader.done() {
            match reader.tag()? {
                (1, 2) => layer.name = utf8(reader.bytes()?),
                (2, 2) => layer.features.push(Feature::decode(reader.bytes()?)?),
                (3, 2) => layer.keys.push(utf8(reader.bytes()?)),
                (4, 2) => layer.values.push(decode_value(reader.bytes()?)?),
                (5, 0) => {
                    layer.extent = u32::try_from(reader.varint()?)
                        .map_err(|_| DecodeError("extent overflow"))?
                }
                (_, wire) => reader.skip(wire)?,
            }
        }
        if layer.extent == 0 {
            return Err(DecodeError("zero extent"));
        }
        Ok(layer)
    }

    pub fn properties<'l>(&'l self, feature: &'l Feature<'a>) -> Properties<'l, 'a> {
        Properties {
            layer: self,
            feature,
        }
    }
}

fn decode_value(bytes: &[u8]) -> Result<Value<'_>> {
    let mut reader = Reader::new(bytes);
    let mut value = Value::Null;
    while !reader.done() {
        value = match reader.tag()? {
            (1, 2) => Value::String(utf8(reader.bytes()?)),
            (2, 5) => Value::Float(f64::from(f32::from_le_bytes(reader.fixed::<4>()?))),
            (3, 1) => Value::Float(f64::from_le_bytes(reader.fixed::<8>()?)),
            (4, 0) => Value::Int(reader.varint()? as i64),
            (5, 0) => {
                let number = reader.varint()?;
                i64::try_from(number)
                    .map(Value::Int)
                    .unwrap_or(Value::Float(number as f64))
            }
            (6, 0) => Value::Int(zigzag(reader.varint()?)),
            (7, 0) => Value::Bool(reader.varint()? != 0),
            (_, wire) => {
                reader.skip(wire)?;
                value
            }
        };
    }
    Ok(value)
}

impl<'a> Feature<'a> {
    fn decode(bytes: &'a [u8]) -> Result<Self> {
        let mut reader = Reader::new(bytes);
        let mut feature = Feature {
            geometry_type: GeometryType::Unknown,
            tags: &[],
            geometry: &[],
        };
        while !reader.done() {
            match reader.tag()? {
                (2, 2) => feature.tags = reader.bytes()?,
                (3, 0) => {
                    feature.geometry_type = match reader.varint()? {
                        1 => GeometryType::Point,
                        2 => GeometryType::Line,
                        3 => GeometryType::Polygon,
                        _ => GeometryType::Unknown,
                    }
                }
                (4, 2) => feature.geometry = reader.bytes()?,
                (_, wire) => reader.skip(wire)?,
            }
        }
        Ok(feature)
    }

    pub fn for_each_path(&self, mut visit: impl FnMut(&[[f32; 2]], bool)) -> Result<()> {
        let mut commands = Packed::new(self.geometry);
        let mut path: Vec<[f32; 2]> = Vec::new();
        let (mut cursor_x, mut cursor_y) = (0_i64, 0_i64);
        while let Some(command) = commands.next() {
            let command = command?;
            let (opcode, count) = (command & 7, command >> 3);
            match opcode {
                1 | 2 => {
                    if count == 0 || count > 1 << 24 {
                        return Err(DecodeError("bad geometry count"));
                    }
                    for _ in 0..count {
                        let delta_x = commands.next().ok_or(DecodeError("missing x"))??;
                        let delta_y = commands.next().ok_or(DecodeError("missing y"))??;
                        cursor_x += zigzag(delta_x);
                        cursor_y += zigzag(delta_y);
                        if opcode == 1 {
                            if path.len() > 0 {
                                visit(&path, false);
                                path.clear();
                            }
                            if self.geometry_type == GeometryType::Point {
                                visit(&[[cursor_x as f32, cursor_y as f32]], false);
                                continue;
                            }
                        }
                        path.push([cursor_x as f32, cursor_y as f32]);
                    }
                }
                7 => {
                    if path.len() > 0 {
                        visit(&path, true);
                        path.clear();
                    }
                }
                _ => return Err(DecodeError("unknown geometry command")),
            }
        }
        if path.len() > 0 {
            visit(&path, false);
        }
        Ok(())
    }

    pub fn first_point(&self) -> Option<[f32; 2]> {
        let mut first = None;
        self.for_each_path(|path, _| {
            if first.is_none() {
                first = path.first().copied();
            }
        })
        .ok()?;
        first
    }
}

impl<'a> Properties<'_, 'a> {
    pub fn get(&self, key: &str) -> Option<Value<'a>> {
        let mut tags = Packed::new(self.feature.tags);
        while let (Some(Ok(key_index)), Some(Ok(value_index))) = (tags.next(), tags.next()) {
            if self.layer.keys.get(key_index as usize) == Some(&key) {
                return self.layer.values.get(value_index as usize).copied();
            }
        }
        None
    }

    pub fn has(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn str(&self, key: &str) -> Option<&'a str> {
        self.get(key).and_then(|value| value.as_str())
    }

    pub fn number(&self, key: &str) -> Option<f64> {
        self.get(key).and_then(|value| value.as_f64())
    }

    pub fn kind_in(&self, kinds: &[&str]) -> bool {
        self.str("kind").is_some_and(|kind| kinds.contains(&kind))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_truncated_input() {
        assert!(Tile::decode(&[26, 255]).is_err());
    }

    #[test]
    fn decodes_real_tile() {
        let bytes = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/7-29-52.mvt"
        ))
        .unwrap();
        let tile = Tile::decode(&bytes).unwrap();
        let roads = tile.layer("roads").expect("roads layer");
        assert!(roads.features.len() > 10);
        let mut points = 0;
        for feature in &roads.features {
            feature
                .for_each_path(|path, _| points += path.len())
                .unwrap();
        }
        assert!(points > 100);
        let places = tile.layer("places").expect("places layer");
        assert!(
            places
                .features
                .iter()
                .any(|feature| places.properties(feature).str("name").is_some())
        );
    }
}
