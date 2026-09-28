import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';
export default defineConfig({
  plugins: [solid({ start: { renderMode: 'async', devtools: false }, ssr: true })],
});
