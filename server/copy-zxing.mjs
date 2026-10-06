// Copies the barcode-reading engine into the built web app, so phones scan barcodes using
// a file from this server instead of downloading it from the internet. Run by
// `npm run build:web` after the web build.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// The package doesn't expose its package.json, so find its folder from its main file
// (…/zxing-wasm/dist/cjs/full/index.js).
const pkgDir = join(dirname(require.resolve('zxing-wasm')), '..', '..', '..');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const out = join(import.meta.dirname, '..', 'dist');
mkdirSync(out, { recursive: true });
copyFileSync(join(pkgDir, 'dist', 'reader', 'zxing_reader.wasm'), join(out, `zxing-reader-${version}.wasm`));
console.log(`Copied barcode engine: dist/zxing-reader-${version}.wasm`);
