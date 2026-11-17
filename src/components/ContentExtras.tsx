import { useEffect, useRef, useState } from 'react';
import {
  Paperclip, Loader2, FileText, Image as ImageIcon, AlertTriangle, Sparkles, Check,
  Copy, Download, Printer, RotateCcw, ShieldAlert, Users, Target, Clapperboard, Lightbulb,
  FileType, Workflow,
} from 'lucide-react';
import type { BriefDirection } from '../lib/api';
import {
  optimizeBriefs, genMaterialStrategy, strategyToMarkdown, downloadTextFile,
  exportHtmlToPdf, extractClientBriefFile, downloadStrategyDoc,
  type MaterialStrategy,
} from '../lib/content-extra';

// ============================================================
// 对外版内容创意扩展（仅在 GitHub Pages 公开版渲染）：
//   ① 素材策略单一页纸（商品洞察完成后自动生成；位于 Brief 拆解之前；
//      无 Brief 也可基于商品信息生成；真人/桌拍/混剪/图文配比按商品特性
//      与脚本方向自动推算，只保留有意义的 2-4 类；含每方向首选素材形式+
//      判断逻辑、五环节跑量公式；支持复制/PDF/Word/Markdown）
//   ② 客户 Brief 上传优化（折叠在一页纸底部：本机 OCR/解析后 AI 重写 Brief）
// ============================================================

export interface StrategyProductInfo {
  productName: string;
  brand?: string;
  industry?: string;
  category?: string;
  url?: string;
  sellingPoints?: string;
  targetAudience?: string;
}

interface StrategyCardProps {
  briefs: BriefDirection[];
  contextText: string;
  category?: string;
  product: StrategyProductInfo;
  /** 挂载即自动生成一次（商品洞察流完成进入内容创意时使用；组件靠外层 key 重挂载重跑） */
  autoGenerate?: boolean;
  // —— 客户 Brief 优化（版本状态由外层持有，供 Brief 拆解区联动切换） ——
  originalBriefs?: BriefDirection[];
  briefsVersion?: 'original' | 'optimized';
  briefsOptimized?: BriefDirection[] | null;
  onOptimized?: (list: BriefDirection[], notes: string) => void;
  onSwitchVersion?: (v: 'original' | 'optimized') => void;
}

// ------------------------------------------------------------
// 素材策略单一页纸（底部集成「参考客户 Brief 后优化策略」）
// ------------------------------------------------------------
export function MaterialStrategyCard({
  briefs, contextText, category, product,
  autoGenerate = false,
  originalBriefs, briefsVersion, briefsOptimized, onOptimized, onSwitchVersion,
}: StrategyCardProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState<MaterialStrategy | null>(null);
  const [copied, setCopied] = useState(false);

  // 客户 Brief 优化（折叠区）
  const briefEnabled = !!(onOptimized && originalBriefs);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [briefText, setBriefText] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [briefErr, setBriefErr] = useState('');
  const [optNotes, setOptNotes] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const autoTriedRef = useRef(false);

  const generate = async (opts?: { auto?: boolean }) => {
    setErr(''); setLoading(true);
    try {
      const r = await genMaterialStrategy({ product, briefs, context: contextText, category });
      setData(r);
      if (!opts?.auto) {
        setTimeout(() => document.getElementById('sec-strategy-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // 商品分析 → 点击「商品洞察」进入内容创意：挂载即自动生成一页纸，无需再点
  useEffect(() => {
    if (autoGenerate && !autoTriedRef.current && !data) {
      autoTriedRef.current = true;
      void generate({ auto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetBriefFile = () => {
    setFileName(''); setFileType(''); setBriefText(''); setBriefErr(''); setOptNotes(''); setOcrProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onBriefFile = async (file?: File | null) => {
    if (!file) return;
    setBriefErr(''); setFileBusy(true); setOcrProgress(0); setOptNotes('');
    try {
      const r = await extractClientBriefFile(file, p => setOcrProgress(p));
      setFileName(r.fileName); setFileType(r.fileType); setBriefText(r.text);
    } catch (e) {
      setBriefErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFileBusy(false);
    }
  };

  const doOptimize = async () => {
    const clientText = briefText.trim();
    if (!clientText) { setBriefErr('请先上传客户 Brief 文件，或在下方粘贴 Brief 文字'); return; }
    if (!originalBriefs?.length) { setBriefErr('请先完成 Brief 方向拆解'); return; }
    setBriefErr(''); setOptimizing(true);
    try {
      const r = await optimizeBriefs({ briefs: originalBriefs, clientBrief: clientText, context: contextText, category });
      onOptimized?.(r.briefs, r.notes);
      setOptNotes(r.notes);
    } catch (e) {
      setBriefErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOptimizing(false);
    }
  };

  const md = () => (data ? strategyToMarkdown(data) : '');

  const copyAll = async () => {
    const t = md(); if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  const toPdf = () => {
    if (!data) return;
    const s = data;
    const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ul = (arr: string[]) => `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const mixRows = s.mix.map(m =>
      `<tr><td><b>${esc(m.label)}</b></td><td>${m.count} 条（${m.pct}%）</td><td>${esc(m.usage)}</td></tr>`).join('');
    const dirRows = s.directions.map(d =>
      `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.validationGoal || '—')}</td><td>${esc(d.materialFormat || '—')}</td><td>${d.pickLabel ? `首选「${esc(d.pickLabel)}」：${esc(d.pickReason || '')}` : '—'}${d.secondLabel ? `<br/>次选「${esc(d.secondLabel)}」：${esc(d.secondReason || '')}` : ''}</td></tr>`).join('');
    const formulaRows = (s.formula || []).map(f =>
      `<tr><td><b>${esc(f.stage)}</b></td><td>${esc(f.technique)}</td><td>${esc(f.detail)}</td><td>${esc(f.goal)}</td></tr>`).join('');
    const html = `
      <p class="muted">品牌：${esc(s.brand) || '—'}　｜　商品链接：${s.url ? `<a href="${esc(s.url)}">${esc(s.url)}</a>` : '—'}　｜　类型：${esc(s.productType)}</p>
      <h2>行业人群画像</h2><p>${esc(s.audience)}</p>
      <h2>产品核心卖点</h2>${ul(s.sellingPoints)}
      <h2>素材配比建议（总量 50 条）</h2>
      <table><tr><th>类型</th><th>数量</th><th>推荐用途</th></tr>${mixRows}</table>
      <p class="muted">配比理由：${esc(s.mixReason)}</p>
      <h2>预计脚本方向与首选/次选素材形式</h2>
      <table><tr><th>方向</th><th>验证目标</th><th>素材形式建议</th><th>首选/次选形式与判断逻辑</th></tr>${dirRows}</table>
      <h2>定制跑量公式（五环节）</h2>
      <table><tr><th>环节</th><th>手法</th><th>具体内容</th><th>目的</th></tr>${formulaRows}</table>
      <h2>黄金钩子推荐</h2><ol>${s.hooks.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
      <h2>拍摄建议</h2>${ul(s.shootingTips)}
      <h2>行业合规红线</h2><ul>${s.compliance.map(x => `<li style="color:#b91c1c">${esc(x)}</li>`).join('')}</ul>
      <h2>通用拍摄建议</h2>${ul(s.generalTips)}`;
    exportHtmlToPdf(`素材策略单 · ${s.productName}`, html);
  };

  const mixCols = data ? { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[data.mix.length] || 'grid-cols-2' : 'grid-cols-2';

  return (
    <div id="sec-strategy-anchor" className="scroll-mt-20 rounded-2xl border border-amber-300 bg-amber-50/30 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Clapperboard className="w-4 h-4 text-brand-600" />
        <span className="text-[13px] font-extrabold text-gray-800">素材策略一页纸</span>
        <span className="text-[10.5px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">内容创意 · 核心交付</span>
        <span className="text-[11px] text-gray-400">人群画像 · 真人/桌拍/混剪/图文配比 · 每方向首选形式与逻辑 · 五环节跑量公式 · 钩子与合规</span>
        <button
          type="button" onClick={() => void generate()} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 shadow-md shadow-brand-200/70 text-[13px] font-extrabold text-white hover:from-brand-700 hover:to-brand-800 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {data ? '重新生成' : loading ? '生成中…' : '生成素材策略'}
        </button>
      </div>
      {!briefs.length && !data && !loading && (
        <p className="mt-2 text-[11px] text-amber-700">当前还未拆解 Brief，可直接基于商品信息先生成策略单，再据此拆解 Brief 方向。</p>
      )}
      {err && <p className="mt-2.5 text-[11.5px] text-danger-ink flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{err}</p>}
      {loading && (
        <p className="mt-3 text-[12px] text-brand-700 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在生成素材策略一页纸，约 10-30 秒…
        </p>
      )}

      {data && !loading && (
        <div id="sec-strategy-result" className="scroll-mt-20 mt-4 rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
            <p className="text-[15px] font-extrabold">素材策略一页纸 · {data.productName}</p>
            <p className="text-[11px] text-white/80 mt-0.5">
              {data.brand ? `品牌：${data.brand}　｜　` : ''}类型：{data.productType}
              {data.url ? `　｜　` : ''}
              {data.url && <a href={data.url} target="_blank" rel="noreferrer" className="underline break-all">商品链接</a>}
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <Section icon={Users} title="行业人群画像">
              <p className="text-[12px] text-gray-700 leading-relaxed">{data.audience}</p>
            </Section>

            <Section icon={Target} title="产品核心卖点">
              <ol className="list-decimal pl-5 space-y-1">
                {data.sellingPoints.map((x, i) => <li key={i} className="text-[12px] text-gray-700">{x}</li>)}
              </ol>
            </Section>

            <Section icon={Clapperboard} title={`素材配比建议（总量 50 条 · ${data.mix.length} 种形式）`}>
              <p className="mb-2 inline-flex items-start gap-1 text-[10.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-2 py-1.5">
                <Target className="w-3 h-3 mt-px shrink-0" />
                配比只依据「商品特性 + 脚本方向」两维推算，与投放预算、价格带、投放阶段无关。
              </p>
              <div className={`grid ${mixCols} gap-2.5`}>
                {data.mix.map(m => (
                  <div key={m.key} className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                    <p className="text-[12px] font-bold text-brand-700">{m.label}</p>
                    <p className="text-[18px] font-extrabold text-gray-900 mt-0.5">{m.count}<span className="text-[11px] font-medium text-gray-400"> 条 / {m.pct}%</span></p>
                    <p className="text-[10.5px] text-gray-500 mt-1 leading-snug">{m.usage}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">配比理由：{data.mixReason}</p>
            </Section>

            <Section icon={RotateCcw} title="预计脚本方向 · 首选/次选素材形式与判断逻辑">
              <div className="space-y-2">
                {data.directions.map((d, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                    <p className="text-[12px] font-bold text-gray-800">
                      {i + 1}. {d.name}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">验证目标：{d.validationGoal || '—'}｜素材形式建议：{d.materialFormat || '—'}</p>
                    <div className="mt-1.5 space-y-1">
                      {d.pickLabel && (
                        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-white bg-brand-600 rounded-full px-1.5 py-0.5 mt-px">首选·{d.pickLabel}</span>
                          <span className="text-gray-600">{d.pickReason}</span>
                        </p>
                      )}
                      {d.secondLabel && (
                        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-brand-700 bg-white border border-brand-200 rounded-full px-1.5 py-0.5 mt-px">次选·{d.secondLabel}</span>
                          <span className="text-gray-600">{d.secondReason}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {!data.directions.length && <p className="text-[12px] text-gray-400">—</p>}
              </div>
            </Section>

            <Section icon={Workflow} title="定制跑量公式（五环节）">
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] border-collapse min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="border border-gray-200 px-2 py-1.5 text-left w-20">环节</th>
                      <th className="border border-gray-200 px-2 py-1.5 text-left w-28">手法</th>
                      <th className="border border-gray-200 px-2 py-1.5 text-left">具体内容</th>
                      <th className="border border-gray-200 px-2 py-1.5 text-left w-24">目的</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.formula || []).map((f, i) => (
                      <tr key={i} className="text-gray-700">
                        <td className="border border-gray-200 px-2 py-1.5 font-bold text-brand-700 whitespace-nowrap">{f.stage}</td>
                        <td className="border border-gray-200 px-2 py-1.5">{f.technique}</td>
                        <td className="border border-gray-200 px-2 py-1.5">{f.detail}</td>
                        <td className="border border-gray-200 px-2 py-1.5 text-gray-500">{f.goal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section icon={Sparkles} title="黄金钩子推荐">
              <div className="flex flex-wrap gap-2">
                {data.hooks.map((h, i) => (
                  <span key={i} className="text-[11.5px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{i + 1}. {h}</span>
                ))}
              </div>
            </Section>

            <Section icon={Lightbulb} title="拍摄建议">
              <ul className="list-disc pl-5 space-y-1">{data.shootingTips.map((x, i) => <li key={i} className="text-[12px] text-gray-700">{x}</li>)}</ul>
            </Section>

            <Section icon={ShieldAlert} title="行业合规红线（该类目禁止/慎用词与场景）">
              <ul className="list-disc pl-5 space-y-1">{data.compliance.map((x, i) => <li key={i} className="text-[12px] text-red-600">{x}</li>)}</ul>
            </Section>

            <Section icon={Check} title="通用拍摄建议">
              <ul className="list-disc pl-5 space-y-1">{data.generalTips.map((x, i) => <li key={i} className="text-[12px] text-gray-700">{x}</li>)}</ul>
            </Section>

            <div className="pt-3 border-t border-gray-100 flex items-center gap-2.5 flex-wrap">
              <button type="button" onClick={() => void copyAll()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-[12px] font-bold hover:bg-brand-700">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制全文' : '一键复制全文'}
              </button>
              <button type="button" onClick={toPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                <Printer className="w-3.5 h-3.5" /> 导出 PDF
              </button>
              <button type="button" onClick={() => data && downloadStrategyDoc(data)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                <FileType className="w-3.5 h-3.5 text-blue-600" /> 导出 Word
              </button>
              <button type="button" onClick={() => downloadTextFile(`素材策略一页纸-${data.productName || '商品'}.md`, md(), 'text/markdown')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5" /> 下载 Markdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 参考客户 Brief 后优化策略（折叠在一页纸底部） ===== */}
      {briefEnabled && (
        <div className="mt-4 pt-4 border-t border-dashed border-amber-200">
          {briefsOptimized && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-gray-700">Brief 版本：</span>
              {([
                { k: 'original', label: '原始版本' },
                { k: 'optimized', label: '客户 Brief 优化版' },
              ] as const).map(v => (
                <button
                  key={v.k} type="button" onClick={() => onSwitchVersion?.(v.k)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                    briefsVersion === v.k
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50'}`}
                >
                  {v.label}
                </button>
              ))}
              {briefsVersion === 'optimized' && optNotes && (
                <span className="text-[11px] text-brand-700/80 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {optNotes}
                </span>
              )}
            </div>
          )}

          <button
            type="button" onClick={() => setShowBrief(o => !o)}
            className="w-full flex items-center gap-2 text-left group"
          >
            <Paperclip className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="text-[12.5px] font-bold text-brand-700 group-hover:text-brand-800">参考客户 Brief 后优化策略</span>
            <span className="text-[11px] text-gray-400">JPG/PNG/PDF/DOCX · ≤10MB · 文件仅在本机浏览器解析，不上传服务器</span>
            <span className="ml-auto text-[11px] text-brand-600 font-semibold">{showBrief ? '收起' : '展开'}</span>
          </button>

          {showBrief && (
            <div className="mt-3.5 space-y-3 rounded-xl border border-brand-100 bg-white p-3.5">
              <input
                ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.docx,image/jpeg,image/png,application/pdf"
                className="hidden" onChange={e => void onBriefFile(e.target.files?.[0])}
              />
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button" disabled={fileBusy} onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-200 text-[12px] font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                >
                  {fileBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  选择文件上传
                </button>
                {fileName && !fileBusy && (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    {fileType === '图片' ? <ImageIcon className="w-3.5 h-3.5 text-violet-500" /> : <FileText className="w-3.5 h-3.5 text-blue-500" />}
                    {fileName}
                    <button type="button" onClick={resetBriefFile} className="text-gray-400 hover:text-danger-ink ml-1">✕</button>
                  </span>
                )}
                {fileBusy && fileType !== '图片' && <span className="text-[11.5px] text-brand-700">正在本地解析文档…</span>}
                {fileBusy && fileType === '图片' && (
                  <span className="text-[11.5px] text-brand-700 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在本地 OCR 识别{ocrProgress > 0.05 ? `（${Math.round(ocrProgress * 100)}%）` : '…'}
                  </span>
                )}
              </div>

              <div>
                <p className="text-[11px] text-gray-500 mb-1">提取的客户 Brief 文字（可编辑校对，OCR 可能有错字）：</p>
                <textarea
                  value={briefText} onChange={e => setBriefText(e.target.value)}
                  rows={5} placeholder="上传文件后文字自动出现在这里；也可以直接粘贴客户 Brief / 微信沟通要点 / 产品资料文字…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-y"
                />
              </div>

              {briefErr && (
                <p className="text-[11.5px] text-danger-ink flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {briefErr}
                </p>
              )}

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button" disabled={optimizing || !briefText.trim()} onClick={() => void doOptimize()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[12px] font-bold shadow-sm hover:brightness-105 disabled:opacity-60"
                >
                  {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  基于客户 Brief 优化方向
                </button>
                {optimizing && <span className="text-[11.5px] text-brand-700">AI 正在对齐客户要求重写 Brief，约 10-30 秒…</span>}
              </div>
              <p className="text-[10.5px] text-gray-400 leading-relaxed">
                隐私说明：图片 OCR、PDF/DOCX 文字提取全部在你的浏览器本地完成，文件本身不会上传或写入任何后台台账；仅提取后的文字用于本次 AI 优化。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] font-bold text-gray-800 mb-1.5 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-brand-500" /> {title}
      </p>
      {children}
    </div>
  );
}
