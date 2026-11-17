// 轻量化使用者身份 + 本地使用历史（对内 / 对外通用）
// - 身份：只需填写一个名字（无密码、无账号体系），存 localStorage
// - 历史：按名字归档在本机 localStorage，切换名字即查看对应历史
// - 对外 GitHub 版：名字默认取主账号登录名，且埋点仍同步 FaaS 台账（跨设备历史不丢）
import { ghTrack, getGhAuth, isGhPages, type GhHistoryItem, type GhTrackExtra } from './gh';

const NAME_KEY = 'xc_user_name';
const HIST_KEY = 'xc_local_usage_v1';
const MAX_PER_NAME = 500; // 每个名字本地最多保留条数，超出裁剪最旧

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStorage(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 隐私模式等忽略 */ }
}

// 当前使用者身份键（用于本地历史归档，对内=名字；对外=服务商+姓名/备注+手机号键）
export function getUserName(): string {
  try {
    const local = (localStorage.getItem(NAME_KEY) || '').trim();
    if (local) return local;
    const gh = getGhAuth();
    if (gh?.name) return ghIdentityKey(gh.agency || '', gh.name, gh.phone || '');
    return '';
  } catch {
    return '';
  }
}

// 对外版本地身份键（服务商维度 + 本人标识）；云端台账统一按服务商归并
export function ghIdentityKey(agency: string, name: string, phone: string): string {
  return `gh::${String(agency || '').trim()}::${String(name || '').trim()}::${String(phone || '').trim()}`;
}

// 使用者展示名（对内=名字；对外=「姓名（服务商）」）
export function getUserDisplay(): string {
  try {
    const local = (localStorage.getItem(NAME_KEY) || '').trim();
    if (local) return local;
    const gh = getGhAuth();
    if (gh?.name) return gh.agency ? `${gh.name}（${gh.agency}）` : gh.name;
    return '';
  } catch {
    return '';
  }
}

// 把历史项里的身份键还原成可读展示名
export function displayIdentity(key: string): string {
  if (!key) return '';
  if (key.startsWith('gh::')) {
    const parts = key.split('::');
    const [, agency, name] = parts;
    return name && agency ? `${name}（${agency}）` : name || key;
  }
  return key;
}

// 是否已用「本地名字」显式登录（区别于对外主账号登录名的透明回退）
export function hasLocalName(): boolean {
  try {
    return !!(localStorage.getItem(NAME_KEY) || '').trim();
  } catch {
    return false;
  }
}

// 名字为明文存储（非 JSON），读取时无需反序列化
export function setUserName(name: string) {
  const n = (name || '').trim().slice(0, 30);
  if (n) { try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } }
}

export function clearUserName() {
  try { localStorage.removeItem(NAME_KEY); } catch { /* noop */ }
}

function readAll(): GhHistoryItem[] {
  const list = readStorage<GhHistoryItem[]>(HIST_KEY);
  return Array.isArray(list) ? list : [];
}

// 追加一条本地历史（按当前名字归档）；未填写名字则不记录
export function addLocalHistory(rec: { feature: string; product: string; inputSummary: string; outputSummary: string }, name?: string): boolean {
  try {
    const n = (name || getUserName()).trim();
    if (!n) return false;
    const all = readAll();
    const item: GhHistoryItem = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: n,
      time: Date.now(),
      feature: String(rec.feature || '').slice(0, 30),
      product: String(rec.product || '').slice(0, 120),
      inputSummary: String(rec.inputSummary || '').slice(0, 800),
      outputSummary: String(rec.outputSummary || '').slice(0, 500),
    };
    all.push(item);
    // 按名字裁剪：只保留该名字最近 MAX_PER_NAME 条，其他名字不动
    const mine: GhHistoryItem[] = [];
    const others: GhHistoryItem[] = [];
    for (const it of all) (it.name === n ? mine : others).push(it);
    const kept = mine.sort((a, b) => b.time - a.time).slice(0, MAX_PER_NAME);
    writeStorage(HIST_KEY, [...others, ...kept]);
    return true;
  } catch {
    return false;
  }
}

// 读取某名字的本地历史（时间倒序）
export function getLocalHistory(name: string): GhHistoryItem[] {
  const n = (name || '').trim();
  if (!n) return [];
  try {
    return readAll().filter((it) => it.name === n).sort((a, b) => b.time - a.time);
  } catch {
    return [];
  }
}

// 统一使用埋点：本地按名字归档（对内对外都记）；对外版额外同步 FaaS 台账
// 返回对外台账落库记录ID（Promise，对内/失败时为 undefined），用于串联迭代链
export function trackUsage(feature: string, product: string, inputSummary: string, outputSummary: string, extra?: GhTrackExtra): Promise<string | undefined> {
  try {
    addLocalHistory({ feature, product, inputSummary, outputSummary });
    if (isGhPages()) return ghTrack(feature, product, inputSummary, outputSummary, extra);
  } catch { /* 埋点永不影响主流程 */ }
  return Promise.resolve(undefined);
}
