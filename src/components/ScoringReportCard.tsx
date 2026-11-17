import { useRef, useState } from 'react';
import {
  FileText, Loader2, ClipboardCopy, Check, Download,
  ShieldCheck, ShieldAlert, ChevronDown, Users, ArrowRight, MousePointerClick,
  Package,
} from 'lucide-react';
import type { ScoringReport, ScoringRedLine } from '../lib/api';
import { reportToText } from '../lib/api';
import { LEVEL_META, type ScoreResult } from '../lib/scoring';
import { addToHitProducts, type BaopinInputs } from '../lib/baopin';
import { GRADE_STYLE } from '../lib/grade';
import AgencyFitCard, { type FitGradeChange } from './AgencyFitCard';

interface ScoringReportSectionProps {
  canScore: boolean;            // 评分参数齐备（有二级类目且可评分）
  loading: boolean;
  error: string;
  report: ScoringReport | null;
  onGenerate: () => void;
  productName: string;
  brand: string;
  agent: string;                // 服务商/代理商名称
  scoreResult: ScoreResult;
  redLines: ScoringRedLine[];   // AI 红线结果（未跑诊断时为空数组）
  // 服务商适配分析
  industry: string;             // 对内 7 行业
  level1: string;               // 门捷列夫一级类目
  influencerTags: string[];     // 商品行业标签（17 类）
  onGoTagger: () => void;       // 跳转达人打标
  // 加入爆品库
  level2?: string;              // 门捷列夫二级类目
  productUrl?: string;          // 商品链接
  inputs?: Partial<BaopinInputs>; // 6 个投放参数
  onGoBaopin?: () => void;      // 跳转爆品库
}

function todayCN(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function barColor(ratio: number): string {
  if (ratio >= 0.8) return '#16a34a';
  if (ratio >= 0.6) return '#d97706';
  return '#dc2626';
}

/**
 * 一页纸报告区：评分完成后生成「星川 × 服务商 内容策略评估报告」
 * 卡片为白底印刷级排版（全部内联样式，保证 html2canvas 截图无色差），可复制文字/下载图片发品牌方。
 */
export default function ScoringReportSection(props: ScoringReportSectionProps) {
  const { canScore, loading, error, report, onGenerate, productName, brand, agent, scoreResult, redLines,
    industry, level1, influencerTags, onGoTagger,
    level2, productUrl, inputs, onGoBaopin } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imgError, setImgError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  // 达人适配分析独立触发：fitActive=已点击展开（挂载即自动加载）；fitSeq=每次点击+1 用于重新挂载刷新
  const [fitActive, setFitActive] = useState(false);
  const [fitSeq, setFitSeq] = useState(0);
  // 加入爆品库：idle→adding→(exist 弹确认)→added；addError 展示失败原因
  const [addState, setAddState] = useState<'idle' | 'adding' | 'added'>('idle');
  const [addError, setAddError] = useState('');
  const [confirmExist, setConfirmExist] = useState(false);
  // 服务商适配分析给出的定级与分级服务策略（追加进一页纸）
  const [fitChange, setFitChange] = useState<FitGradeChange | null>(null);

  const date = todayCN();
  const level = LEVEL_META[scoreResult.level] || LEVEL_META.none;
  const partner = agent.trim() || '星川认证服务商';

  const meta = {
    productName: productName.trim(),
    brand: brand.trim(),
    agent: partner,
    date,
    total: scoreResult.total,
    levelLabel: level.label,
    dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max })),
    redLines,
    fitStrategy: fitChange
      ? { grade: fitChange.grade, name: fitChange.name, strategy: fitChange.strategy, manual: fitChange.manual }
      : null,
  };

  // 报告内容由 FaaS 按请求来源返回（github.io 已在服务端方向化），前端只负责展示
  const handleCopy = async () => {
    if (!report) return;
    const text = reportToText(report, meta);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* 忽略 */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!report || !cardRef.current) return;
    setImgError('');
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('blob')); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safeName = (productName.trim() || '商品').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
          a.download = `${safeName}_星川内容策略评估一页纸_${date.replace(/-/g, '')}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, 'image/png');
      });
    } catch {
      setImgError('图片生成失败，可直接对报告卡片截图保存（内容不受影响）');
    } finally {
      setDownloading(false);
    }
  };

  // ---- 加入爆品库 ----
  const handleAddToBaopin = async (confirmUpdate = false) => {
    if (!report) return;
    setAddState('adding'); setAddError(''); setConfirmExist(false);
    try {
      const r = await addToHitProducts({
        product: {
          productName: productName.trim(),
          brand: brand.trim(),
          level1: level1 || '',
          level2: level2 || '',
          url: productUrl || '',
        },
        scoreResult: {
          total: scoreResult.total,
          dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max })),
        },
        // 透传当前分析页已算好的综合分，FaaS 直接写入爆品库「综合评分」，不再按加权公式重算
        score: scoreResult.total,
        category: (scoreResult as { category?: Record<string, unknown> }).category || null,
        inputs: inputs || {},
        reportText: reportToText(report, meta),
      }, confirmUpdate);
      // 已存在且本次未更新 → 弹「是否更新」
      if (r.existed && !r.updated) {
        setConfirmExist(true);
        setAddState('idle');
        return;
      }
      setAddState('added');
    } catch (e) {
      setAddError('加入爆品库失败：' + (e instanceof Error ? e.message : String(e)));
      setAddState('idle');
    }
  };

  // ---- 截图卡片（内联样式，hex 色值，html2canvas 友好）----
  const card = report ? (
    <div
      ref={cardRef}
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        overflow: 'hidden',
        fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
        color: '#1e293b',
        textAlign: 'left',
      }}
    >
      {/* 顶部品牌带 */}
      <div style={{ background: '#4c1d95', padding: '22px 28px 20px', color: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', opacity: 0.85, letterSpacing: '0.5px' }}>
          <span style={{ fontWeight: 600 }}>星川 × {partner}</span>
          <span>内容策略评估报告</span>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '10px', lineHeight: 1.35 }}>
          {meta.productName || '商品名称待补充'}
        </div>
        <div style={{ fontSize: '12px', marginTop: '6px', opacity: 0.85 }}>
          {meta.brand ? `品牌：${meta.brand} · ` : ''}报告日期：{date} · 计分模型 v1
        </div>
      </div>

      <div style={{ padding: '24px 28px 26px' }}>
        {/* 总分 + 结论 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            flex: '0 0 auto', width: '96px', height: '96px', borderRadius: '50%',
            border: `4px solid ${level.color}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#ffffff',
          }}>
            <span style={{ fontSize: '30px', fontWeight: 800, color: level.color, lineHeight: 1 }}>{scoreResult.total}</span>
            <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>/ 100 分</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: '999px',
              background: level.color, color: '#fff', fontSize: '13px', fontWeight: 700,
            }}>{level.label}</span>
            <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '8px', lineHeight: 1.5, color: '#0f172a' }}>
              {report.headline}
            </div>
          </div>
        </div>
        {report.narrative && (
          <div style={{
            marginTop: '14px', background: '#f5f3ff', border: '1px solid #ede9fe',
            borderRadius: '10px', padding: '12px 14px', fontSize: '13px', lineHeight: 1.75, color: '#4c1d95',
          }}>
            {report.narrative}
          </div>
        )}

        {/* 五维明细 */}
        <div style={{ fontSize: '15px', fontWeight: 700, margin: '22px 0 12px', color: '#0f172a' }}>
          五维得分明细与机会点
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scoreResult.dims.map((d, i) => {
            const rd = report.dimReports[i] || report.dimReports.find(x => x.key === d.key);
            const ratio = d.max ? d.score / d.max : 0;
            return (
              <div key={d.key} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    {i + 1}. {d.name}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: barColor(ratio) }}>
                    {d.score}<span style={{ color: '#94a3b8', fontWeight: 400 }}> / {d.max} 分</span>
                  </span>
                </div>
                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '999px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(ratio * 100, 2)}%`, height: '100%', background: barColor(ratio), borderRadius: '999px' }} />
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.7, marginTop: '8px', color: '#334155' }}>
                  <span style={{ color: '#7c3aed', fontWeight: 700 }}>机会点：</span>{rd?.opportunity || ''}
                </div>
                <div style={{ marginTop: '6px' }}>
                  <span style={{ fontSize: '12.5px', color: '#0d9488', fontWeight: 700 }}>建议动作：</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    {(rd?.points || []).map((pt, pi) => (
                      <div key={pi} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', fontSize: '12.5px', lineHeight: 1.7, color: '#334155' }}>
                        <span style={{ flex: '0 0 auto', color: '#0d9488', fontWeight: 700, marginTop: '1px' }}>·</span>
                        <span style={{ flex: 1, wordBreak: 'break-word' }}>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 红线检测 */}
        <div style={{ fontSize: '15px', fontWeight: 700, margin: '22px 0 10px', color: '#0f172a' }}>红线检测</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {redLines.length === 0 && (
            <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>未运行 AI 红线诊断（可在上方商品分析区点击「AI 深度诊断」后重新生成报告）</span>
          )}
          {redLines.map((r) => {
            const verify = !r.hit && !!r.reason;
            return (
              <span key={r.name} style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '12.5px', padding: '5px 11px', borderRadius: '999px',
                background: r.hit ? '#fef2f2' : verify ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${r.hit ? '#fecaca' : verify ? '#fde68a' : '#bbf7d0'}`,
                color: r.hit ? '#b91c1c' : verify ? '#b45309' : '#15803d',
              }}>
                {r.hit || verify ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                {r.name}{r.hit ? '（需立即处理）' : verify ? '（需核验）' : '通过'}
              </span>
            );
          })}
        </div>

        {/* 品牌方行动项（含执行周期与成功信号） */}
        <div style={{ fontSize: '15px', fontWeight: 700, margin: '22px 0 10px', color: '#0f172a' }}>品牌方行动项（优先级 · 周期 · 成功信号）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {report.actionItems.map((a, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              background: '#faf9ff', border: '1px solid #ede9fe', borderRadius: '10px', padding: '10px 12px',
            }}>
              <span style={{
                flex: '0 0 auto', width: '22px', height: '22px', borderRadius: '50%',
                background: '#4c1d95', color: '#fff', fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px',
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', lineHeight: 1.6, fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' }}>{a.task}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: '5px' }}>
                  {a.cycle && (
                    <span style={{ fontSize: '11.5px', color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }}>
                      ⏱ {a.cycle}
                    </span>
                  )}
                  {a.signal && (
                    <span style={{ fontSize: '11.5px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '2px 9px', lineHeight: 1.5 }}>
                      ✅ 成功信号：{a.signal}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 分级服务策略（服务商适配分析定级后自动补充） */}
        {fitChange && (() => {
          const gs = GRADE_STYLE[fitChange.grade];
          const rows: { label: string; val: string }[] = [
            { label: '资源配置', val: fitChange.strategy.resource },
            { label: '预算节奏', val: fitChange.strategy.budget },
            { label: '达人策略', val: fitChange.strategy.creator },
            { label: '内容素材', val: fitChange.strategy.content },
            { label: '复盘止损', val: fitChange.strategy.review },
          ];
          return (
            <div style={{ marginTop: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                background: gs.bg, border: `1px solid ${gs.border}`, borderRadius: '12px', padding: '12px 14px',
              }}>
                <span style={{
                  flex: '0 0 auto', fontSize: 15, fontWeight: 800, color: '#fff',
                  background: gs.dot, borderRadius: '999px', padding: '4px 12px',
                }}>{fitChange.grade}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: gs.text }}>分级服务策略 · {fitChange.name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                  依据《商品分层规则V1》{fitChange.manual ? '· 服务商手选' : '· 系统推荐'}
                </span>
              </div>
              <div style={{
                    marginTop: 10, fontSize: 13, lineHeight: 1.75, color: '#1e293b',
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 12px',
                  }}>
                <b>总策略：</b>{fitChange.strategy.summary}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {rows.map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, color: '#4c1d95',
                      background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: '8px',
                      padding: '2px 9px', marginTop: 2, whiteSpace: 'nowrap',
                    }}>{r.label}</span>
                    <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.7, color: '#334155' }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 页脚 */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 28px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8' }}>
        星川 × {partner} 内容策略评估报告 · {date} · 基于星川商品分析计分模型 v1，供服务商与品牌方沟通使用
      </div>
    </div>
  ) : null;

  return (
    <div className="mt-6 border-t border-dashed border-brand-200 pt-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-[18px] h-[18px] text-brand-600" />
        <h3 className="text-[15px] font-bold text-gray-800">商品分析交付物</h3>
        <span className="text-[11px] text-gray-400 font-normal">两个入口相互独立，点击各自展开</span>
      </div>

      {/* 两个并排的入口卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EntryCard
          icon={<FileText className="w-5 h-5" />}
          title="📄 生成对客一页纸"
          desc="基于 100 分制适配分 + AI 红线/策略诊断，生成可直接发给品牌方的内容策略评估报告（总分等级、五维机会点、行动项）。建议先跑「AI 深度诊断」。"
          active={!!report}
          loading={loading}
          disabled={!canScore}
          actionLabel={loading ? 'AI 正在生成…' : report ? '重新生成一页纸' : '点击生成一页纸'}
          onClick={onGenerate}
        />
        <EntryCard
          icon={<Users className="w-5 h-5" />}
          title="👥 服务商适配分析"
          desc="按《商品分层规则V1》，结合服务商自有达人库（行业匹配数、星川等级/粉丝分布）与承接能力，给商品输出 P0/P1/P2 定级，并同步到爆品库；定级可自行修改。"
          active={fitActive}
          loading={false}
          disabled={false}
          actionLabel={fitActive ? '重新拉取分析' : '点击展开适配分析'}
          onClick={() => { setFitActive(true); setFitSeq(s => s + 1); }}
        />
      </div>

      {!canScore && (
        <p className="text-[12px] text-warn-ink mt-2">请先选择二级类目并填齐服务商投放参数，适配分生效后即可生成对客一页纸。</p>
      )}
      {error && <p className="text-[12px] text-danger-ink mt-1.5">{error}</p>}

      {/* 下方双列结果区：两列常驻，未触发的一列显示引导文案 */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 左列：对客一页纸 */}
        <div className="min-w-0">
          {loading && !report ? (
            <ColPlaceholder
              icon={<Loader2 className="w-6 h-6 text-brand-500 animate-spin" />}
              text="AI 正在生成一页纸报告，通常需 10-30 秒…"
              tone="loading"
            />
          ) : report ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-ok-ink" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                  {copied ? '已复制' : '复制文字'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition"
                >
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloading ? '正在生成图片…' : '下载图片（PNG）'}
                </button>
                {/* 加入爆品库：成功后可点击直接跳转爆品库 */}
                {addState === 'added' ? (
                  <button
                    type="button"
                    onClick={onGoBaopin}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold bg-green-50 border border-green-300 text-green-700 hover:bg-green-100 transition"
                  >
                    <Check className="w-3.5 h-3.5" /> 已加入爆品库，点击查看
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAddToBaopin(false)}
                    disabled={addState === 'adding'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-95 disabled:opacity-50 transition"
                  >
                    {addState === 'adding'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Package className="w-3.5 h-3.5" />}
                    {addState === 'adding' ? '正在加入…' : '加入爆品库'}
                  </button>
                )}
                {addError && <span className="text-[11px] text-danger-ink">{addError}</span>}
                {/* 已在爆品库：确认是否更新 */}
                {confirmExist && (
                  <span className="flex items-center gap-2 text-[12px] bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-amber-700 font-medium">该商品已在爆品库中，是否用最新报告更新？</span>
                    <button type="button" onClick={() => void handleAddToBaopin(true)}
                      className="px-2 py-0.5 rounded bg-amber-600 text-white text-[11px] font-bold">更新</button>
                    <button type="button" onClick={() => setConfirmExist(false)}
                      className="px-2 py-0.5 rounded border border-amber-300 text-amber-700 text-[11px]">取消</button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setCollapsed(c => !c)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-400 hover:text-gray-600 transition"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  {collapsed ? '展开报告' : '收起'}
                </button>
                {report.degraded && (
                  <span className="text-[11px] text-warn-ink bg-warn-bg border border-warn-line rounded px-2 py-0.5">AI 繁忙，本次为兜底版本，可点「重新生成」</span>
                )}
                {imgError && <span className="text-[11px] text-danger-ink">{imgError}</span>}
              </div>
              {!collapsed && <div className="shadow-sm">{card}</div>}
            </div>
          ) : (
            <ColPlaceholder
              icon={<FileText className="w-6 h-6 text-gray-300" />}
              text="点击上方「📄 生成对客一页纸」按钮，在此生成报告"
            />
          )}
        </div>

        {/* 右列：服务商适配分析（独立触发，不依赖一页纸） */}
        <div className="min-w-0">
          {fitActive ? (
            <AgencyFitCard
              key={`fit-${fitSeq}`}
              productName={productName}
              industry={industry}
              level1={level1}
              tags={influencerTags}
              agent={agent}
              score={scoreResult.total ?? null}
              hardGateFail={redLines.some(r => r.hit)}
              onGoTagger={onGoTagger}
              onFitGradeChange={setFitChange}
            />
          ) : (
            <ColPlaceholder
              icon={<Users className="w-6 h-6 text-gray-300" />}
              text="点击上方「👥 服务商适配分析」按钮，结合达人库与分层规则V1，在此展开商品定级"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** 并排入口卡片 */
function EntryCard(props: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className={`group relative text-left rounded-2xl border-2 p-4 transition-all duration-200 w-full
        disabled:opacity-60 disabled:cursor-not-allowed
        ${props.active
          ? 'border-brand-500 bg-brand-50/60 shadow-sm'
          : 'border-gray-200 bg-white hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors
          ${props.active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 group-hover:bg-brand-100'}`}>
          {props.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-ink-900 leading-snug">{props.title}</span>
            {props.active && !props.loading && (
              <span className="text-[10px] font-semibold text-brand-700 bg-brand-100 border border-brand-200 px-1.5 py-0.5 rounded">已生成</span>
            )}
          </div>
          <p className="text-[11.5px] text-gray-500 mt-1 leading-relaxed">{props.desc}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600">
            {props.loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{props.actionLabel}</>
              : <>{props.actionLabel}<ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></>}
          </div>
        </div>
      </div>
    </button>
  );
}

/** 未触发列的引导占位 */
function ColPlaceholder(props: { icon: React.ReactNode; text: string; tone?: 'default' | 'loading' }) {
  return (
    <div className={`h-full min-h-[200px] rounded-2xl border border-dashed flex flex-col items-center justify-center text-center px-6 py-10
      ${props.tone === 'loading' ? 'border-brand-200 bg-brand-50/40' : 'border-gray-200 bg-gray-50/50'}`}>
      {props.icon}
      <p className={`text-[12.5px] mt-2.5 flex items-center gap-1 ${props.tone === 'loading' ? 'text-brand-600' : 'text-gray-400'}`}>
        {props.tone !== 'loading' && <MousePointerClick className="w-3.5 h-3.5" />}
        {props.text}
      </p>
    </div>
  );
}
