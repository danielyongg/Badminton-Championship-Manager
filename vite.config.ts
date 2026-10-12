import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' agar build bisa dibuka dari subfolder GitHub Pages
export default defineConfig({ base: './', plugins: [react()] });
