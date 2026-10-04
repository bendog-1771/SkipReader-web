const path = require('node:path');
const { chromium, browserOptions } = require('./browser-test-runtime.cjs');
async function run() {
 const browser = await chromium.launch(browserOptions);
 try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const svg = require('node:fs').readFileSync(path.resolve(__dirname, '../assets/skipreader-icon.svg'), 'utf8');
  await page.setContent('<style>html,body{margin:0;width:512px;height:512px;background:transparent}svg{width:512px;height:512px;display:block}</style>' + svg);
  await page.screenshot({ path: path.resolve(__dirname, '../assets/skipreader-icon.png'), omitBackground: true });
 } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
