import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const isDevBuild = process.env.DEV_BUILD === 'true';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDevBuild ? 'development' : 'production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      formats: ['iife'],
      name: 'Injector',
      fileName: () => 'content.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    minify: isDevBuild ? false : 'esbuild',
    sourcemap: isDevBuild ? true : false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
