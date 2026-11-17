import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Capacitor loads the built bundle from the local filesystem
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
