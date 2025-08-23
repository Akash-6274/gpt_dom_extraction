// server.js
const express = require("express");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { executablePath } = require("puppeteer"); // fallback to bundled Chromium (local dev)
const fs = require("fs");
const path = require("path");

puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // allow HTML form submissions

// ---------- Simple test page ----------
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

// ---------- Chrome path resolution for Render ----------
function findChromeUnder(base) {
  try {
    if (!fs.existsSync(base)) return null;
    const versions = fs.readdirSync(base).filter(d => d.startsWith("linux-")).sort();
    if (!versions.length) return null;
    const latest = versions[versions.length - 1];
    const candidate = path.join(base, latest, "chrome-linux64", "chrome");
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function resolveChromePath() {
  // 1) If explicitly set and exists, use it
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2) Preferred: Chrome installed into the project slug during build
  // Build Command should be:
  // PUPPETEER_CACHE_DIR=$PWD/.cache/puppeteer npm install && npx puppeteer browsers install chrome
  const inProject = findChromeUnder("/opt/render/project/.cache/puppeteer/chrome");
  if (inProject) return inProject;

  // 3) Fallback: older location in Render’s global cache
  const inRenderCache = findChromeUnder("/opt/render/.cache/puppeteer/chrome");
  if (inRenderCache) return inRenderCache;

  // 4) Local development fallback
  return executablePath();
}

// ---------- Puppeteer launcher ----------
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

// ---------- DOM path helper (runs in page) ----------
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

// ---------- Extraction logic ----------
async function extractPageData(page) {
  return await page.evaluate((domPathFn) => {
    eval(domPathFn);

    const h1 = document.querySelector("h1");

    const strap = (() => {
      let candidate = h1 && h1.nextElementSibling;
      while (candidate && (candidate.tagName === "BR" || candidate.textContent.trim() === "")) {
        candidate = candidate.nextElementSibling;
      }
      if (candidate && /^(H2|H3|H4|H5|H6|P|SPAN)$/i.test(candidate.tagName)) return candidate;
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
      let cand = anchor && anchor.nextElementSibling;
      while (cand) {
        if (cand.matches && cand.matches(selectors) &&
            cand.textContent.trim().length > 0 && !disallowedAuth.test(cand.textContent.trim())) {
          return cand;
        }
        cand = cand.nextElementSibling;
      }
      const globals = Array.from(document.querySelectorAll(selectors)).filter(
        el => el.textContent.trim().length > 0 &&
              !disallowedAuth.test(el.textContent.trim()) &&
              !el.closest("footer")
      );
      return globals[0] || null;
    })();

    return {
      header: h1 ? { text: h1.innerText.trim(), dom: getDomPath(h1) } : null,
      strapline: strap ? { text: strap.textContent.trim(), dom: getDomPath(strap) } : null,
      cta: cta ? { text: cta.textContent.trim(), dom: getDomPath(cta) } : null
    };
  }, domPathFn);
}

// ---------- Captcha detection ----------
async function detectCaptcha(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    const selectors = [
      "iframe[src*='recaptcha']",
      "div#g-recaptcha",
      "div.hcaptcha-box",
      "input[name='captcha']",
      "form[action*='captcha']"
    ];
    const has = selectors.some(sel => document.querySelector(sel));
    return text.includes("captcha") || text.includes("verify you are human") || has;
  });
}

// ---------- API: POST /analyze ----------
app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Please provide a valid 'url'" });
  }

  let browser;
  try {
    // headless first
    browser = await launchBrowser({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    if (await detectCaptcha(page)) {
      await browser.close();

      // retry non-headless once
      browser = await launchBrowser({ headless: false });
      const retryPage = await browser.newPage();
      await retryPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      if (await detectCaptcha(retryPage)) {
        return res.status(403).json({
          error: "Captcha detected — site blocked automated access (even with full browser)"
        });
      }

      const retried = await extractPageData(retryPage);
      await retryPage.close();
      return res.json({
        url,
        above_the_fold: [
          { element_name: "main page title/header", text: retried?.header?.text || "", dom_path: retried?.header?.dom || "" },
          { element_name: "strap-line", text: retried?.strapline?.text || "", dom_path: retried?.strapline?.dom || "" },
          { element_name: "primary CTA button", text: retried?.cta?.text || "", dom_path: retried?.cta?.dom || "" }
        ],
        notes: ""
      });
    }

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

// ---------- Start server (keep at bottom) ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
