/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' agar build bisa dibuka dari subfolder GitHub Pages
// testTimeout: tes simulasi karier ±3 detik lokal, bisa >5 detik (default) di runner CI yang lambat
// version.json + __BUILD__: web app yang sudah terbuka membandingkan keduanya untuk tahu ada versi baru (src/ui/UpdateBar.tsx).
const BUILD = Date.now().toString(36);
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); } }],
  test: { testTimeout: 20000 },
});
