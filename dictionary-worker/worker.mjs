// Reads only the dictionary pages for a user-entered word; never accepts an upstream URL.
const DEFAULT_ORIGINS = 'https://bendog-1771.github.io,http://localhost:5174,http://127.0.0.1:5174';
const inFlight = new Map();
const compact = values => [...new Set(values.filter(Boolean))];
function decode(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[\da-f]+|\w+);/gi, (all, key) => {
    if (!key.startsWith('#')) return named[key.toLowerCase()] ?? all;
    const number = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
  });
}
function text(html) { return decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); }
function blocks(html, attribute, token) {
  const pattern = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\b${attribute}\\s*=["']([^"']*)["'][^>]*>`, 'gi');
  const result = []; let match;
  while (match = pattern.exec(html)) {
    const value = match[2];
    if (!(attribute === 'class' ? value.split(/\s+/).includes(token) : value === token)) continue;
    const tags = new RegExp(`<\\/?${match[1]}\\b[^>]*>`, 'gi'); tags.lastIndex = pattern.lastIndex;
    let depth = 1, end, close;
    while (close = tags.exec(html)) {
      if (close[0].startsWith('</')) depth--;
      else if (!close[0].endsWith('/>')) depth++;
      if (!depth) { end = tags.lastIndex; break; }
    }
    if (end) { result.push(html.slice(match.index, end)); pattern.lastIndex = end; }
  }
  return result;
}
const byClass = (html, name) => blocks(html, 'class', name);
const byId = (html, name) => blocks(html, 'id', name)[0] || '';
const classText = (html, name) => text(byClass(html, name)[0] || '');
export function parseBing(html, term) {
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const result = { term: classText(html, 'client_def_hd_hd') || term, phonetic: compact(byClass(html, 'client_def_hd_pn').map(text)).join('  '), chineseDefinition: '', englishDefinitions: [], examples: [], source: '必应词典', englishSource: '必应词典', links: [{ label: '必应词典', url: `https://cn.bing.com/dict/search?q=${encodeURIComponent(term)}` }], attributions: [{ label: '必应词典 · 来源与服务条款', url: 'https://www.microsoft.com/servicesagreement/' }] };
  const basic = byId(html, 'client_def_container');
  result.chineseDefinition = compact(byClass(basic, 'client_def_bar').map(block => {
    const pos = classText(block, 'client_def_title_bar');
    const definition = classText(block, 'client_def_list');
    return definition ? `${pos ? pos + ' ' : ''}${definition}` : '';
  })).join('\n');
  const english = byId(html, 'clienthomoid');
  result.englishDefinitions = compact(byClass(english, 'client_def_bar').flatMap(block => {
    const pos = classText(block, 'client_def_title');
    return byClass(block, 'client_def_list_word_content').map(item => text(item)).filter(Boolean).map(def => `${pos ? pos + ' ' : ''}${def}`);
  })).slice(0, 12);
  result.examples = compact(byClass(html, 'client_sentence_list').map(block => [classText(block, 'client_sen_en'), classText(block, 'client_sen_cn')].filter(Boolean).join('\n'))).slice(0, 3);
  for (const block of byClass(html, 'client_def_hd_pn_list')) {
    const raw = block.match(/\b(?:data-pronunciation|data-mp3link)=["']([^"']+)["']/i)?.[1];
    if (!raw) continue;
    try { const url = new URL(decode(raw), 'https://cn.bing.com'); if (url.protocol !== 'https:') continue; if (/美|US/i.test(text(block))) result.audioUs = url.href; else result.audioUk = url.href; } catch {}
  }
  result.audio = result.audioUs || result.audioUk;
  return result;
}
export function parseFree(entries, term) {
  const entry = entries[0] || {};
  const result = { term: entry.word || term, chineseDefinition: "", phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '', englishDefinitions: [], examples: [], source: '免费英文词典', englishSource: 'Free Dictionary API / Wiktionary', links: [{ label: '必应词典', url: `https://cn.bing.com/dict/search?q=${encodeURIComponent(term)}` }], attributions: [] };
  for (const meaning of entry.meanings || []) for (const def of meaning.definitions || []) {
    if (def.definition && result.englishDefinitions.length < 12) result.englishDefinitions.push(`${meaning.partOfSpeech ? meaning.partOfSpeech + ': ' : ''}${def.definition}`);
    if (def.example && result.examples.length < 3) result.examples.push(def.example);
  }
  for (const source of entry.sourceUrls || []) if (/^https:\/\//.test(source)) result.attributions.push({ label: '原始词条', url: source });
  if (entry.license?.url && /^https:\/\//.test(entry.license.url)) result.attributions.push({ label: entry.license.name || '释义许可', url: entry.license.url });
  result.attributions.push({ label: 'Free Dictionary API', url: 'https://dictionaryapi.dev/' });
  result.audio = entry.phonetics?.find(p => /^https:\/\//.test(p.audio || ''))?.audio;
  return result;
}
async function upstream(url, json = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: json ? 'application/json' : 'text/html' } });
  if (response.status === 404) return json ? [] : '';
  if (!response.ok) throw new Error(`词典暂时不可用（${response.status}），可以稍后重试或打开官网`);
  const value = await response.text();
  if (value.length > 1500000) throw new Error('词典响应异常');
  return json ? JSON.parse(value) : value;
}
async function lookup(term, source, supplement) {
  if (source === 'free') return parseFree(await upstream(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, true), term);
  const html = await upstream(`https://cn.bing.com/dict/clientsearch?mkt=zh-CN&setLang=zh&form=BDVEHC&ClientVer=BDDTV3.5.1.4320&q=${encodeURIComponent(term)}`);
  const result = parseBing(html, term);
  if (!result.chineseDefinition && !result.englishDefinitions.length && !result.phonetic) throw new Error('必应没有返回可识别的词条，请检查拼写或打开必应官网');
  if (!result.englishDefinitions.length && supplement && /^[a-z'-]+$/i.test(term)) {
    try {
      const english = parseFree(await upstream(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, true), term);
      result.englishDefinitions = english.englishDefinitions; result.englishSource = english.englishSource;
      result.attributions.push(...english.attributions);
    } catch { /* Chinese definitions remain usable when the optional source is unavailable. */ }
  }
  return result;
}
function reply(value, status, origin) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } }); }
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url), origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(value => value.trim());
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' } });
    if (request.method !== 'GET') return reply({ error: '不支持此操作' }, 405, origin);
    if (url.pathname === '/health') return reply({ ready: true, service: 'eRead dictionary' }, 200, origin);
    if (!['/dictionary', '/api/dictionary'].includes(url.pathname)) return reply({ error: '找不到接口' }, 404, origin);
    const term = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' '), source = url.searchParams.get('source') || 'bing';
    if (!/^[\p{L}][\p{L}\p{M}'’\- .]{0,79}$/u.test(term) || term.split(' ').length > 8) return reply({ error: '请输入单词或简短词组（最多 80 个字符）' }, 400, origin);
    if (!['bing', 'free'].includes(source)) return reply({ error: '不支持此词典' }, 400, origin);
    const supplement = url.searchParams.get('supplement') === '1';
    const key = `${source}:${supplement}:${term.toLowerCase()}`;
    try {
      if (!inFlight.has(key)) inFlight.set(key, lookup(term, source, supplement).finally(() => inFlight.delete(key)));
      const result = await inFlight.get(key);
      return reply(result, 200, origin);
    } catch (error) { return reply({ error: error.name === 'TimeoutError' ? '词典查询超时，可以稍后重试或打开官网' : error.message || '查询失败' }, 502, origin); }
  }
};
