import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Loader2, Sparkles, ClipboardCopy,
  CheckCircle2, AlertTriangle, ShieldAlert, Lightbulb, TrendingUp,
  Gauge, ChevronDown, Wand2, Target, Eraser, FileText,
  Trophy, Package, Sprout, Wallet, Building2, FileSpreadsheet,
} from 'lucide-react';
import { INTERNAL_INDUSTRIES, INFLUENCER_TAGS, type InternalIndustry, type ScoringAi, type ScoringDisplay, fetchScoringDisplay } from '../lib/api';
import { CATEGORIES, type CategoryBaseline } from '../data/scoring-categories';
import {
  LEVEL_META, dimensionAdvice, overallAdvice,
  type ScoreResult, type Level,
} from '../lib/scoring';
import { isGhPages } from '../lib/gh';
import { isDemoMode } from '../lib/demo';

// 第一部分表单字段（与 App 的 FormState 结构对齐）
export interface ScoringFormValues {
  url: string;
  productName: string;
  brand: string;
  agent: string;
  industry: string;
  category: string;
  level1: string;
  level2: string;
  price: string;
  usageScene: string;
  sellingPoints: string;
  targetAudience: string;
  xcDailyBudgetWan: string;
  qianchuanDailySpend: string;
  targetPenetration: string;
  stableRoi: string;
  targetRoi: string;
  reverseSelectPct: string;
  materialChasePct: string;
  influencerTags: string[];
}

interface ScoringPanelProps {
  form: ScoringFormValues;
  set: (key: keyof ScoringFormValues, value: ScoringFormValues[keyof ScoringFormValues]) => void;
  onIndustryChange: (ind: InternalIndustry) => void;
  onLevel2Change: (b: CategoryBaseline | null) => void;
  onToggleTag: (tag: string) => void;
  recognizing: boolean;
  recognizeMsg: string;
  onRecognize: () => void;
  onPasteLink: (v: string) => void;
  baseline: CategoryBaseline | null;
  scoreResult: ScoreResult;
  canScore: boolean;
  scoreAi: ScoringAi | null;
  scoreAiLoading: boolean;
  scoreAiError: string;
  onRunAi: () => void;
  /** full=参考站风格完整打分面板；product=仅商品录入（单独脚本/达人模式） */
  variant?: 'full' | 'product';
  /** product 变体下是否展示达人标签（达人匹配模式需要） */
  showInfluencerTags?: boolean;
  /** 一级类目手选（联动行业、清空二级） */
  onPickLevel1?: (l1: string) => void;
  /** 二级类目手选/识别 */
  onPickLevel2?: (cat: CategoryBaseline | null) => void;
  /** 清空打分区全部输入 */
  onClear?: () => void;
  /** 仅识别到商品ID时的半成功状态：传入商品ID则展示就近补填表单 */
  idOnlyItemId?: string;
  onConfirmIdOnly?: (f: { productName: string; brand: string; price: string; sellingPoints: string }) => void;
  onCancelIdOnly?: () => void;
}

// ============ 统一设计令牌类名（单一品牌紫 + 中性 + 语义色） ============
const inputCls =
  'w-full px-3 h-10 rounded-[10px] border border-line bg-white text-sm text-ink-900 placeholder-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-100 transition-colors';
const readonlyCls =
  'w-full px-3 h-10 rounded-[10px] border border-line bg-surface-2 text-sm text-ink-700 focus:outline-none';
const cardCls = 'bg-white rounded-2xl border border-line shadow-card';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[10px] bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-btn disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-colors';
const btnGhost =
  'inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-[10px] bg-white border border-line text-ink-700 text-sm font-medium hover:border-ink-300 transition-colors';

// 微标签：谁填写（一枚小色点 + 10px 文字，替代满屏彩色药丸）
function MicroAgent({ children = '代理填写' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold leading-none text-[#B57408] bg-warn-bg rounded px-1.5 py-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-warn" />{children}
    </span>
  );
}
function MicroAuto({ children = '自动带出' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold leading-none text-brand-700 bg-brand-50 rounded px-1.5 py-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />{children}
    </span>
  );
}

// 当前类目脱敏基准 7 项（对外版；标签值由 FaaS scoring_display 下发，未到达时显示 —）
const GH_BENCH_KEYS = [
  '规模档位', '14天增长率区间', '正增长店铺占比区间',
  '预算分位区间', '客单价基准区间', 'ROI中位基准区间', 'ROI高位基准区间',
];

function Field({ label, required, children, hint }: { label: React.ReactNode; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-700 mb-1.5">
        {label}{required && <span className="text-danger-ink">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-ink-400 mt-1 leading-relaxed">{hint}</span>}
    </label>
  );
}

function AdviceBlock({ icon: Icon, title, items, tone }: { icon: typeof Lightbulb; title: string; items: string[]; tone: 'green' | 'red' | 'amber' | 'violet' }) {
  if (!items.length) return null;
  const toneCls = {
    green: 'bg-ok-bg/60 border-ok-line text-ink-700',
    red: 'bg-danger-bg border-danger-line text-ink-700',
    amber: 'bg-warn-bg border-warn-line text-ink-700',
    violet: 'bg-brand-50 border-brand-200 text-ink-700',
  }[tone];
  const iconCls = { green: 'text-ok-ink', red: 'text-danger-ink', amber: 'text-warn-ink', violet: 'text-brand-600' }[tone];
  return (
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5 text-ink-900">
        <Icon className={`w-3.5 h-3.5 ${iconCls}`} />{title}
      </p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (<li key={i} className="text-[11px] leading-relaxed flex items-start gap-1.5">
          <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${iconCls}`} /><span>{it}</span>
        </li>))}
      </ul>
    </div>
  );
}

// 一级类目（门捷列夫口径）唯一列表
const LEVEL1_LIST: string[] = Array.from(new Set(CATEGORIES.map(c => c.level1))).sort();

// 五维建议 tone → 进度条/标签色（语义色）
const TONE_BAR: Record<string, string> = { good: 'bg-ok', mid: 'bg-warn', bad: 'bg-danger', empty: 'bg-ink-300' };
const TONE_CHIP: Record<string, string> = {
  good: 'bg-ok-bg text-ok-ink',
  mid: 'bg-warn-bg text-warn-ink',
  bad: 'bg-danger-bg text-danger-ink',
  empty: 'bg-surface-2 text-ink-400 border border-line',
};
// 等级 → 评分环 / 徽章色
const LEVEL_COLOR: Record<Level, string> = { high: '#12B76A', mid: '#F79009', low: '#F04438', none: '#C7CCDA' };
const LEVEL_BAND: Record<Level, string> = {
  high: 'bg-ok-bg text-ok-ink border-ok-line',
  mid: 'bg-warn-bg text-warn-ink border-warn-line',
  low: 'bg-danger-bg text-danger-ink border-danger-line',
  none: 'bg-surface-2 text-ink-400 border-line',
};

export default function ScoringPanel(props: ScoringPanelProps) {
  const {
    form, set, onIndustryChange, onToggleTag,
    recognizing, recognizeMsg, onRecognize, onPasteLink,
    baseline, scoreResult, scoreAi, scoreAiLoading, scoreAiError, onRunAi,
    variant = 'full', showInfluencerTags = false,
    onPickLevel1, onPickLevel2, onClear,
    idOnlyItemId, onConfirmIdOnly, onCancelIdOnly,
  } = props;
  const isFull = variant === 'full';
  const demo = isDemoMode();
  const [showRules, setShowRules] = useState(false);
  const [copiedSnap, setCopiedSnap] = useState(false);

  // idOnly 半成功：就近补填表单本地字段
  const [idFill, setIdFill] = useState({ productName: '', brand: '', price: '', sellingPoints: '' });
  useEffect(() => {
    if (!idOnlyItemId) setIdFill({ productName: '', brand: '', price: '', sellingPoints: '' });
  }, [idOnlyItemId]);

  // ⚠️ 以下两个 hook 必须在 `if (!isFull) return` 之前声明：
  // ScoringPanel 同一实例会在 full ↔ product 变体间重渲染（模式切换时组件不卸载），
  // 若 hook 位于 early return 之后，变体切换会改变 hook 数量，触发 React #300 渲染崩溃（表现为模块内容错乱）。
  // GitHub 服务商版：类目绿卡/子项明细的方向性展示包由 FaaS 按请求来源返回（前端不含脱敏规则，只做展示）
  const ghSite = isGhPages();
  const numOrNull = (s: string): number | null => { const v = parseFloat(s); return isNaN(v) ? null : v; };
  const [ghDisp, setGhDisp] = useState<ScoringDisplay | null>(null);
  useEffect(() => {
    // demo 模式下（无论 github.io 还是内站）同样拉取本地 mock 展示包，保证绿卡/基准 7 卡完整
    if ((!ghSite && !demo) || !isFull || !baseline) { setGhDisp(null); return; }
    const body = {
      product: { price: numOrNull(form.price) },
      inputs: {
        xcBudgetWan: numOrNull(form.xcDailyBudgetWan),
        dailySpend: numOrNull(form.qianchuanDailySpend),
        penetration: numOrNull(form.targetPenetration),
        stableRoi: numOrNull(form.stableRoi),
        targetRoi: numOrNull(form.targetRoi),
        reverseSelectPct: numOrNull(form.reverseSelectPct),
        materialChasePct: numOrNull(form.materialChasePct),
      },
      category: baseline as unknown as Record<string, unknown>,
    };
    let cancelled = false;
    const t = setTimeout(() => {
      fetchScoringDisplay(body).then((d) => { if (!cancelled) setGhDisp(d); }).catch(() => {});
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghSite, demo, isFull, baseline, form.price, form.xcDailyBudgetWan, form.qianchuanDailySpend, form.targetPenetration, form.stableRoi, form.targetRoi, form.reverseSelectPct, form.materialChasePct]);

  const idFillNameOk = idFill.productName.trim().length >= 2;
  const confirmIdFill = () => {
    if (!idFillNameOk) return;
    onConfirmIdOnly?.({
      productName: idFill.productName.trim(),
      brand: idFill.brand.trim(),
      price: idFill.price.trim(),
      sellingPoints: idFill.sellingPoints.trim(),
    });
  };

  const meta = LEVEL_META[scoreResult.level];
  const ringColor = LEVEL_COLOR[scoreResult.level];
  const hitReds = scoreAi?.redLines.filter(r => r.hit) ?? [];
  const ready = scoreResult.readyCount > 0;
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const ringOffset = ready ? CIRC * (1 - scoreResult.total / 100) : CIRC;

  // 商品链接识别卡片（两种模式共用）
  const renderLinkCard = () => (
    <div className={`${cardCls} p-4`}>
      <p className="text-xs font-bold text-ink-900 mb-2 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5 text-brand-600" /> 商品链接 / 分享文案
      </p>
      <textarea
        rows={2}
        value={form.url}
        onChange={e => onPasteLink(e.target.value)}
        placeholder="粘贴抖音商品链接、v.douyin.com 短链、精选联盟长链（haohuo.jinritemai.com）或纯数字商品ID，也可粘贴整段「复制链接」分享文案"
        className={inputCls + ' resize-none h-auto py-2.5'}
      />
      <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
        <button
          type="button" onClick={onRecognize} disabled={!form.url.trim() || recognizing}
          className={btnPrimary + ' h-9 px-3.5 text-xs'}
        >
          {recognizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {recognizing ? '识别中…' : '识别商品'}
        </button>
        {recognizeMsg && (
          <span className={`text-[11px] ${recognizeMsg.includes('未能识别') || recognizeMsg.includes('失败') ? 'text-warn-ink font-medium' : 'text-ink-500'}`}>
            {recognizeMsg}
          </span>
        )}
      </div>

      <AnimatePresence>
        {idOnlyItemId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border border-warn-line bg-warn-bg/70 p-3.5">
              <p className="text-xs font-bold text-warn-ink flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                已提取商品ID：<span className="font-mono">{idOnlyItemId}</span>
              </p>
              <p className="text-[11px] text-ink-700 mt-1 leading-relaxed">
                该链接为星图/精选联盟内部页（JS 动态渲染且需 App 登录），无法自动抓取名称。补一个<b>商品名称</b>即可继续分析；其余项选填。
                <span className="flex items-center gap-1 mt-1 text-warn-ink">
                  <Lightbulb className="w-3 h-3 shrink-0" /> 想全自动识别：在抖音 App 商品页点「分享 → 复制链接」，粘贴 v.douyin.com 短链即可。
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2.5 mt-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-ink-700">商品名称 <span className="text-danger-ink">*</span></span>
                  <input className={inputCls + ' mt-1 h-9'} value={idFill.productName}
                    onChange={e => setIdFill(s => ({ ...s, productName: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && idFillNameOk) confirmIdFill(); }}
                    placeholder="例：韩束防脱固发修护洗发水" autoFocus />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-ink-700">品牌（选填）</span>
                  <input className={inputCls + ' mt-1 h-9'} value={idFill.brand}
                    onChange={e => setIdFill(s => ({ ...s, brand: e.target.value }))} placeholder="例：韩束" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-ink-700">客单价（选填）</span>
                  <input type="number" min={0} className={inputCls + ' mt-1 h-9'} value={idFill.price}
                    onChange={e => setIdFill(s => ({ ...s, price: e.target.value }))} placeholder="例：69.9" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-ink-700">核心卖点（选填）</span>
                  <input className={inputCls + ' mt-1 h-9'} value={idFill.sellingPoints}
                    onChange={e => setIdFill(s => ({ ...s, sellingPoints: e.target.value }))}
                    placeholder="用、/ 分隔，例：防脱/控油/蓬松" />
                </label>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button type="button" onClick={confirmIdFill} disabled={!idFillNameOk}
                  className={btnPrimary + ' h-9 px-4 text-xs'}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> 确认，开始分析
                </button>
                <button type="button" onClick={onCancelIdOnly} className={btnGhost + ' h-9 px-3.5 text-xs'}>
                  取消（重新粘贴链接）
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ==================== product 变体（脚本/达人模式）：仅商品录入 ====================
  if (!isFull) {
    return (
      <div className="space-y-4">
        {renderLinkCard()}
        <div className={`${cardCls} p-4 space-y-3.5`}>
          <p className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-brand-600" /> 商品信息
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="产品名称" required>
              <input className={inputCls} value={form.productName} onChange={e => set('productName', e.target.value)} placeholder="例：金磨坊脆爽魔芋丝" />
            </Field>
            <Field label="品牌" required>
              <input className={inputCls} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="例：金磨坊" />
            </Field>
            <Field label="代理商">
              <input className={inputCls} value={form.agent} onChange={e => set('agent', e.target.value)} placeholder="选填，例：明日世界" />
            </Field>
            <Field label="所属行业" required>
              <select className={inputCls} value={form.industry} onChange={e => onIndustryChange(e.target.value as InternalIndustry)}>
                <option value="">请选择</option>
                {INTERNAL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="品类">
              <input className={inputCls} value={form.category} onChange={e => set('category', e.target.value)} placeholder="例：休闲食品/辣条魔芋" />
            </Field>
            <Field label="客单价（元）">
              <input type="number" min={0} className={inputCls} value={form.price} onChange={e => set('price', e.target.value)} placeholder="例：29.9" />
            </Field>
          </div>
          <Field label="核心卖点（用、/ 分隔）">
            <textarea rows={2} className={inputCls + ' resize-none h-auto py-2.5'} value={form.sellingPoints} onChange={e => set('sellingPoints', e.target.value)} placeholder="例：0碱味/低卡饱腹/开袋即食" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="使用场景（、/ 分隔）">
              <input className={inputCls} value={form.usageScene} onChange={e => set('usageScene', e.target.value)} placeholder="例：追剧、加班、减脂期" />
            </Field>
            <Field label="目标人群">
              <input className={inputCls} value={form.targetAudience} onChange={e => set('targetAudience', e.target.value)} placeholder="例：18-35岁女性/上班族" />
            </Field>
          </div>
        </div>

        {showInfluencerTags && (
          <div className={`${cardCls} p-4`}>
            <p className="text-xs font-bold text-ink-900 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-brand-600" /> 内容偏好标签（影响达人匹配风格，可多选）
            </p>
            <div className="flex flex-wrap gap-2">
              {INFLUENCER_TAGS.map(tag => {
                const on = form.influencerTags.includes(tag);
                return (
                  <button key={tag} type="button" onClick={() => onToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-[10px] text-xs border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-500 border-line hover:border-brand-300'}`}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== full：评分面板（左表单 / 右粘性结果） ====================
  const l2Options = form.level1 ? CATEGORIES.filter(c => c.level1 === form.level1) : CATEGORIES;
  const fmt1 = (v: number | null | undefined, suf = '') => (v == null ? '—' : v.toFixed(2) + suf);

  const copySnapshot = async () => {
    const lv = { high: '高度适配', mid: '中度适配', low: '低度适配', none: '待评定' }[scoreResult.level];
    const ghP60 = ghDisp?.card?.find((h) => h.k === '日耗P20/P40/P60')?.v;
    const ghPrice = ghDisp?.card?.find((h) => h.k === '支付单均价中位数')?.v;
    const lines = [
      '【星川商品分析快照】',
      `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      `商品：${form.productName || '—'}`,
      `代理商：${form.agent || '—'}`,
      `类目：${form.level1 || '—'} / ${form.level2 || '—'}`,
      `星川日预算：${form.xcDailyBudgetWan || '—'} 万元/天${baseline ? `（类目日耗P20/P40/P60：${(ghSite || demo) ? (ghP60 ?? '—') : `${fmt1(baseline.p20Wan)}/${fmt1(baseline.p40Wan)}/${fmt1(baseline.p60Wan)} 万/天`}）` : ''}`,
      `客单价：${form.price || '—'} 元${baseline && baseline.priceMed != null ? `（类目中位价：${(ghSite || demo) ? (ghPrice ?? '—') : `${baseline.priceMed} 元`}）` : ''}`,
      `千川稳定ROI：${form.stableRoi || '—'} / 追投下星川目标ROI：${form.targetRoi || '—'}`,
      `达人反选比例：${form.reverseSelectPct || '—'}%｜达人素材追投数量比例：${form.materialChasePct || '—'}%`,
      `适配总分：${scoreResult.total}/100（${lv}）`,
      scoreResult.dims.map(d => `${d.name} ${d.score}/${d.max}`).join(' · '),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSnap(true);
      setTimeout(() => setCopiedSnap(false), 2000);
    } catch { /* 剪贴板不可用时静默 */ }
  };

  // 类目参考 8 项：内站用本地底表精确值；github.io 用 FaaS 返回的方向性展示包（到达前显示 —）
  const REF_KEYS = ['日耗P20/P40/P60', 'QTD规模排名', 'QTD累计星川消耗', '类目14天消耗环比', '正增长店铺占比', 'ROI P50 / P75', '支付单均价中位数', '有效店铺数'];
  const refIcons = [Gauge, Trophy, Package, TrendingUp, Sprout, Target, Wallet, Building2];
  const refRows = baseline
    ? ((ghSite || demo)
      ? (ghDisp?.card
        ? ghDisp.card.map((h, idx) => ({ icon: refIcons[idx] ?? FileSpreadsheet, k: h.k, v: h.v, hot: h.k.includes('环比') && /增长/.test(h.v) }))
        : refIcons.map((icon, idx) => ({ icon, k: REF_KEYS[idx], v: '—', hot: false })))
      : [
        { icon: Gauge, k: '日耗P20/P40/P60', v: `${fmt1(baseline.p20Wan)}/${fmt1(baseline.p40Wan)}/${fmt1(baseline.p60Wan)} 万/天` },
        { icon: Trophy, k: 'QTD规模排名', v: `TOP ${baseline.rank}/68` },
        { icon: Package, k: 'QTD累计星川消耗', v: `${baseline.totalWan.toLocaleString()} 万` },
        { icon: TrendingUp, k: '类目14天消耗环比', v: baseline.envMedian != null ? `${baseline.envMedian > 0 ? '+' : ''}${baseline.envMedian}%` : '样本不足', hot: baseline.envMedian != null && baseline.envMedian > 0 },
        { icon: Sprout, k: '正增长店铺占比', v: baseline.posShare != null ? `${baseline.posShare}%` : '样本不足' },
        { icon: Target, k: 'ROI P50 / P75', v: `${fmt1(baseline.roiP50)} / ${baseline.roiP75 != null ? fmt1(baseline.roiP75) : '—'}` },
        { icon: Wallet, k: '支付单均价中位数', v: baseline.priceMed != null ? `${baseline.priceMed} 元` : '样本不足' },
        { icon: Building2, k: '有效店铺数', v: baseline.shops != null ? `${baseline.shops} 家` : '—' },
      ])
    : [];

  // 当前类目脱敏基准：FaaS 下发区间/分位标签；未到达时各项显示 —
  const benchRows = GH_BENCH_KEYS.map(k => ghDisp?.bench?.find(b => b.k === k) ?? { k, v: baseline ? '—' : '待选类目' });

  return (
    <div className="space-y-4">
      {/* 顶部图例（替代紫色大横幅：细步骤条在 App 层，这里仅保留「谁填写」图例） */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn" />代理填写</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" />系统自动带出 / 计算</span>
        <span className="ml-auto hidden sm:flex items-center gap-1 text-ink-400">
          <FileSpreadsheet className="w-3 h-3" /> 对标 68 个二级类目 QTD Top500 商品实测数据实时测算（0917 底表）
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[155fr_100fr] gap-4">
        {/* ---------- 左：产品信息填写（demo 与正式版完全同一套表单，仅数据预填差异） ---------- */}
        <div id="pa-info-anchor" className={`${cardCls} p-5 scroll-mt-20`}>
          <h2 className="text-sm font-bold text-ink-900 mb-4 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-brand-600" /> 产品信息填写
          </h2>

          {/* 商品链接或名称 */}
          <Field label={<>商品链接或名称 <MicroAgent>代理填</MicroAgent> <MicroAuto>自动识别类目</MicroAuto></>}>
            <textarea rows={2} value={form.url} onChange={e => onPasteLink(e.target.value)}
              className={inputCls + ' resize-none h-auto py-2.5'}
              placeholder="粘贴抖音商品链接 / haohuo长链 / 纯数字商品ID，或点「识别商品」；也可先在下方手动选类目" />
            <div className="mt-2 flex items-center gap-2.5 flex-wrap">
              <button type="button" onClick={onRecognize} disabled={!form.url.trim() || recognizing}
                className={btnPrimary + ' h-9 px-3.5 text-xs'}>
                {recognizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {recognizing ? '识别中…' : '识别商品'}
              </button>
              {recognizeMsg && <span className="text-[11px] text-ink-500">{recognizeMsg}</span>}
            </div>
          </Field>

          {/* idOnly 就近补填 */}
          <AnimatePresence>
            {idOnlyItemId && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-2 rounded-xl border border-warn-line bg-warn-bg/70 p-3">
                  <p className="text-xs font-bold text-warn-ink flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />已提取商品ID：<span className="font-mono">{idOnlyItemId}</span>
                  </p>
                  <p className="text-[11px] text-ink-700 mt-1">补一个<b>商品名称</b>即可继续；或在抖音 App 分享复制 v.douyin.com 短链实现全自动识别。</p>
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <input className={inputCls + ' h-9'} value={idFill.productName}
                      onChange={e => setIdFill(s => ({ ...s, productName: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && idFillNameOk) confirmIdFill(); }} placeholder="商品名称 *" autoFocus />
                    <input className={inputCls + ' h-9'} value={idFill.brand} onChange={e => setIdFill(s => ({ ...s, brand: e.target.value }))} placeholder="品牌（选填）" />
                    <input type="number" min={0} className={inputCls + ' h-9'} value={idFill.price} onChange={e => setIdFill(s => ({ ...s, price: e.target.value }))} placeholder="客单价（选填）" />
                    <input className={inputCls + ' h-9'} value={idFill.sellingPoints} onChange={e => setIdFill(s => ({ ...s, sellingPoints: e.target.value }))} placeholder="核心卖点（选填、/ 分隔）" />
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <button type="button" onClick={confirmIdFill} disabled={!idFillNameOk}
                      className={btnPrimary + ' h-8 px-3.5 text-xs'}>确认，开始分析</button>
                    <button type="button" onClick={onCancelIdOnly} className={btnGhost + ' h-8 px-3.5 text-xs'}>取消</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label={<>商品名称 <MicroAuto>识别带出/可改</MicroAuto></>}>
              <input className={inputCls} value={form.productName} onChange={e => set('productName', e.target.value)} placeholder="识别后自动带出，可手动改" />
            </Field>
            <Field label={<>代理商 <MicroAgent>代理填</MicroAgent></>}>
              <input className={inputCls} value={form.agent} onChange={e => set('agent', e.target.value)} placeholder="如：明日世界" />
            </Field>
            <Field label={<>一级类目 <MicroAuto>自动识别</MicroAuto></>}>
              <div className="relative">
                <select className={inputCls + ' appearance-none pr-9'}
                  value={form.level1}
                  onChange={e => onPickLevel1 ? onPickLevel1(e.target.value) : (set('level1', e.target.value), set('level2', ''))}>
                  <option value="">-- 请选择一级类目 --</option>
                  {LEVEL1_LIST.map(l1 => <option key={l1} value={l1}>{l1}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-ink-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <span className="block text-[10px] text-ink-400 mt-1">可先选一级类目，再筛选二级类目</span>
            </Field>
            <Field label={<>二级类目 <MicroAuto>自动识别</MicroAuto></>} required>
              <div className="relative">
                <select className={inputCls + ' appearance-none pr-9'}
                  value={form.level2}
                  onChange={e => {
                    const cat = CATEGORIES.find(c => c.level2 === e.target.value) ?? null;
                    if (onPickLevel2) onPickLevel2(cat);
                    else { set('level2', cat ? cat.level2 : ''); set('level1', cat ? cat.level1 : form.level1); }
                  }}>
                  <option value="">{form.level1 ? '-- 请选择二级类目 --' : '-- 请先选一级类目，或让系统自动识别 --'}</option>
                  {l2Options.map(c => <option key={c.level1 + c.level2} value={c.level2}>{c.level2}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-ink-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* 类目参考数据：中性浅底卡片（绿色仅一枚图标 + 正向数值） */}
          <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5">
            <p className="text-xs font-bold text-ink-900 mb-1 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-ok-ink" /> 类目参考
              <span className="font-normal text-ink-400 text-[10px] font-medium">二级类目 QTD Top500 实测 · 自动带出</span>
              {baseline && <span className="ml-auto text-[10px] font-semibold text-ok-ink bg-ok-bg px-2 py-0.5 rounded">{baseline.level2}</span>}
            </p>
            {baseline ? (
              <div className="grid grid-cols-2 gap-x-5">
                {refRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-line-soft last:border-0">
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-500 whitespace-nowrap">
                      <r.icon className="w-3.5 h-3.5 text-ink-400" />{r.k}
                    </span>
                    <span className={`text-[13px] font-bold font-mono whitespace-nowrap tabnum ${r.hot ? 'text-ok-ink' : 'text-ink-900'}`}>{r.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink-400 py-3 text-center">粘贴链接自动识别，或手选二级类目后，此处立即带出 8 项类目参考数据</p>
            )}
          </div>

          {/* 代理商填写参数：白底输入框（不再整框黄） */}
          <p className="text-[11px] font-bold tracking-wide text-ink-400 mt-4 mb-2 flex items-center gap-2">
            投放参数 <span className="flex-1 h-px bg-line-soft" />
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>星川日预算（万元/天） <MicroAgent>代理填</MicroAgent></>} required>
              <input type="number" min={0} step="0.01" className={inputCls} value={form.xcDailyBudgetWan}
                onChange={e => set('xcDailyBudgetWan', e.target.value)} placeholder="例：3" />
            </Field>
            <Field label={<>产品客单价（元） <MicroAgent>代理填</MicroAgent></>} required>
              <input type="number" min={0} className={inputCls} value={form.price}
                onChange={e => set('price', e.target.value)} placeholder="例：69.9" />
            </Field>
            <Field label={<>千川稳定ROI <MicroAgent>代理填</MicroAgent></>} required>
              <input type="number" min={0} step="0.01" className={inputCls} value={form.stableRoi}
                onChange={e => set('stableRoi', e.target.value)} placeholder="例：2.0" />
            </Field>
            <Field label={<>追投下星川目标ROI <MicroAgent>代理填</MicroAgent></>} required hint="只有追投素材持续跑量，ROI 才有下降空间">
              <input type="number" min={0} step="0.01" className={inputCls} value={form.targetRoi}
                onChange={e => set('targetRoi', e.target.value)} placeholder="例：1.5" />
            </Field>
          </div>
          <div className="mt-3 sm:col-span-2">
            <div className="rounded-[12px] border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-brand-500" />
                <span className="text-xs font-semibold text-ink-700">客户配合维度（20分，服务商手填）</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Field label={<>达人反选比例（%） <MicroAgent>代理填</MicroAgent></>} required hint="客户否决推荐达人占比，0-100% 反向线性，0%=10分满分，越低越好">
                  <input type="number" min={0} max={100} className={inputCls} value={form.reverseSelectPct}
                    onChange={e => set('reverseSelectPct', e.target.value)} placeholder="例：20" />
                </Field>
                <Field label={<>达人素材追投数量比例（%） <MicroAgent>代理填</MicroAgent></>} required hint="达人素材被追投数量占比，0-50% 线性计分，≥50%=10分满分">
                  <input type="number" min={0} max={100} className={inputCls} value={form.materialChasePct}
                    onChange={e => set('materialChasePct', e.target.value)} placeholder="例：60" />
                </Field>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button type="button" onClick={onClear} className={btnGhost + ' h-9 px-3.5 text-xs'}>
              <Eraser className="w-3.5 h-3.5" /> 清空
            </button>
            <button type="button" onClick={copySnapshot} className={btnGhost + ' h-9 px-3.5 text-xs ml-auto'}>
              <ClipboardCopy className="w-3.5 h-3.5" /> {copiedSnap ? '已复制' : '复制分析快照'}
            </button>
          </div>

          {(ghSite || demo) ? (
            /* 当前类目脱敏基准（对外版/演示：仅区间 / 分位标签，无大盘绝对值/精确ROI/精确客单价） */
            <div className="mt-4 rounded-2xl border border-line bg-surface-2/60 p-4">
              <h3 className="text-[16px] font-extrabold text-ink-900">当前类目脱敏基准</h3>
              <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">仅展示区间 / 分位标签，不显示任何大盘绝对值、精确 ROI 或精确客单价。</p>
              <div className="grid grid-cols-3 gap-2.5 mt-3">
                {benchRows.map((c, i) => (
                  <div key={i} className="rounded-xl border border-line bg-white px-3 py-3">
                    <p className="text-[11px] text-ink-400 leading-snug">{c.k}</p>
                    <p className="text-[14px] font-bold text-ink-900 mt-1.5 leading-snug">{c.v}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 计分规则说明 */}
              <div className="mt-4">
                <button type="button" onClick={() => setShowRules(v => !v)}
                  className="text-[11px] text-brand-600 font-semibold flex items-center gap-1">
                  <ChevronDown className={`w-3 h-3 transition-transform ${showRules ? 'rotate-180' : ''}`} /> 计分规则说明
                </button>
                {showRules && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-[11px] text-ink-500 space-y-1.5 leading-relaxed bg-surface-2 border border-line-soft rounded-xl p-3">
                    <p>5 个模块合计 100 分（对标二级类目 QTD 大盘 Top500 商品实测数据，共 68 个类目；数据窗口 2026-07-01~09-16）：</p>
                    <ul className="space-y-1 pl-3">
                      <li>· 爆品趋势 20：类目 QTD 规模分位 10 + 类目 14 天消耗环比 6 + 正增长店铺占比 4</li>
                      <li>· 客单价 15：客单价与类目支付单均价中位数偏离，≤10%→15，10~20%→12，20~30%→8，30~50%→4，&gt;50%→1</li>
                      <li>· 投放预算 20：星川日预算直比类目 Top500 单商品日耗分位，≥P60→20，P40~P60→16，P20~P40→10，&lt;P20→4</li>
                      <li>· ROI 25：目标 ROI 可下调空间 12.5 + 与类目 P50 匹配 8.75 + 与 P75 匹配 3.75</li>
                      <li>· 客户配合 20：达人反选比例 10（反向，0%=满分）+ 达人素材追投数量比例 10（≥50%=满分）</li>
                    </ul>
                    <p>商品定级（P0/P1/P2）不在本页输出：需结合服务商自有达人库，在下方「服务商适配分析」中按《商品分层规则V1》结合达人供给与承接能力给出，本页只输出商品分数。</p>
                  </motion.div>
                )}
              </div>

              {/* 更多商品信息（识别后自动带出，可编辑） */}
              <details className="mt-3 group">
                <summary className="text-[11px] text-ink-500 cursor-pointer hover:text-brand-600 list-none flex items-center gap-1">
                  <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" /> 更多商品信息（识别后自动带出，供内容/达人模块使用，可编辑）
                </summary>
                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <Field label="品牌">
                    <input className={inputCls} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="例：韩束" />
                  </Field>
                  <Field label="品类">
                    <input className={inputCls} value={form.category} onChange={e => set('category', e.target.value)} placeholder="例：洗发护发" />
                  </Field>
                  <Field label="核心卖点（、/ 分隔）">
                    <input className={inputCls} value={form.sellingPoints} onChange={e => set('sellingPoints', e.target.value)} placeholder="防脱/控油/蓬松" />
                  </Field>
                  <Field label="目标人群">
                    <input className={inputCls} value={form.targetAudience} onChange={e => set('targetAudience', e.target.value)} placeholder="20-45岁男女" />
                  </Field>
                  <Field label="使用场景（、/ 分隔）">
                    <input className={inputCls} value={form.usageScene} onChange={e => set('usageScene', e.target.value)} placeholder="日常洗护/油头护理" />
                  </Field>
                </div>
              </details>
            </>
          )}
        </div>

        {/* ---------- 右：实时评分（视觉主角，粘性） ---------- */}
        <div className="space-y-4 lg:sticky lg:top-20 self-start">
          {/* 评分主卡（demo 模式同样实时展示 100 分总分） */}
          <div id="pa-score-anchor" className={`${cardCls} p-5 scroll-mt-20`}>
            <p className="text-xs font-bold text-ink-500 mb-1">实时综合分</p>
            <div className="flex flex-col items-center py-2">
              <div className="relative w-[132px] h-[132px]">
                <svg width="132" height="132" viewBox="0 0 120 120" className="-rotate-90">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="#EEF0F5" strokeWidth="10" />
                  <circle cx="60" cy="60" r={R} fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={CIRC} strokeDashoffset={ringOffset}
                    style={{ transition: 'stroke-dashoffset .6s ease, stroke .3s ease' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[42px] leading-none font-bold text-ink-900 tabnum">{ready ? scoreResult.total : '–'}</span>
                  <span className="text-[11px] text-ink-400 mt-1">/ 100</span>
                </div>
              </div>
              <motion.span key={scoreResult.level} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold border ${LEVEL_BAND[scoreResult.level]}`}>
                {scoreResult.level === 'high' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {scoreResult.level === 'none' ? '待填写' : meta.label}
              </motion.span>
              <p className="text-[11px] text-ink-400 mt-2.5 text-center leading-relaxed px-1">{meta.desc}</p>
            </div>
          </div>

          {/* 五维得分：进度条列表 */}
          <div className={`${cardCls} p-5`}>
            <h3 className="text-[15px] font-extrabold text-ink-900 flex items-center gap-1.5 mb-3">
              <Gauge className="w-4 h-4 text-brand-600" /> 五维得分
            </h3>
            <div className="space-y-3.5">
              {scoreResult.dims.map((d, i) => {
                const advText = dimensionAdvice(d);
                const pct = d.max ? Math.round((d.score / d.max) * 100) : 0;
                const tone: string = !d.ready ? 'empty' : pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'bad';
                const tag = !d.ready ? '待填' : tone === 'good' ? '优势' : tone === 'mid' ? '中等' : '短板';
                return (
                  <motion.div key={d.key}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[14px] font-bold text-ink-900 flex items-center gap-1.5">
                        {d.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${TONE_CHIP[tone]}`}>{tag}</span>
                        <span className="text-[13px] font-bold text-ink-900 tabnum">{d.ready ? d.score : '–'}<span className="text-ink-400 font-medium">/{d.max}</span></span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${d.ready ? pct : 0}%`, transition: 'width .5s ease' }} />
                    </div>
                    <p className="text-[11px] text-ink-500 mt-1.5 leading-relaxed">{advText}</p>
                    {d.subs && (
                      <div className="mt-1 space-y-0.5">
                        {d.subs.map((s, si) => (
                          <p key={si} className="text-[10px] text-ink-400 leading-tight pl-1">· {s.name} <b className="text-ink-500 tabnum">{s.score}/{s.max}</b> — {ghDisp?.subs?.[d.key]?.[si] ?? s.detail}</p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* AI 红线检测与策略（demo 模式进入页面自动触发，无需点击） */}
          <div id="pa-ai-anchor" className={`${cardCls} p-5 scroll-mt-20`}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-ink-900 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-danger-ink" /> AI 红线检测与投放策略
              </p>
              <button type="button" onClick={onRunAi} disabled={scoreAiLoading || !baseline}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold disabled:opacity-40 transition-colors border bg-danger-bg border-danger-line text-danger-ink hover:bg-danger/10">
                {scoreAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {scoreAi ? '重新诊断' : 'AI 诊断红线'}
              </button>
            </div>
            {scoreAiError && <p className="text-[11px] text-danger-ink mt-2">{scoreAiError}</p>}
            {!scoreAi && !scoreAiLoading && (
              <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">选择类目并填好参数后，AI 评估 4 条红线（毛利/合规/库存履约/素材供给）并给出投放策略。</p>
            )}
            {scoreAi && (
              <div className="space-y-2.5 mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {scoreAi.redLines.map((r, i) => {
                    const verify = !r.hit && !!r.reason;
                    return (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-[10px] text-[10px] font-semibold border ${
                        r.hit ? 'bg-danger-bg border-danger-line text-danger-ink'
                        : verify ? 'bg-warn-bg border-warn-line text-warn-ink'
                        : 'bg-ok-bg border-ok-line text-ok-ink'}`}>
                        {r.hit || verify ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {r.name}{r.reason ? `：${r.reason}` : ''}
                      </span>
                    );
                  })}
                </div>
                <AdviceBlock icon={Lightbulb} title="策略建议" items={scoreAi.strategy} tone="green" />
                <AdviceBlock icon={AlertTriangle} title="风险提示" items={scoreAi.risks} tone="red" />
                <AdviceBlock icon={TrendingUp} title="优化方向" items={scoreAi.optimize} tone="violet" />
                {scoreAi.summary && <p className="text-[11px] text-ink-700 bg-surface-2 rounded-lg p-2.5 leading-relaxed flex gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />{scoreAi.summary}</p>}
              </div>
            )}
          </div>

          {/* 建议动作 */}
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-card">
            <p className="text-xs font-bold text-brand-700 flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-3.5 h-3.5" /> 建议动作
            </p>
            <p className="text-[12px] text-ink-700 leading-relaxed">{overallAdvice(scoreResult)}</p>
          </div>

          {/* 达人标签（全链路模式可微调） */}
          <div className={`${cardCls} p-5`}>
            <p className="text-[13px] font-bold text-ink-900 mb-2 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-brand-600" /> 内容偏好标签
              <span className="text-[10px] font-normal text-ink-400">影响后续达人匹配，可多选</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {INFLUENCER_TAGS.map(tag => {
                const on = form.influencerTags.includes(tag);
                return (
                  <button key={tag} type="button" onClick={() => onToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-[10px] text-xs border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-500 border-line hover:border-brand-300'}`}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
