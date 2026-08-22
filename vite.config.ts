import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon-192.webp', 'pwa-icon-512.webp', 'pwa-maskable-512.webp'],
      manifest: {
        name: 'Oshali Fuel Distribution',
        short_name: 'Oshali Fuel',
        description: 'Oshali Fuel Distribution Management System',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-icon-192.webp',
            sizes: '192x192',
            type: 'image/webp',
          },
          {
            src: 'pwa-icon-512.webp',
            sizes: '512x512',
            type: 'image/webp',
          },
          {
            src: 'pwa-maskable-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
