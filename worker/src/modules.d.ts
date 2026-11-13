declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "*.pbf" {
  const data: ArrayBuffer;
  export default data;
}
