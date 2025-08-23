// server.js
const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());
const app = express();
app.use(express.json());

// ---- Health check route ----
app.get("/", (req, res) => {
  res.send("✅ API is live! Use POST /analyze with { url: 'https://example.com' }");
});

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

    // Strapline detection
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

    // CTA detection (skip login/signup)
    const cta = (() => {
      const selectors = [
        "a[role='button']", "button", "a.btn", ".btn", ".button", ".cta", ".primary",
        ".hero-btn", ".hero-button", "[data-cta]",
        "[aria-label*='try']", "[aria-label*='start']", "[aria-label*='get']",
        "[aria-label*='join']", "[aria-label*='buy']", "[aria-label*='sign']",
        "[aria-label*='register']", "[aria-label*='demo']"
      ].join(", ");

      const disallowedAuth = /login|sign ?in|sign ?up/i;

      // Prefer CTA near strapline/h1
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

      // Fallback global search
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

// ---- Captcha detection ----
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
    const hasCaptchaElements = selectors.some(sel => document.querySelector(sel));
    return text.includes("captcha") || text.includes("verify you are human") || hasCaptchaElements;
  });
}

// ---- analyze endpoint ----
app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Please provide a valid 'url'" });
  }

  let browser;
  try {
    // Try headless first
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Check captcha
    if (await detectCaptcha(page)) {
      await browser.close();

      // Retry in non-headless mode (once)
      browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
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

    // If no captcha
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

// ---- start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
