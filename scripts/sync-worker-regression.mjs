import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../sync-worker/worker.mjs';
const sqlite = new DatabaseSync(':memory:'); sqlite.exec(fs.readFileSync(new URL('../sync-worker/schema.sql', import.meta.url), 'utf8'));
const DB = {
 prepare(sql) { let args = []; const statement = sqlite.prepare(sql); return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; }, execute() { return statement.columns().length ? { results: statement.all(...args) } : { results: [], meta: statement.run(...args) }; } }; },
 async batch(statements) { sqlite.exec('BEGIN IMMEDIATE'); try { const result = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } }
};
const env = { DB, ALLOWED_ORIGINS: 'https://bendog-1771.github.io' }, checks = [];
const token = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const a = token(), b = token();
async function call(path, method = 'GET', auth = a, body, origin = 'https://bendog-1771.github.io') {
 const response = await worker.fetch(new Request('https://sync.test' + path, { method, headers: { Origin: origin, ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
 return { status: response.status, value: response.status === 204 ? null : await response.json(), headers: response.headers };
}
function check(name, value) { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); }
const envelope = n => ({ version: 1, iv: 'abcdefghijklmnop', ciphertext: 'abcdefghijk' + n });
check('Unknown origins are rejected', (await call('/state', 'GET', a, undefined, 'https://bad.test')).status === 403);
check('Private operations require credentials', (await call('/state', 'GET', null)).status === 401);
check('Unknown credentials do not reveal records', (await call('/state', 'GET', token())).status === 401);
check('Official origin receives a restricted preflight', (await call('/state', 'OPTIONS', null)).status === 204);
check('Account creation accepts a random key', (await call('/accounts', 'POST')).status === 201);
check('Creation is idempotent', (await call('/accounts', 'POST')).status === 200);
check('Independent second account can be created', (await call('/accounts', 'POST', b)).status === 201);
let state = await call('/state'); check('A new account starts empty', state.value.revision === 0 && state.value.envelope === null);
check('Encrypted records can be saved', (await call('/state', 'PUT', a, { revision: 0, envelope: envelope(1), digest: 'a'.repeat(64) })).status === 200);
check('Private responses are never cached', state.headers.get('Cache-Control') === 'no-store');
check('Different accounts cannot access each other records', (await call('/state', 'GET', b)).value.envelope === null);
check('Stale updates are rejected without overwriting', (await call('/state', 'PUT', a, { revision: 0, envelope: envelope(2), digest: 'b'.repeat(64) })).status === 409);
check('Invalid envelopes are rejected', (await call('/state', 'PUT', a, { revision: 1, envelope: {}, digest: 'a'.repeat(64) })).status === 400);
check('Oversized requests are rejected', (await call('/state', 'PUT', a, { revision: 1, envelope: { ...envelope(1), ciphertext: 'a'.repeat(730000) }, digest: 'a'.repeat(64) })).status === 413);
for (let i = 1; i <= 13; i++) await call('/state', 'PUT', a, { revision: i, envelope: envelope(i + 1), digest: (i % 2 ? 'b' : 'a').repeat(64) });
check('History retains ten versions', (await call('/history')).value.items.length === 10);
check('Another account cannot read history', (await call('/history/13', 'GET', b)).status === 404);
check('An earlier encrypted version remains available', (await call('/history/13')).status === 200);
const race = await Promise.all([call('/state', 'PUT', a, { revision: 14, envelope: envelope(16), digest: 'c'.repeat(64) }), call('/state', 'PUT', a, { revision: 14, envelope: envelope(17), digest: 'd'.repeat(64) })]);
check('Concurrent saves accept one version and reject the stale one', race.map(r => r.status).sort().join(',') === '200,409');
check('Deleting an account removes its cloud history', (await call('/accounts', 'DELETE')).status === 200 && (await call('/state')).status === 401 && sqlite.prepare('SELECT count(*) AS n FROM history').get().n === 0);
check('Other accounts survive deletion', (await call('/state', 'GET', b)).status === 200);
for (let i = 0; i < 3; i++) await call('/accounts', 'POST', token());
check('Account creation has an IP rate limit', (await call('/accounts', 'POST', token())).status === 429);
fs.mkdirSync('reports/sync', { recursive: true }); fs.writeFileSync('reports/sync/worker.json', JSON.stringify({ passed: checks.length, checks }, null, 2)); sqlite.close();
