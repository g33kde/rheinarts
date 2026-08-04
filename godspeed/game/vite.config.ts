import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: '.',
  // Deployed at /godspeed/ (see root Dockerfile/nginx.conf), but the dev
  // server serves from localhost:5174/ directly - only the production
  // build needs the subpath prefix baked into asset references.
  base: command === 'build' ? '/godspeed/' : '/',
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
}));
