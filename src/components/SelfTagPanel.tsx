import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Loader2, CheckCircle2, XCircle, UploadCloud, Download, FileSpreadsheet,
  ArrowLeft, Tag as TagIcon, ShieldCheck, Package, FileDown,
  Apple, Monitor, Info, LogIn, X, Database, FileUp, Trash2, FolderOpen, ExternalLink, History,
} from 'lucide-react';
import { FAAS_URL } from '../lib/api';
import { getGhName, ghTaggerUpload, ghTaggerMyHistory, ghTaggerDownload, ghTaggerBatchUpsert, ghTaggerUploadFile, arrayBufferToBase64, textToBase64, GH_TAGGER_FILE_MAX, type GhTaggerHistItem, type GhTaggerBatchResp } from '../lib/gh';

// ============================================================
// 🏷️ 服务商达人自助打标（仅 GitHub Pages 公开版启用）
//   网页本身不抓数据；它只驱动「服务商本机运行的 xc-tagger 小工具」：
//   网页 → http://127.0.0.1:7842/health|/login|/parse|/tag → 本机 Playwright 用星图登录态抓取并打分。
//   登录：点「登录星图」→ 本机弹出 Chrome 扫码，登录态存 .xc-cookies.json，只在服务商本机。
// ============================================================

const TAGGER_BASE = 'http://127.0.0.1:7842';

// 一键启动包 v3.2+ 约 8.8MB（内置 node_modules，调用系统 Chrome/Edge，不含浏览器二进制）。
// 主下载走 gh-pages 同源镜像（与网页同域，国内网络最稳）；GitHub Releases 永久直链作为备用。
const TOOL_BASE = 'tools/xc-tagger';
const RELEASE_BASE = 'https://github.com/didimarco26/xingchuan-workbench/releases/latest/download';
const MAC_ZIP_URL = `${TOOL_BASE}/xc-tagger-mac-v1.zip`;
const WIN_ZIP_URL = `${TOOL_BASE}/xc-tagger-win-v1.zip`;
const ZIP_URL = `${TOOL_BASE}/xc-tagger-v1.zip`;
const MAC_ZIP_FALLBACK = `${RELEASE_BASE}/xc-tagger-mac-v1.zip`;
const WIN_ZIP_FALLBACK = `${RELEASE_BASE}/xc-tagger-win-v1.zip`;
const ZIP_FALLBACK = `${RELEASE_BASE}/xc-tagger-v1.zip`;
const TEMPLATE_URL = `${TOOL_BASE}/xc-influencer-template.xlsx`;
const TOOL_FILES = [
  { href: `${TOOL_BASE}/xc-tagger.js`, label: 'xc-tagger.js（主程序）' },
  { href: `${TOOL_BASE}/package.json`, label: 'package.json（依赖清单）' },
  { href: `${TOOL_BASE}/README.md`, label: 'README.md（使用说明）' },
];

interface TagItem { id?: string; name?: string; douyin?: string; row?: number }
interface TagResult {
  id: string; name: string; found: boolean;
  douyin?: string; // v4.0.0 达人抖音号
  score: number; tier: string; medal: string;
  sLevel: string; lLevel: string; deliveries: number; consumption: number;
  fans?: number; fansTier?: string; persona?: string[]; forms?: string[];
  style?: string[]; scene?: string[]; industry?: string[]; category?: string;
  videoLinks?: string[]; mainCategory?: string; hotDirection?: string;
  confidence?: string;
  visionTag?: boolean; aiSuggestion?: string; visionFrameCount?: number;
  tags: string[]; reason: string;
  dataSource?: string; videoBonus?: number;
  videoAnalysis?: { title?: string; plays?: number; likes?: number; contentType?: string; isSelling?: boolean; url?: string; visionObserve?: string; visionSelling?: boolean }[];
  via?: string;
}

// v4.2.0 断点续跑：本机未完成批次（GET /resume/state）
interface ResumeBatch {
  batchId: string; fileName: string; total: number; done: number;
  status: string; startedAt: number; updatedAt: number;
  items: { id: string; name: string; douyin: string; row?: number; src?: string }[];
  results: TagResult[];
}

// ============================================================
// v3.7.0 我的达人库：本地存量达人库 CSV 导入/导出（对标存量达人表字段）
// ============================================================
interface LibRow {
  name: string; id: string; douyin: string;
  fans: number; fansTier: string;
  sLevel: string; lLevel: string;
  deliveries: number; consumption: number;
  tier: string; score: number;
  persona: string[]; forms: string[]; style: string[]; scene: string[]; industry: string[];
  mainCategory: string; hotDirection: string; confidence: string;
  videoLinks: string[];
  tags: string[]; dataSource: string; reason: string;
  visionTag: boolean; aiSuggestion: string;
}
const LIB_STORAGE_KEY = 'xc_my_influencer_lib_v1';
// 达人库 CSV 列（导出/导入同构，完全对标存量达人表 + v3.8.0 视频画面 AI 打标字段）
const LIB_CSV_HEADERS = [
  '达人名称', '达人ID(星图)', '达人抖音号', '粉丝量', '粉丝量级', '星川等级', '电商等级',
  '星图项目数', '星图消耗(元)', '分层', '得分',
  '人设标签', '内容形式标签', '画面风格标签', '拍摄场景标签', '行业标签',
  '主要带货类目', '近期爆款内容方向', '打标置信度',
  '视频链接1', '视频链接2', '视频链接3',
  '主要标签', '数据来源', '打标依据', 'AI打标建议',
] as const;

const csvCell = (v: unknown): string => {
  const s = (v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v));
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// 简单 RFC4180 CSV 解析（支持引号、转义引号、CRLF）
function parseCsvText(text: string): string[][] {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
const splitLabels = (s: string): string[] =>
  String(s || '').split(/[、,，|/\s]+/).map(x => x.trim()).filter(Boolean);
const num = (s: string): number => { const n = parseFloat(String(s ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };

// 打标结果 → 达人库行
function tagResultToLibRow(r: TagResult): LibRow {
  return {
    name: r.name || '', id: r.id || '', douyin: r.douyin || '',
    fans: r.fans || 0, fansTier: r.fansTier || '',
    sLevel: r.sLevel || '', lLevel: r.lLevel || '',
    deliveries: r.deliveries || 0, consumption: r.consumption || 0,
    tier: r.tier || '', score: r.score || 0,
    persona: r.persona || [], forms: r.forms || [],
    style: r.style || [], scene: r.scene || [], industry: r.industry || [],
    mainCategory: r.mainCategory || '', hotDirection: r.hotDirection || '',
    confidence: r.confidence || '',
    videoLinks: (r.videoLinks || []).slice(0, 3),
    tags: r.tags || [], dataSource: r.dataSource || '', reason: r.reason || '',
    visionTag: !!r.visionTag, aiSuggestion: r.aiSuggestion || '',
  };
}
// 达人库行 → 打标结果结构（v3.11：本地已打标存量库「一键同步云端」时用，字段与工具实时打标结果同构）
function libRowToTagResult(r: LibRow): TagResult {
  const medal = ({ 标杆: '🥇', 主力: '🥈', 潜力: '🥉' } as Record<string, string>)[r.tier] || '⚪';
  return {
    id: r.id || '', name: r.name || '', douyin: r.douyin || '', found: true,
    score: r.score || 0, tier: r.tier || '储备', medal,
    sLevel: r.sLevel || '', lLevel: r.lLevel || '',
    deliveries: r.deliveries || 0, consumption: r.consumption || 0,
    fans: r.fans || 0, fansTier: r.fansTier || '',
    persona: r.persona || [], forms: r.forms || [],
    style: r.style || [], scene: r.scene || [], industry: r.industry || [],
    category: r.mainCategory || '', mainCategory: r.mainCategory || '',
    hotDirection: r.hotDirection || '', confidence: r.confidence || '',
    videoLinks: (r.videoLinks || []).slice(0, 3),
    tags: r.tags || [],
    reason: r.reason || '服务商本地达人库同步（已完成打标的存量名单）',
    dataSource: r.dataSource || '本地库同步',
    visionTag: !!r.visionTag, aiSuggestion: r.aiSuggestion || '',
  };
}
function libRowToCsvValues(row: LibRow): string[] {
  const v3 = row.videoLinks.slice(0, 3);
  while (v3.length < 3) v3.push('');
  return [
    row.name, row.id, row.douyin, String(row.fans), row.fansTier, row.sLevel, row.lLevel,
    String(row.deliveries), String(row.consumption), row.tier, String(row.score),
    row.persona.join(' '), row.forms.join(' '), row.style.join(' '), row.scene.join(' '), row.industry.join(' '),
    row.mainCategory, row.hotDirection, row.confidence,
    v3[0], v3[1], v3[2],
    row.tags.join(' '), row.dataSource, row.reason,
    row.aiSuggestion || (row.visionTag ? '（视频画面 AI 打标）' : ''),
  ].map(csvCell);
}
function downloadCsv(filename: string, valuesRows: string[][]) {
  const lines = [LIB_CSV_HEADERS.map(csvCell).join(','), ...valuesRows.map(r => r.join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// 生成完整结果 CSV 文本（含 BOM，26 列，与下载文件完全同构）
function buildCsvText(valuesRows: string[][]): string {
  const lines = [LIB_CSV_HEADERS.map(csvCell).join(','), ...valuesRows.map(r => r.join(','))];
  return '﻿' + lines.join('\r\n');
}
// 解析达人库 CSV 文本为 LibRow[]
function parseLibCsv(text: string): LibRow[] {
  const rows = parseCsvText(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  const idx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
  const iName = idx(['达人名称', '名称', '昵称', '达人名']);
  const iId = idx(['达人ID', '星图ID']);
  const iDouyin = idx(['达人抖音号', '抖音号', '抖音ID']); // v4.0.0（旧 CSV 无此列 → -1 → 空）
  const iFans = idx(['粉丝量', '粉丝数']);
  const iFansTier = idx(['粉丝量级', '万粉标签', '粉丝档']);
  const iS = idx(['星川等级']);
  const iL = idx(['电商等级']);
  const iDel = idx(['星图项目数', '交付项目', '项目数']);
  const iCon = idx(['星图消耗', '消耗']);
  const iTier = idx(['分层']);
  const iScore = idx(['评分', '得分']);
  const iPersona = idx(['人设标签', '人设']);
  const iForms = idx(['内容形式标签', '内容形式']);
  const iStyle = idx(['画面风格标签', '画面风格']);
  const iScene = idx(['拍摄场景标签', '拍摄场景']);
  const iInd = idx(['行业标签', '行业']);
  const iMain = idx(['主要带货类目', '带货类目']);
  const iHot = idx(['近期爆款内容方向', '爆款']);
  const iConf = idx(['打标置信度', '置信度']);
  const iV1 = idx(['视频链接1']);
  const iTags = idx(['主要标签', '标签']);
  const iSrc = idx(['数据来源']);
  const iReason = idx(['打标依据', '依据']);
  const iAi = idx(['AI打标建议', 'AI 打标建议', '打标建议']);
  const out: LibRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    const get = (i: number) => (i >= 0 ? (c[i] || '') : '');
    const videoLinks = [0, 1, 2].map(k => get(iV1 + k).trim()).filter(Boolean);
    const aiSuggestion = get(iAi).trim();
    out.push({
      name: get(iName).trim(), id: get(iId).trim(),
      douyin: get(iDouyin).trim().replace(/\s+/g, '').replace(/^@+/, ''),
      fans: num(get(iFans)), fansTier: get(iFansTier).trim(),
      sLevel: get(iS).trim(), lLevel: get(iL).trim(),
      deliveries: num(get(iDel)), consumption: num(get(iCon)),
      tier: get(iTier).trim(), score: num(get(iScore)),
      persona: splitLabels(get(iPersona)), forms: splitLabels(get(iForms)),
      style: splitLabels(get(iStyle)), scene: splitLabels(get(iScene)), industry: splitLabels(get(iInd)),
      mainCategory: get(iMain).trim(), hotDirection: get(iHot).trim(), confidence: get(iConf).trim(),
      videoLinks,
      tags: splitLabels(get(iTags)), dataSource: get(iSrc).trim(), reason: get(iReason).trim(),
      visionTag: aiSuggestion.includes('视频画面') || false, aiSuggestion,
    });
  }
  return out.filter(r => r.name || r.id);
}
function loadLib(): LibRow[] {
  try {
    const raw = localStorage.getItem(LIB_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // 兼容旧库（v3.8.0 前无 visionTag/aiSuggestion 字段；v4.0.0 前无 douyin 字段）
    return arr.map((r: LibRow) => ({ ...r, douyin: r.douyin || '', visionTag: !!r.visionTag, aiSuggestion: r.aiSuggestion || '' }));
  } catch { return []; }
}
function saveLib(rows: LibRow[]) {
  try { localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}
interface Health {
  ok: boolean; loggedIn: boolean;
  loginPending?: boolean; loginNote?: string; cookieCount?: number;
  browser?: { mode?: string | null; ready?: boolean; name?: string; cdpPort?: number | null };
}
interface QrState {
  mode?: string | null;
  status?: string;      // starting | waiting | loggedin | expired | idle
  qr?: string | null;   // data:image/png;base64,...
  kind?: string | null;
  browserName?: string;
}

const TIER_STYLE: Record<string, { bg: string; fg: string; bd: string }> = {
  '标杆': { bg: '#FEF3C7', fg: '#B45309', bd: '#F59E0B' },
  '主力': { bg: '#DCFCE7', fg: '#15803D', bd: '#22C55E' },
  '潜力': { bg: '#E0E7FF', fg: '#4338CA', bd: '#6366F1' },
  '储备': { bg: '#F3F4F6', fg: '#6B7280', bd: '#9CA3AF' },
};

async function taggerFetch(path: string, opts: RequestInit = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // 支持外部主动取消（如取消扫码等待）：外部 signal abort 时一并中断本请求
  const extSignal = opts.signal as AbortSignal | undefined;
  const onExtAbort = () => ctrl.abort();
  if (extSignal) {
    if (extSignal.aborted) ctrl.abort();
    else extSignal.addEventListener('abort', onExtAbort, { once: true });
  }
  try {
    const resp = await fetch(TAGGER_BASE + path, { ...opts, signal: ctrl.signal });
    const body = await resp.json().catch(() => null);
    if (!resp.ok || !body) throw new Error((body && body.error) || `本地工具返回异常（HTTP ${resp.status}）`);
    return body;
  } finally {
    clearTimeout(timer);
    if (extSignal) extSignal.removeEventListener('abort', onExtAbort);
  }
}

// 导出打标结果 CSV：v3.8.1 起与「我的达人库」同构，完整 26 列（含画面风格/拍摄场景/
// 主要带货类目/近期爆款内容方向/AI打标建议等 7 维标签），与存量达人表口径一致
function exportResultsCsv(results: TagResult[]) {
  const rows = results.filter(r => r.found).map(tagResultToLibRow);
  if (!rows.length) return;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  downloadCsv(`星川达人打标结果_${stamp}.csv`, rows.map(libRowToCsvValues));
}

// 打标完成后由下方组件逻辑调用 ghTaggerUpload：带登录 token、全量结果自动上云并绑定服务商账号
// （服务商主账号/授权成员）；之后可在「我的打标历史」直接再下载，无需重新上传打标。

export default function SelfTagPanel({ onBack, onSwitchIdLookup }: { onBack: () => void; onSwitchIdLookup?: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<TagItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [tagging, setTagging] = useState(false);
  // v3.8.1：打标实时进度（轮询本地工具 /progress）
  const [tagProg, setTagProg] = useState<{ running: boolean; total: number; done: number; current: string; phase: string; vision: boolean } | null>(null);
  // v3.9.0：逐条实时上云状态（每完成一位达人即保存到云端台账，绑定登录账号；断网/关页面已保存部分不丢）
  const [cloudSave, setCloudSave] = useState<{ saved: number; total: number; syncing: boolean; err: string; supported: boolean } | null>(null);
  // 附件归档（v3.10）：服务商原始名单 + 打标结果 CSV 自动存台账附件字段
  const [filesArchived, setFilesArchived] = useState<{ source: boolean; result: boolean; sourceErr: string; resultErr: string }>({ source: false, result: false, sourceErr: '', resultErr: '' });
  const progTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchIdRef = useRef('');
  const sourceTokenRef = useRef('');      // 原始名单附件 file_token
  const sourceSentRef = useRef(false);     // 原件 token 是否已随首次 upsert 上送
  const localCursorRef = useRef(0);                 // 已从本机工具 /progress 取走的结果序号
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const cloudSupportedRef = useRef<boolean | null>(null); // null=未知 / true=v3.9 工具支持增量 / false=旧版降级
  const [results, setResults] = useState<TagResult[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [loginPending, setLoginPending] = useState(false); // 本机已打开登录页等待扫码
  const [loginElapsed, setLoginElapsed] = useState(0);    // 已等待秒数
  const [loginMsg, setLoginMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [qr, setQr] = useState<QrState | null>(null);     // 无头模式下的登录二维码
  const loginTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const loginAbort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // v3.7.0 我的达人库（本地存量库，localStorage）
  const [myLib, setMyLib] = useState<LibRow[]>([]);
  const [libMsg, setLibMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const libInput = useRef<HTMLInputElement>(null);
  // v3.11：本地达人库一键同步云端（同步为一个云端批次，绑定当前登录账号三元组）
  const [libSync, setLibSync] = useState<{ syncing: boolean; done: number; total: number; err: string; ok: boolean; rid: string } | null>(null);
  // v4.2.0 断点续跑：本机未完成批次（/resume/state）；tried 集合防止自动续跑重复触发
  const [resumeBatches, setResumeBatches] = useState<ResumeBatch[]>([]);
  const resumeTriedRef = useRef<Set<string>>(new Set());
  const [fileName, setFileName] = useState(''); // 展示用文件名（新上传=文件；续跑=断点内文件名）

  useEffect(() => { setMyLib(loadLib()); }, []);

  // —— 云端「我的打标历史」：绑定服务商登录账号，换机/忘下载也能找回全量结果 ——
  const [hist, setHist] = useState<GhTaggerHistItem[] | null>(null);
  const [histErr, setHistErr] = useState('');
  const [histLoading, setHistLoading] = useState(false);
  const [downloadingRid, setDownloadingRid] = useState<string | null>(null);

  const loadHist = useCallback(async () => {
    setHistLoading(true); setHistErr('');
    try {
      setHist(await ghTaggerMyHistory());
    } catch (e) {
      setHist(null);
      setHistErr(e instanceof Error ? e.message : '历史加载失败');
    } finally {
      setHistLoading(false);
    }
  }, []);
  useEffect(() => { void loadHist(); }, [loadHist]);

  // 从云端拉取某条历史的全量打标结果并直接导出 CSV（无需重新上传/打标）
  const downloadHist = async (item: GhTaggerHistItem) => {
    setDownloadingRid(item.rid);
    try {
      const { fileName, results } = await ghTaggerDownload(item.rid);
      const rows = (results || []).filter((r: TagResult) => r && r.found !== false).map(tagResultToLibRow);
      if (!rows.length) throw new Error('该记录没有可导出的命中达人');
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      const base = (fileName || '星川达人打标结果').replace(/\.(xlsx|xls|csv)$/i, '');
      downloadCsv(`${base}_云端恢复_${stamp}.csv`, rows.map(libRowToCsvValues));
    } catch (e) {
      setHistErr(e instanceof Error ? e.message : '下载失败');
    } finally {
      setDownloadingRid(null);
    }
  };
  // 我的达人库 ID 集合（用于打标结果比对「已在库」）
  const libIdSet = new Set(myLib.map(r => String(r.id || '').trim()).filter(Boolean));

  const todayStamp = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  };
  // 导出「我的达人库 CSV」：把当前打标结果（命中达人）对标存量达人表字段导出
  const exportMyLibrary = (rows: TagResult[]) => {
    const libRows = rows.filter(r => r.found).map(tagResultToLibRow);
    if (!libRows.length) return;
    downloadCsv(`我的星川达人库_${todayStamp()}.csv`, libRows.map(libRowToCsvValues));
  };
  // 上传我的达人库 CSV
  const onUploadLib = async (f: File) => {
    setLibMsg(null);
    try {
      const text = await f.text();
      const parsed = parseLibCsv(text);
      if (!parsed.length) {
        setLibMsg({ ok: false, text: '未能识别到达人记录，请确认是本工具导出的「我的星川达人库」CSV 文件。' });
        return;
      }
      // 与现有库按 ID 合并去重（新数据覆盖同 ID）
      const map = new Map<string, LibRow>();
      for (const r of [...myLib, ...parsed]) {
        const key = String(r.id || '').trim() || r.name;
        map.set(key, r);
      }
      const merged = Array.from(map.values());
      setMyLib(merged);
      saveLib(merged);
      setLibMsg({ ok: true, text: `已导入 ${parsed.length} 位达人，当前我的达人库共 ${merged.length} 位（保存在本机浏览器）。` });
    } catch {
      setLibMsg({ ok: false, text: '解析文件失败，请上传本工具导出的 CSV。' });
    }
  };
  const clearMyLib = () => {
    setMyLib([]);
    try { localStorage.removeItem(LIB_STORAGE_KEY); } catch { /* ignore */ }
    setLibMsg({ ok: true, text: '已清空我的达人库。' });
  };

  // v3.11：把本机已打标好的存量达人库一键同步到云端台账（无需再跑工具重新打标）。
  // - 整个本地库作为一个新批次（batchId sync_*），绑定当前登录账号服务商名称+姓名+手机号；
  // - 分批 80 条串行 upsert，服务端按达人ID/名称幂等去重，单批失败重试 3 次；
  // - 结果 CSV（26 列）同步归档到台账附件；附件失败不阻断文本数据上云。
  const SYNC_BATCH_SIZE = 80;
  const syncMyLibrary = async () => {
    if (!myLib.length || libSync?.syncing) return;
    const rows = myLib.filter(r => r.name || r.id);
    if (!rows.length) { setLibMsg({ ok: false, text: '达人库中没有可同步的达人记录。' }); return; }
    setLibMsg(null);
    const total = rows.length;
    const batchId = 'sync_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const fileName = `我的星川达人库_${todayStamp()}.csv`;
    setLibSync({ syncing: true, done: 0, total, err: '', ok: false, rid: '' });
    try {
      // 1) 结果 CSV 先归档到附件空间（记录尚未建，先拿 file_token，随首批 upsert 挂载）
      let resultToken = '';
      try {
        const csvText = buildCsvText(rows.map(libRowToCsvValues));
        const b64 = textToBase64(csvText);
        if (b64.length <= GH_TAGGER_FILE_MAX) {
          const up = await ghTaggerUploadFile({
            batchId, kind: 'result',
            fileName: `我的星川达人库_云端同步_${todayStamp()}.csv`,
            dataBase64: b64,
          });
          resultToken = up.fileToken || '';
        }
      } catch { /* 附件归档失败不阻断同步 */ }
      // 2) 分批串行上云，最后一批 finished=true 收尾
      let resp: GhTaggerBatchResp | null = null;
      for (let i = 0; i < rows.length; i += SYNC_BATCH_SIZE) {
        const chunk = rows.slice(i, i + SYNC_BATCH_SIZE).map(libRowToTagResult);
        const finished = i + SYNC_BATCH_SIZE >= rows.length;
        let lastErr = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            resp = await ghTaggerBatchUpsert({
              batchId, fileName, total, results: chunk, finished,
              ...(i === 0 && resultToken ? { resultFileToken: resultToken } : {}),
            });
            lastErr = ''; break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
            await new Promise(rs => setTimeout(rs, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) throw new Error(lastErr);
        setLibSync({ syncing: !finished, done: Math.min(i + chunk.length, total), total, err: '', ok: finished, rid: resp?.rid || '' });
      }
      // 3) 刷新云端历史列表
      await loadHist();
    } catch (e) {
      setLibSync(s => (s ? { ...s, syncing: false, err: e instanceof Error ? e.message : String(e) } : s));
    }
  };

  const refreshHealth = useCallback(async () => {
    try {
      const b = await taggerFetch('/health', {}, 3500);
      setOnline(true);
      setHealth({
        ok: true, loggedIn: !!b.loggedIn, loginPending: !!b.loginPending,
        cookieCount: b.cookieCount, loginNote: b.loginNote, browser: b.browser || null,
      });
      // 服务端扫码成功后会把 loginPending 复位，前端据此收尾等待态
      if (b.loggedIn) setLoginPending(false);
    } catch {
      setOnline(false); setHealth(null);
    }
  }, []);

  function stopQrPolling() {
    if (qrTimer.current) { clearInterval(qrTimer.current); qrTimer.current = null; }
  }
  // 登录等待期间轮询二维码（仅无头模式会返回图片；CDP 模式返回 mode=cdp 无图）
  function startQrPolling() {
    stopQrPolling();
    const poll = async () => {
      try {
        const q = await taggerFetch('/login/qr', {}, 4000);
        setQr(q);
        if (q && q.status === 'loggedin') stopQrPolling();
      } catch { /* 忽略单次轮询失败 */ }
    };
    poll();
    qrTimer.current = setInterval(poll, 2500);
  }

  // 点「登录星图」：本机工具自动打开系统 Chrome/Edge 扫码；无系统浏览器时网页显示二维码用手机抖音 App 扫
  async function startLogin() {
    if (loginPending) return;
    setLoginMsg(null);
    setQr(null);
    setLoginPending(true);
    setLoginElapsed(0);
    loginTimer.current = setInterval(() => setLoginElapsed(s => s + 1), 1000);
    loginAbort.current = new AbortController();
    startQrPolling();
    try {
      const b = await taggerFetch('/login', {
        method: 'POST',
        signal: loginAbort.current.signal,
      }, 200000);
      if (b.loggedIn) {
        setLoginMsg({ ok: true, text: '✅ 登录成功，可以开始打标（登录态保存在本机，下次免登录）。' });
      } else if (b.needInstall) {
        setLoginMsg({ ok: false, text: b.error || '未检测到可用浏览器，请安装 Google Chrome 或 Microsoft Edge 后重试。' });
      } else {
        setLoginMsg({ ok: false, text: b.error || b.message || '登录未完成，请重新点「登录星图」再试。' });
      }
      await refreshHealth();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/aborted|取消|abort/i.test(msg)) {
        setLoginMsg({ ok: false, text: '已取消登录，可重新点「登录星图」。' });
      } else {
        setLoginMsg({ ok: false, text: '登录失败：' + msg + '。请确认本地工具已启动。' });
      }
    } finally {
      setLoginPending(false);
      if (loginTimer.current) { clearInterval(loginTimer.current); loginTimer.current = null; }
      stopQrPolling();
      loginAbort.current = null;
    }
  }

  // 取消等待扫码（中断 /login 请求）
  function cancelLogin() {
    loginAbort.current?.abort();
    stopQrPolling();
  }

  useEffect(() => {
    refreshHealth();
    const t = setInterval(refreshHealth, 4000);
    return () => clearInterval(t);
  }, [refreshHealth]);

  // v4.2.0 断点续跑：拉取本机未完成批次（工具不在线/旧版本静默）
  const fetchResume = useCallback(async () => {
    try {
      const j = await taggerFetch('/resume/state', {}, 4000);
      if (j && j.ok && Array.isArray(j.batches)) setResumeBatches(j.batches);
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => {
    fetchResume();
    const t = setInterval(fetchResume, 15000);
    return () => clearInterval(t);
  }, [fetchResume]);

  async function handleFile(f: File | null) {
    if (!f) return;
    setError(''); setResults(null); setSummary(null); setRecorded(false); setFile(f); setItems([]);
    setFileName(f ? f.name : '');
    setFilesArchived({ source: false, result: false, sourceErr: '', resultErr: '' });
    sourceTokenRef.current = ''; sourceSentRef.current = false;
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const b = await taggerFetch('/parse?fn=' + encodeURIComponent(f.name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
      }, 60000);
      setItems(b.items || []);
      if (!(b.items || []).length) setError('未从表格识别到达人识别列，请确认表头含「达人ID/星图ID」「达人名称/昵称」或「抖音号」列。');
    } catch (e) {
      setError('名单解析失败：' + (e instanceof Error ? e.message : String(e)));
    } finally { setParsing(false); }
  }

  // v3.9.0：增量结果串行上云（同批次幂等 upsert，失败指数退避重试 4 次）
  const enqueueCloud = (incoming: TagResult[], finished: boolean) => {
    if (!incoming.length && !finished) return;
    const batchId = batchIdRef.current;
    const total = items.length;
    const payload = incoming.map(r => ({ ...r }));
    setCloudSave(s => ({ saved: s?.saved ?? 0, total, syncing: true, err: '', supported: true }));
    uploadChainRef.current = uploadChainRef.current.then(async () => {
      let lastErr = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const withSource = !sourceSentRef.current && !!sourceTokenRef.current;
          const r = await ghTaggerBatchUpsert({
            batchId, fileName, total, results: payload, finished,
            // 首批把原始名单附件 token 带上建记录；服务端对已有附件不覆盖，重试安全
            ...(withSource ? { sourceFileToken: sourceTokenRef.current } : {}),
          });
          if (withSource) sourceSentRef.current = true;
          setCloudSave({ saved: r.saved ?? 0, total: r.total ?? total, syncing: false, err: '', supported: true });
          return;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          await new Promise(rs => setTimeout(rs, Math.min(8000, 800 * 2 ** attempt)));
        }
      }
      setCloudSave(s => ({ saved: s?.saved ?? 0, total, syncing: false, err: '云端保存中断，正在后续重试…(' + lastErr.slice(0, 40) + ')', supported: true }));
    });
  };

  // v3.10：打标结果 CSV（26 列全字段）归档到台账附件字段；loc 为批次或旧版整批记录 ID
  const archiveResultFile = (loc: { batchId?: string; rid?: string }, res: TagResult[], total: number) => {
    return (async () => {
      try {
        const found = (res || []).filter(r => r && r.found !== false);
        if (!found.length) return;
        const csvText = buildCsvText(found.map(tagResultToLibRow).map(libRowToCsvValues));
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        const csvName = `星川达人打标结果_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.csv`;
        const up = await ghTaggerUploadFile({ ...loc, kind: 'result', fileName: csvName, dataBase64: textToBase64(csvText) });
        if (!up.attachedTo && up.fileToken && loc.batchId) {
          // 记录尚未挂上的竞态兜底：用一次 finished upsert 把结果附件 token 带进同一条批次记录
          await ghTaggerBatchUpsert({ batchId: loc.batchId, fileName: file?.name || '', total, results: [], finished: true, resultFileToken: up.fileToken });
        }
        setFilesArchived(a => ({ ...a, result: true, resultErr: '' }));
      } catch (e) {
        setFilesArchived(a => ({ ...a, resultErr: '结果文件归档失败：' + (e instanceof Error ? e.message : String(e)).slice(0, 60) }));
      }
    })();
  };

  async function startTag(opts?: { resume?: ResumeBatch }) {
    const resumeCp = opts?.resume;
    const resumeItems = resumeCp ? resumeCp.items.slice(resumeCp.done) : [];
    if (!resumeCp && !items.length) return;
    if (resumeCp && !resumeItems.length) { void fetchResume(); return; }
    setError(''); setTagging(true); setResults(null); setRecorded(false);
    // v3.9.0：本次打标批次（同批次云端只有一条记录，逐位幂等合并）
    // v4.2.0：续跑沿用断点批次 ID；新任务才生成新批次
    batchIdRef.current = resumeCp
      ? resumeCp.batchId
      : 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localCursorRef.current = 0;
    uploadChainRef.current = Promise.resolve();
    cloudSupportedRef.current = null;
    setCloudSave(null);
    // v3.10：原件/结果文件附件归档状态重置（续跑保留既有状态即可）
    if (!resumeCp) setFilesArchived({ source: false, result: false, sourceErr: '', resultErr: '' });
    sourceTokenRef.current = '';
    sourceSentRef.current = false;
    // v4.2.0 续跑：恢复完整名单与文件名，立即从断点列表移除（防重复触发）
    if (resumeCp) {
      setItems(resumeCp.items);
      setFileName(resumeCp.fileName || '');
      setResumeBatches(bs => bs.filter(b => b.batchId !== resumeCp.batchId));
    }
    // 原始名单先上传到台账附件空间（记录还没建，先拿 file_token，随首批增量上云挂到记录上）
    // 失败/超限不阻断打标，只在界面提示；台账文本数据照常留痕
    // v4.2.0：续跑不重传原件（开跑前已归档）
    if (!resumeCp) void (async () => {
      try {
        if (!file) return;
        if (file.size > GH_TAGGER_FILE_MAX) {
          setFilesArchived(a => ({ ...a, sourceErr: `原始名单超过 11MB，未归档原件（打标数据正常留痕）` }));
          return;
        }
        const buf = await file.arrayBuffer();
        const up = await ghTaggerUploadFile({
          batchId: batchIdRef.current, kind: 'source',
          fileName: file.name, dataBase64: arrayBufferToBase64(buf),
        });
        sourceTokenRef.current = up.fileToken || '';
        setFilesArchived(a => ({ ...a, source: true, sourceErr: '' }));
      } catch (e) {
        setFilesArchived(a => ({ ...a, sourceErr: '原件归档失败：' + (e instanceof Error ? e.message : String(e)).slice(0, 60) }));
      }
    })();
    // v3.8.1：每秒轮询本地工具实时进度（第 N/M 位、当前达人、阶段）
    const runTotal = resumeCp ? resumeCp.total : items.length;
    const runItems = resumeCp ? resumeItems : items;
    setTagProg({ running: true, total: runTotal, done: resumeCp ? resumeCp.done : 0, current: runItems[0]?.name || '', phase: resumeCp ? '继续上次任务，准备中…' : '准备启动…', vision: true });
    progTimer.current = setInterval(async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        // v3.9.0：?since=N 只取本机新完成的达人结果，拿到即增量上云
        const resp = await fetch(TAGGER_BASE + '/progress?since=' + localCursorRef.current, { signal: ctrl.signal });
        clearTimeout(t);
        const b = await resp.json().catch(() => null);
        if (b && b.ok) {
          setTagProg({ running: !!b.running, total: b.total || items.length, done: b.done || 0, current: b.current || '', phase: b.phase || '', vision: b.vision !== false });
          if (Array.isArray(b.results)) {
            cloudSupportedRef.current = true;
            if (b.results.length) {
              const inc = b.results as TagResult[];
              localCursorRef.current += inc.length;
              enqueueCloud(inc, false);
            }
          } else if (cloudSupportedRef.current === null && (b.running || b.done)) {
            cloudSupportedRef.current = false; // 旧版本机工具：无增量结果字段，完成后走全量兜底
          }
        }
      } catch { /* 进度轮询失败静默，下一秒继续；上云失败在 enqueueCloud 内重试 */ }
    }, 1000);
    try {
      if (resumeCp) {
        // v4.2.0：续跑前把断点内已完成结果与云端批次记录对齐（40 条/批；服务端按 ID/名称去重合并）
        setTagProg(p => p ? { ...p, phase: '同步已有结果到云端…' } : p);
        for (let i = 0; i < resumeCp.results.length; i += 40) {
          const part = resumeCp.results.slice(i, i + 40);
          try {
            await ghTaggerBatchUpsert({
              batchId: resumeCp.batchId, fileName: resumeCp.fileName || '', total: resumeCp.total,
              results: part, finished: false,
            });
          } catch { /* 单段对齐失败不阻断，后续增量上云继续补齐 */ }
        }
      }
      // v3.8.1：视频抽帧+云端 AI 打标每位耗时数十秒，批量可能跑很久，超时放宽到 3 小时
      const b = await taggerFetch('/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeCp
          ? { items: resumeItems, batchId: resumeCp.batchId, resume: true, fileName: resumeCp.fileName || '' }
          : { items }),
      }, 10800000);
      if (b.loggedIn === false) { setError('星图未登录：请先点上方「🚀 登录星图」完成扫码，再开始打标。'); return; }
      const res: TagResult[] = b.results || [];
      setResults(res);
      setSummary(b.summary || null);
      if (!res.length) { setError('未返回打标结果，请重试。'); return; }
      if (cloudSupportedRef.current) {
        // v3.9.0：最后再拉一次进度兜底最后一窗增量，随后置批次「已完成」并等待全部上云结束
        try {
          const ctrl = new AbortController();
          const tt = setTimeout(() => ctrl.abort(), 4000);
          const last = await (await fetch(TAGGER_BASE + '/progress?since=' + localCursorRef.current, { signal: ctrl.signal })).json();
          clearTimeout(tt);
          if (Array.isArray(last.results) && last.results.length) {
            const inc = last.results as TagResult[];
            localCursorRef.current += inc.length;
            enqueueCloud(inc, false);
          }
        } catch { /* 忽略，最终 finished 上云会以服务端已合并结果为准 */ }
        enqueueCloud([], true);
        await uploadChainRef.current.catch(() => {});
        setRecorded(true);
        void loadHist();
        // v3.10：完整结果 CSV 归档台账附件
        void archiveResultFile({ batchId: batchIdRef.current }, res, items.length);
      } else {
        // 旧版本机工具兼容：打标完成后一次性全量上云（同样绑定登录账号）
        const foundCount = res.filter(r => r && r.found !== false).length;
        void ghTaggerUpload({
          fileName,
          total: b.total || res.length,
          foundCount,
          summary: b.summary || {},
          inputInfo: JSON.stringify({
            文件名: fileName, 上传达人数量: b.total || res.length,
            打标完成达人数量: foundCount, 使用者: getGhName() || '未署名服务商',
          }),
          results: res,
        }).then(async rid => {
          if (rid) {
            setRecorded(true); void loadHist();
            // v3.10：旧版工具链路同样把原件+结果 CSV 归档到台账附件字段
            try {
              if (file && file.size <= GH_TAGGER_FILE_MAX) {
                const buf = await file.arrayBuffer();
                await ghTaggerUploadFile({ rid, kind: 'source', fileName: file.name, dataBase64: arrayBufferToBase64(buf) });
                setFilesArchived(a => ({ ...a, source: true, sourceErr: '' }));
              }
            } catch { /* 原件归档失败不阻断 */ }
            await archiveResultFile({ rid }, res, b.total || res.length);
          }
        }).catch(() => {});
      }
    } catch (e) {
      setError('打标失败：' + (e instanceof Error ? e.message : String(e)));
      // 已逐位上云的数据不受影响：等待在途上传结束，批次保留为「进行中」，历史里可下载已保存部分
      await uploadChainRef.current.catch(() => {});
    } finally {
      setTagging(false);
      if (progTimer.current) { clearInterval(progTimer.current); progTimer.current = null; }
      setTagProg(null);
      void fetchResume(); // 刷新断点列表（已完成的消失，失败的保留可再续跑）
    }
  }

  // v4.2.0：放弃本地断点（云端批次记录/历史不受影响）
  async function discardResume(batchId: string) {
    resumeTriedRef.current.add(batchId); // 防止自动续跑再触发
    try {
      await taggerFetch('/resume/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      }, 5000);
    } catch { /* 网络失败也从界面移除 */ }
    setResumeBatches(bs => bs.filter(b => b.batchId !== batchId));
  }

  // v4.2.0：打开工作台且已登录时，自动续跑最近一个未完成批次（无需手动找进度）
  useEffect(() => {
    if (!online || tagging || !resumeBatches.length) return;
    const cp = resumeBatches[0];
    if (!health?.loggedIn) return;
    if (resumeTriedRef.current.has(cp.batchId)) return;
    resumeTriedRef.current.add(cp.batchId);
    void startTag({ resume: cp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, tagging, resumeBatches, health?.loggedIn]);

  const steps = [
    { n: 1, icon: Package, t: '下载并运行本地工具', d: '下载 Mac / Windows 一键启动包，解压后双击运行（已内置运行依赖，解压即用、无需联网安装；Mac 免装 Node，首次运行自动就绪；Windows 需 Node.js 18+；均需 Chrome/Edge）' },
    { n: 2, icon: LogIn, t: '点「登录星图」扫码（仅需一次）', d: '保持工具窗口打开，点下方按钮会自动打开本机 Chrome/Edge 扫码；企业电脑禁弹窗时网页内直接显示二维码，用手机抖音扫码即可' },
    { n: 3, icon: TagIcon, t: '上传达人名单 → 开始打标', d: '准备含达人ID或昵称列的 Excel/CSV，拖到上传区，点「开始打标」；工具经服务商广场进达人「创作能力」自动抓取前三条视频，抽帧做视频画面AI分析（看画面/场景/口播），输出五大人设/内容/风格/场景/行业标签、主要带货类目、爆款方向与打标置信度，并按标杆/主力/潜力/储备分层（弹滑块验证码时在浏览器窗口手动拖一下即可）' },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 切换模式
          </button>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-btn shrink-0">
            <TagIcon className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-ink-900 flex items-center gap-2">
              🏷️ 服务商达人自助打标
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">本机运行 · 数据不外传</span>
            </h1>
            <p className="text-[11px] text-ink-400">用你本机已登录的星图账号，批量给达人名单评级分层</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        {/* 新工具入口：只需补全身份（抖音号/星图ID/名称互查、不打分） */}
        {onSwitchIdLookup && (
          <button type="button" onClick={onSwitchIdLookup}
            className="mb-4 w-full rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 flex items-center gap-3 hover:border-blue-300 hover:bg-blue-50 transition text-left">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 text-base">🪪</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-blue-900 flex items-center gap-2">星图达人本地化查询/匹配
                <span className="text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 px-1.5 py-0.5 rounded">只查身份 · 不评级</span>
              </span>
              <span className="block text-[11.5px] text-blue-800/80 mt-0.5">名单只有抖音号 / 星图ID / 达人名称中的部分信息？点我批量补全三元组，支持多维表格一键写回与断点续跑 →</span>
            </span>
          </button>
        )}

        {/* 本地工具连接状态 */}
        <div className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 flex-wrap ${online ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'}`}>
          {online === null ? (
            <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /><span className="text-xs text-gray-500">正在检测本地工具…</span></>
          ) : online ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-800">✅ 本地工具已连接</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${health?.loggedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {health?.loggedIn ? '星图已登录' : (loginPending ? '等待扫码登录中…' : '星图未登录 · 请点下方按钮登录')}
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="text-xs font-bold text-rose-800">❌ 本地工具未启动</span>
              <span className="text-[11px] text-rose-700/80">请先按下方步骤运行 <code className="bg-rose-100 px-1 rounded">xc-tagger.exe</code> 或 <code className="bg-rose-100 px-1 rounded">node xc-tagger.js</code></span>
            </>
          )}
          <button type="button" onClick={refreshHealth}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-line text-[11px] font-bold text-ink-700 hover:border-brand-300 transition">
            <RefreshCw className="w-3 h-3" /> 重新检测
          </button>
        </div>

        {/* v4.2.0 断点续跑：检测到本机未完成批次，可从断点继续 */}
        {resumeBatches.length > 0 && !tagging && (
          <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 p-4">
            <p className="text-[13px] font-bold text-indigo-900 flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-indigo-600" />
              检测到 {resumeBatches.length} 个未完成的打标批次，可从断点继续（无需重新上传）
            </p>
            <div className="space-y-3">
              {resumeBatches.map(cp => {
                const pct = cp.total ? Math.round((cp.done / cp.total) * 100) : 0;
                return (
                  <div key={cp.batchId} className="rounded-xl bg-white border border-indigo-100 p-3.5">
                    <div className="flex items-center gap-2 flex-wrap text-[12px]">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-bold text-ink-900">{cp.fileName || '未命名名单'}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">
                        开始于 {new Date(cp.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-indigo-100 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: pct + '%' }} />
                      </div>
                      <span className="text-[12px] font-bold text-indigo-800 shrink-0">{cp.done}/{cp.total}（{pct}%）</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => startTag({ resume: cp })}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-bold shadow-btn hover:bg-indigo-700 active:scale-[0.98] transition">
                        ▶️ 继续打标（剩 {cp.total - cp.done} 位）
                      </button>
                      <button type="button" onClick={() => discardResume(cp.batchId)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-line text-[12px] font-bold text-gray-500 hover:border-rose-300 hover:text-rose-600 transition">
                        <Trash2 className="w-3.5 h-3.5" /> 放弃本地断点
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11.5px] text-indigo-900/70">
              ℹ️ 已登录状态下将自动继续最近一个批次；中途关闭电脑或工具也没关系，下次打开工作台从此处接着跑，云端记录按同一批次持续留痕。
            </p>
          </div>
        )}

        {/* 登录星图（v3.2：优先系统 Chrome/Edge 弹窗扫码；企业环境自动降级网页二维码） */}
        {online && health && !health.loggedIn && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <p className="text-[13px] font-bold text-emerald-900 flex items-center gap-2 mb-2">
              <LogIn className="w-4 h-4 text-emerald-600" /> 🎯 第二步 · 登录星图（仅需一次）
            </p>
            <p className="text-[12px] text-emerald-900/90 leading-relaxed mb-3">
              点击下方按钮，工具会优先<b>打开本机系统 Chrome / Edge 窗口</b>登录；若企业电脑禁止自动启动浏览器，会自动改为
              <b>在下方直接显示登录二维码</b>，用<b>手机抖音 App 扫码</b>即可。登录状态保存在本机，下次免登录，<b>无需插件、无需复制 Cookie。</b>
            </p>

            {!loginPending ? (
              <button type="button" onClick={startLogin}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-btn hover:bg-emerald-700 active:scale-[0.98] transition">
                <LogIn className="w-4 h-4" /> 登录星图
              </button>
            ) : qr?.qr && qr.status !== 'expired' ? (
              /* 无头兜底：网页内直接展示二维码，手机抖音扫码 */
              <div className="flex flex-col items-center gap-2 rounded-xl bg-white border border-emerald-200 p-4">
                <p className="text-[13px] font-bold text-emerald-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> ⏳ 等待扫码…（{loginElapsed}s / 最多 3 分钟）
                </p>
                <img src={qr.qr} alt="星图登录二维码" className="w-44 h-44 rounded-lg border border-line bg-white p-1" />
                <p className="text-[12px] font-bold text-emerald-800">打开 <b>手机抖音 App</b> → 扫一扫，扫描上方二维码登录</p>
                <p className="text-[11px] text-emerald-900/60">企业环境无法自动启动系统浏览器，已改用网页二维码兜底{qr.browserName ? `（${qr.browserName}）` : ''}。</p>
                <button type="button" onClick={cancelLogin}
                  className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-[12px] font-bold hover:bg-emerald-100 transition">
                  <X className="w-3.5 h-3.5" /> 取消
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[13px] font-bold text-emerald-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {qr?.status === 'expired' ? '二维码已过期' : qr?.status === 'starting' ? '正在打开浏览器…' : '⏳ 等待扫码中…'}（已等待 {loginElapsed}s / 最多 3 分钟）
                </p>
                <p className="text-[11.5px] text-emerald-900/70">
                  {qr?.status === 'expired'
                    ? '登录二维码/窗口已超时，请取消后重新点「登录星图」。'
                    : qr?.mode === 'cdp'
                      ? `请在本机刚打开的${qr.browserName ? `「${qr.browserName}」` : '系统 Chrome / Edge'}窗口里完成扫码登录，登录成功后窗口会自动关闭。`
                      : '正在准备登录页面，稍后若未弹出浏览器窗口，会自动在此显示登录二维码。'}
                </p>
                <button type="button" onClick={cancelLogin}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-[12px] font-bold hover:bg-emerald-100 transition">
                  <X className="w-3.5 h-3.5" /> 取消
                </button>
              </div>
            )}

            {loginMsg && (
              <p className={`mt-2.5 text-[12px] font-bold flex items-start gap-1.5 ${loginMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
                {loginMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 shrink-0 mt-px" />}
                {loginMsg.text}
              </p>
            )}
          </div>
        )}

        {/* 步骤说明 */}
        <div className="mt-5">
          <p className="text-[13px] font-bold text-ink-900 mb-3">使用步骤</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {steps.map(s => (
              <div key={s.n} className="flex items-start gap-3 rounded-2xl bg-white border border-line p-3.5 shadow-card">
                <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                  <s.icon className="w-4 h-4 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-ink-900">{s.n}. {s.t}</p>
                  <p className="text-[11.5px] text-ink-500 mt-0.5 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 工具下载 */}
        <div className="mt-5 rounded-2xl bg-white border border-line p-4 shadow-card">
          <p className="text-[13px] font-bold text-ink-900 flex items-center gap-2 mb-2.5">
            <Download className="w-4 h-4 text-brand-600" /> 第一步 · 下载本地工具
          </p>
          <p className="text-[12px] font-bold text-ink-900 mb-1.5">⚡ 一键启动包（v4.2.0，解压即用 · 断点续跑 · Mac 免装 Node）</p>
          <div className="grid grid-cols-2 gap-2">
            <a href={MAC_ZIP_URL} download="xc-tagger-mac-v1.zip"
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white px-3 py-2.5 text-[12.5px] font-bold shadow-btn hover:bg-black transition">
              <Apple className="w-4 h-4" /> Mac 一键启动包
            </a>
            <a href={WIN_ZIP_URL} download="xc-tagger-win-v1.zip"
              className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white px-3 py-2.5 text-[12.5px] font-bold shadow-btn hover:bg-sky-700 transition">
              <Monitor className="w-4 h-4" /> Windows 一键启动包
            </a>
          </div>
          <p className="text-[11px] text-ink-500 mt-1.5 leading-relaxed flex items-start gap-1">
            <Info className="w-3.5 h-3.5 mt-px shrink-0 text-brand-500" />
            <span>解压后双击 <b>start-xc-tagger.command</b>（Mac）或 <b>start-xc-tagger.bat</b>（Windows）即可运行。启动包已内置全部运行依赖，<b>无需联网安装</b>；使用电脑已装的 Chrome / Edge（Windows 10/11 自带 Edge）。<b>Mac 无需安装 Node.js</b>（系统没有时首次运行自动下载，约 37MB、免管理员密码）；Windows 需安装 <a href="https://nodejs.org" target="_blank" rel="noreferrer" className="text-brand-600 underline">Node.js 18+</a>。</span>
          </p>
          <p className="text-[10.5px] text-ink-400 mt-1 leading-relaxed">
            按钮下载失败/打不开？换备用链接（GitHub 官方源）：
            <a href={MAC_ZIP_FALLBACK} className="text-brand-600 underline ml-1">Mac</a>
            <span className="mx-0.5">·</span>
            <a href={WIN_ZIP_FALLBACK} className="text-brand-600 underline">Windows</a>
          </p>

          <p className="text-[12px] font-bold text-ink-900 mt-3 mb-1.5">🧰 或下载通用包（命令行启动）</p>
          <a href={ZIP_URL} download="xc-tagger-v1.zip"
            className="flex items-center gap-3 w-full rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white px-4 py-3 shadow-btn hover:from-rose-600 hover:to-orange-600 transition">
            <span className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </span>
            <span className="text-left">
              <span className="block text-[13.5px] font-bold">📦 通用工具包（xc-tagger-v1.zip · Mac+Windows）</span>
              <span className="block text-[11px] text-white/85 mt-0.5">内置全部运行依赖，解压即用、无需联网安装（约 8.8MB）</span>
            </span>
          </a>
          <p className="text-[10.5px] text-ink-400 mt-1">
            通用包备用链接（GitHub 官方源）：
            <a href={ZIP_FALLBACK} className="text-brand-600 underline ml-1">xc-tagger-v1.zip</a>
          </p>
          <p className="text-[11.5px] font-semibold text-ink-500 mt-3 mb-1.5">或分别下载单个文件：</p>
          <div className="flex flex-wrap gap-2">
            {TOOL_FILES.map(f => (
              <a key={f.href} href={f.href} download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-2 border border-line-soft text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
                <FileSpreadsheet className="w-3.5 h-3.5" /> {f.label}
              </a>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 mt-2.5 leading-relaxed">
            单个源文件仅供高级用户自行 <code className="bg-gray-100 px-1 rounded">npm install</code> 部署使用；普通服务商请直接下载上面的一键启动包，解压即用。Windows 免 Node 的 exe 包可联系渠道同学获取。
          </p>
        </div>

        {/* 上传区 */}
        <div className="mt-5 rounded-2xl bg-white border border-line p-4 shadow-card">
          <p className="text-[13px] font-bold text-ink-900 flex items-center gap-2 mb-2.5">
            <UploadCloud className="w-4 h-4 text-brand-600" /> 第三步 · 上传达人名单（Excel / CSV）
            <a href={TEMPLATE_URL} download="xc-influencer-template.xlsx"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11.5px] font-bold hover:bg-emerald-100 transition">
              <FileDown className="w-3.5 h-3.5" /> 下载达人名单模板
            </a>
          </p>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0] || null); }}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragOver ? 'border-rose-400 bg-rose-50' : 'border-line-soft bg-surface-2/50 hover:border-rose-300'}`}
          >
            <UploadCloud className="w-7 h-7 mx-auto text-rose-400 mb-2" />
            <p className="text-[12.5px] font-semibold text-ink-800">点击选择文件，或将 Excel/CSV 拖到此处</p>
            <p className="text-[11px] text-ink-400 mt-1">表头含「星图ID」「达人名称」「抖音号」任一识别列即可（抖音号列可空）；.xlsx / .xls / .csv</p>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => handleFile(e.target.files?.[0] || null)} />
          </div>

          {file && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-700 flex-wrap">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold">{file.name}</span>
              {parsing && <span className="text-ink-400 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 正在解析…</span>}
              {!parsing && items.length > 0 && <span className="text-emerald-700 font-bold">识别到 {items.length} 位达人</span>}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-[12px] text-rose-800 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2.5 flex-wrap">
            <button type="button" onClick={() => startTag()} disabled={!items.length || tagging || online === false}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white text-[13px] font-bold shadow-btn hover:from-rose-600 hover:to-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {tagging ? <Loader2 className="w-4 h-4 animate-spin" /> : <TagIcon className="w-4 h-4" />}
              {tagging ? '打标进行中，请勿关闭工具窗口…' : '开始打标'}
            </button>
            {results && results.length > 0 && (
              <button type="button" onClick={() => exportResultsCsv(results)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-emerald-300 text-emerald-700 text-[13px] font-bold hover:bg-emerald-50 transition">
                <Download className="w-4 h-4" /> 导出结果 CSV（{results.length}）
              </button>
            )}
            {results && results.some(r => r.found) && (
              <button type="button" onClick={() => exportMyLibrary(results)}
                title="导出后即为你专属的存量达人库，可在下方「我的达人库」重新上传使用"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[13px] font-bold shadow-btn hover:from-violet-600 hover:to-fuchsia-600 transition">
                <Database className="w-4 h-4" /> 导出我的达人库（CSV）
              </button>
            )}
          </div>

          {/* v3.8.1：实时进度条（每处理完一位达人更新） */}
          {tagging && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <span className="text-[13px] font-bold text-amber-900">
                  {tagProg && tagProg.total > 0
                    ? <>正在处理第 <span className="text-rose-600">{Math.min((tagProg.done || 0) + 1, tagProg.total)}</span> / {tagProg.total} 位达人…</>
                    : '正在启动打标…'}
                </span>
                <span className="text-[11px] text-amber-700 ml-auto">
                  已完成 {tagProg?.done || 0} / {tagProg?.total || items.length}（{tagProg && tagProg.total > 0 ? Math.min(100, Math.round(((tagProg.done || 0) / tagProg.total) * 100)) : 0}%）
                </span>
              </div>
              <div className="mt-2.5 h-2 rounded-full bg-amber-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                  style={{ width: `${tagProg && tagProg.total > 0 ? Math.min(100, Math.round(((tagProg.done || 0) / tagProg.total) * 100)) : 2}%` }} />
              </div>
              <p className="mt-2 text-[11.5px] text-amber-800 flex items-center gap-1.5 flex-wrap">
                {tagProg?.current && <span className="font-semibold bg-white/70 border border-amber-200 rounded px-1.5 py-0.5">当前：{tagProg.current}</span>}
                <span>{tagProg?.phase || '排队中…'}</span>
              </p>
              <p className="mt-1.5 text-[11px] text-amber-700/90">
                每位达人需进主页抓资料、抓前 3 条视频并抽帧做画面 AI 分析，通常每位 20–40 秒，批量请耐心等待；期间不要关闭弹出的浏览器窗口。
              </p>
              {cloudSave && (
                <div className="mt-2.5 flex items-center gap-2 flex-wrap rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  {cloudSave.err
                    ? <><XCircle className="w-4 h-4 text-amber-600 shrink-0" /><span className="text-[11.5px] font-semibold text-amber-700">{cloudSave.err}</span></>
                    : cloudSave.saved >= cloudSave.total && cloudSave.total > 0
                      ? <><CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" /><span className="text-[11.5px] font-bold text-sky-800">已全部保存到云端（{cloudSave.saved}/{cloudSave.total} 条），绑定当前登录账号，可在下方历史随时下载</span></>
                      : <><Database className={`w-4 h-4 text-sky-600 shrink-0 ${cloudSave.syncing ? 'animate-pulse' : ''}`} /><span className="text-[11.5px] font-semibold text-sky-800">已保存 <span className="text-sky-600">{cloudSave.saved}</span>/{cloudSave.total} 条到云端{cloudSave.syncing ? '（同步中…）' : ''}</span></>}
                </div>
              )}
              {(filesArchived.source || filesArchived.sourceErr) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  {filesArchived.source
                    ? <><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span className="text-[11.5px] font-semibold text-emerald-800">原始名单已存入台账附件（{file?.name || '上传文件'}）</span></>
                    : <><XCircle className="w-4 h-4 text-amber-600 shrink-0" /><span className="text-[11.5px] font-semibold text-amber-700">{filesArchived.sourceErr}</span></>}
                </div>
              )}
              <p className="mt-1.5 text-[10.5px] text-amber-700/80">
                每打完一位达人立即上传云端台账（绑定你的服务商名称+姓名+手机号）；即使中途断网或关闭页面，已保存的达人也不会丢失，下次登录可在「我的打标历史」直接下载。
              </p>
            </div>
          )}
        </div>
        {results && results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <p className="text-[13px] font-bold text-ink-900">打标结果（{results.length} 位）</p>
              {recorded && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> 全量结果已自动上云（可在下方历史里再下载）
                </span>
              )}
              {recorded && (filesArchived.result
                ? <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" title="完整结果 CSV（25列）已作为附件存入台账">
                    <CheckCircle2 className="w-3 h-3" /> 结果 CSV 已存台账附件
                  </span>
                : filesArchived.resultErr
                  ? <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" title={filesArchived.resultErr}>
                      <XCircle className="w-3 h-3" /> 结果文件未归档
                    </span>
                  : <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-400 bg-surface-2 border border-line px-2 py-0.5 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" /> 结果文件归档中…
                    </span>)}
              {summary && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {['标杆', '主力', '潜力', '储备'].map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: TIER_STYLE[t].bg, color: TIER_STYLE[t].fg }}>
                      {t === '标杆' ? '🥇' : t === '主力' ? '🥈' : t === '潜力' ? '🥉' : '⚪'} {summary[t] || 0}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-white border border-line shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-surface-2 text-ink-500 text-left">
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">达人</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">分层</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">得分</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">标签</th>
                      <th className="px-3 py-2.5 font-semibold">打标依据 / 建议</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const st = TIER_STYLE[r.tier] || TIER_STYLE['储备'];
                      const inLib = r.found && !!r.id && libIdSet.has(String(r.id).trim());
                      const confColor = r.confidence === '高' ? 'text-emerald-600 bg-emerald-50'
                        : r.confidence === '中' ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-100';
                      return (
                        <tr key={i} className="border-t border-line-soft align-top">
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <p className="font-bold text-ink-900 flex items-center gap-1.5">
                              {r.name || '(未命名)'}
                              {inLib && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold whitespace-nowrap" title="已在你的我的达人库中">📚 在库</span>}
                            </p>
                            {!r.found && <p className="text-[10.5px] text-rose-500">未检索到</p>}
                            <p className="text-[10.5px] text-ink-400 font-mono">{r.id || '—'}</p>
                            {r.douyin && <p className="text-[10.5px] text-ink-500 font-mono">🎵 {r.douyin}</p>}
                            {r.found && (r.videoLinks || []).length > 0 && (
                              <p className="mt-1 flex items-center gap-1.5">
                                {(r.videoLinks || []).slice(0, 3).map((u, k) => (
                                  <a key={k} href={u} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 whitespace-nowrap">
                                    <ExternalLink className="w-3 h-3" />视频{k + 1}
                                  </a>
                                ))}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                              style={{ background: st.bg, color: st.fg }}>
                              {r.medal} {r.tier}
                            </span>
                            {r.found && r.confidence && (
                              <p className={`mt-1 text-[10.5px] px-1.5 py-0.5 rounded text-center font-bold ${confColor}`}>
                                置信度·{r.confidence}
                              </p>
                            )}
                            {r.found && r.visionTag && (
                              <p className="mt-1 text-[10.5px] px-1.5 py-0.5 rounded text-center font-bold text-indigo-600 bg-indigo-50">
                                🎬 视频画面AI打标
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-ink-900">{r.score}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {(r.tags || []).map((tg, j) => (
                                <span key={j} className="text-[10.5px] px-1.5 py-0.5 rounded bg-gray-100 text-ink-600 whitespace-nowrap">{tg}</span>
                              ))}
                            </div>
                            {r.found && ((r.style || []).length > 0 || (r.scene || []).length > 0) && (
                              <p className="mt-1 text-[10.5px] text-ink-500 leading-relaxed max-w-[180px]">
                                {(r.style || []).length > 0 && <>🎨 {(r.style || []).join('、')}<br /></>}
                                {(r.scene || []).length > 0 && <>📍 {(r.scene || []).join('、')}</>}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-ink-500 leading-relaxed min-w-[260px] whitespace-pre-line">{r.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* 云端打标历史：绑定服务商登录账号，换机/忘下载可直接找回全量结果 */}
        <div className="mt-5 rounded-2xl bg-white border border-sky-200 shadow-card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <p className="text-[13px] font-bold text-ink-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600" /> 我的打标历史（云端，绑定当前登录账号）
            </p>
            <button type="button" onClick={() => void loadHist()} disabled={histLoading}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-60">
              <RefreshCw className={`w-3 h-3 ${histLoading ? 'animate-spin' : ''}`} /> 刷新
            </button>
          </div>
          <p className="text-[11px] text-ink-500 leading-relaxed mb-3">
            每次打标完成后，<b className="text-sky-700">全量结果会自动上传并绑定你的登录账号（服务商名称+姓名+手机号）</b>。
            换机或忘记下载时，直接在这里点「下载全量 CSV」即可，无需重新上传名单打标。
          </p>
          {histErr && <p className="text-[11px] text-danger-ink mb-2">{histErr}</p>}
          {hist === null && !histErr && histLoading && (
            <p className="text-[11px] text-ink-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> 正在加载云端历史…</p>
          )}
          {hist && hist.length === 0 && (
            <p className="text-[11px] text-ink-400">暂无历史打标记录。完成一次打标后会自动出现在这里。</p>
          )}
          {hist && hist.length > 0 && (
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-surface-2 text-ink-500 text-left">
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">文件</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">上传时间</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">上传/完成</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">状态</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">分层</th>
                      <th className="px-3 py-2 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map(h => (
                      <tr key={h.rid} className="border-t border-line align-middle">
                        <td className="px-3 py-2 max-w-[220px]" title={h.fileName}>
                          <div className="truncate">{h.fileName || '（未命名名单）'}</div>
                          <div className="flex gap-1 mt-0.5">
                            {h.hasSource && <span className="text-[9.5px] px-1.5 py-px rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-semibold whitespace-nowrap" title="原始名单已作为附件存入台账">📎 原件</span>}
                            {h.hasResult && <span className="text-[9.5px] px-1.5 py-px rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold whitespace-nowrap" title="打标结果 CSV 已作为附件存入台账">📊 结果表</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-ink-500">{h.at || (h.ts ? new Date(h.ts).toLocaleString('zh-CN', { hour12: false }) : '-')}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{h.total} / <b className="text-sky-700">{h.foundCount || 0}</b></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.status === '进行中'
                            ? <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">进行中（可下载已保存部分）</span>
                            : <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">已完成</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                          {[['标杆', '🥇'], ['主力', '🥈'], ['潜力', '🥉'], ['储备', '⚪']].map(([k, ic]) =>
                            <span key={k} className="mr-1.5">{ic}{h.summary?.[k] ?? 0}</span>)}
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => void downloadHist(h)} disabled={downloadingRid === h.rid}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 whitespace-nowrap">
                            {downloadingRid === h.rid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            下载全量 CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* v3.7.0 我的达人库：上传/查看/清空本地存量达人库 */}
        <div className="mt-5 rounded-2xl bg-white border border-violet-200 shadow-card p-4">
          <p className="text-[13px] font-bold text-ink-900 flex items-center gap-2 mb-1.5">
            <FolderOpen className="w-4 h-4 text-violet-600" /> 📂 我的达人库（本地存量达人库）
          </p>
          <p className="text-[11px] text-ink-500 leading-relaxed mb-3">
            打标完成后点上方「<b className="text-violet-600">导出我的达人库（CSV）</b>」即可沉淀你专属的存量达人库；把导出的
            <code className="bg-gray-100 px-1 rounded mx-0.5">我的星川达人库_日期.csv</code> 在下方上传，会保存在<b>本机浏览器</b>，
            后续打标时自动比对并标记「📚 在库」达人。<br />
            若达人名单<b>已在别处完成打标</b>，上传到本机后点
            <b className="text-sky-600">「☁️ 一键同步云端」</b>即可直接同步到云端台账（绑定当前登录账号），
            无需再跑工具重新打标；同步后<b>「服务商适配分析」即可读到达人库</b>。
          </p>
          <input ref={libInput} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadLib(f); e.target.value = ''; }} />
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => libInput.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-[12.5px] font-bold hover:bg-violet-700 transition">
              <FileUp className="w-4 h-4" /> 上传存量达人 CSV
            </button>
            {myLib.length > 0 && (
              <button type="button" onClick={() => void syncMyLibrary()} disabled={!!libSync?.syncing}
                title="把本机已打标达人库同步为一个云端批次，绑定服务商名称+姓名+手机号；服务商适配分析随后即可读取"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[12.5px] font-bold hover:from-sky-600 hover:to-cyan-600 transition disabled:opacity-60">
                {libSync?.syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {libSync?.syncing ? `同步中 ${libSync.done}/${libSync.total}…` : '☁️ 一键同步云端'}
              </button>
            )}
            {myLib.length > 0 && (
              <button type="button" onClick={() => downloadCsv(`我的星川达人库_${todayStamp()}.csv`, myLib.map(libRowToCsvValues))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-violet-300 text-violet-700 text-[12.5px] font-bold hover:bg-violet-50 transition">
                <Download className="w-4 h-4" /> 下载当前达人库（{myLib.length}）
              </button>
            )}
            {myLib.length > 0 && (
              <button type="button" onClick={clearMyLib}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-500 text-[12px] font-bold hover:bg-gray-50 transition">
                <Trash2 className="w-4 h-4" /> 清空重置
              </button>
            )}
          </div>
          {libMsg && (
            <p className={`mt-2 text-[11.5px] font-bold ${libMsg.ok ? 'text-emerald-600' : 'text-rose-500'}`}>{libMsg.text}</p>
          )}
          {libSync && (libSync.syncing || libSync.ok || libSync.err) && (
            <div className={`mt-2 rounded-xl border px-3 py-2.5 ${libSync.err ? 'border-rose-200 bg-rose-50' : libSync.ok ? 'border-emerald-200 bg-emerald-50' : 'border-sky-200 bg-sky-50'}`}>
              {libSync.syncing && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                    <span className="text-[12px] font-bold text-sky-800">
                      ☁️ 正在同步到云端台账 <span className="text-sky-600">{libSync.done}</span>/{libSync.total}
                    </span>
                    <span className="ml-auto text-[11px] text-sky-700">
                      {libSync.total > 0 ? Math.round((libSync.done / libSync.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-sky-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-500 transition-all duration-300"
                      style={{ width: `${libSync.total > 0 ? Math.min(100, Math.round((libSync.done / libSync.total) * 100)) : 0}%` }} />
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-sky-700/90">同步期间请勿关闭页面；分批上传，每批 80 位，已完成的部分不会丢失。</p>
                </>
              )}
              {libSync.ok && !libSync.syncing && (
                <p className="text-[12px] font-bold text-emerald-800 leading-relaxed">
                  ✅ 已成功同步 {libSync.total} 位达人到云端台账（绑定当前登录账号服务商名称+姓名+手机号）。
                  刷新<b>「服务商适配分析」</b>即可读到达人库；也可在上方「我的打标历史」随时下载全量 CSV。
                </p>
              )}
              {libSync.err && (
                <p className="text-[12px] font-bold text-rose-700 leading-relaxed">
                  ❌ 同步中断：{libSync.err.slice(0, 80)}。已上传的达人不会丢失，网络恢复后再次点击「一键同步云端」即可（将生成新的云端批次）。
                </p>
              )}
            </div>
          )}
          {myLib.length > 0 && (
            <div className="mt-3 max-h-[280px] overflow-auto rounded-xl border border-line-soft">
              <table className="w-full text-[11.5px]">
                <thead className="bg-violet-50 sticky top-0">
                  <tr className="text-left text-ink-500">
                    <th className="px-2.5 py-1.5 font-bold">达人</th>
                    <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">分层</th>
                    <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">得分</th>
                    <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">置信度</th>
                    <th className="px-2.5 py-1.5 font-bold">主要标签 / 带货类目</th>
                    <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">视频</th>
                  </tr>
                </thead>
                <tbody>
                  {myLib.slice().sort((a, b) => b.score - a.score).map((r, i) => (
                    <tr key={i} className="border-t border-line-soft align-top">
                      <td className="px-2.5 py-1.5 whitespace-nowrap">
                        <p className="font-bold text-ink-900">{r.name || '(未命名)'}</p>
                        <p className="text-[10px] text-ink-400 font-mono">{r.id || '—'}</p>
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap font-bold">{({ 标杆: '🥇', 主力: '🥈', 潜力: '🥉' } as Record<string, string>)[r.tier] || '⚪'} {r.tier || '—'}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap font-mono font-bold">{r.score}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{r.confidence || '—'}</td>
                      <td className="px-2.5 py-1.5 text-ink-500 max-w-[220px]">
                        <p className="leading-snug">{[...r.persona, ...r.forms, ...r.industry].slice(0, 5).join('、') || '—'}</p>
                        {r.mainCategory && <p className="text-[10px] text-violet-600 mt-0.5">带货：{r.mainCategory}{r.hotDirection ? `｜${r.hotDirection}` : ''}</p>}
                      </td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">
                        {r.videoLinks.length > 0 ? r.videoLinks.map((u, k) => (
                          <a key={k} href={u} target="_blank" rel="noreferrer"
                            className="inline-block mr-1 text-[10.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
                            视频{k + 1}
                          </a>
                        )) : <span className="text-ink-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 隐私说明 */}
        <div className="mt-5 rounded-2xl bg-sky-50 border border-sky-200 px-4 py-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-sky-800 leading-relaxed">
            所有抓取与评级都在<b>你自己的电脑</b>上完成：网页只和本机 <code className="bg-sky-100 px-1 rounded">127.0.0.1:7842</code> 通信；
            仅点「登录星图」时会弹出 Chrome 窗口供扫码，打标时浏览器后台无头运行。登录态保存在本机工具目录的 <code className="bg-sky-100 px-1 rounded">.xc-cookies.json</code>，<b>不上传、不落库</b>；
            本地服务仅对 GitHub Pages 与本机页面开放跨域。删除该文件即完全退出登录。
          </p>
        </div>
      </main>
    </div>
  );
}
