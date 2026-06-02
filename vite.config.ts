import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

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
      },
    },
  ],
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
