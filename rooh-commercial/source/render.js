const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [,, mode, out, a, b, fps] = process.argv;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('PAGE', m.text()));
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
  fs.mkdirSync(out, { recursive: true });
  let times = [];
  if (mode === 'stills') times = a.split(',').map(Number);
  else { const f = +fps; for (let i = +a; i < +b; i++) times.push(i / f); }
  const t0 = Date.now();
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    await page.evaluate(t => window.renderAt(t), t);
    const name = mode === 'stills' ? `t${t.toFixed(2)}.png` : `f${String(Math.round(t * +fps)).padStart(4, '0')}.png`;
    await page.screenshot({ path: `${out}/${name}` });
    if (i % 20 === 0) console.log(i, t.toFixed(3), ((Date.now() - t0) / (i + 1)).toFixed(0) + 'ms/frame');
  }
  await browser.close();
})();
