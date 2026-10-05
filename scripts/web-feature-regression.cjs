const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, browserOptions } = require('./browser-test-runtime.cjs');
const out = path.resolve(__dirname, '../reports/web-features'); fs.mkdirSync(out, { recursive: true });
async function run() {
  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), checks = [], errors = [], queries = [];
  const check = (name, result) => { assert.ok(result, name); checks.push(name); console.log('PASS ' + name); };
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
  try {
    await page.route('**/api/dictionary?**', async route => {
      queries.push(new URL(route.request().url()));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ term: 'curious', phonetic: '[test]', chineseDefinition: 'adj. 好奇的', englishDefinitions: ['adj. A test definition.'], examples: [], source: '必应词典', englishSource: '必应词典', links: [{ label: '必应词典', url: 'https://cn.bing.com/dict/search?q=curious' }], attributions: [{ label: '来源与服务条款', url: 'https://www.microsoft.com/servicesagreement/' }] }) });
    });
    await page.goto('http://localhost:5174/');
    await page.getByRole('button', { name: '导入书籍', exact: true }).waitFor();
    const fixture = '# First Chapter\n\nFish & chips make a **curious** reader smile. An emoji 😀 stays readable.\n\n' + Array.from({ length: 30 }, (_, i) => `Position ${i}: This is a paragraph for testing chapter locations and highlights. A curious reader checks the saved position and continues to read the next sentence.`).join('\n\n') + '\n\n# Second Chapter\n\nAnother chapter is ready.\n\nThe final sentence is here.';
    const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '导入书籍', exact: true }).click();
    await (await chooser).setFiles({ name: 'Features.md', mimeType: 'text/markdown', buffer: Buffer.from(fixture) });
    await page.locator('.library-book').getByText('Features', { exact: true }).waitFor();
    check('Book management uses discreet dots and a clear accessible name', await page.locator('.book-actions-button').innerText() === '•••' && (await page.locator('.book-actions-button').getAttribute('aria-label')).includes('管理《Features》'));
    await page.locator('.library-book').getByText('Features', { exact: true }).click(); await page.locator('.reader-text p').first().waitFor();
    check('Dictionary defaults on and exposes lookup', await page.locator('.tabs').getByRole('button', { name: '查词', exact: true }).count() === 1);
    // Chapter navigation must preserve the earlier chapter's independent location.
    await page.waitForTimeout(350);
    await page.evaluate(() => { const reader = document.querySelector('.reader-scroll'); const p = [...reader.querySelectorAll('p')].find(p => p.textContent.startsWith('Position 18:')); reader.scrollTop += p.getBoundingClientRect().top - reader.getBoundingClientRect().top - 80; });
    await page.waitForFunction(() => document.querySelector('.reader-scroll').scrollTop > 500);
    // Wait for the initial restore suppression to finish before a real user scroll.
    await page.evaluate(() => document.querySelector('.reader-scroll').dispatchEvent(new Event('scroll')));
    await page.locator('.toc-title').filter({ hasText: 'Second Chapter' }).click(); await page.getByRole('heading', { name: 'Second Chapter', exact: true }).waitFor();
    await page.waitForTimeout(350);
    await page.locator('.toc-title').filter({ hasText: 'First Chapter' }).click(); await page.getByRole('heading', { name: 'First Chapter', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.reader-scroll').scrollTop > 500);
    check('Returning through the contents restores a deep chapter location', true);
    await page.locator('.toolbar').getByRole('button', { name: '下一页', exact: true }).click(); await page.getByRole('heading', { name: 'Second Chapter', exact: true }).waitFor();
    await page.locator('.toolbar').getByRole('button', { name: '上一页', exact: true }).click(); await page.getByRole('heading', { name: 'First Chapter', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.reader-scroll').scrollTop > 500);
    check('Adjacent chapter navigation also restores the earlier location', true);
    await page.getByRole('button', { name: '← 书库', exact: true }).click(); await page.reload(); await page.locator('.library-book').getByText('Features', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.reader-scroll')?.scrollTop > 500);
    check('Chapter position survives reload without being overwritten by loading', true);
    await page.evaluate(() => {
      speechSynthesis.cancel = () => {};
      speechSynthesis.speak = utterance => {
        window.testUtterance = utterance;
        window.spoken = (window.spoken || []).concat({ text: utterance.text, highlight: [...(CSS.highlights.get('eread-speech') || [])].map(range => range.toString()).join('') });
        utterance.onstart?.(new Event('start'));
      };
    });
    await page.locator('.toolbar').getByRole('button', { name: '朗读', exact: true }).click(); await page.getByRole('button', { name: '从本章开头朗读', exact: true }).click();
    await page.waitForFunction(() => window.spoken?.length > 0);
    check('The first utterance already has its exact DOM highlight', await page.evaluate(() => spoken[0].text === 'First Chapter' && spoken[0].highlight === spoken[0].text));
    const player = page.getByRole('region', { name: '朗读控制' });
    await player.getByLabel('跟随正文', { exact: true }).check();
    await player.getByRole('button', { name: '下一句', exact: true }).click(); await page.waitForFunction(() => window.spoken.length > 1);
    check('Speech maps entities and inline formatting to the actual text', await page.evaluate(() => spoken.at(-1).text === 'Fish & chips make a curious reader smile.' && spoken.at(-1).highlight === spoken.at(-1).text));
    await player.getByLabel('朗读速度').selectOption('1.25'); await player.getByRole('button', { name: '下一句', exact: true }).click();
    await page.waitForFunction(() => window.testUtterance.rate === 1.25);
    check('Speech speed and emoji sentence retain matching ranges', await page.evaluate(() => spoken.at(-1).text.includes('😀') && spoken.at(-1).highlight === spoken.at(-1).text));
    for (const theme of ['paper', 'night', 'sepia', 'forest', 'blue']) {
      const contrast = await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = canvas.height = 1;
        const rgb = color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); };
        const lum = color => rgb(color).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const probe = document.createElement('span'); probe.style.color = 'var(--text)'; document.body.append(probe);
        const foreground = lum(getComputedStyle(probe).color);
        const ratios = ['--speech-mark', '--locate-mark'].map(variable => { probe.style.backgroundColor = `var(${variable})`; const background = lum(getComputedStyle(probe).backgroundColor); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05); });
        probe.remove(); return ratios;
      }, theme);
      check(`Speech and locate colors remain readable in ${theme} theme`, contrast.every(ratio => ratio >= 4.5));
      if (theme === 'night' || theme === 'paper') await page.screenshot({ path: path.join(out, `speech-${theme}.png`) });
    }
    await player.getByRole('button', { name: '停止', exact: true }).click();
    check('Stop removes both the player and speech highlight', await player.count() === 0 && !await page.evaluate(() => CSS.highlights.has('eread-speech')));
    async function selectCurious() {
      await page.evaluate(() => {
        const span = [...document.querySelectorAll('.reader-text [data-reader-text]')].find(el => el.textContent === 'curious');
        const range = document.createRange(); range.selectNodeContents(span); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    }
    await selectCurious(); await page.getByRole('button', { name: '波浪', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.reader-note-lines path'));
    const geometry = await page.evaluate(() => {
      const path = document.querySelector('.reader-note-lines path'), svg = path.ownerSVGElement, span = [...document.querySelectorAll('.reader-text [data-reader-text]')].find(el => el.textContent === 'curious');
      const box = path.getBBox(); return { gap: svg.getBoundingClientRect().top + box.y - span.getBoundingClientRect().bottom, smooth: path.getAttribute('d').includes(' Q '), pointer: getComputedStyle(svg).pointerEvents };
    });
    check('Wave underline is smooth, clear of text and does not intercept selection', geometry.gap > 1 && geometry.gap < 5 && geometry.smooth && geometry.pointer === 'none');
    await page.getByRole('button', { name: '取消选区', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'underline.png') });
    await page.evaluate(() => {
      const span = [...document.querySelectorAll('.reader-text [data-reader-text]')].find(el => el.textContent.startsWith('Position 29:'));
      const node = span.firstChild, offset = node.textContent.indexOf('continues');
      const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 9); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.locator('.toolbar').getByRole('button', { name: '朗读', exact: true }).click(); await page.getByRole('button', { name: '从选中部分开始朗读', exact: true }).click();
    await page.waitForFunction(() => window.testUtterance.text.startsWith('continues'));
    await page.evaluate(() => testUtterance.onend(new Event('end')));
    await page.waitForFunction(() => testUtterance.text === 'Second Chapter');
    fs.writeFileSync(path.join(out, 'cross-chapter.json'), JSON.stringify(await page.evaluate(() => ({ last: spoken.at(-1), heading: document.querySelector('.reader-text h1')?.textContent, ranges: [...(CSS.highlights.get('eread-speech') || [])].map(range => range.toString()) })), null, 2));
    check('Cross-chapter speech loads the new DOM before its first utterance', await page.evaluate(() => spoken.at(-1).highlight === 'Second Chapter' && document.querySelector('.reader-text h1').textContent === 'Second Chapter'));
    await player.getByRole('button', { name: '停止', exact: true }).click();
    await page.locator('.toc-title').filter({ hasText: 'First Chapter' }).click(); await page.getByRole('heading', { name: 'First Chapter', exact: true }).waitFor();
    await page.waitForTimeout(350);
    await page.locator('.tabs').getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.side-panel').getByLabel('启用内置查词', { exact: true }).uncheck();
    check('Lookup can still be explicitly disabled',await page.locator('.tabs').getByRole('button',{name:'查词',exact:true}).count()===0);
    await page.locator('.side-panel').getByLabel('启用内置查词', { exact: true }).check();
    await page.locator('.tabs').getByRole('button', { name: '查词', exact: true }).waitFor();
    check('Enabling lookup adds its panel without requiring a reader account', true);
    await selectCurious(); await page.locator('.selection-bar').getByRole('button', { name: '查词', exact: true }).click();
    await page.locator('.dict-card').getByRole('heading', { name: 'curious', exact: true }).waitFor();
    check('Lookup shows Bing Chinese and Bing English separately', await page.getByRole('heading', { name: '必应英文释义', exact: true }).isVisible() && await page.getByRole('heading', { name: '必应中文释义', exact: true }).isVisible());
    check('Lookup sends only word, source and supplement preference', queries.length === 1 && [...queries[0].searchParams.keys()].sort().join(',') === 'q,source,supplement' && queries[0].searchParams.get('q') === 'curious');
    await page.locator('.dict-card').getByRole('button', { name: '收藏到生词本', exact: true }).click();
    await page.locator('.notebook-picker-modal').getByPlaceholder('生词本名称').fill('Definitions');
    await page.locator('.notebook-picker-modal').getByRole('button', { name: '收藏', exact: true }).click();
    await page.waitForFunction(async () => (await readerAPI.vocab.list()).items.length === 1);
    fs.writeFileSync(path.join(out, 'saved-vocabulary.json'), JSON.stringify(await page.evaluate(async () => (await readerAPI.vocab.list()).items), null, 2));
    check('Saved vocabulary preserves definitions, original passage and attribution', await page.evaluate(async () => { const item = (await readerAPI.vocab.list()).items[0]; return item.englishDef && item.chineseDef && item.sourceSentence.includes('Fish') && item.startOffset !== undefined && item.definitionSource === '必应词典' && item.attributions.length; }));
    await page.locator('.tabs').getByRole('button', { name: '生词', exact: true }).click();
    check('Vocabulary export is aligned with the panel title', await page.locator('.side-panel .panel-title').getByRole('button', { name: '导出', exact: true }).count() === 1);
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(async () => { const state = await readerAPI.vocab.list(); await readerAPI.vocab.exportItems(state.items, 'md', 'Attribution'); });
    const download = await downloadPromise; await download.saveAs(path.join(out, 'vocabulary.md'));
    check('Export retains definition credits and license links', fs.readFileSync(path.join(out, 'vocabulary.md'), 'utf8').includes('microsoft'));
    await page.locator('.tabs').getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.side-panel').getByLabel('启用内置查词', { exact: true }).uncheck();
    check('Disabling lookup hides it and stops automatic selection lookup', await page.locator('.tabs').getByRole('button', { name: '查词', exact: true }).count() === 0 && !await page.evaluate(async () => (await readerAPI.settings.get()).dictionary.doubleClick));
    await page.getByRole('button', { name: '← 书库', exact: true }).click();
    await page.getByTitle('设置', { exact: true }).click();
    await page.locator('.settings-categories').getByRole('button', { name: '备份与日志', exact: true }).click();
    await page.getByRole('button', { name: '帮助', exact: true }).click();
    check('Help explains optional lookup and generic extensions without brand promotion', await page.locator('.info-modal').innerText().then(text => text.includes('第三方浏览器插件') && text.includes('内置查词默认开启') && text.includes('背景跟随应用主题默认关闭') && text.includes('跃境与星轨练习') && !/扇贝|沙拉/.test(text)));
    await page.locator('.info-modal .float-close').click(); await page.getByRole('button', { name: '关于', exact: true }).click();
    check('About includes content rights, dictionary attribution and local privacy', await page.locator('.info-modal').innerText().then(text => text.includes('著作权') && text.includes('许可') && text.includes('不上传查词后台') && !/扇贝|沙拉/.test(text)));
    await page.screenshot({ path: path.join(out, 'about.png') });
    check('No uncaught browser errors', errors.length === 0);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: checks.length, checks, geometry, errors }, null, 2));
  } catch (error) { fs.writeFileSync(path.join(out, 'failure.txt'), error.stack + '\n' + await page.locator('body').innerText()); await page.screenshot({ path: path.join(out, 'failure.png') }); throw error; }
  finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
