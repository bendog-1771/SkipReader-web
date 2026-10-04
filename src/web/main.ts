import { installBrowserAPI } from "./api";
import "./web.css";

(window as any).eReadWeb = true;
document.documentElement.dataset.ereadWeb = "true";

async function start() {
  try {
    await installBrowserAPI();
    await import("../renderer/app/App");
    const status = document.createElement("div"); status.className = "web-status";
    const label = document.createElement("span"); label.textContent = navigator.onLine ? "本地保存 · 插件查词" : "离线阅读 · 本地保存";
    status.append(label);
    const install = document.createElement("button"); install.textContent = "安装到桌面"; install.hidden = true; status.append(install);
    const help = document.createElement("button"); help.textContent = "安装说明"; status.append(help);
    const close = document.createElement("button"); close.textContent = "×"; close.title = "收起状态栏"; close.onclick = () => status.remove(); status.append(close);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(registration => {
        const update = document.createElement("button"); update.textContent = "更新版本"; update.hidden = true; status.insertBefore(update, close);
        const showUpdate = () => { if (registration.waiting) { update.hidden = false; if (!status.isConnected) document.body.append(status); } };
        showUpdate();
        registration.addEventListener("updatefound", () => registration.installing?.addEventListener("statechange", showUpdate));
        let updating = false;
        update.onclick = () => {
          if (document.querySelector(".modal-backdrop, .idea-popover")) { alert("请先保存或关闭正在编辑的内容，再更新版本。"); return; }
          updating = true; update.disabled = true; registration.waiting?.postMessage("SKIP_WAITING");
        };
        navigator.serviceWorker.addEventListener("controllerchange", () => { if (updating) location.reload(); });
      }).catch(console.error);
    }
    help.onclick = () => alert("Edge / Chrome：浏览器菜单 → 应用 / 安装一跃，安装后可从桌面快捷方式在独立窗口打开。\n\n可以结合第三方浏览器插件辅助学习，请使用同一浏览器配置并允许插件访问本网站。独立窗口中的插件行为取决于浏览器及插件。\n\n书籍保存在当前浏览器。可在设置的“备份与日志”中启用自动文件备份和可选的加密云同步；登录恢复卡与完整书库备份请分别保存。");
    let prompt: any;
    window.addEventListener("beforeinstallprompt", (event: Event) => { event.preventDefault(); prompt = event; install.hidden = false; });
    install.onclick = async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice; prompt = null; install.hidden = true; };
    window.addEventListener("appinstalled", () => { install.hidden = true; help.hidden = true; });
    const connectivity = () => { label.textContent = navigator.onLine ? "本地保存 · 插件查词" : "离线阅读 · 本地保存"; };
    window.addEventListener("online", connectivity); window.addEventListener("offline", connectivity);
    if (matchMedia("(display-mode: standalone)").matches) help.hidden = true;
    document.body.append(status);
  } catch (error) {
    const root = document.getElementById("root")!; root.textContent = "无法打开一跃：" + (error instanceof Error ? error.message : String(error)) + "。请使用正常浏览模式并允许本网站保存数据。";
  }
}
void start();
