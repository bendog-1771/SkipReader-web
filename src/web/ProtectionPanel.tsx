import React, { useEffect, useState } from "react";
import type { Protection } from "./protection";
function download(text: string, filename: string) { const url = URL.createObjectURL(new Blob([text], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
export function ProtectionPanel() {
 const manager = window.skipReaderProtection;
 const [state, setState] = useState(() => manager?.state());
 const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [code, setCode] = useState(""), [showCode, setShowCode] = useState(false), [cardSaved, setCardSaved] = useState(false);
 const [history, setHistory] = useState<Array<{ revision: number; savedAt: string }> | null>(null);
 useEffect(() => { if (!manager) return; setState(manager.state()); return manager.subscribe(() => setState(manager.state())); }, [manager]);
 if (!manager || !state) return null;
 const time = (value?: string) => value ? new Date(value).toLocaleString("zh-CN") : "还没有";
 async function action(fn: (m: Protection) => Promise<unknown>) { if (!manager) return; setBusy(true); setMessage(""); try { await fn(manager); } catch (error: any) { if (error.name !== "AbortError") setMessage(error.message || "操作未完成"); } finally { setBusy(false); setState(manager.state()); } }
 const saveCard = () => { try { download(manager.recoveryCard(), `SkipReader_登录恢复卡_${state.account}.json`); } catch (error: any) { setMessage(error.message); } };
 async function importCard(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  await action(async m => { if (file.size > 8192) throw new Error("请选择登录恢复卡，完整书库备份请用“导入备份”"); const card = JSON.parse(await file.text()); if (card.schema !== "skipreader-login-card" || card.version !== 1) throw new Error("这不是 SkipReader 登录恢复卡"); await m.login(card.code); setCode(""); });
 }
 return <div className="protection-panel" aria-label="数据保护">
  <section className="protection-section">
   <h3>自动文件备份</h3>
   <p>把完整书库备份到电脑文件夹，清除浏览器数据后也能恢复。仅在应用打开时运行。</p>
   <div className="protection-status" role="status">{state.backup}<small>文件夹：{state.directory || "未选择"} · 上次成功：{time(state.lastBackup)}</small></div>
   <div className="inline-row">
    <button disabled={busy || !state.folderSupported} onClick={() => action(m => m.chooseFolder())}>{state.directory ? "更换备份文件夹" : "选择备份文件夹"}</button>
    {state.directory && <><button disabled={busy} onClick={() => action(m => m.authorizeFolder())}>允许继续备份</button><button disabled={busy || !state.backupEnabled} onClick={() => action(m => m.backup(true))}>立即文件备份</button><button disabled={busy || !state.backupEnabled} onClick={() => action(m => m.pauseBackup())}>暂停自动备份</button></>}
   </div>
   {!state.folderSupported && <p>此浏览器不支持自动写入文件夹，可用下方“导出备份”，或改用 Edge／Chrome。</p>}
   <div className="protection-options"><label>有修改时的备份间隔<select aria-label="自动备份间隔" value={state.interval} disabled={busy} onChange={e => action(m => m.configureBackup(Number(e.target.value), state.retention))}><option value="15">15 分钟</option><option value="60">1 小时</option><option value="1440">1 天</option></select></label><label>保留最近<select aria-label="自动备份保留数量" value={state.retention} disabled={busy} onChange={e => action(m => m.configureBackup(state.interval, Number(e.target.value)))}>{[3, 7, 14].map(n => <option key={n} value={n}>{n} 份完整备份</option>)}</select></label></div>
   <p className="muted-note">首次授权后立即备份。重新打开浏览器可能需要再次允许写入；失败会显示在这里。完整备份未加密，请保存在自己的安全文件夹。只清理本应用按固定规则命名的自动备份，不删除其他文件。</p>
  </section>
  <section className="protection-section">
   <h3>云账号与同步</h3>
   <p>可选、免费。笔记、生词、书签和进度在浏览器中加密后同步，整本书与背景图片不上传。其他设备导入同一本书后可恢复原文定位。</p>
   <div className="protection-status" role="status">{state.cloud}<small>{state.account ? `账号 ${state.account} · 上次成功：${time(state.lastSync)}` : "无需注册邮箱或 Cloudflare 账号"}</small></div>
   {!state.account ? <>
    <button className="primary" disabled={busy} onClick={() => action(async m => { await m.create(); setCardSaved(false); })}>创建云账号</button>
    <div className="cloud-login"><label>已有账号的登录码<input type="password" autoComplete="off" aria-label="云账号登录码" placeholder="SKIP1.…" value={code} onChange={e => setCode(e.target.value)} /></label><div className="inline-row"><button disabled={busy || !code.trim()} onClick={() => action(async m => { await m.login(code); setCode(""); })}>登录并合并记录</button><label className="file-button">导入登录恢复卡<input type="file" accept=".json" disabled={busy} onChange={importCard} /></label></div></div>
   </> : <>
    {state.needsCard && <div className="recovery-notice"><strong>先保存登录恢复卡</strong><p>登录码是你的账号钥匙。丢失后我们无法找回加密记录；不要分享恢复卡。它与完整书库备份不同。</p><button onClick={saveCard}>下载登录恢复卡</button><label><input type="checkbox" checked={cardSaved} onChange={e => setCardSaved(e.target.checked)} /> 我已把恢复卡保存在浏览器之外</label><button className="primary" disabled={busy || !cardSaved} onClick={() => action(m => m.activate())}>开启云同步</button></div>}
    {!state.needsCard && <div className="inline-row"><button className="primary" disabled={busy || state.busy} onClick={() => action(m => m.sync())}>立即同步</button><button disabled={busy || state.busy} onClick={() => action(async m => setHistory(await m.history()))}>查看历史版本</button><button onClick={saveCard}>下载登录恢复卡</button></div>}
    <div className="inline-row"><button onClick={() => setShowCode(!showCode)}>{showCode ? "隐藏登录码" : "显示登录码"}</button><button disabled={busy || state.busy} onClick={() => action(async m => { await m.logout(); setHistory(null); setShowCode(false); setCardSaved(false); })}>退出云账号</button></div>
    {showCode && <div className="recovery-code"><code>{manager.loginCode()}</code><button onClick={() => action(async () => { await navigator.clipboard.writeText(manager.loginCode()); setMessage("登录码已复制，请勿分享"); })}>复制登录码</button></div>}
    {history && <div className="cloud-history"><h4>云端历史版本</h4><p>保留最近 10 个有学习内容修改的历史版本。恢复只影响学习记录，不删除本地书籍；恢复前的云端内容会留作历史版本。</p>{!history.length && <p>还没有历史版本，首次上传后继续修改学习记录即可生成。</p>}{history.map(item => <div className="history-row" key={item.revision}><span>{time(item.savedAt)}</span><button disabled={busy || state.busy} onClick={() => { if (confirm("将学习记录恢复到这个历史版本，并同步到其他设备。当前云端记录会留作历史版本。是否继续？")) void action(async m => { await m.restore(item.revision); setHistory(await m.history()); }); }}>恢复此版本</button></div>)}</div>}
    <details><summary>删除云端账号</summary><p>永久删除云端记录和历史版本，登录码随之失效。本机书籍和学习记录仍保留。</p><button className="text-danger" disabled={busy || state.busy} onClick={() => { if (confirm("永久删除云端账号及全部云端历史？此操作无法撤销，本地资料仍保留。")) void action(async m => { await m.deleteAccount(); setHistory(null); setShowCode(false); }); }}>永久删除云端账号</button></details>
   </>}
   <p className="muted-note">登录状态保存在当前浏览器，公共电脑用完请退出。离线修改会在联网后合并；同时修改同一条内容时保留更新的版本。免费服务有容量和请求上限，达到限制时本地阅读不受影响。</p>
  </section>
  {(message || state.error) && <p className="protection-message" role="alert">{message || state.error}</p>}
 </div>;
}
