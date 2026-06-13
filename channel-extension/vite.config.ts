import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

const isDevBuild = process.env.DEV_BUILD === "true";
const packageJsonPath = resolve(__dirname, "package.json");
const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).version;

const rootDir = resolve(__dirname, "../server/deploy");
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

function forceHttpsForPublicUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl.replace(/\/$/, "");
  }
  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal && parsed.protocol === "http:") {
    parsed.protocol = "https:";
    if (parsed.port === "80") parsed.port = "";
  }
  return parsed.toString().replace(/\/$/, "");
}

serverUrl = forceHttpsForPublicUrl(serverUrl);

const copyStaticFiles = () => ({
  name: "copy-channel-static",
  closeBundle() {
    const outDir = resolve(__dirname, "dist");
    const cssSrc = resolve(__dirname, "src", "content.css");
    const bgSrc = resolve(__dirname, "background.js");

    if (fs.existsSync(cssSrc)) {
      fs.copyFileSync(cssSrc, resolve(outDir, "content.css"));
    }
    if (fs.existsSync(bgSrc)) {
      let bgContent = fs.readFileSync(bgSrc, "utf-8");
      bgContent = bgContent.replace(
        /const CHANNEL_SERVER = ".*";/,
        `const CHANNEL_SERVER = "${serverUrl}";`,
      );
      fs.writeFileSync(resolve(outDir, "background.js"), bgContent);
    }

    const manifest = {
      manifest_version: 3,
      name: "EOPP Channel",
      version: packageVersion,
      description: "Remote channel agent for EOPP pages",
      update_url: `${serverUrl}/plugins/channel/update.xml`,
      host_permissions: [
        "https://eopp.epd-portal.ru/*",
        `${serverUrl}/*`,
        `*://${serverHost}/*`,
        "http://localhost:8765/*",
        "http://127.0.0.1:8765/*",
        "http://127.0.0.1:8766/*"
      ],
      permissions: ["storage"],
      background: {
        service_worker: "background.js"
      },
      content_scripts: [
        {
          matches: [
            "https://eopp.epd-portal.ru/*",
            `*://${serverHost}/*`,
            "http://localhost:8765/*",
            "http://127.0.0.1:8765/*",
            "http://127.0.0.1:8766/*"
          ],
          js: ["content.js"],
          css: ["content.css"],
          run_at: "document_idle"
        }
      ]
    };

    fs.writeFileSync(
      resolve(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  }
});

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(isDevBuild ? "development" : "production"),
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(serverUrl)
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["iife"],
      name: "EoppChannel",
      fileName: () => "content.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    minify: isDevBuild ? false : "esbuild",
    sourcemap: isDevBuild
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  }
});
