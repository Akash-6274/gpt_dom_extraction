// // server.js
// const express = require("express");
// const puppeteerExtra = require("puppeteer-extra");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// const fs = require("fs");
// const path = require("path");
// const { executablePath } = require("puppeteer"); // local dev fallback

// puppeteerExtra.use(StealthPlugin());

// const app = express();
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // ------------------------------------------------------------------
// // Health page with a quick HTML form
// // ------------------------------------------------------------------
// app.get("/", (req, res) => {
//   res.send(`
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8" />
//       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//       <title>GPT DOM Extraction API</title>
//       <style>
//         body {
//           font-family: Arial, sans-serif;
//           background: #f9f9f9;
//           margin: 0;
//           padding: 0;
//           display: flex;
//           justify-content: center;
//           align-items: center;
//           height: 100vh;
//         }
//         .container {
//           background: #fff;
//           padding: 2rem 3rem;
//           border-radius: 12px;
//           box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
//           text-align: center;
//           max-width: 500px;
//           width: 100%;
//         }
//         h1 {
//           color: #333;
//           margin-bottom: 0.5rem;
//         }
//         p {
//           color: #666;
//           font-size: 1rem;
//           margin-bottom: 1.5rem;
//         }
//         form {
//           display: flex;
//           gap: 10px;
//           justify-content: center;
//         }
//         input[type="text"] {
//           flex: 1;
//           padding: 10px 12px;
//           border: 1px solid #ccc;
//           border-radius: 8px;
//           font-size: 1rem;
//         }
//         button {
//           padding: 10px 18px;
//           background: #4f46e5;
//           color: #fff;
//           border: none;
//           border-radius: 8px;
//           font-size: 1rem;
//           cursor: pointer;
//           transition: background 0.3s ease;
//         }
//         button:hover {
//           background: #4338ca;
//         }
//       </style>
//     </head>
//     <body>
//       <div class="container">
//         <h1> GPT DOM Extraction</h1>
//         <p>Submit a URL to analyze endpoint.</p>
//         <form method="POST" action="/analyze">
//           <input type="text" name="url" placeholder="https://example.com" />
//           <button type="submit">Analyze</button>
//         </form>
//       </div>
//     </body>
//     </html>
//   `);
// });

// app.get("/analyze", (req, res) => {
//   res
//     .status(405)
//     .send('Use POST /analyze with JSON body: { "url": "https://example.com" }');
// });

// // ------------------------------------------------------------------
// // Resolve Chrome path on Render
// // ------------------------------------------------------------------
// function findChromeUnder(baseDir) {
//   try {
//     if (!fs.existsSync(baseDir)) return null;
//     const versions = fs
//       .readdirSync(baseDir)
//       .filter((d) => d.startsWith("linux-"))
//       .sort();
//     if (!versions.length) return null;
//     const latest = versions[versions.length - 1];
//     const candidate = path.join(baseDir, latest, "chrome-linux64", "chrome");
//     return fs.existsSync(candidate) ? candidate : null;
//   } catch {
//     return null;
//   }
// }

// function resolveChromePath() {
//   // 1) Environment variable override
//   const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
//   if (envPath && fs.existsSync(envPath)) {
//     console.log("✅ Using Chrome from env var:", envPath);
//     return envPath;
//   }

//   // 2) Preferred: Chrome inside project slug (persists at runtime)
//   const projectCache = findChromeUnder(
//     "/opt/render/project/src/.cache/puppeteer/chrome"
//   );
//   if (projectCache) {
//     console.log("✅ Using Chrome from project cache:", projectCache);
//     return projectCache;
//   }

//   // 3) Fallback: global cache (may not exist at runtime)
//   const globalCache = findChromeUnder(
//     "/opt/render/.cache/puppeteer/chrome"
//   );
//   if (globalCache) {
//     console.log("⚠️ Using Chrome from global cache:", globalCache);
//     return globalCache;
//   }

//   // 4) Local fallback: Puppeteer’s bundled Chromium
//   console.warn("⚠️ No cached Chrome found, using bundled Chromium");
//   return executablePath();
// }

// // Centralized launcher
// async function launchBrowser({ headless = true } = {}) {
//   const chromePath = resolveChromePath();
//   return await puppeteerExtra.launch({
//     headless,
//     executablePath: chromePath,
//     args: [
//       "--no-sandbox",
//       "--disable-setuid-sandbox",
//       "--disable-dev-shm-usage",
//       "--no-zygote",
//       "--single-process"
//     ]
//   });
// }

// // ------------------------------------------------------------------
// // DOM helpers (run inside the page)
// // ------------------------------------------------------------------
// const domPathFn = `
// function getDomPath(el) {
//   if (!el) return "";
//   const stack = [];
//   while (el && el.parentElement) {
//     const nodeName = el.tagName.toLowerCase();
//     if (el.id) {
//       stack.unshift(\`\${nodeName}#\${el.id}\`);
//     } else {
//       const siblings = Array.from(el.parentElement.children)
//         .filter((s) => s.tagName === el.tagName);
//       const index = siblings.indexOf(el);
//       if (siblings.length > 1 && index >= 0) {
//         stack.unshift(\`\${nodeName}:nth-of-type(\${index + 1})\`);
//       } else {
//         stack.unshift(nodeName);
//       }
//     }
//     el = el.parentElement;
//   }
//   return stack.join(" > ");
// }
// `;

// async function extractPageData(page) {
//   return await page.evaluate((domPathFn) => {
//     eval(domPathFn);

//     // ----------------- Helpers -----------------
//     const textOf = (el) => (el?.innerText || el?.textContent || "").trim().replace(/\s+/g, " ");
//     const isElementVisible = (el) => {
//       if (!el || !el.getBoundingClientRect) return false;
//       const style = window.getComputedStyle(el);
//       const rect = el.getBoundingClientRect();
//       if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) {
//         return false;
//       }
//       if (rect.width === 0 || rect.height === 0) return false;
//       return true;
//     };

//     // ----------------- HEADER -----------------
//     const h1 = document.querySelector("h1");

//     // ----------------- STRAPLINE -----------------
//     const strap = (() => {
//       if (!h1) return null;

//       // 1) Immediate sibling after H1
//       let c = h1.nextElementSibling;
//       while (c && (c.tagName === "BR" || !textOf(c))) c = c.nextElementSibling;
//       if (c && /^(H2|H3|H4|H5|H6|P|SPAN|DIV)$/i.test(c.tagName) && textOf(c).length > 0) {
//         return c;
//       }

//       // 2) Search inside same container/section
//       const container = h1.closest("section, div, header, main");
//       if (container) {
//         const candidates = Array.from(container.querySelectorAll("p, span, div, h2, h3, h4, h5, h6"))
//           .filter(el =>
//             el !== h1 &&
//             textOf(el).length > 0 &&
//             textOf(el).length < 200 &&
//             !/cookie|login|sign ?in|sign ?up/i.test(textOf(el))
//           );
//         if (candidates.length) return candidates[0];
//       }

//       // 3) Global fallback
//       const global = Array.from(document.querySelectorAll("p, span, div, h2, h3, h4, h5, h6, [data-strap], .subtitle, .tagline"))
//         .filter(el =>
//           textOf(el).length > 0 &&
//           textOf(el).length < 200 &&
//           !/cookie|login|sign ?in|sign ?up/i.test(textOf(el))
//         );
//       return global[0] || null;
//     })();

//     const anchorY = (strap || h1)?.getBoundingClientRect?.().top ?? 0;

//     // ----------------- CTA DETECTION -----------------
//     const scoreCandidate = (el) => {
//       if (!el || !isElementVisible(el)) return -Infinity;

//       const t = textOf(el).toLowerCase();
//       const rect = el.getBoundingClientRect();
//       let score = 0;

//       // Intent scoring
//       const weightMap = [
//         [/^(get|create|start|try)\b.*(now|free|trial)?/, 7],
//         [/\b(buy|shop|purchase|add to cart|checkout|pre[- ]?order)\b/, 7],
//         [/\b(subscribe|upgrade|go pro|go premium|activate|install)\b/, 6],
//         [/\b(book|request|schedule)\b.*\b(demo|call|meeting|consult(ation)?)\b/, 6],
//         [/\b(contact|talk to)\b.*\b(sales|expert|team)\b/, 6],
//         [/\b(request|get)\b.*\b(quote|pricing)\b/, 5],
//         [/\b(download|get the app|get app)\b/, 5],
//         [/\b(enroll|join|apply)\b/, 5],
//         [/\b(donate|give now)\b/, 6],
//         [/\b(learn more|discover more|see plans?)\b/, 3],
//       ];
//       for (const [re, w] of weightMap) if (re.test(t)) score += w;

//       // Negatives
//       const negatives = [/cookie/i, /log ?in/i, /sign ?in/i, /404/i];
//       for (const re of negatives) if (re.test(t)) score -= 10;

//       // Class/ID hints
//       const cls = (el.className || "").toLowerCase();
//       const id = (el.id || "").toLowerCase();
//       const attr = (el.getAttribute("aria-label") || "").toLowerCase();
//       if (/primary|cta|hero|wp-block-button__link|btn/.test(cls + " " + id) ||
//           /\b(primary|cta|start|get|try|buy|shop|subscribe|upgrade|demo|sales)\b/.test(attr)) {
//         score += 2;
//       }

//       // Type
//       const tag = el.tagName.toLowerCase();
//       if (tag === "button") score += 2;
//       if (tag === "a" && (cls.includes("btn") || el.getAttribute("role") === "button")) score += 2;
//       if (tag === "input" && /submit|button/.test((el.getAttribute("type") || "").toLowerCase())) score += 2;

//       // Placement
//       const top = rect.top + window.scrollY;
//       if (top < 1200) score += 2;
//       if (top < 600) score += 1;
//       if (el.closest("footer")) score -= 4;
//       if (el.closest("nav")) score -= 2;

//       // Proximity to hero
//       const d = Math.abs(rect.top - anchorY);
//       if (d < 300) score += 2;
//       else if (d < 600) score += 1;

//       // Size
//       if (rect.width * rect.height > 44 * 44) score += 1;

//       return score;
//     };

//     const ctaSelectors = [
//       "button",
//       "a[role='button']",
//       "a.btn, a.button, a.cta, a.primary",
//       "button.btn, button.button, button.cta, button.primary",
//       "[data-cta], [data-testid*='cta']",
//       "[aria-label*='try' i], [aria-label*='start' i], [aria-label*='get' i], [aria-label*='join' i], [aria-label*='buy' i], [aria-label*='shop' i], [aria-label*='sign up' i], [aria-label*='register' i], [aria-label*='demo' i], [aria-label*='subscribe' i], [aria-label*='download' i], [aria-label*='contact sales' i]",
//       "input[type='submit'], input[type='button'], input[type='image']",
//       ".wp-block-button__link",
//       "[class*='btn']", "[class*='button']", "[class*='cta']"
//     ].join(", ");

//     const candidates = Array.from(document.querySelectorAll(ctaSelectors))
//       .filter((el, idx, arr) => arr.findIndex(e => e === el) === idx)
//       .filter((el) => textOf(el).length > 0 || (el.tagName.toLowerCase() === "input" && (el.getAttribute("value") || "").trim().length > 0));

//     let best = null;
//     let bestScore = -Infinity;
//     for (const el of candidates) {
//       const s = scoreCandidate(el);
//       if (s > bestScore) {
//         best = el;
//         bestScore = s;
//       }
//     }

//     // ----------------- RETURN -----------------
//     return {
//       header: h1 ? { text: h1.innerText.trim(), dom: getDomPath(h1) } : null,
//       strapline: strap ? { text: textOf(strap), dom: getDomPath(strap) } : null,
//       cta: best ? { text: textOf(best) || (best.getAttribute("value") || "").trim(), dom: getDomPath(best) } : null
//     };
//   }, domPathFn);
// }


// // ------------------------------------------------------------------
// // API: POST /analyze
// // ------------------------------------------------------------------
// app.post("/analyze", async (req, res) => {
//   const { url } = req.body;
//   if (!url || !url.startsWith("http")) {
//     return res.status(400).json({ error: "Please provide a valid 'url'" });
//   }

//   let browser;
//   try {
//     browser = await launchBrowser({ headless: true });
//     const page = await browser.newPage();
//     await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

//     const data = await extractPageData(page);
//     await page.close();

//     return res.json({
//       url,
//       above_the_fold: [
//         { element_name: "main page title/header", text: data?.header?.text || "", dom_path: data?.header?.dom || "" },
//         { element_name: "strap-line", text: data?.strapline?.text || "", dom_path: data?.strapline?.dom || "" },
//         { element_name: "primary CTA button", text: data?.cta?.text || "", dom_path: data?.cta?.dom || "" }
//       ],
//     });
//   } catch (err) {
//     console.error("❌ Error analyzing page:", err);
//     return res.status(500).json({ error: err.message });
//   } finally {
//     if (browser) await browser.close();
//   }
// });

// // ------------------------------------------------------------------
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`✅ Server running on http://localhost:${PORT}`);
// });




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



// // ------------------------------------------------------------------
// // 🔑 Hardcoded token (simple protection)
// // ------------------------------------------------------------------
const SERVICE_TOKEN = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7"; // 36 chars


// ------------------------------------------------------------------
// Health page with a quick HTML form
// ------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>GPT DOM Extraction API</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f9f9f9; display: flex; justify-content: center; align-items: center; height: 100vh; }
        .container { background: #fff; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1); text-align: center; max-width: 500px; width: 100%; }
        input[type="text"] { margin-bottom: 10px; width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; }
        button { padding: 10px 18px; background: #4f46e5; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
        button:hover { background: #4338ca; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1> GPT DOM Extraction</h1>
        <p>Submit URL + ID + Token</p>
        <form method="POST" action="/analyze">
          <input type="text" name="url" placeholder="https://example.com" />
          <input type="text" name="id" placeholder="page_id" />
          <input type="text" name="token" placeholder="token" />
          <button type="submit">Analyze</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.get("/analyze", (req, res) => {
  res
    .status(405)
    .send('Use POST /analyze with JSON body: { "url": "https://example.com" }');
});

// ------------------------------------------------------------------
// Resolve Chrome path on Render
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
  // 1) Environment variable override
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    console.log("✅ Using Chrome from env var:", envPath);
    return envPath;
  }

  // 2) Preferred: Chrome inside project slug (persists at runtime)
  const projectCache = findChromeUnder(
    "/opt/render/project/src/.cache/puppeteer/chrome"
  );
  if (projectCache) {
    console.log("✅ Using Chrome from project cache:", projectCache);
    return projectCache;
  }

  // 3) Fallback: global cache (may not exist at runtime)
  const globalCache = findChromeUnder(
    "/opt/render/.cache/puppeteer/chrome"
  );
  if (globalCache) {
    console.log("⚠️ Using Chrome from global cache:", globalCache);
    return globalCache;
  }

  // 4) Local fallback: Puppeteer’s bundled Chromium
  console.warn("⚠️ No cached Chrome found, using bundled Chromium");
  return executablePath();
}

// Centralized launcher
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

    // ----------------- Helpers -----------------
    const textOf = (el) => (el?.innerText || el?.textContent || "").trim().replace(/\s+/g, " ");
    const isElementVisible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) {
        return false;
      }
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    };

    // ----------------- HEADER -----------------
    const h1 = document.querySelector("h1");

    // ----------------- STRAPLINE -----------------
    const strap = (() => {
      if (!h1) return null;

      // 1) Immediate sibling after H1
      let c = h1.nextElementSibling;
      while (c && (c.tagName === "BR" || !textOf(c))) c = c.nextElementSibling;
      if (c && /^(H2|H3|H4|H5|H6|P|SPAN|DIV)$/i.test(c.tagName) && textOf(c).length > 0) {
        return c;
      }

      // 2) Search inside same container/section
      const container = h1.closest("section, div, header, main");
      if (container) {
        const candidates = Array.from(container.querySelectorAll("p, span, div, h2, h3, h4, h5, h6"))
          .filter(el =>
            el !== h1 &&
            textOf(el).length > 0 &&
            textOf(el).length < 200 &&
            !/cookie|login|sign ?in|sign ?up/i.test(textOf(el))
          );
        if (candidates.length) return candidates[0];
      }

      // 3) Global fallback
      const global = Array.from(document.querySelectorAll("p, span, div, h2, h3, h4, h5, h6, [data-strap], .subtitle, .tagline"))
        .filter(el =>
          textOf(el).length > 0 &&
          textOf(el).length < 200 &&
          !/cookie|login|sign ?in|sign ?up/i.test(textOf(el))
        );
      return global[0] || null;
    })();

    const anchorY = (strap || h1)?.getBoundingClientRect?.().top ?? 0;

    // ----------------- CTA DETECTION -----------------
    const scoreCandidate = (el) => {
      if (!el || !isElementVisible(el)) return -Infinity;

      const t = textOf(el).toLowerCase();
      const rect = el.getBoundingClientRect();
      let score = 0;

      // Intent scoring
      const weightMap = [
        [/^(get|create|start|try)\b.*(now|free|trial)?/, 7],
        [/\b(buy|shop|purchase|add to cart|checkout|pre[- ]?order)\b/, 7],
        [/\b(subscribe|upgrade|go pro|go premium|activate|install)\b/, 6],
        [/\b(book|request|schedule)\b.*\b(demo|call|meeting|consult(ation)?)\b/, 6],
        [/\b(contact|talk to)\b.*\b(sales|expert|team)\b/, 6],
        [/\b(request|get)\b.*\b(quote|pricing)\b/, 5],
        [/\b(download|get the app|get app)\b/, 5],
        [/\b(enroll|join|apply)\b/, 5],
        [/\b(donate|give now)\b/, 6],
        [/\b(learn more|discover more|see plans?)\b/, 3],
      ];
      for (const [re, w] of weightMap) if (re.test(t)) score += w;

      // Negatives
      const negatives = [/cookie/i, /log ?in/i, /sign ?in/i, /404/i];
      for (const re of negatives) if (re.test(t)) score -= 10;

      // Class/ID hints
      const cls = (el.className || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const attr = (el.getAttribute("aria-label") || "").toLowerCase();
      if (/primary|cta|hero|wp-block-button__link|btn/.test(cls + " " + id) ||
          /\b(primary|cta|start|get|try|buy|shop|subscribe|upgrade|demo|sales)\b/.test(attr)) {
        score += 2;
      }

      // Type
      const tag = el.tagName.toLowerCase();
      if (tag === "button") score += 2;
      if (tag === "a" && (cls.includes("btn") || el.getAttribute("role") === "button")) score += 2;
      if (tag === "input" && /submit|button/.test((el.getAttribute("type") || "").toLowerCase())) score += 2;

      // Placement
      const top = rect.top + window.scrollY;
      if (top < 1200) score += 2;
      if (top < 600) score += 1;
      if (el.closest("footer")) score -= 4;
      if (el.closest("nav")) score -= 2;

      // Proximity to hero
      const d = Math.abs(rect.top - anchorY);
      if (d < 300) score += 2;
      else if (d < 600) score += 1;

      // Size
      if (rect.width * rect.height > 44 * 44) score += 1;

      return score;
    };

    const ctaSelectors = [
      "button",
      "a[role='button']",
      "a.btn, a.button, a.cta, a.primary",
      "button.btn, button.button, button.cta, button.primary",
      "[data-cta], [data-testid*='cta']",
      "[aria-label*='try' i], [aria-label*='start' i], [aria-label*='get' i], [aria-label*='join' i], [aria-label*='buy' i], [aria-label*='shop' i], [aria-label*='sign up' i], [aria-label*='register' i], [aria-label*='demo' i], [aria-label*='subscribe' i], [aria-label*='download' i], [aria-label*='contact sales' i]",
      "input[type='submit'], input[type='button'], input[type='image']",
      ".wp-block-button__link",
      "[class*='btn']", "[class*='button']", "[class*='cta']"
    ].join(", ");

    const candidates = Array.from(document.querySelectorAll(ctaSelectors))
      .filter((el, idx, arr) => arr.findIndex(e => e === el) === idx)
      .filter((el) => textOf(el).length > 0 || (el.tagName.toLowerCase() === "input" && (el.getAttribute("value") || "").trim().length > 0));

    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      const s = scoreCandidate(el);
      if (s > bestScore) {
        best = el;
        bestScore = s;
      }
    }

    // ----------------- RETURN -----------------
    return {
      header: h1 ? { text: h1.innerText.trim(), dom: getDomPath(h1) } : null,
      strapline: strap ? { text: textOf(strap), dom: getDomPath(strap) } : null,
      cta: best ? { text: textOf(best) || (best.getAttribute("value") || "").trim(), dom: getDomPath(best) } : null
    };
  }, domPathFn);
}


// ------------------------------------------------------------------
// API: POST /analyze
// ------------------------------------------------------------------
app.post("/analyze", async (req, res) => {
  const { url, id, token } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Please provide a valid 'url'" });
  }
  if (token !== SERVICE_TOKEN) {
    return res.status(403).json({ error: "Invalid or missing token" });
  }

  let browser;
  try {
    browser = await launchBrowser({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const data = await extractPageData(page);
    await page.close();

    return res.json({
      id: id || null, // ✅ include client’s page_id
      url,
      above_the_fold: [
        { element_name: "main page title/header", text: data?.header?.text || "", dom_path: data?.header?.dom || "" },
        { element_name: "strap-line", text: data?.strapline?.text || "", dom_path: data?.strapline?.dom || "" },
        { element_name: "primary CTA button", text: data?.cta?.text || "", dom_path: data?.cta?.dom || "" }
      ],
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
  console.log(`🔑 Token set to: ${SERVICE_TOKEN}`);
});
