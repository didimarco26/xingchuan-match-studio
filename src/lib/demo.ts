// ============================================================
// 🎬 演示模式（Demo Mode）全局开关
//   - 唯一开启入口：URL 参数 ?demo=1 / true（演示专用网址）
//   - 主入口（无 demo 参数）一律正常模式——不再因本地缓存残留
//     而在打开主入口时默认进入演示模式
//   - 开启后四大模块（商品分析 / 内容能力 / 达人匹配 / 经营看板）
//     全部秒出本地预置高质量数据，不走实时 AI / 网络
//   - 页内右下角开关仅当前会话生效（同步 URL 参数）；关掉参数或
//     重新打开主入口即恢复真实调用链路
// ============================================================
import { useEffect, useState } from 'react';

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

function readUrl(): boolean | null {
  try {
    const params = new URLSearchParams(window.location.search);
    // 显式 ?demo=0 仍可退出演示模式
    if (params.has('demo')) {
      const v = params.get('demo');
      return v === '1' || (v || '').toLowerCase() === 'true';
    }
    // 深链兜底：路径末段为 /demo（GitHub Pages 回退页 404 同源生效）
    const seg = window.location.pathname.split('/').filter(Boolean);
    if (seg.length && seg[seg.length - 1].toLowerCase() === 'demo') return true;
    return null;
  } catch {
    return null;
  }
}

// 初始状态只认 URL：主入口无 ?demo 参数（或 ?demo=0）→ 正常模式。
// 不再读取 localStorage，避免访问过演示网址后主入口永久演示。
let current = readUrl() ?? false;

/** 当前是否处于演示模式 */
export function isDemoMode(): boolean {
  return current;
}

function emit(on: boolean) {
  listeners.forEach((l) => { try { l(on); } catch { /* ignore */ } });
}

/** 切换演示模式：同步 URL query 并通知所有订阅者（仅当前会话，不写本地缓存） */
export function setDemoMode(on: boolean) {
  current = on;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('demo', on ? '1' : '0');
    window.history.replaceState(null, '', url.toString());
  } catch { /* ignore */ }
  emit(on);
}

/** 订阅演示模式变化（返回取消订阅函数） */
export function subscribeDemo(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React Hook：响应式获取/切换演示模式 */
export function useDemoMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(current);
  useEffect(() => subscribeDemo(setOn), []);
  return [on, setDemoMode];
}

// ============================================================
// 🎬 演示模式 · 模拟真实链路的短 loading
//   - 用户点击真实功能按钮后，先展示该组件自带的 loading，
//     等待 400-900ms，再把本地预置结果渲染到与真实模式相同的位置
//   - 一次点击若内部串行/并行调用多个被短路的函数，只在首个调用等待，
//     其余落在「同一手势窗口」内立即返回 → 保证每次点击总等待恰为一次 400-900ms
// ============================================================
const GESTURE_GRACE_MS = 300;
let gestureUntil = 0;

export function demoLatency(): Promise<void> {
  const now = Date.now();
  if (now < gestureUntil) return Promise.resolve();
  const ms = 400 + Math.floor(Math.random() * 501); // 400-900ms
  gestureUntil = now + ms + GESTURE_GRACE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
