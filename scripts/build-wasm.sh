#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
RUSTFLAGS="-C target-feature=+simd128" cargo build --release -p instantmap-wasm --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir worker/pkg --no-typescript target/wasm32-unknown-unknown/release/instantmap_wasm.wasm
ls -l worker/pkg/instantmap_wasm_bg.wasm
