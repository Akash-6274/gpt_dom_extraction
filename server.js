// server.js
const express = require("express");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const { executablePath } = require("puppeteer");

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Health check + test page ----
app.get("/", (req, res) => {
  res.send(`
    <h2>🚀 GPT DOM Extraction API</h2>
    <p>Submit a URL to test the <code>/analyze</code> endpoint.</p>
    <form method="POST" action="/analyze">
      <input type="text" name="url" placeholder="https://example.com" size="50" />
      <button type="submit">Analyze</button>
    </form>
  `);
});

// --- Chrome path resolver ---
function findChromeUnder(base) {
  if (!fs.existsSync(base)) return null;
  const versions = fs.readdirSync(base).filter(d => d.startsWith("linux-")).sort();
  if (!versions.length) return null;
  const latest = versions[versions.length - 1];
  const candidate = path.join(base, latest, "chrome-linux64", "chrome");
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveChromePath() {
  // 1) Project slug cache (good path)
  const inProject = findChromeUnder("/opt/render/project/.cache/puppeteer/chrome");
  if (inProject) return inProject;

  // 2) Legacy build cache (sometimes used)
  const inRenderCache = findChromeUnder("/opt/render/.cache/puppeteer/chrome");
  if (inRenderCache) return inRenderCache;

  // 3) Local dev fallback
  return executablePath();
}

// --- Launch browser helper ---
async function launchBrowser({ headless = true } = {}) {
  return await puppeteerExtra.launch({
    headless,
    executablePath: resolveChromePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process"
    ]
  });
}

// ---- DOM path helper ----
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

// ---- Main extraction logic ----
async function extractPageData(page) {
  return await page.evaluate((domPathFn) => {
    eval(domPathFn);

    const h1 = document.querySelector("h1");

    const strap = (() => {
      let candidate = h1 && h1.nextElementSibling;
      while (candidate && (candidate.tagName === "BR" || candidate.textContent.trim() === "")) {
        candidate = candidate.nextElementSibling;
      }
      if (candidate && /^(H2|H3|H4|H5|H6|P|SPAN)$/i.test(candidate.tagName)) {
        return candidate;
      }
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

      let anchorNode = strap || h1;
      let candidate = anchorNode && anchorNode.nextElementSibling;
      while (candidate) {
        if (
          candidate.matches &&
          candidate.matches(selectors) &&
          candidate.textContent.trim().length > 0 &&
          !disallowedAuth.test(candidate.textContent.trim())
        ) {
          return candidate;
        }
        candidate = candidate.nextElementSibling;
      }

      const globalCandidates = Array.from(document.querySelectorAll(selectors)).filter(
        el =>
          el.textContent.trim().length > 0 &&
          !disallowedAuth.test(el.textContent.trim()) &&
          !el.closest("footer")
      );
      return globalCandidates.length ? globalCandidates[0] : null;
    })();

    return {
      header: h1 ? { text: h1.innerText.trim(), dom: getDomPath(h1) } : null,
      strapline: strap ? { text: strap.textContent.trim(), dom: getDomPath(strap) } : null,
      cta: cta ? { text: cta.textContent.trim(), dom: getDomPath(cta) } : null
    };
  }, domPathFn);
}

// ---- analyze endpoint ----
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

    const extracted = await extractPageData(page);
    await page.close();

    res.json({
      url,
      above_the_fold: [
        { element_name: "main page title/header", text: extracted?.header?.text || "", dom_path: extracted?.header?.dom || "" },
        { element_name: "strap-line", text: extracted?.strapline?.text || "", dom_path: extracted?.strapline?.dom || "" },
        { element_name: "primary CTA button", text: extracted?.cta?.text || "", dom_path: extracted?.cta?.dom || "" }
      ],
      notes: ""
    });
  } catch (err) {
    console.error("❌ Error analyzing page:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Add a GET handler for /analyze (avoid 502 when opening in browser)
app.get("/analyze", (req, res) => {
  res.status(405).send("Use POST /analyze with JSON body: { \"url\": \"https://example.com\" }");
});

// ---- start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
