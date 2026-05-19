import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

const isDevBuild = process.env.DEV_BUILD === "true";

// Load .env.server from project root
const rootDir = resolve(__dirname, "../prod");
const envServerPath = resolve(rootDir, ".env.server");
let serverUrl = "http://localhost:8765";
let serverHost = "localhost";

if (fs.existsSync(envServerPath)) {
  const envContent = fs.readFileSync(envServerPath, "utf-8");
  const urlMatch = envContent.match(/^SERVER_URL\s*=\s*(.+)$/m);
  const hostMatch = envContent.match(/^SERVER_HOST\s*=\s*(.+)$/m);
  if (urlMatch) serverUrl = urlMatch[1].trim();
  if (hostMatch) serverHost = hostMatch[1].trim();
}

const copyStaticFiles = () => ({
  name: "copy-static",
  closeBundle() {
    const staticFiles = ["icon.png", "icon128.png"];
    const cssSrc = resolve(__dirname, "src", "content.css");
    const bgSrc = resolve(__dirname, "background.js");
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

    // Copy and patch background.js with server URL
    if (fs.existsSync(bgSrc)) {
      let bgContent = fs.readFileSync(bgSrc, "utf-8");
      bgContent = bgContent.replace(
        /const CAPTCHA_SERVER = ".*";/,
        `const CAPTCHA_SERVER = "${serverUrl}";`,
      );
      fs.writeFileSync(resolve(outDir, "background.js"), bgContent);
    }

    // Generate manifest.json from template with server URL
    const serverProtocol = serverUrl.split(":")[0];
    const serverNoProtocol = serverHost;

    const manifest = {
      manifest_version: 3,
      name: "Помощник",
      version: "1.2.5",
      description: "Быстрые заметки прямо на странице",
      icons: {
        "48": "icon.png",
        "128": "icon128.png",
      },
      update_url: `${serverUrl}/plugins/update.xml`,
      host_permissions: [
        "https://eopp.epd-portal.ru/*",
        `*://${serverNoProtocol}/*`,
        "http://localhost:8765/*",
        "http://127.0.0.1:8765/*",
        "http://127.0.0.1:8766/*",
      ],
      permissions: ["storage"],
      background: {
        service_worker: "background.js",
      },
      content_scripts: [
        {
          matches: [
            "https://eopp.epd-portal.ru/ru/reservations/reservation/*",
            `*://${serverNoProtocol}/*/edit`,
            `*://${serverNoProtocol}/*/reschedule`,
            "http://localhost:8765/*/edit",
            "http://localhost:8765/*/reschedule",
            "http://127.0.0.1:8765/*/edit",
            "http://127.0.0.1:8765/*/reschedule",
            "http://127.0.0.1:8766/*/edit",
            "http://127.0.0.1:8766/*/reschedule",
          ],
          js: ["content.js"],
          css: ["content.css"],
          run_at: "document_idle",
        },
      ],
    };

    fs.writeFileSync(
      resolve(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  },
});

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      isDevBuild ? "development" : "production",
    ),
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(serverUrl),
    "import.meta.env.VITE_SERVER_HOST": JSON.stringify(serverHost),
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
