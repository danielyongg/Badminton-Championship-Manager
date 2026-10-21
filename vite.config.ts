/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';

// base './' agar build bisa dibuka dari subfolder GitHub Pages
// testTimeout: tes simulasi karier ±3 detik lokal, bisa >5 detik (default) di runner CI yang lambat
// version.json + __BUILD__: web app yang sudah terbuka membandingkan keduanya untuk tahu ada versi baru (src/ui/UpdateBar.tsx).
// sw.js: service-worker.js berisi daftar semua file build (+ public/) agar game bisa dibuka offline.
const BUILD = Date.now().toString(36);
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), {
    name: 'version-json-sw',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
      const files = ['./', ...Object.keys(bundle), ...readdirSync('public')].filter((f) => f !== 'version.json');
      const sw = readFileSync('service-worker.js', 'utf8').replace("'bcm-__BUILD__'", `'bcm-${BUILD}'`).replace('= __FILES__;', `= ${JSON.stringify(files)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  }],
  test: { testTimeout: 20000 },
});
