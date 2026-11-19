// Render the real bundled UI in headless Chromium with a mocked bridge,
// then screenshot for visual verification.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

mkdirSync('test/static-test', { recursive: true });
await build({
  entryPoints: ['ui/app.jsx'],
  bundle: true,
  outfile: 'test/static-test/main.js',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  alias: { '@forge/bridge': './test/bridge-mock.js' },
  logLevel: 'silent',
});
copyFileSync('ui/index.html', 'test/static-test/index.html');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1264, height: 909 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + process.cwd() + '/test/static-test/index.html');
await page.waitForFunction(() => document.body.innerText.includes('DEMO-101'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/downloads/sortline-ui-projectpage.png' });
console.log('screenshot saved: /downloads/sortline-ui-projectpage.png');
await browser.close();
