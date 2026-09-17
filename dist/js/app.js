// register pattern: every external fact renders only through this module,
// reading site/registry.json. status must be one of stated|absent|unconfirmed.
// "stated" is the only status permitted to produce a live href, a clickable
// control, or a non-placeholder number.

function deriveHandle(url) {
  // LINK RULE: never store a handle directly — derive it from the stored URL.
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] ? `@${parts[0]}` : u.hostname;
  } catch {
    return null;
  }
}

function formatDated(asOf) {
  return asOf ? `as of ${asOf}` : "";
}

function renderCaBar(registry) {
  const ca = registry.contractAddress;
  const valueEl = document.getElementById("ca-value");
  const copyBtn = document.getElementById("ca-copy");
  const copyLabel = document.getElementById("ca-copy-label");
  const datedEl = document.getElementById("ca-dated");

  valueEl.dataset.status = ca.status;
  datedEl.textContent = formatDated(ca.asOf);

  if (ca.status === "stated" && ca.value) {
    valueEl.textContent = ca.value;
    copyBtn.disabled = false;
    copyBtn.removeAttribute("aria-disabled");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ca.value);
      } catch {
        // clipboard API unavailable; fall through to visible feedback only
      }
      copyBtn.dataset.copied = "true";
      copyLabel.textContent = "Copied";
      setTimeout(() => {
        copyBtn.dataset.copied = "false";
        copyLabel.textContent = "Copy";
      }, 1600);
    });
  } else {
    valueEl.textContent = ca.status === "unconfirmed" ? "Unconfirmed" : "Not yet issued";
    copyBtn.disabled = true;
    copyBtn.setAttribute("aria-disabled", "true");
  }
}

function renderSocialIcon(el, entry, label) {
  if (entry.status === "stated" && entry.url) {
    el.href = entry.url;
    el.removeAttribute("data-inert");
    el.removeAttribute("aria-disabled");
    const handle = deriveHandle(entry.url);
    el.setAttribute("aria-label", handle ? `${label}: ${handle}` : label);
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  } else {
    el.removeAttribute("href");
    el.dataset.inert = "true";
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("aria-label", `${label}: not yet confirmed`);
  }
}

function renderSocial(registry) {
  renderSocialIcon(document.getElementById("social-x"), registry.social.x, "X");
  renderSocialIcon(document.getElementById("social-github"), registry.social.github, "GitHub");

  const footerSlot = document.getElementById("footer-social");
  const xClone = document.getElementById("social-x").cloneNode(true);
  const ghClone = document.getElementById("social-github").cloneNode(true);
  footerSlot.append(xClone, ghClone);
}

function renderChain(registry) {
  const chain = registry.chain;
  const badge = document.getElementById("chain-badge");
  const eyebrow = document.getElementById("hero-chain");
  if (chain.status === "stated") {
    badge.textContent = chain.value;
    eyebrow.textContent = `Chain — ${chain.value}`;
  } else {
    badge.textContent = "—";
    eyebrow.textContent = "Chain — unconfirmed";
  }
}

function statTile(label, entry, formatter = (v) => v) {
  const wrap = document.createElement("div");
  wrap.className = "stat-tile";
  const l = document.createElement("div");
  l.className = "stat-tile__label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "stat-tile__value";
  if (entry.status === "stated" && entry.value !== null) {
    v.textContent = formatter(entry.value);
  } else {
    v.dataset.status = entry.status;
    v.textContent = "—";
    v.title = entry.status === "unconfirmed" ? "Unconfirmed" : "Absent — not yet reported";
  }
  wrap.append(l, v);
  return wrap;
}

function renderStats(registry) {
  const row = document.getElementById("stat-row");
  row.append(
    statTile("Chain", registry.chain),
    statTile("Contract", { status: registry.contractAddress.status, value: registry.contractAddress.value ? "issued" : null }),
    statTile("Market cap", registry.stats.marketCapUsd, (v) => `$${v}`),
    statTile("Volume", registry.stats.volumeUsd, (v) => `$${v}`),
    statTile("Holders", registry.stats.holders)
  );
}

function renderBatches(registry) {
  const grid = document.getElementById("batch-grid");
  const countEl = document.getElementById("batch-count");
  // COUNT RULE: the count is always registry.batches.length — never a literal.
  countEl.textContent = String(registry.batches.length);

  function paint(list) {
    grid.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `No batches on record yet.<span class="empty-state__dated">${formatDated(registry.chain.asOf)}</span>`;
      grid.append(empty);
      return;
    }
    for (const b of list) {
      const card = document.createElement("article");
      card.className = "card";
      const title = document.createElement("div");
      title.className = "card__title";
      title.textContent = b.name;
      const meta = document.createElement("div");
      meta.className = "card__meta";
      meta.textContent = b.meta || "";
      card.append(title, meta);
      grid.append(card);
    }
  }

  paint(registry.batches);

  const tabs = document.querySelectorAll("#batch-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      const sorted = [...registry.batches];
      if (tab.dataset.sort === "oldest") sorted.reverse();
      paint(sorted);
    });
  });
}

function registerRow(fieldName, entry) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.justifyContent = "space-between";
  row.style.gap = "16px";
  row.style.padding = "12px 0";
  row.style.borderBottom = "1px solid var(--surface-card-border)";
  row.style.minHeight = "var(--tap-min)";
  row.style.alignItems = "center";

  const name = document.createElement("span");
  name.textContent = fieldName;
  name.style.color = "var(--text-secondary)";

  const status = document.createElement("span");
  status.textContent = `${entry.status}${entry.asOf ? " · " + formatDated(entry.asOf) : ""}`;
  status.style.fontSize = "0.85rem";
  status.style.color = entry.status === "stated" ? "var(--text-primary)" : "var(--text-muted)";
  status.style.fontStyle = entry.status === "stated" ? "normal" : "italic";

  row.append(name, status);
  return row;
}

function renderRegisterList(registry) {
  const list = document.getElementById("register-list");
  list.append(
    registerRow("Chain", registry.chain),
    registerRow("Contract address", registry.contractAddress),
    registerRow("X", registry.social.x),
    registerRow("GitHub", registry.social.github),
    registerRow("Market cap", registry.stats.marketCapUsd),
    registerRow("Volume", registry.stats.volumeUsd),
    registerRow("Holders", registry.stats.holders)
  );
}

async function main() {
  const res = await fetch("registry.json");
  const registry = await res.json();
  renderCaBar(registry);
  renderChain(registry);
  renderSocial(registry);
  renderStats(registry);
  renderBatches(registry);
  renderRegisterList(registry);
}

main();
