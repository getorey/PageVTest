import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// opencode-local-plugin/
const pluginRoot = path.resolve(__dirname, "..");
// your-project/
const projectRoot = path.resolve(pluginRoot, "..");

const srcPlugin = path.resolve(pluginRoot, "src", "index.ts");
const opencodeDir = path.resolve(projectRoot, ".opencode");
const opencodePluginsDir = path.resolve(opencodeDir, "plugins");
const dstPlugin = path.resolve(opencodePluginsDir, "hello-plugin.ts");

// .opencode/package.json (opencode가 bun install 하도록)
const opencodePkg = path.resolve(opencodeDir, "package.json");
const desiredPkg = {
  dependencies: {
    "@opencode-ai/plugin": "latest"
  }
};

fs.mkdirSync(opencodePluginsDir, { recursive: true });

// 1) 플러그인 TS 복사
fs.copyFileSync(srcPlugin, dstPlugin);

// 2) .opencode/package.json 보장
fs.writeFileSync(opencodePkg, JSON.stringify(desiredPkg, null, 2));

console.log("[sync] copied plugin to", dstPlugin);
console.log("[sync] ensured", opencodePkg);
