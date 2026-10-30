import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE lets the same build run at a domain root (Netlify, Cloudflare, Vercel)
// or under a GitHub Pages project path such as /my-blog/.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
  },
});
