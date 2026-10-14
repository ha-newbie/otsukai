import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const repositoryBase = owner && repository
  ? (repository.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${repository}/`)
  : '/';
const base = process.env.BASE_PATH ?? repositoryBase;
if (!/^\/(?:[a-zA-Z0-9_.-]+\/)*$/.test(base)) {
  throw new Error('BASE_PATHは / または /otsukai/ のような、前後にスラッシュのあるパスを指定してください');
}

/** GitHub Pages serves 404.html for a first visit to an unknown SPA path. */
const pagesFallback: Plugin = {
  name: 'github-pages-spa-fallback',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const index = bundle['index.html'];
    if (!index || index.type !== 'asset') this.error('SPAの起動ファイル index.html が生成されませんでした');
    this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
    this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
  },
};
export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), VitePWA({
    base, scope: base, filename: 'sw.js', registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
    manifest: {
      id: base, name: 'おつかい — 献立と買い物', short_name: 'おつかい', lang: 'ja',
      description: '献立から買い物まで。無料・広告なしの献立ノート。',
      start_url: base, scope: base, display: 'standalone',
      background_color: '#f7f8f4', theme_color: '#47745a',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: { clientsClaim: true, globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: `${base}index.html` },
  }), pagesFallback],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
