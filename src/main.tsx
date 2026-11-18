import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { applyGhBranding } from './lib/gh'
import './index.css'

// GitHub 公开版独立站：免登录开放，不再经过 GhGate 服务商主账号门禁。
// 首次访问自动写入本机身份，供本地历史记录（IndexedDB / localStorage）归档使用；
// 不产生任何账号信息，云端服务商台账（ghTrack）在无登录态时自动静默跳过。
try {
  if (!localStorage.getItem('xc_user_name')) localStorage.setItem('xc_user_name', '本机用户')
} catch { /* localStorage 不可用时忽略，不阻塞应用 */ }

// GitHub 公开版：浏览器标签标题 / 启动屏标题改为「星川决策工作台-服务商」（内站不生效）
try { applyGhBranding(); } catch { /* 品牌覆盖失败不阻塞 */ }

// 标记应用已启动，供 index.html 的启动加载态/超时兜底识别
window.__xcAppLoaded = true
const bootLoader = document.getElementById('boot-loader')
function hideBootLoader() {
  if (!bootLoader) return
  try {
    bootLoader.classList.add('hide')
    // React 挂载后移除启动加载节点
    setTimeout(() => bootLoader.remove(), 500)
  } catch { /* noop */ }
}
// 初始化致命错误兜底：避免 boot-loader 移除后白屏
function showInitFatal(e: unknown) {
  try { console.error('[xc] init fatal:', e); } catch { /* noop */ }
  try {
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;'
        + 'background:linear-gradient(135deg,#f5f3ff 0%,#eef2ff 100%);padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif">'
        + '<div style="max-width:420px;background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 20px 50px rgba(76,29,149,.12);text-align:center">'
        + '<div style="font-size:40px;margin-bottom:12px">🫣</div>'
        + '<h1 style="font-size:17px;font-weight:700;color:#1e293b;margin-bottom:8px">工作台初始化失败</h1>'
        + '<p style="font-size:13.5px;color:#64748b;line-height:1.7;margin-bottom:20px">可能是网络较慢或脚本加载不完整，请刷新页面重试。</p>'
        + '<button onclick="location.reload()" style="padding:9px 28px;border:0;border-radius:10px;cursor:pointer;background:#7c3aed;color:#fff;font-size:13.5px;font-weight:600">刷新页面重试</button>'
        + '</div></div>'
    }
    if (bootLoader) bootLoader.remove()
  } catch { /* noop */ }
}

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  hideBootLoader()
} catch (e) {
  showInitFatal(e)
}
