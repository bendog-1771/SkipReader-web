const encoder = new TextEncoder();
export const MAX_ENVELOPE = 720000;
export async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(v => v.toString(16).padStart(2, '0')).join(''); }
function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Failure(415, '请使用 JSON 请求');
  const reader = request.body?.getReader(); if (!reader) throw new Failure(400, '缺少请求内容');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_ENVELOPE + 2000) { await reader.cancel(); throw new Failure(413, '学习记录超过本次同步容量，请先导出备份'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Failure(400, '请求内容无效'); }
}
class Failure extends Error { constructor(status, message) { super(message); this.status = status; } }
export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim());
  const cors = origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
  const respond = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  try {
   if (origin && !allowed.includes(origin)) throw new Failure(403, '此网站没有连接权限');
   if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' } });
   const path = new URL(request.url).pathname;
   if (path === '/health' && request.method === 'GET') return respond({ service: 'SkipReader sync', version: 1 });
   if (!env.DB) throw new Failure(503, '云同步正在维护，请稍后重试；本地数据不受影响');
   const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
   if (!token) throw new Failure(401, '请先登录云账号');
   const authHash = await hash(token), id = authHash.slice(0, 32);
   if (path === '/accounts' && request.method === 'POST') {
    const existing = await env.DB.prepare('SELECT id FROM accounts WHERE id=?').bind(id).first();
    if (existing) return respond({ id });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const hour = Math.floor(Date.now() / 3600000), bucket = (await hash(ip + ':' + hour)).slice(0, 32);
    const limit = await env.DB.prepare('INSERT INTO registration_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, hour + 2).first();
    if (limit.count > 5) throw new Failure(429, '创建账号过于频繁，请一小时后重试');
    const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM accounts').first();
    if (count.total >= 3000) throw new Failure(503, '当前免费账号容量已满，请先使用本地备份');
    const timestamp = new Date().toISOString();
    await env.DB.batch([
     env.DB.prepare('INSERT OR IGNORE INTO accounts(id,auth_hash,created_at,updated_at) VALUES(?,?,?,?)').bind(id, authHash, timestamp, timestamp),
     env.DB.prepare('DELETE FROM registration_limits WHERE expires<?').bind(hour)
    ]);
    return respond({ id }, 201);
   }
   const account = await env.DB.prepare('SELECT id,auth_hash,revision,envelope,digest,updated_at FROM accounts WHERE id=?').bind(id).first();
   if (!account || !equal(account.auth_hash, authHash)) throw new Failure(401, '登录码无效或账号已删除');
   if (path === '/state' && request.method === 'GET') return respond({ revision: account.revision, envelope: account.envelope ? JSON.parse(account.envelope) : null, updatedAt: account.updated_at });
   if (path === '/state' && request.method === 'PUT') {
    const body = await jsonBody(request), envelope = body.envelope;
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !/^[a-f0-9]{64}$/.test(body.digest || '') || envelope?.version !== 1 || !/^[A-Za-z0-9_-]{16}$/.test(envelope?.iv || '') || !/^[A-Za-z0-9_-]+$/.test(envelope?.ciphertext || '')) throw new Failure(400, '同步数据无效');
    const serialized = JSON.stringify(envelope); if (serialized.length > MAX_ENVELOPE) throw new Failure(413, '学习记录超过同步容量，请先导出备份');
    if (body.revision !== account.revision) return respond({ error: '云端已有新修改，请重新合并', conflict: true }, 409);
    const timestamp = new Date().toISOString();
    const result = await env.DB.batch([
     env.DB.prepare('INSERT OR IGNORE INTO history(account_id,revision,envelope,digest,saved_at) SELECT id,revision,envelope,digest,updated_at FROM accounts WHERE id=? AND revision=? AND envelope IS NOT NULL AND digest<>?').bind(id, body.revision, body.digest),
     env.DB.prepare('UPDATE accounts SET envelope=?,digest=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(serialized, body.digest, timestamp, id, body.revision),
     env.DB.prepare('DELETE FROM history WHERE account_id=? AND revision NOT IN (SELECT revision FROM history WHERE account_id=? ORDER BY revision DESC LIMIT 10)').bind(id, id)
    ]);
    const revision = result[1].results?.[0]?.revision;
    if (!revision) return respond({ error: '云端已有新修改，请重新合并', conflict: true }, 409);
    return respond({ revision, updatedAt: timestamp });
   }
   if (path === '/history' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT revision,saved_at FROM history WHERE account_id=? ORDER BY revision DESC LIMIT 10').bind(id).all();
    return respond({ items: rows.results.map(row => ({ revision: row.revision, savedAt: row.saved_at })) });
   }
   const history = path.match(/^\/history\/(\d+)$/);
   if (history && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT envelope,saved_at FROM history WHERE account_id=? AND revision=?').bind(id, Number(history[1])).first();
    if (!row) throw new Failure(404, '这个历史版本已不存在');
    return respond({ envelope: JSON.parse(row.envelope), savedAt: row.saved_at });
   }
   if (path === '/accounts' && request.method === 'DELETE') {
    await env.DB.batch([env.DB.prepare('DELETE FROM history WHERE account_id=?').bind(id), env.DB.prepare('DELETE FROM accounts WHERE id=?').bind(id)]);
    return respond({ deleted: true });
   }
   throw new Failure(404, '没有这个操作');
  } catch (error) { return respond({ error: error instanceof Failure ? error.message : '云服务暂时不可用，请稍后重试；本地数据不受影响' }, error instanceof Failure ? error.status : 503); }
 }
};
