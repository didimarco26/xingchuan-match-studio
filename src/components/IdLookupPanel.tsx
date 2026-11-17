// ============================================================
// 🪪 星图达人本地化查询/匹配（xc-id-lookup）· 对外工作台内嵌面板
//   全流程均在本面板内完成：上传名单 → 登录 → 互查 → 导出 / 写回 Base
//   本机工具（127.0.0.1:7843）仅作为后台服务，不再跳转独立页面。
//   上传窗口常驻显示；工具未启动时上传区灰显并给出引导。
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Download, Apple, Monitor, Package, Info, RefreshCw, Loader2,
  CheckCircle2, XCircle, FileSpreadsheet, ScanSearch, LogIn, X, Play, UploadCloud,
  Database, Save, AlertTriangle, FolderUp, Search, Lock,
} from 'lucide-react';
import { loadXlsx } from '../lib/load-xlsx';

const TOOL = 'http://127.0.0.1:7843';
const TOOL_BASE = 'tools/xc-id-lookup';
const RELEASE_BASE = 'https://github.com/didimarco26/xingchuan-workbench/releases/latest/download';
const MAC_ZIP_URL = `${TOOL_BASE}/mac-v1.zip`;
const WIN_ZIP_URL = `${TOOL_BASE}/win-v1.zip`;
const ZIP_URL = `${TOOL_BASE}/xc-id-lookup-v1.zip`;
const TEMPLATE_URL = `${TOOL_BASE}/xc-id-template.xlsx`;
const FAAS_URL = 'https://magic.solutionsuite.cn/api/faas/zz28FjWVyIhWV';

const VIA_LABEL: Record<string, string> = {
  id_home: '星图ID直达主页',
  douyin_exact: '抖音号精确匹配',
  douyin_fuzzy: '抖音号模糊(排序第一)',
  name_search: '名称搜索(排序第一)',
};

interface Health {
  ok: boolean; version: string; loggedIn: boolean; loginPending?: boolean;
  lookup?: { running: boolean; total: number; done: number; current: string | null; phase: string };
}
interface Item {
  row: number; id: string; douyin: string; name: string;
  recordId?: string; orig: Record<string, string>;
}
interface ResRow extends Item {
  found: boolean; via: string; matchType: string; status: string;
}
interface CpInfo { found: boolean; total: number; done: number; finished: boolean }
interface BaseData {
  app_token: string; table_id: string;
  allFields: { field_id: string; name: string; type: number }[];
  records: { record_id: string; fields: Record<string, unknown> }[];
}
type TabKey = 'file' | 'base';
type ColMap = { id: string; douyin: string; name: string };

// ---- 通用工具 ----
async function toolFetch(path: string, init?: RequestInit, timeoutMs = 4000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(TOOL + path, { ...init, signal: ctrl.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(cellText).join(' ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.text || o.name || o.link || '');
  }
  return String(v).trim();
}

// 列角色自动识别（口径与本机工具 classifyHeaders 一致）
function classify(headers: string[]): ColMap {
  const douyin = headers.find(h => /抖音号|抖音id|抖音账号|抖音|douyin|unique_?id/i.test(h)) || '';
  const id = headers.find(h => h !== douyin && /星图id|星图达人id|达人id|星图|star_?id|author_?id|\bid\b|uid|(?:^|[\s_])编号$/i.test(h)) || '';
  const name = headers.find(h => h !== id && h !== douyin && /达人名称|达人名|昵称|名字|主播名|主播|账号名|name/i.test(h)) || '';
  return { id, douyin, name };
}

function parseBaseUrl(s: string): { app_token: string; table_id: string; view_id: string } | null {
  let u: URL;
  try { u = new URL(String(s).trim()); } catch { return null; }
  const parts = u.pathname.split('/').filter(Boolean);
  const bi = parts.indexOf('base');
  const app = bi >= 0 ? parts[bi + 1] || '' : '';
  let table = u.searchParams.get('table') || '';
  if (!table && bi >= 0) table = parts[bi + 2] || '';
  const view = u.searchParams.get('view') || '';
  return app ? { app_token: app, table_id: table, view_id: view } : null;
}

async function callFaaS(payload: Record<string, unknown>) {
  const r = await fetch(FAAS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await r.json();
}

// ============================================================
export default function IdLookupPanel({ onBack }: { onBack: () => void }) {
  // ---- 本机工具连接状态 ----
  const [health, setHealth] = useState<Health | null>(null);
  const [connTick, setConnTick] = useState(0);
  const online = !!(health && health.ok);

  useEffect(() => {
    let stop = false;
    const ping = () => toolFetch('/health', undefined, 2200)
      .then((h: Health) => { if (!stop) setHealth(h); })
      .catch(() => { if (!stop) setHealth(null); });
    ping();
    const t = setInterval(ping, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [connTick]);

  // ---- 来源 tab ----
  const [tab, setTab] = useState<TabKey>('file');

  // ---- 名单 / 断点 / 互查 ----
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<unknown[][]>([]);
  const [map, setMap] = useState<ColMap>({ id: '', douyin: '', name: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [cp, setCp] = useState<CpInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResRow[]>([]);
  const [prog, setProg] = useState({ total: 0, done: 0, current: '', phase: '' });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 文件解析提示 ----
  const [fileName, setFileName] = useState('');
  const [parseMsg, setParseMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // ---- 登录 ----
  const [loginMsg, setLoginMsg] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [qr, setQr] = useState('');
  const qrRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Base ----
  const [baseUrl, setBaseUrl] = useState('');
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseData, setBaseData] = useState<BaseData | null>(null);
  const [baseMap, setBaseMap] = useState<ColMap>({ id: '', douyin: '', name: '' });
  const [baseMsg, setBaseMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [writeMsg, setWriteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ============================================================
  // 登录星图（面板内完成）
  // ============================================================
  const stopQr = () => { if (qrRef.current) { clearInterval(qrRef.current); qrRef.current = null; } };
  const startLogin = useCallback(async () => {
    setLoginBusy(true); setQr('');
    setLoginMsg('⏳ 正在启动浏览器，请在弹出的 Chrome/Edge 窗口里完成登录…');
    stopQr();
    qrRef.current = setInterval(async () => {
      try {
        const r = await toolFetch('/login/qr', undefined, 4000);
        if (r && r.qr) {
          setQr(r.qr);
          setLoginMsg('⏳ 企业策略禁止弹窗，已改为二维码登录，请用手机抖音 App 扫码…');
        }
      } catch { /* ignore */ }
    }, 2500);
    try {
      const r = await toolFetch('/login', { method: 'POST' }, 300000);
      if (r && r.ok && r.loggedIn) {
        setLoginMsg('✅ 登录成功！可以开始互查。'); setQr('');
        setConnTick(x => x + 1);
      } else if (r && r.cancelled) setLoginMsg('登录已取消。');
      else if (r && r.needInstall) setLoginMsg('⚠️ ' + (r.message || '未找到可用浏览器，请安装 Chrome/Edge 后重试。'));
      else setLoginMsg('⚠️ ' + ((r && r.message) || '登录未完成，请重试。'));
    } catch {
      setLoginMsg('⚠️ 登录超时或工具已停止，请确认工具保持运行后重试。');
    } finally { stopQr(); setLoginBusy(false); }
  }, []);

  useEffect(() => () => { stopQr(); if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // ============================================================
  // 文件解析（客户端 SheetJS，无需占用本机工具）
  // ============================================================
  const handleFile = useCallback(async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setParseMsg({ ok: false, text: '仅支持 .xlsx / .xls / .csv 文件。' });
      return;
    }
    setParseMsg({ ok: true, text: `⏳ 正在解析 ${file.name} …` });
    try {
      const X = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = X.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
      if (!aoa.length) { setParseMsg({ ok: false, text: '文件为空（首个工作表未找到内容）。' }); return; }
      const hs = (aoa[0] as unknown[]).map(h => cellText(h));
      const rows = aoa.slice(1).filter(r => (r as unknown[]).some(c => cellText(c) !== ''));
      if (!rows.length) { setParseMsg({ ok: false, text: '只有表头、没有数据行。' }); return; }
      setFileName(file.name); setHeaders(hs); setDataRows(rows);
      setMap(classify(hs));
      setResults([]); setCp(null);
      setParseMsg({ ok: true, text: `✅ 解析成功：共 ${rows.length} 行。已自动识别名单列，可直接开始互查。` });
    } catch (e) {
      setParseMsg({ ok: false, text: '解析失败：' + ((e as Error).message || String(e)) });
    }
  }, []);

  // 列映射变化 / 数据变化 → 重建 items
  useEffect(() => {
    if (!headers.length || !dataRows.length) { setItems([]); return; }
    const idx = (h: string) => headers.indexOf(h);
    const iId = idx(map.id), iDy = idx(map.douyin), iNm = idx(map.name);
    const list: Item[] = [];
    dataRows.forEach((r, ri) => {
      const arr = r as unknown[];
      const orig: Record<string, string> = {};
      headers.forEach((h, hi) => { orig[h] = cellText(arr[hi]); });
      list.push({
        row: ri,
        id: iId >= 0 ? cellText(arr[iId]) : '',
        douyin: iDy >= 0 ? cellText(arr[iDy]) : '',
        name: iNm >= 0 ? cellText(arr[iNm]) : '',
        orig,
      });
    });
    const valid = list.filter(it => it.id || it.douyin || it.name);
    setItems(valid);
  }, [headers, dataRows, map]);

  // items 就绪 → 探测断点（文件 / base 各自的 source）
  useEffect(() => {
    if (!items.length) { setCp(null); return; }
    let stop = false;
    toolFetch('/checkpoint/peek', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, source: tab === 'base' ? 'base' : 'file' }),
    }).then((r: CpInfo) => { if (!stop) setCp(r && r.found ? r : null); })
      .catch(() => { if (!stop) setCp(null); });
    return () => { stop = true; };
  }, [items, tab]);

  // ============================================================
  // 互查：启动 + 轮询增量结果
  // ============================================================
  const pollOnce = useCallback((baseDone: number) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await toolFetch('/progress?since=' + baseDone, undefined, 6000);
        (r.results || []).forEach((rr: ResRow) => {
          setResults(prev => {
            const i = prev.findIndex(x => x.row === rr.row);
            if (i >= 0) { const c = prev.slice(); c[i] = rr; return c; }
            return [...prev, rr];
          });
        });
        setProg({
          total: r.total || 0, done: r.done || 0,
          current: r.current || '', phase: r.phase || '',
        });
        if (r.running) { pollOnce((r.results || []).length ? r.done : baseDone); }
        else {
          setRunning(false);
          // 最终全量拉一次，兜底无增量返回的场景
          const all = await toolFetch('/progress', undefined, 8000);
          setResults(all.results || []);
          setProg({ total: all.total || 0, done: all.done || 0, current: '', phase: '完成' });
        }
      } catch {
        // 网络抖动：继续重试
        pollOnce(baseDone);
      }
    }, 1000);
  }, []);

  const startLookup = useCallback(async (resume: boolean) => {
    if (!online || !items.length) return;
    setRunning(true);
    if (!resume) setResults([]);
    setProg({ total: items.length, done: 0, current: '', phase: '启动中' });
    try {
      const r = await toolFetch('/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, resume, source: tab === 'base' ? 'base' : 'file', meta: {} }),
      }, 30000);
      if (!r || r.ok === false) {
        setRunning(false);
        setProg(p => ({ ...p, phase: r && r.error ? '启动失败：' + r.error : '启动失败' }));
        return;
      }
      pollOnce(0);
    } catch {
      setRunning(false);
      setProg(p => ({ ...p, phase: '启动失败：工具无响应' }));
    }
  }, [online, items, tab, pollOnce]);

  const discardCp = useCallback(async () => {
    try {
      await toolFetch('/checkpoint/discard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, source: tab === 'base' ? 'base' : 'file' }),
      });
    } catch { /* ignore */ }
    setCp(null);
  }, [items, tab]);

  // ============================================================
  // 导出 Excel（与本机工具 buildExportRows 口径一致）
  // ============================================================
  const doExport = useCallback(async () => {
    const X = await loadXlsx();
    const cls = classify(headers);
    const finalHeaders = [...headers];
    if (!cls.douyin) finalHeaders.push('抖音号');
    if (!cls.id) finalHeaders.push('星图ID');
    if (!cls.name) finalHeaders.push('达人名称');
    finalHeaders.push('状态', '匹配方式');
    const isEmpty = (v: unknown) => v == null || String(v).trim() === '';
    const aoa: unknown[][] = [finalHeaders];
    results.forEach((r) => {
      const o: Record<string, string> = {};
      headers.forEach(h => { o[h] = (h in r.orig) ? r.orig[h] : ''; });
      const fill = (existing: string, canonical: string, v: string) => {
        if (!v) { if (!existing) o[canonical] = ''; return; }
        if (existing) { if (isEmpty(o[existing])) o[existing] = v; }
        else o[canonical] = v;
      };
      fill(cls.id, '星图ID', r.id);
      fill(cls.douyin, '抖音号', r.douyin);
      fill(cls.name, '达人名称', r.name);
      o['状态'] = r.status;
      o['匹配方式'] = VIA_LABEL[r.via] || r.matchType || '';
      aoa.push(finalHeaders.map(h => o[h] != null ? o[h] : ''));
    });
    const ws = X.utils.aoa_to_sheet(aoa);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, '互查结果');
    X.writeFile(wb, 'xc-id-lookup-互查结果.xlsx');
  }, [headers, results]);

  // ============================================================
  // 多维表格直连（FaaS 读取 / 写回）
  // ============================================================
  const loadBase = useCallback(async () => {
    const p = parseBaseUrl(baseUrl);
    if (!p) { setBaseMsg({ ok: false, text: '链接无法识别，请粘贴完整的多维表格链接。' }); return; }
    if (!p.table_id) { setBaseMsg({ ok: false, text: '链接中缺少数据表（table）信息，请打开具体某张数据表后再复制链接。' }); return; }
    setBaseLoading(true); setBaseMsg(null); setWriteMsg(null);
    try {
      const r = await callFaaS({
        stage: 'idlookup_base_records',
        app_token: p.app_token, table_id: p.table_id, view_id: p.view_id,
      });
      if (!r.ok) { setBaseMsg({ ok: false, text: '读取失败：' + (r.error || '未知错误') }); return; }
      const data: BaseData = {
        app_token: p.app_token, table_id: p.table_id,
        allFields: r.allFields || [], records: r.records || [],
      };
      if (!data.records.length) { setBaseMsg({ ok: false, text: '该表没有可读取的记录。' }); return; }
      setBaseData(data);
      const names = data.allFields.map(f => f.name);
      setBaseMap(classify(names));
      setResults([]); setCp(null);
      setBaseMsg({ ok: true, text: `✅ 读取成功：${data.records.length} 条记录，已自动识别名单列。` });
    } catch {
      setBaseMsg({ ok: false, text: '读取失败：网络异常，请稍后重试。' });
    } finally { setBaseLoading(false); }
  }, [baseUrl]);

  // Base 字段映射 → 重建 items（保留 recordId）
  useEffect(() => {
    if (tab !== 'base' || !baseData) return;
    const get = (rec: { fields: Record<string, unknown> }, field: string) =>
      field ? cellText(rec.fields[field]) : '';
    const list: Item[] = baseData.records.map((rec, i) => {
      const orig: Record<string, string> = {};
      baseData.allFields.forEach(f => { orig[f.name] = cellText(rec.fields[f.name]); });
      return {
        row: i, recordId: rec.record_id, orig,
        id: get(rec, baseMap.id),
        douyin: get(rec, baseMap.douyin),
        name: get(rec, baseMap.name),
      };
    });
    setItems(list.filter(it => it.id || it.douyin || it.name));
  }, [tab, baseData, baseMap]);

  const writeBack = useCallback(async () => {
    if (!baseData || !results.length) return;
    setWriteMsg({ ok: true, text: '⏳ 正在写回多维表格…' });
    try {
      const r = await callFaaS({
        stage: 'idlookup_base_writeback',
        app_token: baseData.app_token, table_id: baseData.table_id,
        mapping: { douyin: baseMap.douyin, starId: baseMap.id, name: baseMap.name },
        records: results
          .filter(x => x.recordId)
          .map(x => ({ record_id: x.recordId, douyin: x.douyin, starId: x.id, name: x.name })),
      });
      if (r.ok) setWriteMsg({ ok: true, text: `✅ 已写回 ${r.updated} 行到多维表格，可回到表格查看。` });
      else setWriteMsg({ ok: false, text: '写回失败：' + (r.error || '未知错误') });
    } catch {
      setWriteMsg({ ok: false, text: '写回失败：网络异常，请稍后重试。' });
    }
  }, [baseData, results, baseMap]);

  // ============================================================
  // JSX
  // ============================================================
  const loggedIn = !!(health && health.loggedIn);
  const canStart = online && loggedIn && items.length > 0 && !running;
  const showResume = !!cp && !cp.finished && cp.done < cp.total;

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      {/* ===== 顶部栏 ===== */}
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 返回首页
          </button>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-btn shrink-0">
            <ScanSearch className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-ink-900 flex items-center gap-2 flex-wrap">
              星图达人本地化查询/匹配
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">xc-id-lookup · v1.3.0</span>
            </h1>
            <p className="text-[11px] text-ink-400">补全「抖音号 + 星图ID + 达人名称」三元组 · 只查身份不评级 · 全程在本页完成</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-24">
        {/* ===== 本机工具状态 ===== */}
        <div className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 flex-wrap ${
          online ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
          {online ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-800">✅ 本机工具已连接（v{health!.version}）</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                loggedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {loggedIn ? '星图已登录' : '星图未登录 · 请先登录'}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-bold text-amber-900">未检测到本机工具 —— 上传名单可以先操作，互查前请按下方第 1 步启动工具（启动后这里自动变绿）</span>
            </>
          )}
        </div>

        {/* ===== 功能介绍 ===== */}
        <section className="mt-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-cyan-50/60 p-5">
          <h2 className="text-[14px] font-extrabold text-ink-900 flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-brand-600" /> 这个工具能帮你做什么
          </h2>
          <p className="mt-2 text-[12.5px] text-ink-600 leading-relaxed">
            当你手头的达人名单<b className="text-ink-800">只有「抖音号 / 星图ID / 达人名称」中的部分信息</b>、对不上号时，
            本工具复用你本机<b className="text-ink-800">真实登录的星图账号</b>，自动为每一行补全完整身份三元组——
            <b className="text-blue-700">抖音号 + 星图ID + 达人名称</b>，让残缺名单变成可直接对接的完整名单。
            <b className="text-rose-600">只补全身份信息，不做评级</b>。
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-white px-3.5 py-3">
              <p className="text-[12px] font-bold text-ink-900 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-brand-600" /> 适用场景</p>
              <p className="mt-1 text-[11.5px] text-ink-500 leading-relaxed">名单来自不同渠道、字段残缺：只有抖音号找不到主页，或只有名称无法锁定本人时批量补齐。</p>
            </div>
            <div className="rounded-xl border border-line bg-white px-3.5 py-3">
              <p className="text-[12px] font-bold text-ink-900 flex items-center gap-1.5"><Search className="w-3.5 h-3.5 text-brand-600" /> 三路智能匹配</p>
              <p className="mt-1 text-[11.5px] text-ink-500 leading-relaxed">按「星图ID 直达主页 ＞ 抖音号精确匹配 ＞ 名称搜索兜底」逐行检索，任一路径命中即补全。</p>
            </div>
            <div className="rounded-xl border border-line bg-white px-3.5 py-3">
              <p className="text-[12px] font-bold text-ink-900 flex items-center gap-1.5"><Save className="w-3.5 h-3.5 text-brand-600" /> 结果怎么用</p>
              <p className="mt-1 text-[11.5px] text-ink-500 leading-relaxed">可导出完整对照 Excel；若名单来自多维表格，可一键把补全值写回飞书多维表格。</p>
            </div>
          </div>
        </section>

        {/* ===== 第 1 步：下载并启动本机工具（固定占位） ===== */}
        {!online ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-white p-5 ring-1 ring-amber-100">
            <h2 className="text-[13.5px] font-bold text-ink-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-600" /> 第 1 步 · 下载并启动本机工具（仅首次需要）
            </h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a href={MAC_ZIP_URL} className="rounded-xl border border-line px-4 py-3 hover:border-brand-300 hover:bg-brand-50/50 transition block">
                <p className="flex items-center gap-2 text-[13px] font-bold text-ink-900"><Apple className="w-4 h-4" /> Mac 一键启动包</p>
                <p className="text-[11px] text-ink-400 mt-1">无需预装 Node，解压后双击 .command</p>
              </a>
              <a href={WIN_ZIP_URL} className="rounded-xl border border-line px-4 py-3 hover:border-brand-300 hover:bg-brand-50/50 transition block">
                <p className="flex items-center gap-2 text-[13px] font-bold text-ink-900"><Monitor className="w-4 h-4" /> Windows 一键启动包</p>
                <p className="text-[11px] text-ink-400 mt-1">需已安装 Node 18+，双击 .bat</p>
              </a>
              <a href={ZIP_URL} className="rounded-xl border border-line px-4 py-3 hover:border-brand-300 hover:bg-brand-50/50 transition block">
                <p className="flex items-center gap-2 text-[13px] font-bold text-ink-90"><FolderUp className="w-4 h-4" /> 通用包</p>
                <p className="text-[11px] text-ink-400 mt-1">适合有 Node 环境的用户</p>
              </a>
            </div>
            <p className="mt-3 text-[11.5px] text-ink-500 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-500" />
              <span>双击启动后只会出现一个<b>黑色后台窗口</b>，<b>不会再跳转到别的网页</b>；保持该窗口打开，回到本页面即可使用。如提示「无法打开 / 来自身份不明的开发者」，在启动脚本上右键 → 打开一次。</span>
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-[12.5px] font-bold text-emerald-900">第 1 步 · 本机工具已启动（v{health!.version}）</p>
          </section>
        )}

        {/* ===== 第 2 步：登录星图（固定占位） ===== */}
        {!online ? (
          <section className="mt-4 rounded-2xl border border-line bg-[#F7F8FC] px-5 py-3.5 flex items-center gap-2 opacity-70">
            <Lock className="w-4 h-4 text-ink-400" />
            <p className="text-[12.5px] font-bold text-ink-400">第 2 步 · 登录星图 —— 请先完成第 1 步启动工具</p>
          </section>
        ) : loggedIn ? (
          <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-[12.5px] font-bold text-emerald-900">第 2 步 · 星图已登录</p>
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-emerald-200 bg-white p-5 ring-1 ring-emerald-100">
            <h2 className="text-[13.5px] font-bold text-ink-900 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-emerald-600" /> 第 2 步 · 登录星图（仅需一次）
            </h2>
            <p className="mt-2 text-[12px] text-ink-600 leading-relaxed">
              点击按钮后在弹出的 Chrome/Edge 窗口里正常登录（扫码 / 账号密码均可）；若企业电脑禁止弹窗，会在下方显示二维码，用手机抖音 App 扫码。无需复制 Cookie。
            </p>
            <button type="button" onClick={startLogin} disabled={loginBusy}
              className="mt-3 inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-emerald-600 text-white text-[12.5px] font-bold hover:bg-emerald-700 disabled:opacity-60 transition">
              {loginBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              登录星图
            </button>
            {qr && <img src={qr} alt="登录二维码" className="mt-3 w-44 h-44 rounded-xl border border-line bg-white p-2" />}
            {loginMsg && <p className="mt-2 text-[12px] text-ink-600">{loginMsg}</p>}
          </section>
        )}

        {/* ===== 第 3 步：上传名单（常驻显示） ===== */}
        <section className={`mt-5 rounded-2xl border bg-white p-5 ${!online ? 'border-line' : 'border-brand-200'}`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-[13.5px] font-bold text-ink-900 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-brand-600" /> 第 3 步 · 选择达人名单
            </h2>
            <a href={TEMPLATE_URL} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-700 hover:text-brand-800">
              <FileSpreadsheet className="w-3.5 h-3.5" /> 下载空白名单模板
            </a>
          </div>

          {/* 来源切换 */}
          <div className="mt-3 inline-flex rounded-xl bg-[#F1F2F8] p-1">
            <button type="button" onClick={() => setTab('file')}
              className={`px-3.5 h-8 rounded-lg text-[12px] font-bold transition ${tab === 'file' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500'}`}>
              📄 Excel / CSV
            </button>
            <button type="button" onClick={() => setTab('base')}
              className={`px-3.5 h-8 rounded-lg text-[12px] font-bold transition ${tab === 'base' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500'}`}>
              <Database className="w-3.5 h-3.5 inline mr-1" />多维表格直连
            </button>
          </div>

          {/* ---- 文件来源：常驻上传窗口 ---- */}
          {tab === 'file' && (
            <div className="mt-4">
              <div
                onClick={() => !running && fileRef.current && fileRef.current.click()}
                onDragEnter={() => setDragOver(true)} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                className={`rounded-2xl border-2 border-dashed px-6 py-9 text-center cursor-pointer transition ${
                  dragOver ? 'border-brand-400 bg-brand-50/70' : 'border-line bg-[#FAFBFE] hover:border-brand-300'}`}
              >
                <UploadCloud className="w-8 h-8 text-brand-500 mx-auto" />
                <p className="mt-2 text-[13px] font-bold text-ink-800">点击选择，或把 Excel / CSV 拖到这里</p>
                <p className="mt-1 text-[11.5px] text-ink-400">支持 .xlsx / .xls / .csv · 名单需含 抖音号 / 星图ID / 达人名称 任意一列</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) handleFile(f); }} />
              </div>
              {fileName && <p className="mt-2 text-[12px] text-ink-500">📎 {fileName}</p>}
              {parseMsg && (
                <p className={`mt-2 text-[12px] ${parseMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{parseMsg.text}</p>
              )}

              {/* 列映射（解析后） */}
              {headers.length > 0 && (
                <div className="mt-4 rounded-xl bg-[#F7F8FC] border border-line p-3">
                  <p className="text-[11.5px] font-bold text-ink-600 mb-2">确认名单列（识别不准可手动调整）：</p>
                  <div className="flex flex-wrap gap-3">
                    {([['douyin', '抖音号列'], ['id', '星图ID列'], ['name', '达人名称列']] as const).map(([k, label]) => (
                      <label key={k} className="text-[11.5px] text-ink-600 flex items-center gap-1.5">
                        {label}
                        <select value={map[k]} onChange={(e) => setMap(m => ({ ...m, [k]: e.target.value }))}
                          className="rounded-lg border border-line bg-white h-8 px-2 text-[11.5px] max-w-[180px]">
                          <option value="">（不使用）</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- Base 来源 ---- */}
          {tab === 'base' && (
            <div className="mt-4">
              <div className="flex gap-2">
                <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder="粘贴多维表格链接（如 https://…feishu.cn/base/xxxx?table=xxxx）"
                  className="flex-1 h-10 rounded-xl border border-line bg-white px-3 text-[12px] min-w-0" />
                <button type="button" onClick={loadBase} disabled={baseLoading}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700 disabled:opacity-60">
                  {baseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} 读取名单
                </button>
              </div>
              {baseMsg && <p className={`mt-2 text-[12px] ${baseMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{baseMsg.text}</p>}

              {baseData && (
                <div className="mt-4 rounded-xl bg-[#F7F8FC] border border-line p-3">
                  <p className="text-[11.5px] font-bold text-ink-600 mb-2">确认表格字段：</p>
                  <div className="flex flex-wrap gap-3">
                    {([['douyin', '抖音号字段'], ['id', '星图ID字段'], ['name', '达人名称字段']] as const).map(([k, label]) => (
                      <label key={k} className="text-[11.5px] text-ink-600 flex items-center gap-1.5">
                        {label}
                        <select value={baseMap[k]} onChange={(e) => setBaseMap(m => ({ ...m, [k]: e.target.value }))}
                          className="rounded-lg border border-line bg-white h-8 px-2 text-[11.5px] max-w-[180px]">
                          <option value="">（不使用）</option>
                          {baseData.allFields.map(f => <option key={f.field_id} value={f.name}>{f.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <p className="mt-3 text-[12px] text-ink-500">
              共 <b className="text-ink-800">{items.length}</b> 行有效名单（至少含一项可检索信息）
              {!online && <span className="text-amber-700"> · 启动本机工具后即可互查</span>}
              {online && !loggedIn && <span className="text-amber-700"> · 请先完成星图登录</span>}
            </p>
          )}
        </section>

        {/* ===== 断点续跑提示 ===== */}
        {showResume && (
          <section className="mt-4 rounded-2xl border border-brand-200 bg-brand-50/80 px-4 py-3.5 flex items-center gap-3 flex-wrap">
            <span className="text-[12.5px] font-bold text-brand-900">⏸️ 检测到未完成的互查（已完成 {cp!.done}/{cp!.total}）</span>
            <button type="button" onClick={() => startLookup(true)} disabled={!canStart}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700 disabled:opacity-60">
              <Play className="w-3.5 h-3.5" /> 继续断点跑
            </button>
            <button type="button" onClick={discardCp}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-line bg-white text-[12px] font-bold text-ink-700 hover:border-rose-300 hover:text-rose-600">
              <X className="w-3.5 h-3.5" /> 放弃断点、重新开始
            </button>
          </section>
        )}

        {/* ===== 开始互查 + 进度 ===== */}
        {items.length > 0 && (
          <section className="mt-5">
            {!showResume && (
              <button type="button" onClick={() => startLookup(false)} disabled={!canStart}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-[13px] font-bold shadow-lg hover:opacity-95 disabled:opacity-50 disabled:shadow-none">
                <Play className="w-4 h-4" /> 开始互查（{items.length} 行）
              </button>
            )}
            {(running || prog.done > 0) && (
              <div className="mt-4 rounded-2xl border border-line bg-white p-4">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-bold text-ink-800">
                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5 text-brand-600" /> : <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 text-emerald-600" />}
                    {prog.phase || '互查中'} {prog.current ? `· ${prog.current}` : ''}
                  </span>
                  <span className="font-bold text-ink-700 tabnum">{prog.done}/{prog.total}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#EEF0F7] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all"
                    style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== 结果表 ===== */}
        {results.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-[13.5px] font-bold text-ink-900">互查结果（{results.length} 行）</h2>
              <div className="flex gap-2">
                <button type="button" onClick={doExport}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-brand-200 bg-brand-50 text-[12px] font-bold text-brand-700 hover:bg-brand-100">
                  <Download className="w-3.5 h-3.5" /> 导出 Excel
                </button>
                {tab === 'base' && baseData && (
                  <button type="button" onClick={writeBack}
                    className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700">
                    <Save className="w-3.5 h-3.5" /> 一键写回多维表格
                  </button>
                )}
              </div>
            </div>
            {writeMsg && <p className={`mt-2 text-[12px] ${writeMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{writeMsg.text}</p>}

            <div className="mt-3 rounded-2xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-[11.5px] min-w-[760px]">
                  <thead className="bg-[#F5F6FB] sticky top-0">
                    <tr className="text-ink-500">
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold">星图ID</th>
                      <th className="px-3 py-2 text-left font-semibold">抖音号</th>
                      <th className="px-3 py-2 text-left font-semibold">达人名称</th>
                      <th className="px-3 py-2 text-left font-semibold">状态</th>
                      <th className="px-3 py-2 text-left font-semibold">匹配方式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice().sort((a, b) => a.row - b.row).map((r) => (
                      <tr key={r.row} className="border-t border-line/70 hover:bg-[#FAFBFF]">
                        <td className="px-3 py-2 text-ink-400 tabnum">{r.row + 1}</td>
                        <td className="px-3 py-2 tabnum">{r.id || '—'}</td>
                        <td className="px-3 py-2">{r.douyin || '—'}</td>
                        <td className="px-3 py-2">{r.name || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 font-semibold ${r.found ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {r.found ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-ink-500">{VIA_LABEL[r.via] || r.matchType || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
