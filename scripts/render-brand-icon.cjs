const path = require('node:path');
const fs = require('node:fs');
const { chromium, browserOptions } = require('./browser-test-runtime.cjs');
async function run() {
 const browser = await chromium.launch(browserOptions);
 try {
  const page = await browser.newPage();
  const master = fs.readFileSync(path.resolve(__dirname, '../assets/skipreader-icon-master.png'));
  // Prepare install sizes from the approved artwork; no creative changes here.
  const icons = await page.evaluate(async source => {
   const image = new Image(); image.src = source; await image.decode();
   return [512, 192].map(size => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size, size);
    return { size, data: canvas.toDataURL('image/png').split(',')[1] };
   });
  }, 'data:image/png;base64,' + master.toString('base64'));
  for (const icon of icons) fs.writeFileSync(path.resolve(__dirname, `../assets/skipreader-icon${icon.size === 512 ? '' : '-192'}.png`), Buffer.from(icon.data, 'base64'));
  // Raster wrapper preserves the existing icon.svg URL, not a vector source.
  fs.writeFileSync(path.resolve(__dirname, '../assets/skipreader-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>SkipReader · 一跃</title><image width="512" height="512" href="data:image/png;base64,${icons[0].data}"/></svg>\n`);
  console.log('Prepared 512px and 192px install icons with transparent corners');
 } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
