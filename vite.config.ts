import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
  },
  build: {
    target: 'ES2022',
    sourcemap: true,
  },
});
