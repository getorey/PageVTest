import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// opencode-local-plugin/
const pluginRoot = path.resolve(__dirname, "..");
// your-project/
const projectRoot = path.resolve(pluginRoot, "..");

// 소스 경로
const srcDir = path.resolve(pluginRoot, "src");
const srcPlugin = path.resolve(srcDir, "index.ts");

// 타겟 경로 (.opencode/plugins/)
const opencodeDir = path.resolve(projectRoot, ".opencode");
const opencodePluginsDir = path.resolve(opencodeDir, "plugins");
const dstPluginDir = path.resolve(opencodePluginsDir, "doc-janitor-plugin");

// .opencode/package.json (opencode가 bun install 하도록)
const opencodePkg = path.resolve(opencodeDir, "package.json");
const desiredPkg = {
  dependencies: {
    "@opencode-ai/plugin": "latest",
    "zod": "^4.3.6"
  }
};

// 디렉토리 생성
fs.mkdirSync(opencodePluginsDir, { recursive: true });
fs.mkdirSync(dstPluginDir, { recursive: true });

// 1) 플러그인 메인 파일 복사 (doc-janitor-plugin.ts)
fs.copyFileSync(srcPlugin, path.resolve(dstPluginDir, "index.ts"));

// 2) tools 폴더 복사
const srcToolsDir = path.resolve(srcDir, "tools");
const dstToolsDir = path.resolve(dstPluginDir, "tools");
if (fs.existsSync(srcToolsDir)) {
  fs.cpSync(srcToolsDir, dstToolsDir, { recursive: true });
  console.log("[sync] copied tools/ to", dstToolsDir);
}

// 3) hooks 폴더 복사
const srcHooksDir = path.resolve(srcDir, "hooks");
const dstHooksDir = path.resolve(dstPluginDir, "hooks");
if (fs.existsSync(srcHooksDir)) {
  fs.cpSync(srcHooksDir, dstHooksDir, { recursive: true });
  console.log("[sync] copied hooks/ to", dstHooksDir);
}

// 4) .opencode/package.json 보장
fs.writeFileSync(opencodePkg, JSON.stringify(desiredPkg, null, 2));

console.log("[sync] copied plugin to", path.resolve(dstPluginDir, "index.ts"));
console.log("[sync] ensured", opencodePkg);
