import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");

const HEX_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

function read(path) {
  return readFileSync(path, "utf8");
}

// ---- individual checks, each returns {ok, detail} and takes file contents so
// the self-test below can feed them throwaway/broken copy ----

function checkPaletteConfined(files) {
  // files: { path -> content }, palette literals must live only in tokens.css
  const offenders = [];
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith("tokens.css")) continue;
    const matches = content.match(HEX_RE);
    if (matches) offenders.push(`${path}: ${matches.join(", ")}`);
  }
  return { ok: offenders.length === 0, detail: offenders.join(" | ") };
}

function checkTokensHaveProvenance(tokensCssContent) {
  const hasKmeans = /k-means/i.test(tokensCssContent);
  const hasCoord = /snapped px \(\d+,\s*\d+\)/.test(tokensCssContent);
  return {
    ok: hasKmeans && hasCoord,
    detail: hasKmeans && hasCoord ? "" : "missing k-means / snapped-pixel provenance comments",
  };
}

function checkRegistryShape(registry) {
  const valid = new Set(["stated", "absent", "unconfirmed"]);
  const bad = [];
  function walk(obj, path) {
    if (obj && typeof obj === "object" && "status" in obj) {
      if (!valid.has(obj.status)) bad.push(`${path}.status=${obj.status}`);
      return;
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === "$schema") continue;
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }
  walk(registry, "");
  return { ok: bad.length === 0, detail: bad.join(", ") };
}

function checkCaGateWired(indexHtml, appJs) {
  const hasDataStatus = /id="ca-value"[^>]*data-status="absent"/.test(indexHtml);
  const startsDisabled = /id="ca-copy"[^>]*\bdisabled\b/.test(indexHtml);
  const gatesOnStated = /ca\.status === ["']stated["']/.test(appJs);
  const ok = hasDataStatus && startsDisabled && gatesOnStated;
  return {
    ok,
    detail: ok ? "" : `hasDataStatus=${hasDataStatus} startsDisabled=${startsDisabled} gatesOnStated=${gatesOnStated}`,
  };
}

function checkSocialInertByDefault(indexHtml, appJs) {
  const xInert = /id="social-x"[^>]*data-inert="true"/.test(indexHtml);
  const ghInert = /id="social-github"[^>]*data-inert="true"/.test(indexHtml);
  const noHrefInMarkup = !/id="social-(x|github)"[^>]*href=/.test(indexHtml);
  const gatesOnStated = /entry\.status === ["']stated["'] && entry\.url/.test(appJs);
  const ok = xInert && ghInert && noHrefInMarkup && gatesOnStated;
  return {
    ok,
    detail: ok ? "" : `xInert=${xInert} ghInert=${ghInert} noHrefInMarkup=${noHrefInMarkup} gatesOnStated=${gatesOnStated}`,
  };
}

function checkCountFromRegistryLength(appJs) {
  const usesLength = /registry\.batches\.length/.test(appJs);
  return { ok: usesLength, detail: usesLength ? "" : "batch count is not derived from registry.batches.length" };
}

function checkNoChUnits(files) {
  const offenders = [];
  for (const [path, content] of Object.entries(files)) {
    // "ch" as a CSS unit: number immediately followed by ch, word-boundaried
    const matches = content.match(/\b\d+(\.\d+)?ch\b/g);
    if (matches) offenders.push(`${path}: ${matches.join(", ")}`);
  }
  return { ok: offenders.length === 0, detail: offenders.join(" | ") };
}

function checkTapTargets(mainCss) {
  const usesTapMin = (mainCss.match(/var\(--tap-min\)/g) || []).length;
  return { ok: usesTapMin >= 3, detail: usesTapMin >= 3 ? "" : `only ${usesTapMin} usages of --tap-min` };
}

// ---- runner over the real project files ----

function loadRealFiles() {
  const files = {
    [join(SITE, "styles/tokens.css")]: read(join(SITE, "styles/tokens.css")),
    [join(SITE, "styles/main.css")]: read(join(SITE, "styles/main.css")),
    [join(SITE, "index.html")]: read(join(SITE, "index.html")),
    [join(SITE, "app.js")]: read(join(SITE, "app.js")),
  };
  const registry = JSON.parse(read(join(SITE, "registry.json")));
  return { files, registry };
}

function runAllChecks({ files, registry }) {
  const tokensCss = files[join(SITE, "styles/tokens.css")];
  const mainCss = files[join(SITE, "styles/main.css")];
  const indexHtml = files[join(SITE, "index.html")];
  const appJs = files[join(SITE, "app.js")];

  return {
    "palette confined to tokens.css": checkPaletteConfined(files),
    "tokens.css has k-means provenance": checkTokensHaveProvenance(tokensCss),
    "registry.json fields use stated|absent|unconfirmed": checkRegistryShape(registry),
    "CA gate wired inert-by-default": checkCaGateWired(indexHtml, appJs),
    "social icons inert-by-default, no href in markup": checkSocialInertByDefault(indexHtml, appJs),
    "batch count derives from registry.batches.length": checkCountFromRegistryLength(appJs),
    "no ch units": checkNoChUnits(files),
    "tap targets reference --tap-min (44px)": checkTapTargets(mainCss),
  };
}

function printResults(results, { quiet = false } = {}) {
  let allOk = true;
  for (const [name, { ok, detail }] of Object.entries(results)) {
    if (!ok) allOk = false;
    if (!quiet) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  }
  return allOk;
}

// ---- self-test: prove every gate is able to fail on throwaway copy ----

function selfTest() {
  const real = loadRealFiles();
  console.log("-- self-test: injecting throwaway violations, expecting each gate to FAIL --");
  let allFailedAsExpected = true;

  const mutations = [
    {
      name: "palette confined to tokens.css",
      run: () => {
        const files = { ...real.files };
        files[join(SITE, "styles/main.css")] += "\n.throwaway { color: #ff00ff; }\n";
        return checkPaletteConfined(files);
      },
    },
    {
      name: "tokens.css has k-means provenance",
      run: () => checkTokensHaveProvenance("/* no provenance here */ :root { --x: #112233; }"),
    },
    {
      name: "registry.json fields use stated|absent|unconfirmed",
      run: () => checkRegistryShape({ chain: { status: "definitely-live" } }),
    },
    {
      name: "CA gate wired inert-by-default",
      run: () => {
        const brokenHtml = real.files[join(SITE, "index.html")].replace('data-status="absent"', "");
        return checkCaGateWired(brokenHtml, real.files[join(SITE, "app.js")]);
      },
    },
    {
      name: "social icons inert-by-default, no href in markup",
      run: () => {
        const brokenHtml = real.files[join(SITE, "index.html")].replace(
          'id="social-x" data-inert="true"',
          'id="social-x" href="https://x.com/throwaway"'
        );
        return checkSocialInertByDefault(brokenHtml, real.files[join(SITE, "app.js")]);
      },
    },
    {
      name: "batch count derives from registry.batches.length",
      run: () => checkCountFromRegistryLength(real.files[join(SITE, "app.js")].replace(/registry\.batches\.length/g, "61")),
    },
    {
      name: "no ch units",
      run: () => checkNoChUnits({ "throwaway.css": ".x { width: 40ch; }" }),
    },
    {
      name: "tap targets reference --tap-min (44px)",
      run: () => checkTapTargets("/* nothing sized here */"),
    },
  ];

  for (const m of mutations) {
    const { ok } = m.run();
    const failedAsExpected = !ok;
    if (!failedAsExpected) allFailedAsExpected = false;
    console.log(`${failedAsExpected ? "PASS" : "FAIL"}  gate can fail: ${m.name}`);
  }
  return allFailedAsExpected;
}

const real = loadRealFiles();
const selfTestOk = selfTest();
console.log("\n-- running gates against the real project --");
const results = runAllChecks(real);
const realOk = printResults(results);

console.log(`\nself-test (gates can fail on throwaway copy): ${selfTestOk ? "PASS" : "FAIL"}`);
console.log(`real project gates: ${realOk ? "PASS" : "FAIL"}`);

process.exit(selfTestOk && realOk ? 0 : 1);
