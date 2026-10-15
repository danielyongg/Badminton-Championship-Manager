/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' agar build bisa dibuka dari subfolder GitHub Pages
// testTimeout: tes simulasi karier ±3 detik lokal, bisa >5 detik (default) di runner CI yang lambat
export default defineConfig({ base: './', plugins: [react()], test: { testTimeout: 20000 } });
