use instantmap_render::mvt::Tile;
use std::collections::BTreeMap;

fn main() {
    for path in std::env::args().skip(1) {
        let bytes = std::fs::read(&path).unwrap();
        let tile = Tile::decode(&bytes).unwrap();
        println!("== {path}");
        for layer in &tile.layers {
            let mut kinds: BTreeMap<String, usize> = BTreeMap::new();
            for feature in &layer.features {
                let properties = layer.properties(feature);
                let kind = format!(
                    "{}{}",
                    properties.str("kind").unwrap_or("-"),
                    properties
                        .str("kind_detail")
                        .map(|d| format!("/{d}"))
                        .unwrap_or_default()
                );
                *kinds
                    .entry(format!("{:?}:{kind}", feature.geometry_type))
                    .or_default() += 1;
            }
            println!(
                "  {} ({}): {}",
                layer.name,
                layer.features.len(),
                kinds
                    .iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            );
        }
    }
}
