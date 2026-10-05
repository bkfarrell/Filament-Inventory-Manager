import { setZXingModuleOverrides, ZXING_WASM_VERSION } from 'barcode-detector';

// Browsers without built-in barcode reading (such as iPhone Safari) use a barcode engine
// that normally downloads from the internet. Load it from this server instead
// (copied into the web build by server/copy-zxing.mjs), so scanning works at home without
// depending on an outside website.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? `/zxing-reader-${ZXING_WASM_VERSION}.wasm` : prefix + path,
});
