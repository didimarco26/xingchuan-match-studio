import { useState, useRef, useCallback } from 'react';
import {
  X, Download, Upload, FileSpreadsheet, Plus, Minus, Play, Loader2,
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, ClipboardList,
} from 'lucide-react';
import {
  extractFromUrl, fetchScoringReport, reportToText,
  type ScoringReport,
} from '../lib/api';
import { CATEGORIES } from '../data/scoring-categories';
import { scoreProduct, suggestCategory } from '../lib/scoring';
import { batchImportProduct } from '../lib/baopin';
import { loadXlsx } from '../lib/load-xlsx';

// ============================================================
// 📥 爆品库批量导入弹窗（对内 + 对外）
//   A. Excel/CSV 模板导入（下载模板 → 上传解析 → 预览确认 → 批量分析）
//   B. 网页表单逐行添加（动态 +/- 行 → 批量分析）
// 逐条分析：识别链接 → 本地打分 → 一页纸报告 → 立即写入爆品库
// ============================================================

type Tab = 'excel' | 'form';
type Phase = 'input' | 'preview' | 'running' | 'finished';
type RowStatus = 'pending' | 'running' | 'done' | 'error';

interface BatchRow {
  url: string;
  xcBudgetWan: string;
  price: string;
  stableRoi: string;
  targetRoi: string;
  reverseSelectPct: string;
  materialChasePct: string;
}

interface RunState {
  status: RowStatus;
  step: string;
  name: string;
  score: number | null;
  level: string;
  error: string;
}

const HEADERS = [
  '商品链接', '星川日预算（万元/天）', '产品客单价（元）', '千川稳定ROI',
  '追投下星川目标ROI', '达人反选比例（%）', '达人素材追投数量比例（%）',
];
const FIELD_KEYS: (keyof Omit<BatchRow, 'url'>)[] = [
  'xcBudgetWan', 'price', 'stableRoi', 'targetRoi', 'reverseSelectPct', 'materialChasePct',
];
const PLACEHOLDERS = ['1', '99', '2.5', '2', '10', '80'];

const EMPTY_ROW: BatchRow = {
  url: '', xcBudgetWan: '', price: '', stableRoi: '',
  targetRoi: '', reverseSelectPct: '', materialChasePct: '',
};

const toNum = (s: string): number | null => {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
};

// 表头模糊匹配：返回 {列名: 列索引}
function mapHeader(headerCells: string[]): Record<string, number> {
  const find = (keys: string[]) => headerCells.findIndex(h => {
    const t = String(h || '').replace(/[\s（）()]/g, '');
    return keys.some(k => t.includes(k.replace(/[\s（）()]/g, '')));
  });
  const out: Record<string, number> = {};
  const urlIdx = find(['商品链接', '链接', '商品URL', 'URL']);
  out.url = urlIdx;
  out.xcBudgetWan = find(['星川日预算', '日预算']);
  out.price = find(['产品客单价', '客单价']);
  out.stableRoi = find(['千川稳定ROI', '稳定ROI']);
  out.targetRoi = find(['追投下星川目标ROI', '目标ROI']);
  out.reverseSelectPct = find(['达人反选比例', '反选']);
  out.materialChasePct = find(['达人素材追投数量比例', '素材追投']);
  return out;
}

// ---- 模板下载 ----
async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const example = [
    'https://haohuo.jinritemai.com/views/product/item2?id=36xxxxxxxx（粘贴抖店/精选联盟商品链接）',
    1, 99, 2.5, 2, 10, 80,
  ];
  const note = ['↑ 按此格式填写，删除示例行后上传；仅「商品链接」必填，其余参数留空也可分析'];
  const ws: any = XLSX.utils.aoa_to_sheet([HEADERS, example, note]);
  ws['!cols'] = HEADERS.map((h, i) => ({ wch: i === 0 ? 46 : Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '爆品库导入');
  XLSX.writeFile(wb, '代理商爆品库导入模板.xlsx');
}

export default function BatchImportModal(
  { agency, onClose, onDone }: { agency?: string; onClose: () => void; onDone: () => void },
) {
  const [tab, setTab] = useState<Tab>('excel');
  const [phase, setPhase] = useState<Phase>('input');

  // 表单模式行
  const [formRows, setFormRows] = useState<BatchRow[]>([{ ...EMPTY_ROW }]);
  // 待分析行（两种模式确认后统一进入）
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [parseHint, setParseHint] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 运行态
  const batchIdRef = useRef(`BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const [runs, setRuns] = useState<RunState[]>([]);
  const abortRef = useRef(false);

  // -------- Excel 上传解析 --------
  const handleFile = async (file: File) => {
    setParseHint('');
    try {
      const XLSX = await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      if (!matrix.length) throw new Error('文件内容为空');
      const headerCells = matrix[0].map(c => String(c));
      const idx = mapHeader(headerCells);
      if (idx.url < 0) throw new Error('未找到「商品链接」列，请使用最新模板');
      const cell = (r: unknown[], i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '');
      const parsed: BatchRow[] = [];
      for (let r = 1; r < matrix.length; r++) {
        const rowArr = matrix[r];
        const url = cell(rowArr, idx.url);
        if (!url || /^[↑\s·\-—]+$/.test(url) || url.includes('按此格式填写')) continue;
        parsed.push({
          url,
          xcBudgetWan: cell(rowArr, idx.xcBudgetWan),
          price: cell(rowArr, idx.price),
          stableRoi: cell(rowArr, idx.stableRoi),
          targetRoi: cell(rowArr, idx.targetRoi),
          reverseSelectPct: cell(rowArr, idx.reverseSelectPct),
          materialChasePct: cell(rowArr, idx.materialChasePct),
        });
      }
      if (!parsed.length) throw new Error('未解析到有效商品行（示例行已自动跳过）');
      setRows(parsed);
      setPhase('preview');
    } catch (e) {
      setParseHint('解析失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // -------- 单条分析 --------
  const analyzeOne = useCallback(async (row: BatchRow, index: number, total: number): Promise<boolean> => {
    const patch = (p: Partial<RunState>) => setRuns(rs => rs.map((x, i) => (i === index ? { ...x, ...p } : x)));
    try {
      patch({ status: 'running', step: '正在识别商品信息…' });
      const extracted = await extractFromUrl(row.url);
      if (!extracted) throw new Error('商品链接识别失败，请检查链接或稍后重试');
      const name = extracted.productName.trim();
      if (!name) throw new Error('未能获取商品名（页面可能需要登录），可改用商品ID或稍后重试');

      // 二级类目基线：parse 给出的类目优先，其次商品名联想
      const baseline =
        CATEGORIES.find(c => c.level2 === extracted.category) ||
        suggestCategory(name) || null;
      const level1 = baseline?.level1 || '';

      const price = toNum(row.price) ?? extracted.price;
      const xcBudgetWan = toNum(row.xcBudgetWan);
      const stableRoi = toNum(row.stableRoi);
      const targetRoi = toNum(row.targetRoi);
      const reverseSelectPct = toNum(row.reverseSelectPct);
      const materialChasePct = toNum(row.materialChasePct);

      patch({ step: '正在计算综合得分…' });
      const result = scoreProduct({
        xcBudgetWan, stableRoi, targetRoi, reverseSelectPct, materialChasePct,
        price, category: baseline,
      });

      patch({ step: '正在生成一页纸报告…' });
      let report: ScoringReport;
      try {
        report = await fetchScoringReport({
          product: {
            productName: name, brand: extracted.brand,
            industry: extracted.industry || '',
            category: baseline?.level2 || extracted.category,
            price, sellingPoints: extracted.sellingPoints, agent: agency || '',
            usageScene: extracted.usageScene, targetAudience: extracted.targetAudience,
          },
          inputs: {
            xcBudgetWan, dailySpend: null, penetration: null,
            stableRoi, targetRoi, reverseSelectPct, materialChasePct,
          },
          category: (baseline as unknown as Record<string, unknown>) || null,
          result: {
            total: result.total, level: result.level,
            budgetRatio: result.budgetRatio, tolerance: result.tolerance,
            roiRatio: result.roiRatio, priceDev: result.priceDev,
            dims: result.dims.map(d => ({ name: d.name, score: d.score, max: d.max, band: d.band })),
          },
          ai: null,
        });
      } catch {
        // 报告失败不阻断：用本地分数拼简版报告
        const today = new Date().toISOString().slice(0, 10);
        report = {
          headline: `星川综合得分 ${result.total} 分`,
          narrative: '一页纸报告生成失败，已保留五维得分，可稍后在商品分析页重新生成。',
          dimReports: result.dims.map(d => ({
            key: d.key, opportunity: d.band, points: [d.band],
          })),
          actionItems: [{
            task: '按五维短板补齐投放参数后重新生成报告',
            cycle: '本周', signal: '综合得分提升至60+',
          }],
          degraded: true,
        };
        void today;
      }

      const today = new Date().toISOString().slice(0, 10);
      const reportText = reportToText(report, {
        productName: name, brand: extracted.brand, agent: agency || '', date: today,
        total: result.total, levelLabel: result.level,
        dims: result.dims.map(d => ({ name: d.name, score: d.score, max: d.max })),
        redLines: [],
      });

      patch({ step: '正在写入爆品库…', name });
      const r = await batchImportProduct({
        product: {
          productName: name, brand: extracted.brand,
          level1, level2: baseline?.level2 || '',
          url: extracted.url || row.url,
        },
        scoreResult: {
          total: result.total,
          dims: result.dims.map(d => ({ name: d.name, score: d.score, max: d.max })),
        },
        category: (baseline as unknown as Record<string, unknown>) || null,
        inputs: { xcBudgetWan, price, stableRoi, targetRoi, reverseSelectPct, materialChasePct },
        reportText,
      }, { batchId: batchIdRef.current, index, total });

      patch({
        status: 'done', step: '', name,
        score: r.comp, level: r.level || '',
      });
      return true;
    } catch (e) {
      patch({
        status: 'error', step: '',
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }, [agency]);

  // -------- 开始批量分析（串行） --------
  const startBatch = async (batchRows: BatchRow[]) => {
    abortRef.current = false;
    setRuns(batchRows.map(() => ({
      status: 'pending', step: '', name: '', score: null, level: '', error: '',
    })));
    setPhase('running');
    // 让出一帧渲染进度
    await new Promise(r => setTimeout(r, 60));
    let okCount = 0;
    for (let i = 0; i < batchRows.length; i++) {
      if (abortRef.current) break;
      const ok = await analyzeOne(batchRows[i], i, batchRows.length);
      if (ok) okCount++;
    }
    setPhase('finished');
  };

  // 失败行重试
  const retryFailed = async () => {
    const failedIdx = runs.map((r, i) => (r.status === 'error' ? i : -1)).filter(i => i >= 0);
    setRuns(rs => rs.map((x, i) => failedIdx.includes(i)
      ? { ...x, status: 'pending', error: '', step: '', name: '' } : x));
    setPhase('running');
    await new Promise(r => setTimeout(r, 60));
    for (const i of failedIdx) {
      await analyzeOne(rows[i], i, rows.length);
    }
    setPhase('finished');
  };

  // -------- 表单行操作 --------
  const updateFormRow = (i: number, key: keyof BatchRow, v: string) =>
    setFormRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const addFormRow = () => setFormRows(rs => [...rs, { ...EMPTY_ROW }]);
  const removeFormRow = (i: number) => setFormRows(rs => rs.filter((_, j) => j !== i));

  const formValidRows = formRows.filter(r => r.url.trim());
  const confirmForm = () => {
    if (!formValidRows.length) return;
    setRows(formValidRows);
    setPhase('preview');
  };

  // 预览中删除某行
  const removePreviewRow = (i: number) => setRows(rs => {
    const next = rs.filter((_, j) => j !== i);
    if (!next.length) setPhase('input');
    return next;
  });

  const doneCount = runs.filter(r => r.status === 'done').length;
  const errCount = runs.filter(r => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-line-soft">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-ink-900">📥 批量导入爆品</h3>
            <p className="text-[11px] text-ink-400">逐条自动分析并立即写入爆品库，支持中断后重试失败行</p>
          </div>
          {(phase === 'input' || phase === 'preview' || phase === 'finished') && (
            <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-canvas text-ink-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-auto px-5 py-4">
          {/* ============ 输入阶段 ============ */}
          {phase === 'input' && (
            <>
              <div className="inline-flex rounded-lg border border-line overflow-hidden mb-4">
                {([['excel', 'Excel/CSV 导入'], ['form', '网页表单填写']] as [Tab, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => { setTab(k); setParseHint(''); }}
                    className={`px-4 py-1.5 text-xs ${tab === k ? 'bg-brand-600 text-white font-bold' : 'bg-white text-ink-600 hover:bg-canvas'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'excel' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-6 flex flex-col items-center gap-3 text-center">
                    <FileSpreadsheet className="w-10 h-10 text-brand-500" />
                    <div className="text-[13px] font-bold text-ink-800">第一步：下载标准模板填写</div>
                    <button type="button" onClick={downloadTemplate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-50">
                      <Download className="w-3.5 h-3.5" /> 下载 Excel 模板
                    </button>
                    <p className="text-[11px] text-ink-400 max-w-md">
                      模板列：商品链接（必填）、星川日预算、产品客单价、千川稳定ROI、追投目标ROI、达人反选比例、素材追投比例
                    </p>
                  </div>
                  <div className="rounded-xl border border-dashed border-line bg-canvas/60 p-6 flex flex-col items-center gap-3 text-center">
                    <Upload className="w-9 h-9 text-ink-400" />
                    <div className="text-[13px] font-bold text-ink-800">第二步：上传填好的 Excel/CSV</div>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold shadow-btn hover:bg-brand-700">
                      <Upload className="w-3.5 h-3.5" /> 选择文件上传
                    </button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
                    {parseHint && <div className="text-[12px] text-red-600">{parseHint}</div>}
                  </div>
                </div>
              )}

              {tab === 'form' && (
                <div className="space-y-3">
                  <div className="hidden sm:grid grid-cols-[1fr_64px_64px_64px_64px_72px_72px_32px] gap-1.5 px-1 text-[10px] font-bold text-ink-400">
                    <span>商品链接 / 分享文案（必填）</span>
                    <span>日预算(万)</span><span>客单价</span><span>稳定ROI</span>
                    <span>目标ROI</span><span>反选(%)</span><span>追投(%)</span><span />
                  </div>
                  {formRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_64px_64px_64px_64px_72px_72px_32px] gap-1.5 items-center">
                      <input value={row.url} onChange={e => updateFormRow(i, 'url', e.target.value)}
                        placeholder="粘贴商品链接"
                        className="col-span-2 sm:col-span-1 px-2 py-1.5 rounded-lg border border-line text-xs min-w-0" />
                      {FIELD_KEYS.map((k, ki) => (
                        <input key={k} value={row[k]} onChange={e => updateFormRow(i, k, e.target.value)}
                          inputMode="decimal" placeholder={PLACEHOLDERS[ki]}
                          className="px-2 py-1.5 rounded-lg border border-line text-xs w-full min-w-0" />
                      ))}
                      <button type="button" onClick={() => (formRows.length > 1 ? removeFormRow(i) : setFormRows([{ ...EMPTY_ROW }]))}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-line text-ink-400 hover:text-red-600 hover:border-red-300">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addFormRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-line text-xs text-ink-600 hover:border-brand-300 hover:text-brand-700">
                    <Plus className="w-3.5 h-3.5" /> 添加一行
                  </button>
                </div>
              )}
            </>
          )}

          {/* ============ 预览阶段 ============ */}
          {phase === 'preview' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-[13px] font-bold text-ink-800">
                  共解析到 {rows.length} 个商品，请确认后开始批量分析
                </span>
              </div>
              <div className="rounded-xl border border-line overflow-hidden">
                <div className="overflow-auto max-h-[46vh]">
                  <table className="w-full text-[11px]">
                    <thead className="bg-canvas sticky top-0">
                      <tr>
                        <th className="px-2.5 py-2 text-left font-bold text-ink-500">#</th>
                        <th className="px-2.5 py-2 text-left font-bold text-ink-500 min-w-[200px]">商品链接</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">日预算</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">客单价</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">稳定ROI</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">目标ROI</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">反选%</th>
                        <th className="px-2.5 py-2 text-right font-bold text-ink-500">追投%</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-t border-line-soft">
                          <td className="px-2.5 py-1.5 text-ink-400">{i + 1}</td>
                          <td className="px-2.5 py-1.5 text-ink-700 max-w-[280px]">
                            <div className="truncate">{r.url}</div>
                          </td>
                          <td className="px-2.5 py-1.5 text-right">{r.xcBudgetWan || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right">{r.price || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right">{r.stableRoi || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right">{r.targetRoi || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right">{r.reverseSelectPct || '—'}</td>
                          <td className="px-2.5 py-1.5 text-right">{r.materialChasePct || '—'}</td>
                          <td className="px-1 py-1.5 text-center">
                            <button type="button" onClick={() => removePreviewRow(i)}
                              className="text-ink-300 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ============ 运行 / 完成阶段 ============ */}
          {(phase === 'running' || phase === 'finished') && (
            <div className="space-y-2">
              {phase === 'running' && (
                <div className="flex items-center gap-2 text-[12px] text-brand-700 font-bold mb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在分析第 {Math.min(doneCount + errCount + 1, runs.length)}/{runs.length} 个商品
                  <span className="text-ink-400 font-normal">
                    （已完成 {doneCount}，失败 {errCount}）
                  </span>
                </div>
              )}
              {phase === 'finished' && (
                <div className={`rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2 ${
                  errCount ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  {errCount ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  批量分析完成：成功 {doneCount} 个{errCount ? `，失败 ${errCount} 个` : ''}
                </div>
              )}
              {runs.map((r, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 flex items-center gap-2.5 ${
                  r.status === 'done' ? 'border-green-200 bg-green-50/50'
                    : r.status === 'error' ? 'border-red-200 bg-red-50/50'
                      : r.status === 'running' ? 'border-brand-200 bg-brand-50/50'
                        : 'border-line-soft'}`}>
                  {r.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                  {r.status === 'error' && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  {r.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-brand-600 shrink-0" />}
                  {r.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-line shrink-0" />}
                  <div className="min-w-0 flex-1">
                    {r.status === 'pending' && (
                      <span className="text-[12px] text-ink-400 truncate block">{rows[i]?.url}</span>
                    )}
                    {r.status === 'running' && (
                      <>
                        {r.name && <div className="text-[12px] font-bold text-ink-800 truncate">{r.name}</div>}
                        <div className="text-[11px] text-brand-600">{r.step}</div>
                      </>
                    )}
                    {r.status === 'done' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-ink-800 truncate max-w-[320px]">{r.name}</span>
                        <span className="text-[11px] text-ink-500">综合 <b>{r.score}</b></span>
                        {r.level && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                            AI {r.level}
                          </span>
                        )}
                      </div>
                    )}
                    {r.status === 'error' && (
                      <div className="text-[11px] text-red-600 truncate">{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line-soft flex items-center justify-end gap-2">
          {phase === 'input' && tab === 'form' && (
            <>
              <span className="mr-auto text-[11px] text-ink-400">已填 {formValidRows.length} 行有效商品</span>
              <button type="button" onClick={confirmForm} disabled={!formValidRows.length}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold shadow-btn disabled:opacity-40">
                下一步：确认
              </button>
            </>
          )}
          {phase === 'preview' && (
            <>
              <button type="button" onClick={() => setPhase('input')}
                className="px-3.5 py-2 rounded-lg border border-line text-xs font-medium text-ink-600">
                返回修改
              </button>
              <button type="button" onClick={() => void startBatch(rows)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-rose-600 text-white text-xs font-bold shadow-btn">
                <Play className="w-3.5 h-3.5" /> 开始批量分析（{rows.length} 个）
              </button>
            </>
          )}
          {phase === 'running' && (
            <span className="text-[11px] text-ink-400 mr-auto">请稍候，每条结果将立即写入爆品库…</span>
          )}
          {phase === 'finished' && (
            <>
              {errCount > 0 && (
                <button type="button" onClick={retryFailed}
                  className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-bold">
                  <RefreshCw className="w-3.5 h-3.5" /> 重试 {errCount} 个失败项
                </button>
              )}
              <button type="button" onClick={() => { onDone(); onClose(); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold shadow-btn">
                <CheckCircle2 className="w-3.5 h-3.5" /> 关闭并刷新列表
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
