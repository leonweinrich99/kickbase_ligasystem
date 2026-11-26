import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

const ROUTES = [
  { name: 'liga', path: '/' },
  { name: 'pokal', path: '/pokal' },
  { name: 'feed', path: '/feed' },
  { name: 'feed-allgemein', path: '/feed?cat=allgemein' },
  { name: 'live', path: '/live' },
  { name: 'account', path: '/account' },
];

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 667, mobile: true },
  { name: 'mobile-375', width: 375, height: 812, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Kein Chrome/Edge Binary gefunden (setze CHROME_PATH).');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(e));
      this.ws.addEventListener('message', (evt) => {
        const msg = JSON.parse(String(evt.data));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

const AUDIT_SCRIPT = `(() => {
  const issues = [];
  const vw = window.innerWidth;
  const docScrollW = document.documentElement.scrollWidth;
  if (docScrollW > vw + 1) {
    issues.push({
      type: 'viewport-overflow',
      detail: 'documentElement.scrollWidth (' + docScrollW + ') > innerWidth (' + vw + ')'
    });
  }

  const topRow = document.querySelector('[data-layout-guard="header-top-row"]');
  if (topRow) {
    const rowRect = topRow.getBoundingClientRect();
    if (rowRect.right > vw + 1) {
      issues.push({
        type: 'header-overflow',
        detail: 'header-top-row right (' + Math.round(rowRect.right) + ') > viewport (' + vw + ')'
      });
    }
    const idEl = topRow.querySelector('[data-layout-guard="header-identity"]');
    const rightEl = topRow.querySelector('[data-layout-guard="header-right"]');
    if (idEl && rightEl) {
      const idRect = idEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      if (rightRect.width > 0 && idRect.right > rightRect.left + 1) {
        issues.push({
          type: 'header-overlap',
          detail: 'header-identity right (' + Math.round(idRect.right) + ') overlaps header-right left (' + Math.round(rightRect.left) + ')'
        });
      }
      if (rightRect.right > vw + 1) {
        issues.push({
          type: 'header-right-overflow',
          detail: 'header-right right (' + Math.round(rightRect.right) + ') > viewport (' + vw + ')'
        });
      }
    }
    for (const child of topRow.querySelectorAll('*')) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > rowRect.right + 2) {
        issues.push({
          type: 'header-child-overflow',
          detail: (child.tagName + ' "' + (child.textContent || '').trim().slice(0, 40) + '" right ' + Math.round(r.right) + ' > row ' + Math.round(rowRect.right))
        });
        break;
      }
    }
  }

  const statusStrip = document.querySelector('[data-layout-guard="header-status-strip"]');
  if (statusStrip) {
    const r = statusStrip.getBoundingClientRect();
    if (r.right > vw + 1 || statusStrip.scrollWidth > statusStrip.clientWidth + 1) {
      issues.push({
        type: 'status-strip-overflow',
        detail: 'statusStrip scrollWidth (' + statusStrip.scrollWidth + ') / right (' + Math.round(r.right) + ') exceeds viewport (' + vw + ')'
      });
    }
  }

  const tabStrip = document.querySelector('[data-layout-guard="tab-strip"]');
  if (tabStrip) {
    const sr = tabStrip.getBoundingClientRect();
    if (sr.width > 0 && sr.height > 0) {
      for (const btn of tabStrip.querySelectorAll('button')) {
        const br = btn.getBoundingClientRect();
        if (br.width === 0 || br.height === 0) continue;
        if (br.top < sr.top - 1 || br.bottom > sr.bottom + 1) {
          issues.push({
            type: 'tab-strip-vertical-clip',
            detail: 'button "' + (btn.textContent || '').trim().slice(0, 30) + '" clipped vertically in tab-strip'
          });
          break;
        }
      }
    }
  }

  for (const card of document.querySelectorAll('[data-layout-guard="player-card"]')) {
    const cr = card.getBoundingClientRect();
    if (cr.width === 0 || cr.height === 0) continue;
    if (cr.right > vw + 1) {
      issues.push({
        type: 'player-card-overflow',
        detail: 'player-card right (' + Math.round(cr.right) + ') > viewport (' + vw + ')'
      });
      break;
    }
    const center = card.querySelector('[data-layout-guard="player-card-center"]');
    const right = card.querySelector('[data-layout-guard="player-card-right"]');
    if (center && right) {
      const midR = center.getBoundingClientRect();
      const rightR = right.getBoundingClientRect();
      if (midR.right > rightR.left + 1) {
        issues.push({
          type: 'player-card-overlap',
          detail: 'player-card center (' + Math.round(midR.right) + ') overlaps right (' + Math.round(rightR.left) + ')'
        });
        break;
      }
    }
  }

  return {
    vw,
    docScrollW,
    hasHeader: Boolean(topRow),
    issues,
  };
})()`;

async function run() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('frontend/dist fehlt. Bitte zuerst `npm run build` ausfuehren.');
  }

  const args = process.argv.slice(2);
  const ssIdx = args.indexOf('--screenshots');
  const screenshotDir = ssIdx >= 0 ? args[ssIdx + 1] : null;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const browserPath = findBrowser();
  const { server, baseUrl } = await startStaticServer();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kickbase-layout-guard-'));
  const debugPort = 9222 + Math.floor(Math.random() * 500);

  const chrome = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  const failures = [];

  try {
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('Kein Chrome CDP Page-Target gefunden.');
    }

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.mobile ? 2 : 1,
        mobile: vp.mobile,
      });

      for (const route of ROUTES) {
        const targetUrl = `${baseUrl}${route.path}`;
        await cdp.send('Page.navigate', { url: targetUrl });

        // Warte bis TabPageHeader nach Splash/Fetch gerendert ist (max 5s)
        const deadline = Date.now() + 5000;
        let ready = false;
        while (Date.now() < deadline) {
          const check = await cdp.send('Runtime.evaluate', {
            expression: 'Boolean(document.querySelector(\'[data-layout-guard="header-top-row"]\'))',
            returnByValue: true,
          });
          if (check?.result?.value) {
            ready = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }

        // Kurz auf Animationen & Scroll-Positionierung warten
        await new Promise((r) => setTimeout(r, 450));

        const evalRes = await cdp.send('Runtime.evaluate', {
          expression: AUDIT_SCRIPT,
          returnByValue: true,
        });
        const report = evalRes?.result?.value;

        if (!ready || !report?.hasHeader) {
          failures.push(`${vp.name} ${route.path}: Header wurde nicht innerhalb des Timeouts gerendert.`);
          continue;
        }

        if (report.issues.length > 0) {
          for (const issue of report.issues) {
            failures.push(`${vp.name} ${route.path} [${issue.type}]: ${issue.detail}`);
          }
        } else {
          console.log(`PASS  ${vp.name.padEnd(13)} ${route.path.padEnd(22)} (scrollW=${report.docScrollW}/${report.vw})`);
        }

        if (screenshotDir && (route.name === 'pokal' || route.name === 'liga' || route.name === 'feed-allgemein') && (vp.name === 'mobile-375' || vp.name === 'desktop-1280')) {
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          const outFile = path.join(screenshotDir, `${route.name}-${vp.name}.png`);
          fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
        }
      }
    }
  } finally {
    cdp?.close();
    try {
      chrome.kill();
    } catch {
      // ignore
    }
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  if (failures.length > 0) {
    console.error('\nLAYOUT-GUARD FEHLGESCHLAGEN:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }

  console.log(`\nAlle ${ROUTES.length * VIEWPORTS.length} Responsive-Layout-Checks bestanden!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
