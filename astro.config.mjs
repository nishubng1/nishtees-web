import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static output: Cloudflare Pages serves dist/ directly, and the separate
// functions/ directory handles the API. No SSR adapter — see functions/api/.
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
