import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        const outDir = resolve(__dirname, 'dist');
        // Копируем manifest.json
        copyFileSync(
          resolve(__dirname, 'public/manifest.json'),
          resolve(outDir, 'manifest.json'),
        );
        // Копируем иконки если есть
        const iconsDir = resolve(__dirname, 'public/icons');
        const distIconsDir = resolve(outDir, 'icons');
        if (existsSync(iconsDir)) {
          mkdirSync(distIconsDir, { recursive: true });
          for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
            const src = resolve(iconsDir, file);
            if (existsSync(src)) {
              copyFileSync(src, resolve(distIconsDir, file));
            }
          }
        }

        // Chrome Extensions требуют относительные пути в HTML (не абсолютные /assets/...).
        // Vite вставляет абсолютные — исправляем на относительные (./assets/...).
        const htmlPath = resolve(outDir, 'index.html');
        if (existsSync(htmlPath)) {
          let html = readFileSync(htmlPath, 'utf-8');
          html = html.replace(/ src="\/assets\//g, ' src="./assets/');
          html = html.replace(/ href="\/assets\//g, ' href="./assets/');
          // Убираем crossorigin — Chrome MV3 CSP не разрешает его для extension pages
          html = html.replace(/ crossorigin/g, '');
          writeFileSync(htmlPath, html);
        }
      },
    },
  ],
  base: './', // Относительный базовый путь для Chrome Extension
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        newtab: resolve(__dirname, 'index.html'),
      },
    },
  },
});
