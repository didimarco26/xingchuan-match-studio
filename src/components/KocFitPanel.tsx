// ============================================================
// 💄 KOC 契合度论证（douyin-koc-beauty-match v3 网页化）· 对外工作台
//   三步流：① 商品链接 AI 自动分析（可选手动补充）→ ② 批量添加达人/视频链接
//   （一个商品对多位达人，服务端自动解析公开信息）→ ③ 每达人一张契合度评分卡，
//   点「查看详情」生成完整论证报告（五轴+四要素+八维+前置费+内外版Markdown）。
//   无状态 FaaS：koc_resolve_creators → koc_video_scan → koc_creator_profile
//     → koc_audience → koc_fit_report；完成后 ghTrack 落达人匹配记录专表。
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, Plus, X, Trash2, Copy, Check,
  Link2, Users, ChevronDown, RefreshCw, AlertTriangle,
  FileText, Eye, ScanSearch, Wand2, ImagePlus,
  MessageSquareText, BadgeCheck, ThumbsUp, ThumbsDown, Sparkles, Search,
  FileSpreadsheet,
} from 'lucide-react';
import { FAAS_URL, extractFromUrl, type UrlExtractResult } from '../lib/api';
import { ghTrack } from '../lib/gh';

// 达人/视频链接批量解析：独立轻量 FaaS（抖音分享页 SSR + 旧版 user/info JSON，主页链接秒抓全量）
const KOC_RESOLVE_URL = 'https://magic.solutionsuite.cn/api/faas/zz28Op0ooDw8K';
// 本机抓取助手（xc-koc-fetch）：在用户电脑上用真实 Chrome 进入抖音主页抓近期作品，
// 数据中心无法直接抓取作品列表（风控），助手是内容样本的核心通道
const KOC_LOCAL_HELPER = 'http://127.0.0.1:7844';
const KOC_HELPER_ZIP = 'https://didimarco26.github.io/xingchuan-workbench/tools/xc-koc-fetch/mac-v1.zip';

// ---------------- 数据类型（FaaS 契约） ----------------
interface VideoItem { id: number; title: string; url: string; stats: string; desc: string; frames: string[]; }
interface ScanCraft { hook?: string; visual?: string; structure?: string; product?: string; trust?: string; cta?: string; pacing?: string; template?: string; }
interface Scan { i: number; content_type: string; category_relevance: number; elements: { tag: string; presence: string; evidence: string }[]; style_tags: string[]; selling: boolean; craft: ScanCraft; summary: string; confidence: string; basis: string; }
interface Profile {
  nickname: string; primary_niche: string; secondary_niches: string[]; category_content_ratio: number;
  sample_size: number; persona_summary: string; persona_type: string; visual_style_tags: string[];
  strategy_mode: string[];
  professional_evidence: { collab_brands: string[]; store_signals: string[]; claims: string[]; template_note: string };
  monetization_signals: string;
  content_craft: Record<string, number> & { overall: number; strength: string[]; weakness: string[] };
  risk_flags: string[]; confidence: string;
  evidence_chain: Record<string, string>; data_gaps: string[];
}
interface Audience {
  age_dist: Record<string, number>; gender_ratio: { female: number; male: number };
  purchase_persona: string[]; purchase_power_level: string; beauty_consumption_tendency: string;
  audience_creator_relation: string; evidence_comments_sample: string[]; audience_confidence: string;
  evidence_chain: string; inferred_basis: string[]; data_gaps: string[];
}
interface Reason { point: string; evidence: string; weight: string; }
interface Fit {
  analysis_date: string; benchmark: string; product_name: string; creator_name: string;
  fit_score: number; verdict: string;
  axes: Record<string, { score: number; reason: string }>;
  koc_quality_case: Record<string, { point: string; evidence: string }>;
  evidence_indicators: Record<string, string>;
  trend_check: { aligned: boolean; current_form: string; why: string; opportunity: string };
  reasons_for: Reason[]; reasons_against: Reason[];
  front_fee_advice: { level: string; budget_range: string; deliverables: string[]; expected_test: string; reason: string };
  suggested_angle: string; advice_reason: string; scale_note: string; data_gaps: string[];
  benchmark_note?: string; insufficient_data?: boolean;
  report_internal_md: string; report_external_md: string;
}
interface ResolvedVideo { awemeId?: string; title: string; stats: string; url: string; }
interface ResolvedItem {
  input: string; url: string; finalUrl: string; kind: string;
  awemeId: string; secUid: string; nickname: string; bio: string;
  followers: number; likesTotal: number; worksCount: number; ipLocation: string;
  douyinId?: string; avatar?: string; needHomepage?: boolean;
  videosSource?: 'local' | 'cloud';
  videos: ResolvedVideo[]; status: 'ok' | 'video_only' | 'need_info';
}
interface ManualEntry {
  nickname: string; douyinId: string; followers: string; bio: string; observations: string;
  videos: VideoItem[]; comments: string;
}
type CPhase = 'queued' | 'scan' | 'profile' | 'audience' | 'fit' | 'done' | 'error' | 'insufficient';
interface CreatorEntry {
  id: number; raw: string; url: string;
  resolving: boolean; resolveFailed: boolean;
  resolved?: ResolvedItem;
  manual: ManualEntry;
  expanded: boolean; showAdvanced: boolean;
  phase: CPhase; error?: string; insufficientReason?: string;
  scans: Scan[] | null; profile: Profile | null; audience: Audience | null; fit: Fit | null;
}
interface ProductState {
  url: string; name: string; category: string; priceBand: string;
  coreClaims: string; targetAudience: string; tone: string; avoid: string; goal: string; source: string;
}

// ---------------- 常量 ----------------
const GOALS = ['跑量带货', '种草蓄水', '新品上市', '大促节点（双11/618）', '品牌调性'];
const GOAL_MAP: Record<string, string> = { '跑量带货': '跑量', '种草蓄水': '种草', '新品上市': '新品', '大促节点（双11/618）': '大促', '品牌调性': '品牌' };
const AXIS_LABEL: Record<string, string> = { audience_match: '受众匹配', content_match: '内容匹配', category_credibility: '品类可信度', risk: '风险控制', trend_alignment: '趋势对齐' };
const CRAFT_LABEL: Record<string, string> = { hook: '前3秒钩子', visual: '视觉/画面质感', structure: '信息结构', product: '产品展示', trust: '信任建立', cta: '转化表达', pacing: '节奏/剪辑', template: '可复制性' };
const CRAFT_ORDER = ['hook', 'visual', 'structure', 'product', 'trust', 'cta', 'pacing', 'template'];
const QC_LABEL: Record<string, { title: string; icon: string }> = {
  category_match: { title: '品类对口', icon: '🎯' },
  expertise: { title: '专业度证据', icon: '🔬' },
  persona_trust: { title: '人设信任', icon: '🤝' },
  cost_efficiency: { title: '性价比', icon: '💰' },
};
const VERDICT_META: Record<string, { label: string; cls: string; ring: string }> = {
  strong_fit: { label: '高度契合 · 建议合作', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: '#10b981' },
  possible_fit: { label: '条件合作 · 小额测试', cls: 'bg-amber-50 text-amber-700 border-amber-200', ring: '#f59e0b' },
  poor_fit: { label: '契合度不足 · 暂缓', cls: 'bg-rose-50 text-rose-700 border-rose-200', ring: '#f43f5e' },
  insufficient_data: { label: '数据不足 · 待补充', cls: 'bg-gray-100 text-ink-500 border-line', ring: '#9ca3af' },
};
const FEE_META: Record<string, { label: string; cls: string }> = {
  recommend: { label: '建议支付前置费', cls: 'bg-emerald-600 text-white' },
  conditional: { label: '建议小额前置费 + 效果对赌', cls: 'bg-amber-500 text-white' },
  not_recommend: { label: '暂不建议前置费', cls: 'bg-rose-500 text-white' },
  unknown: { label: '证据不足 · 暂无法建议', cls: 'bg-gray-200 text-ink-500' },
};
const SOURCE_LABEL: Record<string, string> = { official: '官方商品数据', history: '历史产品库命中', ai: 'AI 链接分析' };
const MAX_TOTAL_FRAMES = 12;
const DRAFT_KEY = 'xc_kocfit_draft_v2';
const inputCls = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition';
const cardCls = 'bg-white rounded-2xl border border-line shadow-card p-5';

// ---------------- 工具函数 ----------------
async function postStage<T>(stage: string, payload: Record<string, unknown>, timeoutMs = 220000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(FAAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, ...payload }), signal: ctrl.signal,
    });
  } finally { clearTimeout(timer); }
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body || body.ok !== true || !body.data) {
    throw new Error(body?.error ? String(body.error) : `服务异常（HTTP ${resp.status}）`);
  }
  return body.data as T;
}

function fmtCount(n: number): string {
  if (!n) return '';
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}

function pickUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s，,;；）)]+/);
  return m ? m[0] : '';
}

function emptyManual(): ManualEntry {
  return { nickname: '', douyinId: '', followers: '', bio: '', observations: '', videos: [], comments: '' };
}

async function fileToFrame(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片解析失败'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.62);
}

const PHASE_TEXT: Record<CPhase, string> = {
  queued: '排队中', scan: '① 识别视频美妆/个护元素…', profile: '② 生成达人画像与八维制作能力…',
  audience: '③ 推断受众美妆消费画像…', fit: '④ 五轴契合度论证与前置费建议…', done: '完成', error: '失败',
  insufficient: '内容证据不足，待补充视频',
};

const INSUFFICIENT_REASON = '只抓到主页基础资料（粉丝/简介等），缺少代表视频内容证据；五轴评估与合作结论需基于内容样本，本次不出分。请补充 1–3 条该达人的代表视频（粘贴视频链接，或展开「高级证据」填标题/口播文案并上传截图）后重新论证。';

// ================= 主组件 =================
export default function KocFitPanel({ onBack, onSwitchTool }: { onBack: () => void; onSwitchTool: (m: string) => void }) {
  const [showResult, setShowResult] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [product, setProduct] = useState<ProductState>({
    url: '', name: '', category: '', priceBand: '', coreClaims: '', targetAudience: '', tone: '', avoid: '', goal: '跑量带货', source: '',
  });
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [entries, setEntries] = useState<CreatorEntry[]>([]);
  const [resolving, setResolving] = useState(false);
  const [running, setRunning] = useState(false);
  const [helper, setHelper] = useState<'unknown' | 'on' | 'off'>('unknown');
  const helperRef = useRef<'unknown' | 'on' | 'off'>('unknown');
  const [helperMode, setHelperMode] = useState<'' | 'cdp' | 'standalone'>('');
  const [helperMsgs, setHelperMsgs] = useState<string[]>([]);
  const setHelperBoth = (v: 'unknown' | 'on' | 'off') => { helperRef.current = v; setHelper(v); };
  // 探测本机抓取助手（xc-koc-fetch）是否在运行
  const detectHelper = async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(KOC_LOCAL_HELPER + '/health', { signal: ctrl.signal });
      clearTimeout(t);
      setHelperBoth(r.ok ? 'on' : 'off');
      return r.ok;
    } catch { setHelperBoth('off'); return false; }
  };
  useEffect(() => { detectHelper(); }, []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const idSeq = useRef(1);
  const vidSeq = useRef(1);
  const entriesRef = useRef<CreatorEntry[]>(entries);
  entriesRef.current = entries;

  // 草稿恢复（剔除大数据：frames 与报告正文不持久化）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d?.product) setProduct({ ...product, ...d.product });
      if (Array.isArray(d?.entries)) {
        const restored: CreatorEntry[] = d.entries.map((e: CreatorEntry) => ({
          ...e, resolving: false, resolveFailed: !!e.resolveFailed,
          manual: { ...(e.manual || emptyManual()), videos: (e.manual?.videos || []).map((v: VideoItem) => ({ ...v, frames: [] })) },
          phase: e.phase === 'done' ? 'done' : 'queued',
          scans: e.phase === 'done' ? e.scans : null, profile: e.phase === 'done' ? e.profile : null,
          audience: e.phase === 'done' ? e.audience : null, fit: e.fit || null,
        }));
        setEntries(restored);
        if (restored.some(e => e.phase === 'done')) setShowResult(true);
      }
    } catch { /* 草稿损坏静默 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 草稿写入
  useEffect(() => {
    try {
      const slim = entries.map(e => ({
        ...e,
        manual: { ...e.manual, videos: e.manual.videos.map(v => ({ ...v, frames: [] })) },
        fit: e.fit ? { ...e.fit, report_internal_md: '', report_external_md: '' } : null,
      }));
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ product, entries: slim }));
    } catch { /* 容量超限静默 */ }
  }, [product, entries]);

  const patchProduct = (k: keyof ProductState, v: string) => setProduct(p => ({ ...p, [k]: v, source: k === 'url' ? '' : p.source }));
  const patchEntry = (id: number, patch: Partial<CreatorEntry>) =>
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const patchManual = (id: number, patch: Partial<ManualEntry>) =>
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, manual: { ...x.manual, ...patch } } : x)));

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  // ---------- Step1：商品链接 AI 自动分析 ----------
  async function parseProduct() {
    const url = product.url.trim();
    if (!url) { setParseMsg('请先粘贴商品链接（抖店/精选联盟/抖音分享口令均可）'); return; }
    setParsing(true); setParseMsg('');
    try {
      const r: UrlExtractResult | null = await extractFromUrl(url);
      if (!r || (!r.productName && !r.category)) throw new Error('未识别到商品信息，可直接在下方手动填写名称与类目');
      setProduct(p => ({
        ...p,
        url: r.url || p.url,
        name: r.productName || p.name,
        category: r.category || p.category,
        priceBand: r.price ? `约${r.price}元` : p.priceBand,
        coreClaims: (r.sellingPoints || '').split('/').map(s => s.trim()).filter(Boolean).join('、'),
        targetAudience: r.targetAudience || p.targetAudience,
        tone: (r.usageScene || '').split('/').map(s => s.trim()).filter(Boolean).slice(0, 2).join('、'),
        source: r.source || 'ai',
      }));
      setShowExtra(false);
    } catch (e: any) {
      setParseMsg(e?.message || '商品解析失败，可手动填写');
      setShowExtra(true);
    } finally { setParsing(false); }
  }

  // ---------- Step2：链接收集 + 批量解析 ----------
  // 通用：从一批文本（粘贴行 / Excel 单元格）中提取抖音链接并追加到达人列表（不覆盖已有）
  function addCreatorsFromTexts(texts: string[], allowManualLine = false): number {
    const found: { raw: string; url: string }[] = [];
    texts.forEach((text0, idx) => {
      const line = String(text0 || '').trim();
      if (!line) return;
      const urls = line.match(/https?:\/\/[^\s，,;；）)]+/g) || [];
      if (urls.length) urls.forEach(u => found.push({ raw: line, url: u.replace(/[.。]+$/, '') }));
      else if (allowManualLine && texts.length === 1 && idx === 0) found.push({ raw: line, url: '' });
    });
    if (!found.length) return 0;
    const exist = new Set(entriesRef.current.map(e => e.url || e.raw));
    const seen = new Set<string>();
    const add: CreatorEntry[] = [];
    for (const f of found) {
      const key = f.url || f.raw;
      if (exist.has(key) || seen.has(key)) continue;
      seen.add(key);
      add.push({
        id: idSeq.current++, raw: f.raw, url: f.url, resolving: false, resolveFailed: false,
        manual: emptyManual(), expanded: false, showAdvanced: false,
        phase: 'queued', scans: null, profile: null, audience: null, fit: null,
      });
    }
    if (add.length) setEntries(prev => [...prev, ...add]);
    return add.length;
  }

  function addLinks() {
    const text = linkText.trim();
    if (!text) return;
    const lines = text.split(/\n+/);
    const n = addCreatorsFromTexts(lines, true);
    if (!n) { showToast('未发现新链接（可能已在列表中）'); return; }
    setLinkText('');
    showToast(`已追加 ${n} 位达人`);
  }

  // Excel/CSV 批量导入：遍历所有工作表单元格文本与超链接，抽取达人/视频链接
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  async function onExcelChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const texts: string[] = [];
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws['!ref']) continue;
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= Math.min(range.e.r, 2000); r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) continue;
            if (typeof cell.v === 'string') texts.push(cell.v);
            else if (cell.v != null) texts.push(String(cell.v));
            const target = (cell as any).l?.Target;
            if (target) texts.push(String(target));
          }
        }
      }
      const n = addCreatorsFromTexts(texts, false);
      if (!n) showToast('表格里未发现抖音达人/视频链接（可能已全部在列表中）');
      else showToast(`已从《${file.name}》追加 ${n} 位达人，点「开始论证」会自动解析`);
    } catch (e) {
      showToast('Excel 解析失败，请确认是 .xlsx/.xls/.csv 文件');
    } finally { setImporting(false); }
  }

  function addManualCreator() {
    const id = idSeq.current++;
    setEntries(prev => [...prev, {
      id, raw: '', url: '', resolving: false, resolveFailed: false, manual: emptyManual(),
      expanded: true, showAdvanced: false, phase: 'queued', scans: null, profile: null, audience: null, fit: null,
    }]);
  }

  function removeEntry(id: number) {
    setEntries(prev => prev.filter(x => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  async function resolveAll() {
    const targets = entriesRef.current.filter(e => e.url && !e.resolved && !e.resolving);
    if (!targets.length) return;
    setResolving(true);
    setHelperMsgs([]);
    const norm = (s: string) => (s.match(/https?:\/\/[^\s，,;；]+/)?.[0] || s).trim().replace(/[.。]+$/, '');
    const removeIds: number[] = []; let okN = 0; let softN = 0;
    try {
      // —— 本机抓取助手优先（xc-koc-fetch）：真实 Chrome + 住宅 IP，进入主页抓近期作品 ——
      const localIds = new Set<number>();
      const useHelper = helperRef.current === 'on' || (helperRef.current === 'unknown' && await detectHelper());
      if (useHelper) {
        try {
          const lresp = await fetch(KOC_LOCAL_HELPER + '/fetch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: targets.map(e => e.url) }),
          });
          if (lresp.ok) {
            const lj: any = await lresp.json();
            const lcreators: any[] = lj?.creators || [];
            if (lj?.mode === 'cdp' || lj?.mode === 'standalone') setHelperMode(lj.mode);
            const warns: string[] = Array.isArray(lj?.warnings) ? lj.warnings : [];
            for (const c of lcreators) {
              const vids: any[] = Array.isArray(c.videos) ? c.videos : [];
              // v1.1：仅在确实抓到作品时占用条目；登录墙/空结果/失败一律放行给云端兜底
              if (c.status !== 'ok' || vids.length === 0) {
                if (c.reason) warns.push(String(c.reason).slice(0, 180));
                continue;
              }
              const src = norm(String(c.input || ''));
              const entry = targets.find(b =>
                !localIds.has(b.id) && src && norm(b.url) === src);
              if (!entry) continue;
              localIds.add(entry.id);
              const videos: ResolvedVideo[] = vids.slice(0, 30).map((v: any) => ({
                awemeId: String(v.id || v.awemeId || ''), title: v.title || '', url: v.url || '',
                stats: String(v.stats || ''),
              }));
              const resolved: ResolvedItem = {
                input: entry.url, url: entry.url, finalUrl: '', kind: 'user', awemeId: '', secUid: c.secUid || '',
                nickname: c.nickname || '', bio: '', followers: c.followers || 0, likesTotal: 0,
                worksCount: c.worksCount || 0,
                ipLocation: '', douyinId: c.douyinId || '', videosSource: 'local',
                videos, status: 'ok',
              };
              setEntries(prev => prev.map(e => {
                if (e.id !== entry.id) return e;
                const m = { ...e.manual };
                if (!m.nickname && c.nickname) m.nickname = c.nickname;
                if (!m.followers && c.followers) m.followers = fmtCount(c.followers);
                if (!m.douyinId && c.douyinId) m.douyinId = c.douyinId;
                return { ...e, resolving: false, resolveFailed: false, resolved, manual: m };
              }));
            }
            if (warns.length) setHelperMsgs(Array.from(new Set(warns)).slice(0, 3));
          } else { setHelperBoth('off'); }
        } catch { setHelperBoth('off'); /* 助手不可用则退回云端基础资料 */ }
      }
      // —— 云端 FaaS：仅对本机未抓到的达人补基础资料（本机作品列表绝不覆盖） ——
      const cloudTargets = targets.filter(e => !localIds.has(e.id));
      for (let i = 0; i < cloudTargets.length; i += 8) {
        const batch = cloudTargets.slice(i, i + 8);
        batch.forEach(e => { if (!localIds.has(e.id)) patchEntry(e.id, { resolving: true, resolveFailed: false }); });
        try {
          const resp = await fetch(KOC_RESOLVE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: batch.map(e => e.url) }),
          });
          const creators: any[] = (await resp.json())?.data?.creators || [];
          const used = new Set<number>();
          for (const c of creators) {
            const srcs: string[] = (c.sources || []).map(norm);
            const entry = batch.find(b => !used.has(b.id) && srcs.some(s => s === norm(b.url)));
            if (!entry) continue;
            used.add(entry.id);
            if (c.status === 'ok') okN++; else softN++;
            const videos: ResolvedVideo[] = (c.videos || []).map((v: any) => ({
              awemeId: v.awemeId, title: v.title || '', url: v.url || '',
              stats: (v.digg || v.comment) ? `点赞${fmtCount(v.digg || 0)} 评论${fmtCount(v.comment || 0)}${v.share ? ` 转发${fmtCount(v.share)}` : ''}` : '',
            }));
            const resolved: ResolvedItem = {
              input: (c.sources || [entry.url])[0] || entry.url, url: entry.url, finalUrl: '', kind: c.kind || '',
              awemeId: videos[0]?.awemeId || '', secUid: c.secUid || '',
              nickname: c.nickname || '', bio: c.bio || '',
              followers: c.followers || 0, likesTotal: c.likesTotal || 0, worksCount: c.worksCount || 0,
              ipLocation: c.ipLocation || '', douyinId: c.douyinId || '', avatar: c.avatar || '',
              needHomepage: !!c.needHomepage, videos, status: c.status || 'need_info',
            };
            setEntries(prev => prev.map(e => {
              if (e.id !== entry.id) return e;
              const m = { ...e.manual };
              if (!m.nickname && c.nickname) m.nickname = c.nickname;
              if (!m.bio && c.bio) m.bio = c.bio;
              if (!m.followers && c.followers) m.followers = fmtCount(c.followers);
              if (!m.douyinId && c.douyinId) m.douyinId = c.douyinId;
              if (c.status === 'ok' && !m.observations) {
                m.observations = `${c.followers ? `粉丝${fmtCount(c.followers)}` : ''}${c.worksCount ? ` · 作品${c.worksCount}` : ''}${c.likesTotal ? ` · 获赞${fmtCount(c.likesTotal)}` : ''}${c.ipLocation ? ` · ${c.ipLocation}` : ''}`.trim();
              }
              if (!c.nickname) m.observations = m.observations || '视频链接已收录为内容证据；补一条达人主页链接可自动补全昵称/粉丝/简介';
              return { ...e, resolving: false, resolveFailed: c.status === 'need_info', resolved, manual: m };
            }));
            // 同一达人（sec_uid 相同）的多余来源 entry 去重
            if (c.secUid) {
              for (const b of batch) {
                if (!used.has(b.id) && srcs.some(s => s === norm(b.url))) { used.add(b.id); removeIds.push(b.id); }
              }
            }
          }
          // 未回填的链接：软失败（不阻塞）
          for (const b of batch) if (!used.has(b.id)) {
            setEntries(prev => prev.map(e => e.id === b.id ? {
              ...e, resolving: false, resolveFailed: true,
              manual: { ...e.manual, observations: e.manual.observations || '自动解析未取到主页信息，可补主页链接，或直接开始论证' },
            } : e));
          }
        } catch {
          batch.forEach(e => patchEntry(e.id, { resolving: false, resolveFailed: true }));
        }
      }
      if (removeIds.length) setEntries(list => list.filter(e => !removeIds.includes(e.id)));
      showToast(okN ? `已识别 ${okN} 位达人完整信息${softN ? '，部分视频链接待补主页' : ''}${removeIds.length ? '（已自动去重同一达人）' : ''}` : '解析受限，可补主页链接或直接开始论证');
    } finally { setResolving(false); }
  }

  // 可论证：有昵称 或 有视频证据（自动/手动）或有手动观察
  const runnable = (e: CreatorEntry) =>
    !!e.manual.nickname.trim() ||
    !!e.resolved?.videos.length ||
    e.manual.videos.some(v => (v.title || v.desc || v.frames.length)) ||
    !!e.manual.observations.trim();
  const readyCount = entries.filter(runnable).length;

  // ---------- 证据组装 ----------
  function buildPayloads(e: CreatorEntry) {
    const r = e.resolved, m = e.manual;
    const productPayload = {
      name: product.name.trim(),
      category: product.category.trim(),
      price_band: product.priceBand,
      core_claims: product.coreClaims.split(/[\n/、,，]+/).map(s => s.trim()).filter(Boolean),
      target_audience: product.targetAudience.trim(),
      tone: product.tone.trim(),
      avoid: product.avoid.trim(),
      campaign_goal: GOAL_MAP[product.goal] || product.goal,
      url: product.url.trim(),
    };
    const nickName = m.nickname.trim() || (r?.videos?.length ? '待识别达人（见视频证据）' : '待识别达人');
    const creatorPayload = {
      name: nickName, nickname: nickName,
      douyin_id: m.douyinId.trim(),
      ip_location: r?.ipLocation || '',
      followers: m.followers.trim(),
      likes: r?.likesTotal ? fmtCount(r.likesTotal) : '',
      works_count: r?.worksCount ? fmtCount(r.worksCount) : '',
      bio: m.bio.trim(),
      store_signals: '',
      observations: m.observations.trim(),
      homepage: r?.url || e.url || e.raw,
    };
    const commentsArr = m.comments.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 60);
    const autoVids = (r?.videos || []).map(v => ({ title: v.title, desc: '', stats: v.stats, frames: [] as string[], url: v.url }));
    const manVids = m.videos.filter(v => v.title.trim() || v.desc.trim() || v.frames.length)
      .map(v => ({ title: v.title.trim(), desc: v.desc.trim(), stats: v.stats, frames: v.frames, url: v.url }));
    let framesUsed = 0;
    const videoPayload = [...autoVids, ...manVids].map(v => {
      const take = v.frames.slice(0, Math.max(0, MAX_TOTAL_FRAMES - framesUsed));
      framesUsed += take.length;
      return { ...v, frames: take };
    }).filter((v) => v.title || v.desc || v.frames.length || v.url).map((v, i) => ({ i, ...v }));
    return { productPayload, creatorPayload, commentsArr, videoPayload };
  }

  // ---------- 单达人四阶段 ----------
  const setPhase = (id: number, phase: CPhase, extra: Partial<CreatorEntry> = {}) =>
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, phase, ...extra } : x)));

  async function runOne(id: number) {
    const e0 = entriesRef.current.find(x => x.id === id);
    if (!e0) return;
    const { productPayload, creatorPayload, commentsArr, videoPayload } = buildPayloads(e0);
    // 数据充足性闸门：没有任何代表视频证据（链接/标题文案/截图）时不出分，避免零证据被误判全 0
    if (!videoPayload.length) {
      setPhase(id, 'insufficient', { fit: null, scans: null, profile: null, audience: null, insufficientReason: INSUFFICIENT_REASON });
      return;
    }
    try {
      let scans: Scan[] = [];
      if (videoPayload.length) {
        setPhase(id, 'scan');
        const r = await postStage<{ videos: Scan[] }>('koc_video_scan', { creator: { name: creatorPayload.name }, videos: videoPayload });
        scans = r.videos || [];
        setPhase(id, 'profile', { scans });
      } else { setPhase(id, 'profile', { scans: null }); }

      const prof = await postStage<Profile>('koc_creator_profile', {
        product: productPayload, creator: creatorPayload, videoScans: scans, comments: commentsArr,
      });
      // 第二道闸门：视频证据未能形成有效内容样本（sample_size=0）时同样不出分
      if (!prof.sample_size || prof.sample_size <= 0) {
        setPhase(id, 'insufficient', { fit: null, profile: prof, scans, insufficientReason: INSUFFICIENT_REASON });
        return;
      }
      setPhase(id, 'audience', { profile: prof });

      const aud = await postStage<Audience>('koc_audience', {
        product: productPayload, creatorProfile: prof, videoScans: scans, comments: commentsArr,
      });
      setPhase(id, 'fit', { audience: aud });

      const fit = await postStage<Fit>('koc_fit_report', {
        product: productPayload, creatorProfile: prof, audienceProfile: aud, goal: productPayload.campaign_goal,
      });
      setPhase(id, 'done', { fit });
      setOpenId(prev => prev ?? id);

      ghTrack('KOC契合度论证', productPayload.name,
        `达人 ${creatorPayload.name}（${creatorPayload.followers || '粉丝未知'}）· 证据：${videoPayload.length}条视频/${commentsArr.length}条评论`,
        `契合度 ${fit.fit_score}/100（${VERDICT_META[fit.verdict]?.label || fit.verdict}）· ${FEE_META[fit.front_fee_advice.level]?.label || fit.front_fee_advice.level}`,
        {
          matchType: 'KOC契合度论证',
          fullInput: JSON.stringify({
            product: productPayload, creator: creatorPayload,
            videos: videoPayload.map(v => ({ title: v.title, url: v.url, stats: v.stats, desc: v.desc, frames: v.frames.length })),
            comments: commentsArr,
          }).slice(0, 88000),
          creators: `${creatorPayload.name}｜${creatorPayload.homepage}｜粉丝${creatorPayload.followers || '-'}｜契合度${fit.fit_score}`,
          creatorCount: 1, scoreTotal: fit.fit_score, productUrl: productPayload.url, rawInput: creatorPayload.homepage,
        }).catch(() => undefined);
    } catch (err: any) {
      setPhase(id, 'error', { error: err?.message || '分析失败，请重试' });
    }
  }

  // ---------- 一页式：批量论证（先自动解析链接，并发 2） ----------
  async function runAll() {
    if (!product.name.trim() || !product.category.trim()) { showToast('请先完成商品分析（至少填商品名称与类目）'); return; }
    if (!entries.length) { showToast('请先添加至少 1 位达人链接'); return; }
    // 链接未解析时先自动解析，省去手动点按钮
    if (entriesRef.current.some(e => e.url && !e.resolved && !e.resolving)) await resolveAll();
    const ready = entriesRef.current.filter(runnable);
    if (!ready.length) { showToast('请添加达人/视频链接，或展开手动补充达人信息'); return; }
    setShowResult(true);
    setRunning(true);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    const queue = ready.filter(e => e.phase !== 'done').map(e => e.id);
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        if (id == null) break;
        await runOne(id);
      }
    };
    await Promise.all([worker(), worker()]);
    setRunning(false);
  }

  async function rerunOne(id: number) {
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, phase: 'queued', error: undefined, insufficientReason: undefined, scans: null, profile: null, audience: null, fit: null } : x)));
    await runOne(id);
  }

  // ---------- 手动视频/截图 ----------
  function addManualVideo(id: number) {
    const vid: VideoItem = { id: vidSeq.current++, title: '', url: '', stats: '', desc: '', frames: [] };
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, manual: { ...x.manual, videos: [...x.manual.videos, vid] } } : x)));
  }
  function patchManualVideo(id: number, vid: number, patch: Partial<VideoItem>) {
    setEntries(prev => prev.map(x => (x.id === id ? {
      ...x, manual: { ...x.manual, videos: x.manual.videos.map(v => (v.id === vid ? { ...v, ...patch } : v)) },
    } : x)));
  }
  function removeManualVideo(id: number, vid: number) {
    setEntries(prev => prev.map(x => (x.id === id ? {
      ...x, manual: { ...x.manual, videos: x.manual.videos.filter(v => v.id !== vid) },
    } : x)));
  }
  async function uploadFrames(id: number, vid: number, files: FileList | null) {
    if (!files || !files.length) return;
    const cur = entriesRef.current.find(x => x.id === id);
    const used = (cur?.manual.videos || []).reduce((s, v) => s + v.frames.length, 0);
    const room = Math.max(0, MAX_TOTAL_FRAMES - used);
    const frames: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try { frames.push(await fileToFrame(f)); } catch { /* 坏图跳过 */ }
    }
    if (!frames.length) { showToast(room ? '图片读取失败' : `截图最多 ${MAX_TOTAL_FRAMES} 张`); return; }
    patchManualVideo(id, vid, { frames: [...(entriesRef.current.find(x => x.id === id)?.manual.videos.find(v => v.id === vid)?.frames || []), ...frames] });
  }

  const doneCount = entries.filter(e => e.phase === 'done').length;

  return (
    <div className="min-h-screen bg-[#F6F7FB] pb-24">
      <Header onBack={onBack} onSwitchTool={onSwitchTool} />
      <main className="max-w-6xl mx-auto px-4 pt-5">
        {toast && <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full bg-ink-900/90 px-4 py-2 text-[12.5px] text-white shadow-lg">{toast}</div>}

        {/* ============ 一页式：商品 + 达人 同屏 ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ---- 商品分析 ---- */}
          <section className={cardCls}>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 inline-flex items-center justify-center shrink-0"><Link2 className="w-4 h-4" /></span>
              <div>
                <h2 className="text-[15px] font-semibold text-ink-900 leading-tight">① 商品分析</h2>
                <p className="text-[11.5px] text-ink-400 leading-snug">粘贴商品链接，AI 自动分析；无链接可直接手填名称与类目</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input className={inputCls} placeholder="商品链接 / 抖店 / 精选联盟 / 抖音口令"
                value={product.url} onChange={e => patchProduct('url', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') parseProduct(); }} />
              <button onClick={parseProduct} disabled={parsing || !product.url.trim()}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {parsing ? '分析中…' : '分析'}
              </button>
            </div>
            {parseMsg && <div className="mt-2 text-[12px] text-amber-600">{parseMsg}</div>}

            {product.name ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-ink-900">{product.name}</span>
                      {product.source && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">{SOURCE_LABEL[product.source] || 'AI 分析'}</span>}
                    </div>
                    <div className="mt-1 text-[12px] text-ink-600 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>类目：{product.category || '—'}</span>
                      {product.priceBand && <span>价格带：{product.priceBand}</span>}
                    </div>
                    {product.coreClaims && <div className="mt-1 text-[12px] text-ink-500">卖点：{product.coreClaims}</div>}
                    {product.targetAudience && <div className="mt-0.5 text-[12px] text-ink-500">人群：{product.targetAudience}</div>}
                  </div>
                  <button onClick={() => setShowExtra(v => !v)} className="shrink-0 inline-flex items-center gap-1 text-[12px] text-rose-600 hover:underline">
                    <ScanSearch className="w-3.5 h-3.5" />{showExtra ? '收起' : '补充'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-line bg-[#FCFCFE] p-3">
                <div className="text-[12px] text-ink-500 mb-2">没有链接？手动填写（带链接结果更准）：</div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="商品名称（必填）" value={product.name} onChange={e => patchProduct('name', e.target.value)} />
                  <input className={inputCls} placeholder="细分类目，如 护肤/洁面（必填）" value={product.category} onChange={e => patchProduct('category', e.target.value)} />
                </div>
              </div>
            )}

            {showExtra && (
            <div className="mt-3 rounded-xl border border-line bg-[#FCFCFE] p-3 space-y-2">
              <div className="text-[12px] font-medium text-ink-700">补充与修正（选填，论证会更贴合商品）</div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="商品名称" value={product.name} onChange={e => patchProduct('name', e.target.value)} />
                <input className={inputCls} placeholder="细分类目，如 护肤/洁面" value={product.category} onChange={e => patchProduct('category', e.target.value)} />
                <input className={inputCls} placeholder="价格带，如 59-89元" value={product.priceBand} onChange={e => patchProduct('priceBand', e.target.value)} />
                <select className={inputCls} value={product.goal} onChange={e => patchProduct('goal', e.target.value)}>
                  {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <textarea className={inputCls} rows={2} placeholder="核心卖点（顿号或换行分隔）" value={product.coreClaims} onChange={e => patchProduct('coreClaims', e.target.value)} />
              <textarea className={inputCls} rows={2} placeholder="目标人群，如 混油/敏感肌年轻女性" value={product.targetAudience} onChange={e => patchProduct('targetAudience', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="内容调性，如 真实测评/成分党" value={product.tone} onChange={e => patchProduct('tone', e.target.value)} />
                <input className={inputCls} placeholder="必须避免方向，如 医疗功效宣称" value={product.avoid} onChange={e => patchProduct('avoid', e.target.value)} />
              </div>
            </div>
            )}
          </section>

          {/* ---- 达人匹配 ---- */}
          <section className={cardCls}>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 inline-flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></span>
              <div>
                <h2 className="text-[15px] font-semibold text-ink-900 leading-tight">② 添加达人 / 视频链接</h2>
                <p className="text-[11.5px] text-ink-400 leading-snug">一个商品可同时匹配多位达人：粘贴链接/口令（每行一个），或上传含达人链接的 Excel 一次性导入</p>
              </div>
            </div>
            <textarea className={inputCls + ' mt-3'} rows={3}
              placeholder={'例：\n7.99 复制打开抖音，看看【某某的作品】… https://v.douyin.com/xxxxxxx/\nhttps://www.douyin.com/user/MS4wLjAB...（达人主页）'}
              value={linkText} onChange={e => setLinkText(e.target.value)} />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button onClick={addLinks} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-rose-700">
                <Plus className="w-4 h-4" />添加到达人列表
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12.5px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {importing ? '读取中…' : '上传 Excel'}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onExcelChange} />
              <button onClick={addManualCreator} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] text-ink-700 hover:border-rose-300">
                <Users className="w-4 h-4" />手动添加
              </button>
              {entries.some(e => e.url && !e.resolved) && (
                <button onClick={resolveAll} disabled={resolving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {resolving ? '正在解析…' : '一键解析链接信息'}
                </button>
              )}
              {entries.length > 0 && <span className="text-[11.5px] text-ink-400 ml-auto">共 {entries.length} 位 · 可论证 {readyCount} 位</span>}
            </div>

            {/* 本机抓取助手状态：开启后可进抖音主页抓近期作品作为内容证据 */}
            <div className={'mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug ' +
              (helper === 'on' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700')}>
              <span className={'mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ' + (helper === 'on' ? 'bg-emerald-500' : 'bg-amber-500')} />
              {helper === 'on'
                ? <span>已连接本机抓取助手{helperMode === 'cdp' ? '（已复用 9222 端口登录态 Chrome）' : helperMode === 'standalone' ? '（独立模式，未走登录态）' : ''}，将<b>进入达人抖音主页抓取近期作品</b>作为内容证据，五轴可基于真实视频出分。</span>
                : <span>未检测到本机抓取助手：仅能取主页基础资料，<b>无法看主页视频、不出五轴分</b>。下载并启动 Mac 助手（v1.1，需用带 9222 调试端口且已登录抖音的 Chrome）后即可自动抓近期作品 →&nbsp;
                    <a href={KOC_HELPER_ZIP} target="_blank" rel="noreferrer" className="underline font-medium">下载 mac-v1.zip</a>（解压双击启动，保持终端运行）。</span>}
            </div>
            {helper === 'on' && helperMsgs.length > 0 && (
              <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
                {helperMsgs.map((m, i) => <p key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{m}</p>)}
              </div>
            )}

            {entries.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-line bg-[#FCFCFE] py-10 text-center">
                <Link2 className="w-7 h-7 mx-auto text-ink-300" />
                <div className="mt-2 text-[12px] text-ink-400">粘贴链接后点「添加到达人列表」；开始论证时会自动解析公开信息</div>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                {entries.map(e => <CreatorRow key={e.id} entry={e}
                  onToggle={() => patchEntry(e.id, { expanded: !e.expanded })}
                  onRemove={() => removeEntry(e.id)}
                  onPatchManual={(p) => patchManual(e.id, p)}
                  onAddVideo={() => addManualVideo(e.id)}
                  onPatchVideo={(vid, p) => patchManualVideo(e.id, vid, p)}
                  onRemoveVideo={(vid) => removeManualVideo(e.id, vid)}
                  onUpload={(vid, files) => uploadFrames(e.id, vid, files)}
                  onToggleAdvanced={() => patchEntry(e.id, { showAdvanced: !e.showAdvanced })} />)}
              </div>
            )}
          </section>
        </div>

        {/* ---- 主行动条（吸底） ---- */}
        <div className="sticky bottom-3 z-30 mt-4">
          <div className="rounded-2xl border border-line bg-white/95 backdrop-blur shadow-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] text-ink-500">
              {product.name
                ? <>商品：<b className="text-ink-800">{product.name}</b>{entries.length ? ` · 达人 ${entries.length} 位（可论证 ${readyCount}）` : ' · 还未添加达人'}</>
                : '请先完成①商品分析'}
            </div>
            <button disabled={running || !product.name.trim() || !product.category.trim() || !readyCount} onClick={runAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running ? `论证中… ${doneCount}/${entries.length}` : `开始论证${readyCount ? `（${readyCount} 位达人）` : ''}`}
            </button>
          </div>
        </div>

        {/* ============ 结果（同页下方） ============ */}
        {showResult && entries.length > 0 && (
        <div ref={resultRef} className="mt-6 space-y-4 scroll-mt-20">
          <section className={' ' + cardCls + ' !p-4'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14.5px] font-semibold text-ink-900">{product.name}</span>
                  <span className="text-[11px] text-ink-400">{product.category}{product.priceBand ? ` · ${product.priceBand}` : ''}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-500">
                  {running ? `正在论证中… 已完成 ${doneCount}/${entries.length}` : `完成 ${doneCount}/${entries.length} · 按契合度排序，点「查看详情」阅读完整论证报告`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {entries.some(e => e.phase === 'error') && (
                  <button onClick={() => entries.filter(e => e.phase === 'error').forEach(e => rerunOne(e.id))}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-700 hover:bg-amber-100">
                    <RefreshCw className="w-3.5 h-3.5" />重试失败项
                  </button>
                )}
                <button onClick={() => setShowResult(false)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] text-ink-700 hover:border-rose-300">
                  <X className="w-3.5 h-3.5" />收起结果
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...entries].sort((a, b) => rankEntry(b) - rankEntry(a)).map(e => (
              <div key={e.id} className={openId === e.id ? 'md:col-span-2 min-w-0' : 'min-w-0'}>
                <CreatorCard entry={e} open={openId === e.id}
                  onOpen={() => setOpenId(openId === e.id ? null : e.id)}
                  onRerun={() => rerunOne(e.id)} />
              </div>
            ))}
          </div>
        </div>
        )}
      </main>
    </div>
  );
}

function rankEntry(e: CreatorEntry): number {
  if (e.phase === 'done') return 1000 + (e.fit?.fit_score || 0);
  if (e.phase === 'insufficient') return 150;
  if (e.phase === 'error') return 100;
  if (e.phase !== 'queued') return 200; // 进行中
  return 0;
}

// ---------------- Step2 达人行 ----------------
function StatusPill({ entry }: { entry: CreatorEntry }) {
  if (entry.resolving) return <span className="inline-flex items-center gap-1 text-[11px] text-rose-600"><Loader2 className="w-3 h-3 animate-spin" />解析中</span>;
  if (entry.phase === 'done') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">已完成</span>;
  if (entry.phase === 'insufficient') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">待补视频</span>;
  if (entry.phase === 'error') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">论证失败</span>;
  if (entry.resolveFailed) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">待补昵称</span>;
  if (entry.resolved?.status === 'ok') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">信息已抓取</span>;
  if (entry.resolved?.status === 'video_only') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">已抓视频·补昵称</span>;
  if (entry.url) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-ink-400 border border-line">未解析</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-ink-400 border border-line">手动添加</span>;
}

function CreatorRow({ entry, onToggle, onRemove, onPatchManual, onAddVideo, onPatchVideo, onRemoveVideo, onUpload, onToggleAdvanced }: {
  entry: CreatorEntry; onToggle: () => void; onRemove: () => void;
  onPatchManual: (p: Partial<ManualEntry>) => void; onAddVideo: () => void;
  onPatchVideo: (vid: number, p: Partial<VideoItem>) => void; onRemoveVideo: (vid: number) => void;
  onUpload: (vid: number, files: FileList | null) => void; onToggleAdvanced: () => void;
}) {
  const e = entry;
  const name = e.manual.nickname || e.resolved?.nickname || '';
  const sub = [
    e.manual.followers ? `粉丝 ${e.manual.followers}` : '',
    e.resolved?.videos.length ? `${e.resolved.videos.length} 条代表视频` : '',
    e.resolved?.ipLocation ? `IP ${e.resolved.ipLocation}` : '',
    !name ? (e.resolveFailed ? '公开信息抓取失败，请手填昵称后继续' : '可解析链接或手填昵称') : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <button type="button" onClick={onToggle} className="flex-1 flex items-center gap-2.5 text-left min-w-0">
          <span className="w-8 h-8 shrink-0 rounded-full bg-rose-50 text-rose-600 inline-flex items-center justify-center">
            {e.resolved?.kind === 'video' ? <FileText className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-ink-900 truncate">{name || (e.url ? '待识别达人' : '手动添加达人')}</span>
            <span className="block text-[11.5px] text-ink-400 truncate">{sub || e.resolved?.bio || e.raw}</span>
          </span>
          <StatusPill entry={e} />
          <ChevronDown className={'w-4 h-4 text-ink-300 transition-transform shrink-0 ' + (e.expanded ? 'rotate-180' : '')} />
        </button>
        <button type="button" onClick={onRemove} className="shrink-0 text-ink-300 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button>
      </div>

      {e.expanded && (
      <div className="border-t border-line px-3.5 py-3 space-y-3 bg-[#FCFCFE]">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] text-ink-400">达人昵称 *{e.resolved?.nickname ? '（已自动抓取，可改）' : ''}</span>
            <input className={inputCls + ' mt-0.5'} value={e.manual.nickname} onChange={ev => onPatchManual({ nickname: ev.target.value })} placeholder="昵称（论证必填）" />
          </label>
          <label className="block">
            <span className="text-[11px] text-ink-400">粉丝数（自动抓取）</span>
            <input className={inputCls + ' mt-0.5'} value={e.manual.followers} onChange={ev => onPatchManual({ followers: ev.target.value })} placeholder="如 3.2万" />
          </label>
          <label className="block">
            <span className="text-[11px] text-ink-400">抖音号（选填）</span>
            <input className={inputCls + ' mt-0.5'} value={e.manual.douyinId} onChange={ev => onPatchManual({ douyinId: ev.target.value })} placeholder="抖音号" />
          </label>
        </div>
        <label className="block">
          <span className="text-[11px] text-ink-400">主页简介（自动抓取，可补充）</span>
          <textarea className={inputCls + ' mt-0.5'} rows={2} value={e.manual.bio} onChange={ev => onPatchManual({ bio: ev.target.value })} placeholder="达人主页简介/人设观察" />
        </label>

        {/* 自动抓取的视频 */}
        {e.resolved?.videos.length ? (
          <div className="rounded-lg border border-line bg-white p-2.5">
            <div className="text-[11.5px] font-medium text-ink-600 mb-1.5">已从链接识别 {e.resolved.videos.length} 条代表视频（自动作为内容证据）</div>
            <div className="space-y-1">
              {e.resolved.videos.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[11.5px] text-ink-600">
                  <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate flex-1">{v.title || '（标题未抓到，可在下方手动补充）'}</span>
                  {v.stats && <span className="shrink-0 text-ink-400">{v.stats}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* 只有主页资料、无视频证据时的评分前置提示 */}
        {((!e.resolved?.videos.length && !e.manual.videos.some(v => (v.title || v.desc || v.frames.length))) || e.phase === 'insufficient') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-800 leading-relaxed">
            目前只有主页基础资料，没有内容证据，五轴评估将无法出具（不会打 0 分或下负面结论）。请再粘贴 1–3 条该达人的<b>视频链接</b>，或展开下方<b>「高级证据」</b>填写代表视频标题/口播文案并上传截图后重新论证。
          </div>
        )}

        {/* 评论样本（选填） */}
        <label className="block">
          <span className="text-[11px] text-ink-400 inline-flex items-center gap-1"><MessageSquareText className="w-3.5 h-3.5" />评论区样本（选填，一行一条；≥8 条时受众判断走直接证据，更准）</span>
          <textarea className={inputCls + ' mt-0.5'} rows={3} value={e.manual.comments} onChange={ev => onPatchManual({ comments: ev.target.value })}
            placeholder={'粘贴该达人视频下的真实评论，一行一条…'} />
        </label>

        {/* 高级证据：手动视频+截图+观察 */}
        <div>
          <button type="button" onClick={onToggleAdvanced}
            className="text-[11.5px] text-rose-600 hover:underline inline-flex items-center gap-1">
            {e.showAdvanced ? '收起高级证据' : '高级（可选）：手动补充视频文案 / 上传截图 / 其他观察'}
            <ChevronDown className={'w-3.5 h-3.5 transition-transform ' + (e.showAdvanced ? 'rotate-180' : '')} />
          </button>
          {e.showAdvanced && (
          <div className="mt-2 space-y-2.5 rounded-lg border border-line bg-white p-2.5">
            <label className="block">
              <span className="text-[11px] text-ink-400">其他观察（橱窗迹象、合作品牌、更新频率等）</span>
              <textarea className={inputCls + ' mt-0.5'} rows={2} value={e.manual.observations} onChange={ev => onPatchManual({ observations: ev.target.value })} />
            </label>
            {e.manual.videos.map(v => (
              <div key={v.id} className="rounded-lg border border-dashed border-line p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input className={inputCls} placeholder="视频标题（如：混油皮晚间洁面实测…）" value={v.title} onChange={ev => onPatchVideo(v.id, { title: ev.target.value })} />
                  <button type="button" onClick={() => onRemoveVideo(v.id)} className="shrink-0 text-ink-300 hover:text-rose-500"><X className="w-4 h-4" /></button>
                </div>
                <textarea className={inputCls} rows={2} placeholder="视频文案/口播要点" value={v.desc} onChange={ev => onPatchVideo(v.id, { desc: ev.target.value })} />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-ink-600 cursor-pointer hover:border-rose-300">
                    <ImagePlus className="w-3.5 h-3.5" />上传截图（{v.frames.length}）
                    <input type="file" accept="image/*" multiple className="hidden" onChange={ev => onUpload(v.id, ev.target.files)} />
                  </label>
                  {v.frames.map((fr, i) => (
                    <span key={i} className="relative">
                      <img src={fr} alt="" className="w-10 h-10 object-cover rounded border border-line" />
                      <button type="button" onClick={() => onPatchVideo(v.id, { frames: v.frames.filter((_, j) => j !== i) })}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ink-900/70 text-white inline-flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                  <span className="text-[10.5px] text-ink-400">单达人截图合计 ≤ {MAX_TOTAL_FRAMES} 张</span>
                </div>
              </div>
            ))}
            <button type="button" onClick={onAddVideo} className="inline-flex items-center gap-1 text-[11.5px] text-rose-600 hover:underline">
              <Plus className="w-3.5 h-3.5" />添加一条视频证据
            </button>
          </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
// ---------------- 顶部 ----------------
function Header({ onBack }: { onBack: () => void; onSwitchTool: (m: string) => void }) {
  return (
    <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
          <ArrowLeft className="w-3.5 h-3.5" /> 返回首页
        </button>
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-btn shrink-0">
          <HeartIcon />
        </div>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-ink-900 leading-tight">KOC 契合度论证</div>
          <div className="text-[11px] text-ink-400 leading-tight">一个商品 × 多位达人 · 批量契合论证与前置费建议</div>
        </div>
      </div>
    </header>
  );
}

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

// ---------------- Step3：每达人评分卡 ----------------
function MiniRing({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 100 100" className="w-14 h-14 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#F0F0F5" strokeWidth="10" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 42 * score / 100} ${2 * Math.PI * 42}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[15px] font-bold leading-none" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function CreatorCard({ entry, open, onOpen, onRerun }: {
  entry: CreatorEntry; open: boolean; onOpen: () => void; onRerun: () => void;
}) {
  const e = entry;
  const name = e.manual.nickname || e.resolved?.nickname || '待识别达人';
  const fit = e.fit;

  // 数据不足：缺视频证据，不出分、不下合作结论
  if (e.phase === 'insufficient') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 inline-flex items-center justify-center shrink-0">
            <AlertTriangle className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13.5px] font-medium text-ink-900 truncate">{name}</span>
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border bg-white text-amber-700 border-amber-200">数据不足 · 待补充</span>
            </div>
            <p className="mt-1 text-[12px] text-amber-800 leading-relaxed">{e.insufficientReason || INSUFFICIENT_REASON}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button type="button" onClick={onRerun}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-amber-600">
                <RefreshCw className="w-3.5 h-3.5" />补充后重新论证
              </button>
              <span className="text-[11px] text-amber-700/80">主页基础资料{[e.manual.followers, e.manual.douyinId].filter(Boolean).length ? `（已获取：${[e.manual.followers && `粉丝 ${e.manual.followers}`, e.manual.douyinId && `抖音号 ${e.manual.douyinId}`].filter(Boolean).join(' · ')}）` : '已获取'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 进行中 / 排队 / 失败
  if (e.phase !== 'done') {
    const busy = e.phase !== 'queued' && e.phase !== 'error';
    return (
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 inline-flex items-center justify-center shrink-0">
            {e.resolved?.kind === 'video' ? <FileText className="w-4.5 h-4.5 w-[18px] h-[18px]" /> : <Users className="w-[18px] h-[18px]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-ink-900 truncate">{name}</div>
            <div className="text-[11.5px] text-ink-400 truncate">
              {e.phase === 'error' ? (e.error || '论证失败') : busy ? PHASE_TEXT[e.phase] : '排队等待论证'}
            </div>
          </div>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-rose-500 shrink-0" />}
          {e.phase === 'error' && (
            <button type="button" onClick={onRerun}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-700 hover:bg-amber-100">
              <RefreshCw className="w-3.5 h-3.5" />重试
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!fit) return null;
  if (fit.verdict === 'insufficient_data') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 inline-flex items-center justify-center shrink-0">
            <AlertTriangle className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13.5px] font-medium text-ink-900 truncate">{name}</span>
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border bg-white text-amber-700 border-amber-200">数据不足 · 待补充</span>
            </div>
            <p className="mt-1 text-[12px] text-amber-800 leading-relaxed">{fit.advice_reason || INSUFFICIENT_REASON}</p>
            <ul className="mt-1.5 list-disc pl-4 text-[11.5px] text-amber-800/90 space-y-0.5">
              {(fit.data_gaps.length ? fit.data_gaps : ['补充 1–3 条代表视频链接 / 标题口播文案 / 截图后重新论证']).map((g, i) => <li key={i}>{g}</li>)}
            </ul>
            <button type="button" onClick={onRerun}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-amber-600">
              <RefreshCw className="w-3.5 h-3.5" />补充后重新论证
            </button>
          </div>
        </div>
      </div>
    );
  }
  const vm = VERDICT_META[fit.verdict] || VERDICT_META.possible_fit;
  const fm = FEE_META[fit.front_fee_advice.level] || FEE_META.conditional;
  const topReasons = fit.reasons_for.slice(0, 2);

  return (
    <div className={'rounded-2xl border bg-white overflow-hidden transition ' + (open ? 'border-rose-300 shadow-card' : 'border-line hover:border-rose-200')}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <MiniRing score={fit.fit_score} color={vm.ring} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-ink-900 truncate">{name}</span>
              <span className={'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ' + vm.cls}>{vm.label}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400 truncate">
              {[e.manual.followers && `粉丝 ${e.manual.followers}`, e.manual.douyinId && `抖音号 ${e.manual.douyinId}`].filter(Boolean).join(' · ') || 'KOC 同类相对分（koc_peer）'}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-600 leading-relaxed line-clamp-2">{fit.advice_reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ' + fm.cls}>
                <BadgeCheck className="w-3 h-3" />{fm.label}{fit.front_fee_advice.budget_range ? `·${fit.front_fee_advice.budget_range}` : ''}
              </span>
              {topReasons.map((r, i) => (
                <span key={i} className="hidden sm:inline-flex text-[10.5px] px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 max-w-[220px] truncate">{r.point}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
          <span className="text-[11px] text-ink-400">五轴：品类{(fit.axes.category_credibility?.score ?? 0)} · 受众{(fit.axes.audience_match?.score ?? 0)} · 内容{(fit.axes.content_match?.score ?? 0)} · 风险{(fit.axes.risk?.score ?? 0)} · 趋势{(fit.axes.trend_alignment?.score ?? 0)}</span>
          <button type="button" onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-700 shrink-0">
            <Eye className="w-3.5 h-3.5" />{open ? '收起详情' : '查看详情'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-[#FAFAFD] p-4 space-y-4">
          <FitReport fit={fit} profile={e.profile} audience={e.audience} scan={e.scans} onRerun={onRerun} />
        </div>
      )}
    </div>
  );
}

// ================= 详情报告 =================
function FitReport({ fit, profile, audience, scan, onRerun }: {
  fit: Fit; profile: Profile | null; audience: Audience | null; scan: Scan[] | null; onRerun: () => void;
}) {
  const [tab, setTab] = useState<'view' | 'external' | 'internal'>('view');
  const [copied, setCopied] = useState(false);
  const vm = VERDICT_META[fit.verdict] || VERDICT_META.possible_fit;
  const fm = FEE_META[fit.front_fee_advice.level] || FEE_META.conditional;
  const mdText = tab === 'external' ? fit.report_external_md : fit.report_internal_md;

  function copyMd() {
    const t = mdText || '';
    if (!t) return;
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => undefined);
  }

  return (
    <>
      {/* 结论英雄卡 */}
      <section className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <ScoreRing score={fit.fit_score} color={vm.ring} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={'inline-flex items-center text-[12.5px] font-medium px-2.5 py-1 rounded-full border ' + vm.cls}>{vm.label}</span>
                <span className="text-[11px] text-ink-400">基准：KOC 同类相对分（koc_peer）· {fit.analysis_date}</span>
              </div>
              <h2 className="mt-2 text-[16px] font-semibold text-ink-900 leading-snug">
                {fit.creator_name || '该达人'} × {fit.product_name || '该商品'}
              </h2>
              <p className="mt-1.5 text-[12.5px] text-ink-600 leading-relaxed">{fit.advice_reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={'inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-lg ' + fm.cls}>
                  <BadgeCheck className="w-3.5 h-3.5" />{fm.label}{fit.front_fee_advice.budget_range ? `（${fit.front_fee_advice.budget_range}）` : ''}
                </span>
                <button type="button" onClick={onRerun}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-[12px] text-ink-600 hover:border-brand-300 hover:text-brand-700 transition">
                  <RefreshCw className="w-3.5 h-3.5" /> 重新论证
                </button>
              </div>
            </div>
          </div>
          {fit.front_fee_advice.reason && <p className="mt-3 text-[12px] text-ink-500 bg-[#FAFAFD] rounded-xl px-3 py-2 leading-relaxed">💡 {fit.front_fee_advice.reason}</p>}
          {fit.benchmark_note && (
            <p className="mt-2 text-[11.5px] text-rose-600/90 bg-rose-50/70 border border-rose-100 rounded-xl px-3 py-2 leading-relaxed">📐 {fit.benchmark_note}</p>
          )}
        </div>
        {/* Tab 切换 */}
        <div className="border-t border-line px-4 py-2.5 flex flex-wrap items-center gap-2 bg-[#FCFCFE]">
          <TabBtn active={tab === 'view'} onClick={() => setTab('view')} icon={<Eye className="w-3.5 h-3.5" />}>结构化报告</TabBtn>
          <TabBtn active={tab === 'external'} onClick={() => setTab('external')} icon={<FileText className="w-3.5 h-3.5" />}>对外版（发品牌方）</TabBtn>
          <TabBtn active={tab === 'internal'} onClick={() => setTab('internal')} icon={<FileText className="w-3.5 h-3.5" />}>内部完整版</TabBtn>
          {tab !== 'view' && (
            <button type="button" onClick={copyMd}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-[12px] hover:opacity-90 transition">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? '已复制' : '复制 Markdown'}
            </button>
          )}
        </div>
      </section>

      {tab === 'view' ? (
      <>
        {/* KOC 优质四要素 */}
      <section className={cardCls}>
        <CardTitle icon="💎" title="KOC 为什么优质（四要素）" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {Object.keys(QC_LABEL).map(k => {
            const q = fit.koc_quality_case[k] || { point: '', evidence: '' };
            return (
              <div key={k} className="rounded-xl border border-line p-3 bg-[#FCFCFE]">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink-800">
                  <span>{QC_LABEL[k].icon}</span>{QC_LABEL[k].title}
                </div>
                {q.point && <div className="mt-1.5 text-[12.5px] text-ink-700 leading-relaxed">{q.point}</div>}
                {q.evidence && <div className="mt-1 text-[11.5px] text-ink-400 leading-relaxed">证据：{q.evidence}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 五轴 */}
      <section className={cardCls}>
        <CardTitle icon="📊" title="五轴契合度（0-10，风险轴 10=几乎无风险）" />
        <div className="mt-3 space-y-3">
          {Object.keys(AXIS_LABEL).map(k => {
            const a = fit.axes[k] || { score: 0, reason: '' };
            const color = a.score >= 7 ? '#10b981' : a.score >= 5 ? '#f59e0b' : '#f43f5e';
            return (
              <div key={k}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-ink-700">{AXIS_LABEL[k]}</span>
                  <span className="font-semibold" style={{ color }}>{a.score}/10</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-ink-50 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${a.score * 10}%`, background: color }} />
                </div>
                {a.reason && <div className="mt-1 text-[11.5px] text-ink-400 leading-relaxed">{a.reason}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-ink-300 leading-relaxed">权重：品类可信度 30% / 受众匹配 25% / 内容匹配 25% / 风险控制 10% / 趋势对齐 10%。{fit.scale_note}</div>
      </section>

      {/* 支持 / 反对 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={cardCls}>
          <CardTitle icon={<ThumbsUp className="w-4 h-4 text-emerald-600" />} title="支持合作的理由" />
          <div className="mt-3 space-y-2.5">
            {fit.reasons_for.length ? fit.reasons_for.map((r, i) => <ReasonRow key={i} r={r} tone="for" />) : <Empty />}
          </div>
        </div>
        <div className={cardCls}>
          <CardTitle icon={<ThumbsDown className="w-4 h-4 text-amber-600" />} title="风险与反对证据" />
          <div className="mt-3 space-y-2.5">
            {fit.reasons_against.length ? fit.reasons_against.map((r, i) => <ReasonRow key={i} r={r} tone="against" />) : <Empty text="未发现显著反对证据" />}
          </div>
        </div>
      </section>

      {/* 前置费建议 + 内容角度 */}
      <section className={cardCls}>
        <CardTitle icon="🎬" title="前置费合作建议" />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
          <div>
            <div className="text-[12px] font-medium text-ink-600 mb-1">前置费应换得的交付</div>
            {fit.front_fee_advice.deliverables.length ? (
              <ul className="list-disc pl-4 space-y-1 text-ink-700">{fit.front_fee_advice.deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul>
            ) : <Empty />}
          </div>
          <div>
            <div className="text-[12px] font-medium text-ink-600 mb-1">投流测试设计</div>
            <div className="text-ink-700 leading-relaxed">{fit.front_fee_advice.expected_test || <Empty />}</div>
          </div>
        </div>
        {fit.suggested_angle && (
          <div className="mt-4 rounded-xl bg-rose-50/60 border border-rose-100 p-3">
            <div className="text-[12px] font-medium text-rose-700 mb-1">🎯 建议内容角度（按该达人风格定制）</div>
            <div className="text-[12.5px] text-ink-700 leading-relaxed">{fit.suggested_angle}</div>
          </div>
        )}
      </section>

      {/* 八维制作能力 */}
      {profile && (
      <section className={cardCls}>
        <CardTitle icon="🎥" title="视频制作能力八维评估（0-5，只评制作能力不评流量）" />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {CRAFT_ORDER.map(k => {
            const v = Number(profile.content_craft[k] || 0);
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[12px] text-ink-600 w-24 shrink-0">{CRAFT_LABEL[k]}</span>
                <div className="flex-1 flex gap-0.5">
                  {[1,2,3,4,5].map(n => <span key={n} className="h-2 flex-1 rounded-sm" style={{ background: n <= v ? '#e11d48' : '#F0F0F5' }} />)}
                </div>
                <span className="text-[12px] font-semibold text-ink-700 w-7 text-right">{v}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11.5px]">
          <span className="text-emerald-700">长板：{profile.content_craft.strength.join('；') || '—'}</span>
          <span className="text-amber-700">短板：{profile.content_craft.weakness.join('；') || '—'}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] text-ink-600">
          <div><b className="text-ink-700">垂类定位：</b>{profile.primary_niche}{profile.secondary_niches.length ? ` / ${profile.secondary_niches.join('、')}` : ''}（美妆内容占比 {profile.category_content_ratio}%，样本 {profile.sample_size} 条，置信{profile.confidence}）</div>
          <div><b className="text-ink-700">人设：</b>{profile.persona_summary || '—'}</div>
          <div className="sm:col-span-2"><b className="text-ink-700">商业化成熟度：</b>{profile.monetization_signals || '—'}</div>
          {!!profile.professional_evidence.collab_brands.length && <div className="sm:col-span-2"><b className="text-ink-700">合作过品牌：</b>{profile.professional_evidence.collab_brands.join('、')}</div>}
          {!!profile.risk_flags.length && <div className="sm:col-span-2 text-rose-600"><b>风险标记：</b>{profile.risk_flags.join('；')}</div>}
        </div>
      </section>
      )}

      {/* 受众画像 */}
      {audience && (
      <section className={cardCls}>
        <CardTitle icon={<MessageSquareText className="w-4 h-4 text-blue-600" />} title={`受众美妆消费画像（${audience.evidence_chain === 'direct' ? '评论直接证据' : audience.evidence_chain === 'comparison' ? '同类对照推断' : '内容人设推断'} · 置信${audience.audience_confidence}）`} />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="text-[12.5px] space-y-2">
            <div><b className="text-ink-700">性别：</b>女 {audience.gender_ratio.female}% / 男 {audience.gender_ratio.male}%</div>
            <div><b className="text-ink-700">购买力：</b>{({ high: '高', medium: '中', low: '低' } as Record<string, string>)[audience.purchase_power_level] || audience.purchase_power_level}</div>
            <div><b className="text-ink-700">消费倾向：</b>{audience.beauty_consumption_tendency || '—'}</div>
            <div><b className="text-ink-700">受众-达人关系：</b>{audience.audience_creator_relation || '—'}</div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {audience.purchase_persona.map((t, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{t}</span>)}
            </div>
          </div>
          <div className="text-[12px]">
            {Object.keys(audience.age_dist).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(audience.age_dist).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-16 text-ink-500 shrink-0">{k}</span>
                    <div className="flex-1 h-2 rounded-full bg-ink-50 overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${v}%` }} /></div>
                    <span className="w-9 text-right text-ink-500">{v}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {audience.evidence_comments_sample.length > 0 && (
          <div className="mt-3">
            <div className="text-[11.5px] text-ink-400 mb-1.5">代表性评论样本：</div>
            <div className="flex flex-wrap gap-1.5">
              {audience.evidence_comments_sample.map((t, i) => <span key={i} className="text-[11.5px] px-2 py-1 rounded-lg bg-[#FAFAFD] border border-line text-ink-600 max-w-full">“{t}”</span>)}
            </div>
          </div>
        )}
        {audience.evidence_chain !== 'direct' && audience.inferred_basis.length > 0 && (
          <div className="mt-3 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">推断依据：{audience.inferred_basis.join('；')}（建议补充 8 条以上评论样本转为直接证据）</div>
        )}
      </section>
      )}

      {/* 趋势 + 视频扫描 */}
      <section className={cardCls}>
        <CardTitle icon="📈" title="品类内容趋势对齐" />
        <div className="mt-2 text-[12.5px] space-y-1.5 text-ink-700">
          <div><b>对齐情况：</b>{fit.trend_check.aligned ? <span className="text-emerald-600">与当前品类红利方向对齐</span> : <span className="text-amber-600">存在错位</span>}</div>
          {fit.trend_check.current_form && <div><b>当前红利形式：</b>{fit.trend_check.current_form}</div>}
          {fit.trend_check.why && <div><b>判断依据：</b>{fit.trend_check.why}</div>}
          {fit.trend_check.opportunity && <div className="text-rose-700"><b>可借势点：</b>{fit.trend_check.opportunity}</div>}
        </div>
      </section>

      {scan && scan.length > 0 && (
      <section className={cardCls}>
        <CardTitle icon={<ScanSearch className="w-4 h-4 text-violet-600" />} title={`代表视频元素识别（${scan.length} 条 · ${scan.filter(s=>s.basis==='frame').length} 条画面证据）`} />
        <div className="mt-3 space-y-2.5">
          {scan.map((s, i) => (
            <div key={i} className="rounded-xl border border-line p-3 bg-[#FCFCFE]">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-medium text-ink-800">视频 {i + 1}</span>
                <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">{s.content_type}</span>
                <span className="text-ink-400">相关度 {s.category_relevance}</span>
                <span className="text-ink-300">{s.basis === 'frame' ? '画面证据' : '仅文案'} · 置信{s.confidence}</span>
                {s.selling && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">挂车/带货</span>}
              </div>
              {s.elements.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.elements.map((el, j) => <span key={j} className="text-[11px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-600">{el.tag}{el.evidence ? ` · ${el.evidence}` : ''}</span>)}
                </div>
              )}
              {s.summary && <div className="mt-1.5 text-[11.5px] text-ink-500 leading-relaxed">{s.summary}</div>}
            </div>
          ))}
        </div>
      </section>
      )}

      {/* 数据缺口 */}
      {(fit.data_gaps.length > 0 || (profile?.data_gaps.length ?? 0) > 0) && (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-amber-800"><AlertTriangle className="w-4 h-4" />数据缺口与置信度声明</div>
        <ul className="mt-2 list-disc pl-5 text-[12px] text-amber-800/90 space-y-1">
          {fit.data_gaps.map((g, i) => <li key={'f'+i}>{g}</li>)}
          {(profile?.data_gaps || []).map((g, i) => <li key={'p'+i}>{g}</li>)}
        </ul>
      </section>
      )}
      </>
      ) : (
        <section className={cardCls}>
          {mdText ? <pre className="whitespace-pre-wrap text-[12.5px] text-ink-800 leading-relaxed font-sans">{mdText}</pre>
                  : <Empty text="该版本报告文本缺失，请查看结构化报告" />}
        </section>
      )}
    </>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#F0F0F5" strokeWidth="9" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 42 * score / 100} ${2 * Math.PI * 42}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-[10px] text-ink-400 mt-0.5">/100</span>
      </div>
    </div>
  );
}

function CardTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
      {typeof icon === 'string' ? <span>{icon}</span> : icon}{title}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition ' + (active ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50')}>
      {icon}{children}
    </button>
  );
}

function ReasonRow({ r, tone }: { r: Reason; tone: 'for' | 'against' }) {
  const dot = r.weight === 'high' ? (tone === 'for' ? 'bg-emerald-500' : 'bg-rose-500') : r.weight === 'medium' ? 'bg-amber-400' : 'bg-ink-300';
  return (
    <div className="flex gap-2">
      <span className={'mt-1.5 w-2 h-2 rounded-full shrink-0 ' + dot} title={`权重：${r.weight}`} />
      <div>
        <div className="text-[12.5px] text-ink-800 leading-relaxed">{r.point}</div>
        {r.evidence && <div className="text-[11.5px] text-ink-400 mt-0.5 leading-relaxed">证据：{r.evidence}</div>}
      </div>
    </div>
  );
}

function Empty({ text = '证据不足，暂未给出' }: { text?: string }) {
  return <span className="text-[12px] text-ink-300">{text}</span>;
}
