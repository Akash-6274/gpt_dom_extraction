// server.js
const express = require("express");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const { executablePath } = require("puppeteer"); // local dev fallback

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------------
// Health page with a quick HTML form
// ------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send(`
    <h1>🚀 GPT DOM Extraction API</h1>
    <p>Submit a URL to test the <code>/analyze</code> endpoint.</p>
    <form method="POST" action="/analyze">
      <input type="text" name="url" placeholder="https://example.com" size="50" />
      <button type="submit">Analyze</button>
    </form>
  `);
});

// Optional: avoid 502 if someone opens /analyze directly in browser
app.get("/analyze", (req, res) => {
  res
    .status(405)
    .send('Use POST /analyze with JSON body: { "url": "https://example.com" }');
});

// ------------------------------------------------------------------
// Resolve Chrome path on Render
// We install Chrome into the *project slug* so it persists at runtime.
// Build Command (Render Settings) should be:
// PUPPETEER_CACHE_DIR=$PWD/.cache/puppeteer PUPPETEER_DOWNLOAD_PATH=$PWD/.cache/puppeteer npm install && npx puppeteer browsers install chrome
// ------------------------------------------------------------------
function findChromeUnder(baseDir) {
  try {
    if (!fs.existsSync(baseDir)) return null;
    const versions = fs
      .readdirSync(baseDir)
      .filter((d) => d.startsWith("linux-"))
      .sort();
    if (!versions.length) return null;
    const latest = versions[versions.length - 1];
    const candidate = path.join(baseDir, latest, "chrome-linux64", "chrome");
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function resolveChromePath() {
  // 1) If user explicitly set an env var and it exists, use it
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2) ✅ Preferred: Chrome installed into the project slug (persists at runtime)
  const projectCache = findChromeUnder(
    "/opt/render/project/.cache/puppeteer/chrome"
  );
  if (projectCache) return projectCache;

  // 3) ⚠️ Fallback: older global cache (may not exist at runtime)
  const globalCache = findChromeUnder(
    "/opt/render/.cache/puppeteer/chrome"
  );
  if (globalCache) return globalCache;

  // 4) Local development fallback: Puppeteer’s bundled Chromium
  return executablePath();
}

// Centralized launcher with safe flags for containers
async function launchBrowser({ headless = true } = {}) {
  const chromePath = resolveChromePath();
  return await puppeteerExtra.launch({
    headless,
    executablePath: chromePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process"
    ]
  });
}

// ------------------------------------------------------------------
// DOM helpers (run inside the page)
// ------------------------------------------------------------------
const domPathFn = `
function getDomPath(el) {
  if (!el) return "";
  const stack = [];
  while (el && el.parentElement) {
    const nodeName = el.tagName.toLowerCase();
    if (el.id) {
      stack.unshift(\`\${nodeName}#\${el.id}\`);
    } else {
      const siblings = Array.from(el.parentElement.children)
        .filter((s) => s.tagName === el.tagName);
      const index = siblings.indexOf(el);
      if (siblings.length > 1 && index >= 0) {
        stack.unshift(\`\${nodeName}:nth-of-type(\${index + 1})\`);
      } else {
        stack.unshift(nodeName);
      }
    }
    el = el.parentElement;
  }
  return stack.join(" > ");
}
`;

async function extractPageData(page) {
  return await page.evaluate((domPathFn) => {
    eval(domPathFn);

    const h1 = document.querySelector("h1");

    const strap = (() => {
      let c = h1 && h1.nextElementSibling;
      while (c && (c.tagName === "BR" || c.textContent.trim() === "")) c = c.nextElementSibling;
      if (c && /^(H2|H3|H4|H5|H6|P|SPAN)$/i.test(c.tagName)) return c;
      return document.querySelector("h2, h3, h4, h5, h6, p, span, [data-strap], .subtitle, .tagline");
    })();

    const cta = (() => {
      const selectors = [
        "a[role='button']", "button", "a.btn", ".btn", ".button", ".cta", ".primary",
        ".hero-btn", ".hero-button", "[data-cta]",
        "[aria-label*='try']", "[aria-label*='start']", "[aria-label*='get']",
        "[aria-label*='join']", "[aria-label*='buy']", "[aria-label*='sign']",
        "[aria-label*='register']", "[aria-label*='demo']"
      ].join(", ");
      const disallowedAuth = /login|sign ?in|sign ?up/i;

      let anchor = strap || h1;
      let c = anchor && anchor.nextElementSibling;
      while (c) {
        if (c.matches && c.matches(selectors) &&
            c.textContent.trim().length > 0 &&
            !disallowedAuth.test(c.textContent.trim())) return c;
        c = c.nextElementSibling;
      }

      const global = Array.from(document.querySelectorAll(selectors)).filter(
        el => el.textContent.trim().length > 0 &&
              !disallowedAuth.test(el.textContent.trim()) &&
              !el.closest("footer")
      );
      return global[0] || null;
    })();

    return {
      header: h1 ? { text: h1.innerText.trim(), dom: getDomPath(h1) } : null,
      strapline: strap ? { text: strap.textContent.trim(), dom: getDomPath(strap) } : null,
      cta: cta ? { text: cta.textContent.trim(), dom: getDomPath(cta) } : null
    };
  }, domPathFn);
}

// ------------------------------------------------------------------
// API: POST /analyze
// ------------------------------------------------------------------
app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Please provide a valid 'url'" });
  }

  let browser;
  try {
    browser = await launchBrowser({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const data = await extractPageData(page);
    await page.close();

    return res.json({
      url,
      above_the_fold: [
        { element_name: "main page title/header", text: data?.header?.text || "", dom_path: data?.header?.dom || "" },
        { element_name: "strap-line", text: data?.strapline?.text || "", dom_path: data?.strapline?.dom || "" },
        { element_name: "primary CTA button", text: data?.cta?.text || "", dom_path: data?.cta?.dom || "" }
      ],
      notes: ""
    });
  } catch (err) {
    console.error("❌ Error analyzing page:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// ------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
