import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: '.',
  // Deployed at /debris/ (same shared-image pattern as Godspeed), but the
  // dev server serves from localhost directly - only the production build
  // needs the subpath prefix baked into asset references.
  base: command === 'build' ? '/debris/' : '/',
  // Music lives outside the Vite project root (debris/music/, sibling to
  // debris/game/) so tracks can be dropped in without touching src/ - Vite
  // copies this dir's contents as-is, referenced at runtime via
  // import.meta.env.BASE_URL (see src/audio/MusicController.ts). Mirrors
  // Godspeed's godspeed/music/ setup exactly.
  publicDir: '../music',
  server: {
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
}));
