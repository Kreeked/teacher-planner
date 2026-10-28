import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH задається під час збирання для GitHub Pages (/teacher-planner/).
// Локально застосунок працює з кореня.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  // Firebase SDK важить ~800 КБ; для застосунку, що кешується офлайн, це нормально.
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Планер для вчителя',
        short_name: 'Планер',
        description: 'Календарно-тематичне планування, розклад і підготовка уроків',
        lang: 'uk',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F3F3F0',
        theme_color: '#F3F3F0',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Шрифт Onest з Google Fonts — щоб і без інтернету виглядало так само.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
})
