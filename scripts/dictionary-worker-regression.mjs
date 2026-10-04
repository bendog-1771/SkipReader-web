import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { parseBing, parseFree } from '../dictionary-worker/worker.mjs';

const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); console.log('PASS ' + name); };
// Synthetic content tests nested HTML without redistributing dictionary definitions.
const html = `<div id="client_def_container"><div class="client_def_hd_hd">sample</div><span class="client_def_hd_pn">美 [sample]</span><div class="client_def_bar"><div class="client_def_title_bar">adj.</div><div class="client_def_list"><span>示例 &amp; 文本</span></div></div></div><div id="clienthomoid"><div class="client_def_bar"><div class="client_def_title">adj.</div><div class="client_def_list_word_content">A <b>sample</b> definition.</div></div></div><div class="client_sentence_list"><div class="client_sen_en">Example sentence.</div><div class="client_sen_cn">示例句子。</div></div>`;
const parsed = parseBing(html, 'sample');
check('Bing parser separates Chinese and actual Bing English definitions', parsed.chineseDefinition === 'adj. 示例 & 文本' && parsed.englishDefinitions[0] === 'adj. A sample definition.');
check('Bing parser retains pronunciation, bilingual example and source links', parsed.phonetic && parsed.examples[0].includes('示例句子') && parsed.links[0].url.includes('bing.com') && parsed.attributions.length);
const free = parseFree([{ word: 'sample', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A sample entry.', example: 'Use this sample.' }] }], license: { name: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/3.0/' }, sourceUrls: ['https://en.wiktionary.org/wiki/sample'] }], 'sample');
check('Free English parser retains upstream licensing and provenance', free.chineseDefinition === '' && free.englishDefinitions.length === 1 && free.attributions.some(link => link.label === 'CC BY-SA'));

const originalFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response(html, { status: 200 }); };
const request = (path, origin = 'https://bendog-1771.github.io', method = 'GET') => new Request('https://eread.example' + path, { method, headers: origin ? { Origin: origin } : {} });
try {
  check('Other origins rejected before any upstream request', (await worker.fetch(request('/dictionary?q=sample', 'https://unrelated.example'))).status === 403 && calls.length === 0);
  check('Missing origin rejected', (await worker.fetch(request('/dictionary?q=sample', ''))).status === 403);
  const preflight = await worker.fetch(request('/dictionary', undefined, 'OPTIONS'));
  check('Preflight allows the configured Pages origin', preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === 'https://bendog-1771.github.io');
  for (const query of ['', 'https://internal.example', '<script>alert(1)</script>', 'a'.repeat(81)]) check('Invalid query rejected: ' + (query.slice(0, 20) || 'empty'), (await worker.fetch(request('/dictionary?q=' + encodeURIComponent(query)))).status === 400);
  check('Unsupported source rejected', (await worker.fetch(request('/dictionary?q=sample&source=custom'))).status === 400);
  check('Mutation requests rejected', (await worker.fetch(request('/dictionary?q=sample', undefined, 'POST'))).status === 405);
  const results = await Promise.all([worker.fetch(request('/dictionary?q=sample')), worker.fetch(request('/dictionary?q=sample'))]);
  const value = await results[0].json();
  check('Concurrent identical requests share one fetch to the fixed Bing host', calls.length === 1 && calls[0].url.startsWith('https://cn.bing.com/dict/clientsearch?') && calls[0].options.signal);
  check('API returns plain structured data with CORS and no storage cache', value.englishSource === '必应词典' && results[0].headers.get('Cache-Control') === 'no-store' && value.links.length > 0);
  globalThis.fetch = async () => new Response('Service unavailable', { status: 503 });
  const failed = await worker.fetch(request('/dictionary?q=unavailable'));
  check('Upstream failure becomes a useful error without challenge bypass', failed.status === 502 && (await failed.json()).error.includes('503'));
  globalThis.fetch = async () => new Response('<html>Verification required</html>');
  const challenge = await worker.fetch(request('/dictionary?q=challenge'));
  check('Unrecognized upstream page is not returned as definitions or HTML', challenge.status === 502);
  fs.mkdirSync('reports/dictionary', { recursive: true });
  fs.writeFileSync('reports/dictionary/worker-report.json', JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { globalThis.fetch = originalFetch; }
