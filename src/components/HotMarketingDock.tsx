import { useState } from 'react';
import {
  Flame, RefreshCw, AlertCircle, Loader2, Zap, ChevronDown,
  Copy, Check, Target, Users, Clock, X, Rocket, ExternalLink, TrendingUp, PlayCircle,
  CornerDownRight, ListPlus,
} from 'lucide-react';
import {
  MKT_WINDOW_OPTIONS, MKT_SCENARIO_OPTIONS, MKT_STYLE_OPTIONS,
  type HotMarketingPlan, type HotMarketingOpp, type HotMarketingItem,
  type MktWindow, type MktScenario, type MktStyle,
} from '../lib/api';

// ============================================================
// 热点营销进阶 · 右侧侧边面板（画布右侧空白区）
// 展示：①筛选器（时间窗口 1天/7天/14天/1月/3月 + 营销场景 竞价/品牌/种草 多选）
//      ②行业热点榜（大盘 TopHub 抖音热榜，带视频直链）
//      ③品牌匹配机会卡（S/A/B/C 分级：适合客户/为什么现在跟/2切口/前3秒开场钩子，可复制/看视频）
// plan/loading 由父级（App）管理；onGenerate 触发按新筛选参数重新生成。与主流程解耦，失败不影响左侧。
// ============================================================

const GRADE_STYLE: Record<string, { badge: string; ring: string }> = {
  S: { badge: 'bg-gradient-to-br from-amber-500 to-rose-500 text-white', ring: 'border-rose-300' },
  A: { badge: 'bg-orange-500 text-white', ring: 'border-orange-300' },
  B: { badge: 'bg-sky-500 text-white', ring: 'border-sky-300' },
  C: { badge: 'bg-gray-400 text-white', ring: 'border-gray-300' },
};
const MEDAL = ['🥇', '🥈', '🥉'];

const SCENARIO_CLS: Record<string, string> = {
  竞价: 'bg-brand-50 text-brand-700 border-brand-200',
  品牌: 'bg-violet-50 text-violet-700 border-violet-200',
  种草: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function urgencyCls(t: string): string {
  if (/立即|24小时|马上/.test(t)) return 'bg-rose-50 text-rose-600 border-rose-200';
  if (/3-7|7天|准备/.test(t)) return 'bg-amber-50 text-amber-600 border-amber-200';
  return 'bg-slate-50 text-slate-500 border-slate-200';
}

async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

/** 外链按钮：抖音热榜/机会卡关联的热点视频 */
function VideoLink({ url, title, compact = false }: { url?: string; title?: string; compact?: boolean }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title ? `看热点视频：${title}` : '看热点视频'}
      className={
        compact
          ? 'shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 bg-white'
          : 'inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10.5px] font-bold text-rose-600 hover:bg-rose-100 transition-colors'
      }
    >
      <PlayCircle className="w-3 h-3" /> 看视频
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </a>
  );
}

export function HotOppCard({
  opp, rank, targetIdx = 0, hasTargets = false, onQuote,
}: {
  opp: HotMarketingOpp; rank: number;
  /** 当前「引用到脚本」目标方向索引 */
  targetIdx?: number;
  /** 是否存在已生成的脚本方向 */
  hasTargets?: boolean;
  /** 引用回调（父级注入指定方向卡优化输入框）；返回是否成功 */
  onQuote?: (text: string, targetIdx: number) => boolean;
}) {
  const [copiedKey, setCopiedKey] = useState('');
  const [quotedKey, setQuotedKey] = useState('');
  const [noTargetHint, setNoTargetHint] = useState(false);
  const gs = GRADE_STYLE[opp.grade] || GRADE_STYLE.C;

  const flash = (setter: (k: string) => void, key: string) => {
    setter(key);
    setTimeout(() => setter(''), 1600);
  };

  /** 单个字段尾部的「复制 / 引用」按钮组 */
  const FieldActions = ({ copyVal, quoteVal, keyId, quoteTitle }: {
    copyVal: string; quoteVal: string; keyId: string; quoteTitle: string;
  }) => (
    <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={async () => { if (await copyText(copyVal)) flash(setCopiedKey, keyId); }}
        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-ink-500 hover:bg-slate-100"
        title="复制"
      >
        {copiedKey === keyId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        {copiedKey === keyId ? '已复制' : '复制'}
      </button>
      <button
        type="button" disabled={!hasTargets}
        onClick={() => {
          if (!onQuote) return;
          if (onQuote(quoteVal, targetIdx)) flash(setQuotedKey, keyId);
          else { setNoTargetHint(true); setTimeout(() => setNoTargetHint(false), 2400); }
        }}
        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
          hasTargets ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-300 cursor-not-allowed'}`}
        title={hasTargets ? quoteTitle : '请先生成脚本方向'}
      >
        {quotedKey === keyId ? <Check className="w-3 h-3 text-emerald-500" /> : <CornerDownRight className="w-3 h-3" />}
        {quotedKey === keyId ? '已引用' : '引用'}
      </button>
    </span>
  );

  // 整卡引用：把所有拆解部分组装成结构化文本（带标签，AI 可直接读懂）
  const quoteWhole = () => {
    const L = [`【热点机会·${opp.grade}级】${opp.name}`];
    if (opp.fitClients) L.push(`【热点适合人群】${opp.fitClients}`);
    if (opp.whyNow) L.push(`【热点时效由头·为什么现在跟】${opp.whyNow}`);
    opp.angles.forEach((a, i) => L.push(`【热点切口${i + 1}】${a}`));
    if (opp.hook) L.push(`【可借钩子·前3秒开场】${opp.hook}`);
    const text = L.join('\n');
    if (onQuote?.(text, targetIdx)) flash(setQuotedKey, 'whole');
    else { setNoTargetHint(true); setTimeout(() => setNoTargetHint(false), 2400); }
  };

  return (
    <div className={`rounded-xl border ${gs.ring} bg-white overflow-hidden shadow-sm`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/70">
        <span className={`shrink-0 w-8 h-8 rounded-lg ${gs.badge} text-sm font-extrabold flex items-center justify-center shadow-sm`}>
          {opp.grade}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-ink-800 leading-tight truncate">
            {rank < 3 ? <span className="mr-0.5">{MEDAL[rank]}</span> : null}
            {opp.name}
            <span className="ml-1.5 text-[11px] font-semibold text-ink-400">{opp.score} 分</span>
            {opp.scenario && (
              <span className={`ml-1.5 text-[9.5px] font-bold px-1.5 py-px rounded border ${SCENARIO_CLS[opp.scenario] || SCENARIO_CLS.竞价}`}>
                {opp.scenario}
              </span>
            )}
            {opp.style && (
              <span className="ml-1 text-[9.5px] font-bold px-1.5 py-px rounded border bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
                {opp.style}
              </span>
            )}
          </p>
          {opp.timeliness && (
            <span className={`mt-0.5 inline-block text-[10px] px-1.5 py-px rounded border ${urgencyCls(opp.timeliness)}`}>
              {opp.timeliness}
            </span>
          )}
        </div>
        <VideoLink url={opp.videoUrl} title={opp.videoTitle || opp.name} compact />
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        {noTargetHint && (
          <p className="text-[10.5px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            还没有可引用的脚本方向，请先生成脚本后再引用。
          </p>
        )}
        {opp.fitClients && (
          <div className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-600">
            <Users className="w-3.5 h-3.5 mt-px shrink-0 text-brand-500" />
            <span className="min-w-0"><span className="text-ink-400">适合客户·</span>{opp.fitClients}</span>
            <FieldActions copyVal={opp.fitClients} quoteVal={`【热点适合人群】${opp.fitClients}`} keyId="fit" quoteTitle="引用适合客户到脚本优化区" />
          </div>
        )}
        {opp.whyNow && (
          <div className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-600">
            <Clock className="w-3.5 h-3.5 mt-px shrink-0 text-amber-500" />
            <span className="min-w-0"><span className="text-ink-400">为什么现在跟·</span>{opp.whyNow}</span>
            <FieldActions copyVal={opp.whyNow} quoteVal={`【热点时效由头】${opp.whyNow}`} keyId="why" quoteTitle="引用时效由头到脚本优化区" />
          </div>
        )}
        {opp.angles.length > 0 && (
          <div className="space-y-1">
            {opp.angles.map((a, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <Target className="w-3.5 h-3.5 mt-px shrink-0 text-rose-500" />
                <span className="rounded-md border border-rose-100 bg-rose-50/60 px-2 py-1 text-ink-700 min-w-0">
                  <span className="font-semibold text-rose-600">切口{i + 1}·</span>{a}
                </span>
                <FieldActions copyVal={a} quoteVal={`【热点切口${i + 1}】${a}`} keyId={`angle${i}`} quoteTitle="引用这个切口到脚本优化区" />
              </div>
            ))}
          </div>
        )}
        {opp.hook && (
          <div className="rounded-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50/60 px-2.5 py-2">
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 shrink-0 text-brand-600" />
              <span className="text-[10px] font-bold text-brand-700">🎬 短视频前3秒开场钩子（可直接拍）</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-brand-900">{opp.hook}</p>
            <div className="mt-1 flex justify-end">
              <FieldActions copyVal={opp.hook} quoteVal={`【可借钩子·前3秒开场】${opp.hook}`} keyId="hook" quoteTitle="引用开场钩子到脚本优化区" />
            </div>
          </div>
        )}
        <button
          type="button" disabled={!hasTargets} onClick={quoteWhole}
          className={`w-full mt-0.5 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold border ${
            hasTargets
              ? quotedKey === 'whole'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
              : 'border-ink-200 bg-ink-50 text-ink-300 cursor-not-allowed'}`}
          title={hasTargets ? '把整张机会卡结构化引用到脚本优化区' : '请先生成脚本方向'}
        >
          {quotedKey === 'whole' ? <Check className="w-3.5 h-3.5" /> : <ListPlus className="w-3.5 h-3.5" />}
          {quotedKey === 'whole' ? '已引用到脚本优化区' : '引用整张机会卡到脚本'}
        </button>
      </div>
    </div>
  );
}

/** 行业热点榜区块：大盘当前热榜条目（非品牌匹配），带视频直链 */
function IndustryHotList({ items, board }: { items: HotMarketingItem[]; board?: string }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
        <TrendingUp className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="text-[12px] font-bold text-ink-800">行业热点榜</span>
        <span className="text-[10px] text-ink-400 truncate">该行业抖音实时热榜{board ? ` · ${board}` : ''}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((h, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50/70">
            <span className={`shrink-0 w-[18px] h-[18px] min-w-[18px] text-center text-[10.5px] font-extrabold rounded ${i < 3 ? 'bg-amber-100 text-amber-700' : 'text-ink-300'}`}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-snug text-ink-700 line-clamp-2">{h.title}</p>
              <p className="mt-0.5 text-[9.5px] text-ink-300 truncate">
                {h.source ? `抖音 · ${h.source}` : '抖音热榜'}
                {h.heat ? ` · 🔥${h.heat}` : ''}
              </p>
            </div>
            <VideoLink url={h.url} title={h.title} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface HotMarketingDockBodyProps {
  plan: HotMarketingPlan | null;
  loading: boolean;
  error: boolean;
  contextLabel?: string;   // 已带入的商品上下文，用于头部只读展示
  onRetry: () => void;
  onGenerate?: (params: { win: MktWindow; scenarios: MktScenario[]; styles: MktStyle[] }) => void;
  onClose?: () => void;
  title?: string;
  /** 可引用的脚本方向列表（索引 + 名称）；为空时引用按钮禁用 */
  quoteTargets?: { index: number; label: string }[];
  /** 把某段拆解内容引用（注入）到指定方向卡优化输入框；返回是否成功 */
  onQuote?: (text: string, targetIndex: number) => boolean;
}

export default function HotMarketingDockBody({
  plan, loading, error, contextLabel, onRetry, onGenerate, onClose, title = '热点营销进阶',
  quoteTargets = [], onQuote,
}: HotMarketingDockBodyProps) {
  // 引用目标方向：默认第一个已生成方向
  const [targetIdx, setTargetIdx] = useState<number>(0);
  const effectiveTargetIdx = quoteTargets.some(t => t.index === targetIdx)
    ? targetIdx
    : (quoteTargets[0]?.index ?? 0);
  // 筛选器本地态：默认跟随已返回 plan 的口径，否则 7天/竞价/不限风格
  const [win, setWin] = useState<MktWindow>((plan?.win as MktWindow) || '7d');
  const [scenarios, setScenarios] = useState<MktScenario[]>((plan?.scenarios as MktScenario[])?.length ? plan!.scenarios as MktScenario[] : ['竞价']);
  const [styles, setStyles] = useState<MktStyle[]>((plan?.styles as MktStyle[])?.length ? plan!.styles as MktStyle[] : []);

  const planWin = (plan?.win || '7d') as MktWindow;
  const planScenarios = (plan?.scenarios?.length ? plan.scenarios : ['竞价']).slice().sort().join('+');
  const curScenarios = scenarios.slice().sort().join('+');
  const planStyles = (plan?.styles || []).slice().sort().join('+');
  const curStyles = styles.slice().sort().join('+');
  const paramsChanged = win !== planWin || curScenarios !== planScenarios || curStyles !== planStyles;

  const toggleScenario = (s: MktScenario) => {
    setScenarios(prev => prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]);
  };
  const toggleStyle = (s: MktStyle) => {
    setStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };
  const doGenerate = () => {
    if (loading || !onGenerate) return;
    onGenerate({ win, scenarios, styles });
  };
  // 重试：优先按当前筛选参数重新生成，否则回退父级默认重试
  const doRetry = () => {
    if (loading) return;
    if (onGenerate) onGenerate({ win, scenarios, styles });
    else onRetry();
  };

  const hasOpps = !!plan && plan.opportunities.length > 0;
  const hasHotItems = !!plan && (plan.hotItems?.length || 0) > 0;
  const windowLabel = MKT_WINDOW_OPTIONS.find(o => o.value === win)?.label || '7天';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/40">
      {/* 头部（固定不滚动：标题 + 筛选器） */}
      <div className="shrink-0 px-4 py-3 border-b border-line-soft bg-white/80 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-sm shrink-0">
            <Flame className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink-800 leading-tight flex items-center gap-1">
              <Rocket className="w-3.5 h-3.5 text-rose-500" /> {title}
            </p>
            <p className="text-[10px] text-ink-400 leading-tight">
              {plan?.windowText || '未来7天'} · {plan?.scenarios?.join('/') || '千川竞价'}
              {(plan?.styles?.length ? plan.styles : styles).length > 0 &&
                <span className="text-fuchsia-500"> · 风格{(plan?.styles?.length ? plan.styles : styles).join('/')}</span>}
              {' '}· S/A/B/C 分级
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-ink-400"
              title="收起面板">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {contextLabel && (
          <p className="mt-1.5 text-[10px] text-ink-400 leading-snug truncate">已带入：<span className="font-semibold text-ink-600">{contextLabel}</span></p>
        )}

        {/* 筛选器：时间窗口 + 营销场景 + 刷新 */}
        <div className="mt-2.5 rounded-lg border border-line-soft bg-slate-50/70 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-bold text-ink-400 w-12">时间窗口</span>
            <div className="flex-1 flex flex-wrap gap-1">
              {MKT_WINDOW_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  disabled={loading}
                  onClick={() => setWin(o.value)}
                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border transition-colors disabled:opacity-50 ${
                    win === o.value ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-ink-500 border-slate-200 hover:border-rose-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-bold text-ink-400 w-12">营销场景</span>
            <div className="flex-1 flex flex-wrap gap-1">
              {MKT_SCENARIO_OPTIONS.map(s => {
                const on = scenarios.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => toggleScenario(s)}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border transition-colors disabled:opacity-50 ${
                      on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-500 border-slate-200 hover:border-brand-300'
                    }`}
                    title={s === '竞价' ? '千川竞价带货短视频' : s === '品牌' ? '品牌广告/心智曝光' : '星图达人种草内容'}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-bold text-ink-400 w-12">内容风格</span>
            <div className="flex-1 flex flex-wrap gap-1">
              {MKT_STYLE_OPTIONS.map(s => {
                const on = styles.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => toggleStyle(s)}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border transition-colors disabled:opacity-50 ${
                      on ? 'bg-fuchsia-500 text-white border-fuchsia-500' : 'bg-white text-ink-500 border-slate-200 hover:border-fuchsia-300'
                    }`}
                    title="多选；不选=不限，AI 按场景自由发挥"
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end pt-0.5">
            <button
              type="button"
              onClick={doGenerate}
              disabled={loading || !onGenerate || !paramsChanged}
              className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-500 to-rose-500 text-white text-[10.5px] font-bold px-2.5 py-1 hover:from-orange-600 hover:to-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title={paramsChanged ? `按「${windowLabel} · ${scenarios.join('/')}${styles.length ? ' · ' + styles.join('/') : ''}」重新生成方案` : '筛选条件未变化'}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '生成中…' : paramsChanged ? `按${windowLabel}·${scenarios.join('/')}${styles.length ? '·风格' : ''}刷新` : '已是当前口径'}
            </button>
          </div>
        </div>
      </div>

      {/* 内容区（仅此区域滚动：机会卡 + 热榜；min-h-0 保证 flex 子项可收缩出滚动条） */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-2.5">
        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
            <p className="text-[11.5px] text-ink-500">正在生成热点营销方案…</p>
            <p className="text-[10px] text-ink-300">抓热点+营销节点 → 六项评估分级 → 出切口与开场钩子</p>
          </div>
        )}

        {!loading && error && !plan && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            <p className="text-[11.5px] text-ink-500">热点营销方案生成失败（AI 波动或超时），<br />不影响左侧主流程。</p>
            <button type="button" onClick={doRetry}
              className="mt-1 inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:opacity-90">
              <RefreshCw className="w-3 h-3" /> 重新生成
            </button>
          </div>
        )}

        {!loading && plan && (
          <>
            {/* 总结 */}
            {hasOpps && (
              <div className="flex items-start gap-1.5 rounded-xl bg-white border border-line-soft px-3 py-2">
                <Flame className="w-4 h-4 mt-px shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="text-[11.5px] leading-snug text-ink-700">{plan.summary}</p>
                  <p className="mt-0.5 text-[9.5px] text-ink-300">
                    {plan.fetchTime ? `数据时间 ${plan.fetchTime}` : ''}
                    {plan.salvaged ? ' · 结果较长有截断' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* 品牌匹配机会卡（S/A/B/C） */}
            {hasOpps ? (
              <>
                <p className="px-1 text-[10.5px] font-bold text-ink-500 flex items-center gap-1">
                  <Rocket className="w-3 h-3 text-rose-500" /> 品牌匹配机会（结合「{contextLabel?.split('·')[0]?.trim() || '本商品'}」卖点与人群）
                </p>
                {/* 引用目标方向选择器 */}
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                    <span className="text-[10.5px] font-bold text-ink-700">引用到脚本</span>
                    <span className="text-[9.5px] text-ink-400">内容将插入所选方向的「优化输入」，可整段或逐字段引用</span>
                  </div>
                  {quoteTargets.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {quoteTargets.map(t => (
                        <button
                          key={t.index}
                          type="button"
                          onClick={() => setTargetIdx(t.index)}
                          className={`max-w-full truncate rounded-md px-2 py-1 text-[10.5px] font-bold border transition ${
                            effectiveTargetIdx === t.index
                              ? 'border-rose-400 bg-rose-500 text-white shadow-sm'
                              : 'border-line-soft bg-white text-ink-600 hover:border-rose-300'}`}
                          title={t.label}
                        >
                          方向{t.index + 1}·{t.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-amber-600 font-semibold">尚未生成脚本方向，请先在左侧生成脚本，再回来引用。</p>
                  )}
                </div>
                {plan.opportunities.map((o, i) => (
                  <HotOppCard
                    key={`${o.name}-${i}`}
                    opp={o}
                    rank={i}
                    hasTargets={quoteTargets.length > 0}
                    targetIdx={effectiveTargetIdx}
                    onQuote={onQuote}
                  />
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-rose-200 bg-rose-50/50 px-3 py-5 text-center">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <p className="text-[11px] text-ink-500">品牌匹配机会生成波动，可先参考下方行业热点榜。</p>
                <button type="button" onClick={doRetry}
                  className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] px-2.5 py-1 rounded-lg bg-rose-500 text-white hover:opacity-90">
                  <RefreshCw className="w-3 h-3" /> 重试生成机会卡
                </button>
              </div>
            )}

            {/* 行业热点榜（大盘） */}
            {hasHotItems && (
              <>
                <p className="px-1 pt-1 text-[10.5px] font-bold text-ink-500 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-amber-500" /> 行业大盘热点（与「行业热点参考」同源）
                </p>
                <IndustryHotList items={plan.hotItems!} board={plan.hotBoard} />
              </>
            )}

            {!hasHotItems && plan.hotLimited && (
              <p className="px-1 text-[10px] text-ink-300 flex items-center gap-1">
                <ChevronDown className="w-3 h-3" /> 实时热榜暂时不可用（第三方反爬），机会卡基于营销节点与行业趋势生成。
              </p>
            )}

            <p className="text-[9.5px] text-ink-300 leading-relaxed pt-1 flex items-center gap-1">
              <ChevronDown className="w-3 h-3 shrink-0" /> 脚本主链路按星川优质爆款案例生成；参考以上热点后，可在方向卡「优化迭代」里引用热点切口/钩子微调。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
