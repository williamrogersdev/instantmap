use instantmap_render::mvt::Tile;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).unwrap();
    let tile = Tile::decode(&bytes).unwrap();
    let layer = tile.layer(&args[2]).unwrap();
    let keys = [
        "kind",
        "kind_detail",
        "ref",
        "shield_text",
        "network",
        "name",
        "population",
        "population_rank",
        "min_zoom",
        "capital",
    ];
    for feature in layer
        .features
        .iter()
        .take(args.get(3).and_then(|n| n.parse().ok()).unwrap_or(12))
    {
        let properties = layer.properties(feature);
        let found: Vec<String> = keys
            .iter()
            .filter_map(|key| properties.get(key).map(|value| format!("{key}={value:?}")))
            .collect();
        println!("{:?} {}", feature.geometry_type, found.join(" "));
    }
}
