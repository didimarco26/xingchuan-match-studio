import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Loader2, Sparkles, RefreshCw, ClipboardCopy, Check,
  UserCheck, Crosshair, Crown, Wind, ArrowRight, PencilLine,
} from 'lucide-react';
import { fetchAgencyFit, fetchIndustryAdvantage, saveFitGrade, type AgencyFitData } from '../lib/api';
import { isGhPages, getGhAuth } from '../lib/gh';
import { isDemoMode } from '../lib/demo';
import { DEMO_AGENCY } from '../data/demo-agency-library';
import {
  gradeByFit, fitSignalsFromData, GRADE_STYLE, GRADE_ORDER, serviceStrategyFor,
  type Grade, type GradeResult, type ServiceStrategy,
} from '../lib/grade';

export interface FitGradeChange {
  grade: Grade;
  name: string;
  strategy: ServiceStrategy;
  manual: boolean;
}

interface AgencyFitCardProps {
  productName: string;
  industry: string;          // 对内 7 行业
  level1: string;            // 门捷列夫一级类目
  tags: string[];            // 商品行业标签（17 类）
  agent: string;             // 对内表单服务商名
  score: number | null;      // 商品分析总分
  hardGateFail: boolean;     // 是否命中硬门槛
  onGoTagger: () => void;    // 跳转达人打标（对外切 tab / 对内开公开站）
  onFitGradeChange?: (c: FitGradeChange | null) => void;  // 定级变化（一页纸据此补充分级服务策略）
}

function fmtFans(n: number): string {
  n = Number(n) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return String(n);
}

const LEVEL_STYLE: Record<string, string> = {
  S5: 'bg-amber-100 text-amber-700 border-amber-200',
  S4: 'bg-orange-100 text-orange-700 border-orange-200',
  S3: 'bg-sky-100 text-sky-700 border-sky-200',
  S2: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  S1: 'bg-gray-100 text-gray-600 border-gray-200',
  S0: 'bg-gray-100 text-gray-500 border-gray-200',
  未分级: 'bg-gray-50 text-gray-400 border-gray-200',
};
const TIER_STYLE: Record<string, string> = {
  标杆: 'bg-amber-50 text-amber-600 border-amber-200',
  主力: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  潜力: 'bg-sky-50 text-sky-600 border-sky-200',
  储备: 'bg-gray-50 text-gray-500 border-gray-200',
};
const COVERAGE_STYLE: Record<string, string> = {
  强: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  中: 'bg-amber-100 text-amber-700 border-amber-200',
  弱: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function AgencyFitCard(props: AgencyFitCardProps) {
  const gh = isGhPages();
  const demo = isDemoMode();
  const ghAuth = gh ? getGhAuth() : null;
  // demo 绑定预置服务商「深圳正阳」；对内需要表单服务商名，对外只认登录态 agency
  const agencyReady = demo || (gh ? !!ghAuth?.agency : !!props.agent.trim());
  const identityBody = demo
    ? { agent: DEMO_AGENCY }
    : gh ? { token: ghAuth?.token || '' } : { agent: props.agent.trim() };
  const tagsReady = props.tags.length > 0;

  const [data, setData] = useState<AgencyFitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retrySeq, setRetrySeq] = useState(0);

  // 商品定级（服务商适配分析 → 商品分层规则V1）
  const [manualGrade, setManualGrade] = useState<Grade | null>(null); // 服务商手选（覆盖推荐）
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeSaved, setGradeSaved] = useState(false);
  const [showGradeMenu, setShowGradeMenu] = useState(false);
  const fitSignals = useMemo(() => fitSignalsFromData(data), [data]);
  const recGrade: GradeResult | null = useMemo(
    () => gradeByFit(props.score, props.hardGateFail, fitSignals),
    [props.score, props.hardGateFail, fitSignals],
  );
  const shownGrade = manualGrade ?? recGrade?.grade ?? null;
  // P1 细分：推荐为 P1 时沿用推荐口径，手选 P1 默认按能力带动
  const kindFor = (g: Grade): 'supply' | 'ability' | undefined => {
    if (g !== 'P1') return undefined;
    if (recGrade?.grade === 'P1') return recGrade.name === '供给补齐' ? 'supply' : 'ability';
    return 'ability';
  };
  const GRADE_NAMES: Record<Grade, string> = {
    P0: '核心增产', P1: '能力带动', P2: '观察验证', P3: '暂缓·汰换',
  };
  const effName = shownGrade
    ? (manualGrade
      ? (shownGrade === 'P1' ? (kindFor('P1') === 'supply' ? '供给补齐' : '能力带动') : GRADE_NAMES[shownGrade])
      : recGrade?.name ?? GRADE_NAMES[shownGrade])
    : '';
  const effectiveStrategy = shownGrade ? serviceStrategyFor(shownGrade, kindFor(shownGrade)) : null;

  // 定级变化 → 通知一页纸（补充分级服务策略）
  useEffect(() => {
    props.onFitGradeChange?.(shownGrade && effectiveStrategy
      ? { grade: shownGrade, name: effName, strategy: effectiveStrategy, manual: !!manualGrade }
      : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownGrade, effectiveStrategy, manualGrade, effName]);

  // 商品/服务商变化 → 重置定级
  useEffect(() => {
    setManualGrade(null); setGradeSaved(false);
  }, [props.productName, ghAuth?.agency, props.agent]);

  // 推荐定级生成后自动同步爆品库（手动改过则不覆盖）
  useEffect(() => {
    if (!recGrade || manualGrade || gradeSaved || savingGrade) return;
    if (!props.productName.trim() || !agencyReady) return;
    let alive = true;
    setSavingGrade(true);
    saveFitGrade({
      productName: props.productName.trim(),
      ...identityBody,
      score: props.score, grade: recGrade.grade, fitKind: kindFor(recGrade.grade),
    }).then(() => { if (alive) setGradeSaved(true); })
      .catch(() => {/* 同步失败不阻断分析 */})
      .finally(() => { if (alive) setSavingGrade(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recGrade, manualGrade, gradeSaved]);

  const pickGrade = (g: Grade) => {
    setShowGradeMenu(false);
    if (!props.productName.trim() || !agencyReady) { setManualGrade(g); return; }
    setSavingGrade(true);
    saveFitGrade({
      productName: props.productName.trim(),
      ...identityBody,
      score: props.score, grade: g, fitKind: kindFor(g), manual: true,
    }).then(() => { setManualGrade(g); setGradeSaved(true); })
      .catch(() => setManualGrade(g))
      .finally(() => setSavingGrade(false));
  };

  // 优势文案
  const [advText, setAdvText] = useState('');
  const [advLoading, setAdvLoading] = useState(false);
  const [advError, setAdvError] = useState('');
  const [copied, setCopied] = useState(false);

  const cacheKey = useMemo(() => JSON.stringify({
    a: gh ? ghAuth?.agency : props.agent.trim(),
    t: props.tags, l: props.level1, i: props.industry,
  }), [gh, ghAuth?.agency, props.agent, props.tags, props.level1, props.industry]);

  useEffect(() => {
    let alive = true;
    setData(null); setError(''); setAdvText(''); setAdvError('');
    if (!agencyReady || !tagsReady) return;
    setLoading(true);
    const body = {
      productName: props.productName, industry: props.industry,
      level1: props.level1, tags: props.tags,
      ...identityBody,
    };
    fetchAgencyFit(body)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(String(e?.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, retrySeq]);

  const genAdvantage = () => {
    if (!data || data.empty) return;
    setAdvLoading(true); setAdvError('');
    const body = {
      productName: props.productName, industry: props.industry,
      level1: props.level1, tags: data.tags.length ? data.tags : props.tags,
      ...identityBody,
    };
    fetchIndustryAdvantage(body)
      .then(r => setAdvText(r.text))
      .catch(e => setAdvError(String(e?.message || e)))
      .finally(() => setAdvLoading(false));
  };

  const copyAdv = async () => {
    try { await navigator.clipboard.writeText(advText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const levelEntries = ['S5', 'S4', 'S3', 'S2', 'S1', 'S0', '未分级'];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* 头部 */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shrink-0">
            <Users className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink-900 leading-tight flex items-center gap-2">
              服务商适配分析
              {data && !data.empty && shownGrade && (
                <span
                  className="text-[10px] font-bold border px-1.5 py-0.5 rounded-md"
                  style={{
                    color: GRADE_STYLE[shownGrade].text,
                    background: GRADE_STYLE[shownGrade].bg,
                    borderColor: GRADE_STYLE[shownGrade].border,
                  }}
                >
                  商品定级 {shownGrade}
                </span>
              )}
              {data && !data.empty && (
                <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded ${COVERAGE_STYLE[data.coverage]}`}>
                  覆盖能力{data.coverage}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-ink-500 mt-0.5">
              按《商品分层规则V1》：商品分析分数 × 服务商自有达人库供给与承接能力 → 输出商品 P0/P1/P2 定级
            </p>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />}
      </div>

      <div className="px-5 pb-5">
        {/* 前置条件不足 */}
        {!agencyReady && (
          <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 px-4 py-3 text-[12px] text-gray-500 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            {gh ? '登录态未包含服务商信息，请重新登录后查看达人库适配。' : '填写服务商名称后可查看该服务商达人库与本商品的行业适配。'}
          </div>
        )}
        {agencyReady && !tagsReady && (
          <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 px-4 py-3 text-[12px] text-gray-500 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-gray-400" />
            先选择商品行业（行业标签），即可分析达人库行业适配。
          </div>
        )}

        {/* 加载中 */}
        {agencyReady && tagsReady && loading && (
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100" />)}
            </div>
            <div className="h-10 rounded-xl bg-gray-100" />
            <div className="h-20 rounded-xl bg-gray-100" />
          </div>
        )}

        {/* 失败 */}
        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-red-600">适配分析失败：{error}</span>
            <button
              onClick={() => setRetrySeq(s => s + 1)}
              className="text-[12px] font-medium text-red-600 hover:text-red-700 flex items-center gap-1 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 重试
            </button>
          </div>
        )}

        {!loading && !error && data && (
        <AnimatePresence mode="wait">
          {data.empty ? (
            /* ========== 情况 B：无打标数据 ========== */
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-dashed border-gray-200 px-5 py-7 flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <UserCheck className="w-6 h-6 text-gray-400" />
              </div>
              {gh ? (
                <>
                  <p className="text-[13px] text-gray-600 max-w-sm leading-relaxed">
                    暂无本服务商上传的达人打标数据，无法评估行业适配性。<br />
                    使用达人自助打标工具上传名单后即可分析。
                  </p>
                  <button
                    onClick={props.onGoTagger}
                    className="mt-3 text-[12.5px] text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
                  >
                    尚未上传？前往 🏷️ 服务商达人自助打标 <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-gray-600 max-w-sm leading-relaxed">
                    主库存量达人库中暂无归属该服务商的达人，无法评估行业适配性。<br />
                    可引导服务商先完成达人打标后重试。
                  </p>
                  <button
                    onClick={props.onGoTagger}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[13px] font-semibold hover:shadow-lg hover:shadow-brand-500/20 transition-all"
                  >
                    前往达人打标 <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </motion.div>
          ) : (
            /* ========== 情况 A：有达人库数据 ========== */
            <motion.div
              key="fit"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* ========== 商品定级（分层规则V1） ========== */}
              <div className="rounded-xl border border-ink-100 bg-gradient-to-br from-white to-surface-2 p-4 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {shownGrade ? (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-extrabold border-2 shrink-0"
                        style={{
                          color: GRADE_STYLE[shownGrade].text,
                          borderColor: GRADE_STYLE[shownGrade].dot,
                          background: GRADE_STYLE[shownGrade].bg,
                        }}
                      >
                        {shownGrade}
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-full border-2 border-dashed border-ink-300 flex items-center justify-center shrink-0">
                        <Crosshair className="w-4 h-4 text-ink-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-ink-900">
                        {manualGrade && recGrade && manualGrade !== recGrade.grade
                          ? `${manualGrade}（手选）· 系统推荐 ${recGrade.grade} ${recGrade.name}`
                          : recGrade ? `${recGrade.grade} · ${recGrade.name}`
                          : props.score == null ? '商品尚未完成分析，暂无法定级' : '暂无法定级'}
                      </div>
                      <div className="text-[10.5px] text-ink-400 mt-0.5">
                        {savingGrade ? '正在同步到爆品库…'
                          : gradeSaved ? '✓ 定级已同步到代理商爆品库'
                          : '定级依据见下，服务商可自行修改'}
                      </div>
                    </div>
                  </div>
                  {/* 手选定级 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowGradeMenu(v => !v)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[11.5px] font-semibold text-ink-600 hover:border-brand-300 hover:text-brand-600 bg-white"
                    >
                      <PencilLine className="w-3.5 h-3.5" /> 修改定级
                    </button>
                    {showGradeMenu && (
                      <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-line bg-white shadow-pop p-1.5">
                        {GRADE_ORDER.map(g => (
                          <button key={g} type="button" onClick={() => pickGrade(g)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-surface-2"
                            style={{ color: GRADE_STYLE[g].text }}>
                            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[9px]"
                              style={{ borderColor: GRADE_STYLE[g].dot }}>{g}</span>
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* 定级依据 + 动作 */}
                {recGrade && (
                  <div className="mt-3 space-y-1.5 text-[11.5px] leading-relaxed">
                    <p className="text-ink-700"><span className="font-bold text-ink-500">定级依据：</span>{recGrade.reason}</p>
                    <p className="text-ink-700"><span className="font-bold text-ink-500">建议动作：</span>{recGrade.action}</p>
                    <p className="text-ink-400"><span className="font-bold">升降级触发：</span>{recGrade.trigger}</p>
                  </div>
                )}
                {!recGrade && props.score == null && (
                  <p className="mt-2 text-[11.5px] text-ink-400">请先完成上方商品分析，系统再结合达人库给出定级。</p>
                )}
              </div>

              {/* 汇总指标 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 px-3.5 py-3">
                  <div className="text-[11px] text-gray-500 flex items-center gap-1"><Users className="w-3 h-3" />达人库总数</div>
                  <div className="text-[20px] font-extrabold text-ink-900 leading-tight mt-0.5">{data.total}</div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-3.5 py-3">
                  <div className="text-[11px] text-brand-600 flex items-center gap-1"><Crosshair className="w-3 h-3" />行业匹配达人</div>
                  <div className="text-[20px] font-extrabold text-brand-700 leading-tight mt-0.5">{data.matchedCount}</div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 px-3.5 py-3">
                  <div className="text-[11px] text-amber-600 flex items-center gap-1"><Crown className="w-3 h-3" />主力等级</div>
                  <div className="text-[20px] font-extrabold text-amber-700 leading-tight mt-0.5">
                    {data.mainLevel || (data.mainTier ? data.mainTier : '—')}
                  </div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-sky-50 to-white border border-sky-100 px-3.5 py-3">
                  <div className="text-[11px] text-sky-600 flex items-center gap-1"><Wind className="w-3 h-3" />主力粉丝档</div>
                  <div className="text-[20px] font-extrabold text-sky-700 leading-tight mt-0.5">
                    {data.topFans || '—'}
                  </div>
                </div>
              </div>

              {/* 等级分布 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-gray-500 mr-1">星川等级分布</span>
                {levelEntries.map(lv => (
                  <span key={lv} className={`text-[11px] font-semibold border px-2 py-1 rounded-lg ${LEVEL_STYLE[lv]}`}>
                    {lv} · {(data.levelDist?.[lv] ?? 0)}
                  </span>
                ))}
              </div>
              {/* 分层 + 粉丝量分布 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 mr-0.5">综合分层</span>
                  {['标杆', '主力', '潜力', '储备'].map(t => (
                    <span key={t} className={`text-[11px] font-medium border px-2 py-0.5 rounded ${TIER_STYLE[t]}`}>
                      {t} {data.tierDist?.[t] ?? 0}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 mr-0.5">粉丝量级</span>
                  {['百万级', '十万级', '万级', '万级以下'].map(t => (
                    <span key={t} className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">
                      {t} {data.fansDist?.[t] ?? 0}
                    </span>
                  ))}
                </div>
              </div>

              {/* 结论 */}
              {data.conclusion && (
                <div className="rounded-xl bg-amber-50/70 border border-amber-100 px-4 py-3 text-[12.5px] text-amber-900 leading-relaxed">
                  {data.conclusion}
                </div>
              )}

              {/* 代表达人名单 */}
              {data.topCreators.length > 0 && (
                <div>
                  <div className="text-[11px] text-gray-500 mb-1.5">
                    行业匹配代表达人（按星川等级 / 综合分层 / 粉丝量排序，前 {data.topCreators.length} 位）
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {data.topCreators.map((c, i) => (
                      <div key={c.name + i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
                        <span className="text-[11px] font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                        <span className="text-[12.5px] font-medium text-ink-800 truncate min-w-0 flex-1">{c.name}</span>
                        {c.level && c.level !== '未分级' && (
                          <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded shrink-0 ${LEVEL_STYLE[c.level]}`}>{c.level}</span>
                        )}
                        {c.tier && (
                          <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded shrink-0 ${TIER_STYLE[c.tier]}`}>{c.tier}</span>
                        )}
                        <span className="text-[10.5px] text-gray-400 shrink-0 w-12 text-right">{fmtFans(c.fans)}粉</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 行业垂类服务优势 */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[12.5px] font-semibold text-ink-800">
                    行业垂类服务优势
                  </div>
                  <div className="flex items-center gap-2">
                    {advText && (
                      <button
                        onClick={copyAdv}
                        className="text-[11px] text-gray-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        {copied ? <><Check className="w-3 h-3" /> 已复制</> : <><ClipboardCopy className="w-3 h-3" /> 复制</>}
                      </button>
                    )}
                    <button
                      onClick={genAdvantage}
                      disabled={advLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[12px] font-semibold hover:shadow-md hover:shadow-brand-500/20 transition-all disabled:opacity-60"
                    >
                      {advLoading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Sparkles className="w-3.5 h-3.5" />}
                      {advText ? '重新生成' : '生成行业垂类服务优势'}
                    </button>
                  </div>
                </div>
                {advError && (
                  <p className="mt-2 text-[12px] text-red-500">生成失败：{advError}，请重试</p>
                )}
                {advText && (
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="mt-2.5 text-[12.5px] leading-relaxed text-ink-700 whitespace-pre-wrap"
                  >
                    {advText}
                  </motion.p>
                )}
                {!advText && !advError && (
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    点击后基于该服务商达人的行业、人设、内容形式等真实标签，生成约 200 字可直接用于品牌提案的服务优势描述。
                  </p>
                )}
              </div>

              {/* 数据来源 */}
              <div className="text-[10.5px] text-gray-400">
                {data.source === 'tagger'
                  ? `数据来源：服务商自助打标台账 ${data.total} 人${data.batches ? `（${data.batches} 个批次）` : ''}`
                  : `数据来源：主库「存量达人库」归属达人 ${data.total} 人`}
                ；匹配标签：{data.tags.join('、')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}
