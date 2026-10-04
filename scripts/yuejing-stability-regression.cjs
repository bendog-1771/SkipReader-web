const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, browserOptions } = require('./browser-test-runtime.cjs');
const out = path.resolve(__dirname, '../reports/yujing');
async function run() {
  const browser = await chromium.launch(browserOptions), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
  const checks = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); };
  const snapshot = () => page.evaluate(() => window.skipReaderYujingSnapshot());
  const panel = async () => { if (!(await snapshot()).panel) await page.getByRole('button', { name: '跃境', exact: true }).click(); };
  const scene = name => page.locator('.yj-scene-picks').getByRole('button', { name, exact: true }).click();
  const slider = (label, value) => page.getByLabel(label, { exact: true }).evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
  try {
    await page.goto('http://localhost:5174/');
    await page.getByRole('button', { name: '导入书籍', exact: true }).waitFor();
    const chooser = page.waitForEvent('filechooser'), imported = page.evaluate(() => window.readerAPI.books.import());
    await (await chooser).setFiles({ name: 'Short Chinese.md', mimeType: 'text/markdown', buffer: Buffer.from('# 海边\n\n风来了。海很蓝。一起读书吧。\n\nA ripple moves through the water.\n\n# 云上\n\nThe open book floats above the quiet island.') });
    const book = await imported;
    await page.evaluate(async book => {
      const notebook = await window.readerAPI.vocab.addNotebook('48 words');
      for (let i = 0; i < 48; i++) await window.readerAPI.vocab.addItem({ notebookId: notebook.id, bookId: book.book.id, word: 'word' + i, chineseDef: '释义 ' + i, sourceSentence: 'My original sentence contains word' + i + '.' });
      const cfg = await window.readerAPI.settings.get();
      await window.readerAPI.settings.set({ ...cfg, yujing: { ...cfg.yujing, enabled: true, scene: 'train', planetCount: 48 } });
    }, book);
    await page.reload();
    await page.waitForFunction(() => window.skipReaderYujingSnapshot?.().models?.island === 'ready');
    check('Old carriage preference migrates to the Blender book island', (await snapshot()).scene === 'island');
    check('Ambiguous circular home button is removed', await page.locator('.yj-home').count() === 0);
    const entry = await page.locator('.yj-entry').boundingBox();
    check('Library entry is in the top tools, away from lower reading statistics', entry.y < 200 && entry.height >= 30);
    check('Book cards and their outer buttons become transparent', await page.locator('.library-book').first().evaluate(el => [el, el.querySelector('button')].every(n => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)')));
    await page.locator('.book-actions-button').first().click();
    check('Three-dot management still opens the existing book menu', await page.getByRole('button', { name: '重命名', exact: true }).isVisible());
    await page.keyboard.press('Escape');
    const themes = [];
    for (const theme of ['paper', 'night', 'sepia', 'forest', 'blue', 'dusk']) {
      await page.evaluate(async theme => { const cfg = await window.readerAPI.settings.get(); await window.readerAPI.settings.set({ ...cfg, theme }); }, theme);
      await page.reload(); await page.waitForFunction(() => !!window.skipReaderYujingSnapshot); await panel();
      themes.push(await page.locator('.yj-panel').evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, body: getComputedStyle(document.body).color })));
    }
    check('Climate panel follows all six reader themes', new Set(themes.map(v => v.background)).size === 6 && themes.every(v => v.color === v.body));
    await page.locator('.yj-panel-title button').click();
    await page.locator('.library-book').getByText('Short Chinese', { exact: true }).click();
    await page.locator('.reader-text p').first().waitFor(); await panel();
    await scene('风中的句子'); await page.getByLabel('吹来的文字').selectOption('chapter');
    await page.waitForFunction(() => window.skipReaderYujingSnapshot().quotes.some(q => q.endsWith('风来了。')));
    check('Short Chinese sentences without spaces are available independently', (await snapshot()).quotes.includes('海很蓝。') && (await snapshot()).quotes.includes('一起读书吧。'));
    await page.locator('.yj-panel-title button').click();
    await page.mouse.move(1100, 650); const a = await snapshot();
    await page.mouse.move(350, 740); const b = await snapshot();
    check('Wind tracks real pointer movement', a.pointer[0] > b.pointer[0] && a.pointer[1] > b.pointer[1]);
    await page.mouse.click(1200, 750); check('Clicking the empty background triggers a visible gust', (await snapshot()).gust > .8);
    await page.evaluate(() => {
      const node = document.querySelector('.reader-text p').firstChild, range = document.createRange(); range.selectNodeContents(node);
      getSelection().removeAllRanges(); getSelection().addRange(range); node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.locator('.selection-bar .yj-capture').click();
    await page.waitForFunction(() => window.skipReaderYujingSnapshot().quotes.includes('风来了。海很蓝。一起读书吧。'));
    check('The selection bar saves and immediately blows the selected original sentence', (await page.evaluate(() => window.readerAPI.notes.listAll())).length === 1);
    await panel();
    for (const value of [0, .35, 1]) {
      await slider('阅读底色不透明度', value);
      await page.waitForFunction(value => document.querySelector('.app-shell').style.getPropertyValue('--yj-paper') === Math.round(value * 100) + '%', value);
      const styles = await page.locator('.reader-content').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, wrapper: getComputedStyle(el.closest('.reader-wrap')).backgroundColor }));
      check('Reading paper opacity reaches ' + Math.round(value * 100) + '% without another blocking mask', styles.wrapper === 'rgba(0, 0, 0, 0)' && (value !== 0 || /\/ 0\)/.test(styles.background) || styles.background === 'rgba(0, 0, 0, 0)'));
    }
    await slider('阅读底色不透明度', .35);
    await scene('词语星轨'); await page.waitForFunction(() => window.skipReaderYujingSnapshot().planetCount === 48);
    check('All 48 actual vocabulary planets and the original stars render', (await snapshot()).planetCount === 48 && (await snapshot()).stars === 850);
    await scene('海的慢呼吸'); await page.waitForFunction(() => { const state = window.skipReaderYujingSnapshot(); return state.models.ocean === 'ready' && state.triangles > 40000; });
    check('The displayed sea uses the Blender morph mesh', (await snapshot()).triangles > 40000);
    const seen = await page.evaluate(async () => {
      const ids = ['风中的句子', '云上书岛', '词语星轨', '海的慢呼吸'], failures = [];
      for (let i = 0; i < 32; i++) {
        [...document.querySelectorAll('.yj-scene-picks button')].find(b => b.textContent === ids[i % 4]).click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const state = window.skipReaderYujingSnapshot(); if (state.visibleLayers.length !== 1 || state.visibleLayers[0] !== state.scene) failures.push(state);
      }
      return failures;
    });
    check('32 consecutive scene changes show exactly one matching background', seen.length === 0);
    await page.waitForTimeout(100); const count = (await snapshot()).geometries;
    for (let i = 0; i < 5; i++) { await scene('词语星轨'); await scene('海的慢呼吸'); }
    await page.waitForTimeout(100);
    check('Switching scenes reuses stable graphics resources', (await snapshot()).geometries <= count + 2 && await page.locator('.yj-scene canvas').count() === 2);
    await page.locator('.yj-panel-title button').click(); await page.screenshot({ path: path.join(out, 'polished-reader.png') });
    const search = await page.locator('#chapterSearch').boundingBox();
    check('Chapter search is compact and narrower', search.width <= 220 && search.height <= 38);
    for (let i = 0; i < 4; i++) {
      await panel(); await page.locator('.yj-off').click();
      assert.equal(await page.locator('.yj-scene canvas').count(), 0);
      await panel(); await scene('云上书岛'); await page.waitForFunction(() => window.skipReaderYujingSnapshot().models.island === 'ready');
      assert.equal(await page.locator('.yj-scene canvas').count(), 2);
    }
    check('Repeated disable and enable removes old canvases and safely reloads models', true);
    await scene('词语星轨'); await page.getByRole('button', { name: '进入词语星轨 · 快速刷词', exact: true }).click();
    await page.getByLabel('自动下一题', { exact: true }).uncheck();
    for (let i = 0; i < 20; i++) {
      const state = await snapshot(); await page.keyboard.press(String(state.choices.indexOf(state.queue[0]) + 1)); await page.keyboard.press('Space');
    }
    check('Twenty rapid keyboard answers do not use stale choices', (await snapshot()).learned === 20 && (await snapshot()).queue.length === 28);
    check('Original examples appear during the question', (await page.locator('.yj-example p').innerText()).includes('My original sentence'));
    check('No application or shader errors during the stress run', errors.length === 0);
    fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'stability-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors }, null, 2));
  } catch (e) {
    fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, 'stability-failure.png'), fullPage: true }); console.log('STATE', await snapshot(), 'ERRORS', errors); throw e;
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
