import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig(({ isPreview }) => ({
  base: '/Museo-Virtual/',
  plugins: isPreview ? [] : [mkcert()],
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
  },
  build: {
    target: 'es2022',
  },
}));
