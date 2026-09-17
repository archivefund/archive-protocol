import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");
const DIST = join(ROOT, "dist");

// deployable surface only: index.html, styles/, js/, assets/, registry.json
// (registry.json is data the page fetches at runtime, not markup/style/script,
// but the build is not deployable without it, so it ships alongside index.html)
// excluded by construction: brand/, reference/, tools/, tests/, node_modules/
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

cpSync(join(SITE, "styles"), join(DIST, "styles"), { recursive: true });
cpSync(join(SITE, "assets"), join(DIST, "assets"), { recursive: true });
cpSync(join(SITE, "registry.json"), join(DIST, "registry.json"));

mkdirSync(join(DIST, "js"), { recursive: true });
cpSync(join(SITE, "app.js"), join(DIST, "js", "app.js"));

let html = readFileSync(join(SITE, "index.html"), "utf8");
html = html.replace('<script src="app.js"></script>', '<script src="js/app.js"></script>');
if (!html.includes('<script src="js/app.js"></script>')) {
  throw new Error("build: failed to rewrite app.js script path to js/app.js");
}
writeFileSync(join(DIST, "index.html"), html);

console.log(`build: wrote deployable site to ${DIST}`);
