import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

const isDevBuild = process.env.DEV_BUILD === "true";

const copyStaticFiles = () => ({
  name: "copy-static",
  closeBundle() {
    const staticFiles = [
      "manifest.json",
      "background.js",
      "icon.png",
      "icon128.png",
    ];
    const cssSrc = resolve(__dirname, "src", "content.css");
    const outDir = resolve(__dirname, "dist");
    for (const file of staticFiles) {
      const src = resolve(__dirname, file);
      const dst = resolve(outDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
    if (fs.existsSync(cssSrc)) {
      fs.copyFileSync(cssSrc, resolve(outDir, "content.css"));
    }
  },
});

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      isDevBuild ? "development" : "production",
    ),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      name: "Injector",
      fileName: () => "content.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    minify: isDevBuild ? false : "esbuild",
    sourcemap: isDevBuild ? true : false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
