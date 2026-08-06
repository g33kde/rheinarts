import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: '.',
  // Deployed at /godspeed/ (see root Dockerfile/nginx.conf), but the dev
  // server serves from localhost:5174/ directly - only the production
  // build needs the subpath prefix baked into asset references.
  base: command === 'build' ? '/godspeed/' : '/',
  // Music lives outside the Vite project root (godspeed/music/, sibling to
  // godspeed/game/) so tracks can be dropped in without touching src/ -
  // Vite copies this dir's contents as-is, referenced at runtime via
  // import.meta.env.BASE_URL (see src/audio/MusicController.ts).
  publicDir: '../music',
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
}));
