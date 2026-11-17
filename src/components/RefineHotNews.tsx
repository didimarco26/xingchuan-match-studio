import { useEffect, useRef, useState } from 'react';
import {
  Flame, RefreshCw, ExternalLink, AlertCircle, Loader2, Lightbulb, Zap, Sparkles, Rocket, CheckCircle2, X,
} from 'lucide-react';
import {
  fetchHotNews, fetchHotInsights, type HotNewsResult, type HotNewsItem,
} from '../lib/api';

// ============================================================
// 脚本方向卡 · 🔥 热点营销参考（右侧侧边面板内容）
// 挂载于画布右侧：宽屏 sticky 内嵌、窄屏右侧抽屉。激活后拉取当前商品所属行业的抖音热点（≤6 条），
// 每条带 AI「热点洞察 / 可借钩子」；勾选钩子后底部「✅ 引入已选内容到优化方向」批量追加到方向卡优化输入框。
// 榜单 25min 模块级缓存（同页多个方向卡共享一次拉取）；组件常驻挂载，勾选状态不随开关丢失。
// ============================================================

const REFINE_HOT_TOP = 6;
const HOT_TTL_MS = 25 * 60 * 1000;

// 模块级共享缓存：industry → { at, result }（同一页面 3 张方向卡只拉一次）
interface HotCacheEntry { at: number; result: HotNewsResult }
const hotCache = new Map<string, HotCacheEntry>();
function hotCacheGet(key: string): HotNewsResult | null {
  const c = hotCache.get(key);
  if (!c) return null;
  if (Date.now() - c.at < HOT_TTL_MS) return c.result;
  hotCache.delete(key);
  return null;
}
function hotCacheSet(key: string, result: HotNewsResult) {
  hotCache.set(key, { at: Date.now(), result });
}

interface RefineHotNewsProps {
  industry: string;
  /** 品类/细分类目：榜单映射按行业+品类精准选榜（如营养保健→亲子+美食相关度排序，而非泛探店） */
  category?: string;
  /** 面板是否激活：首次激活才拉取榜单（懒加载） */
  active: boolean;
  /** 点「✅ 引入已选内容到优化方向」：把勾选的钩子/洞察（多行文本）回传给父组件填入迭代输入框 */
  onIntroduce: (text: string) => void;
  /** 点「热点营销进阶」：打开右侧完整热点营销方案面板（与本面板互斥） */
  onOpenHotMarketingAdvance?: () => void;
  /** 关闭面板 */
  onClose?: () => void;
}

export default function RefineHotNews({ industry, category = '', active, onIntroduce, onOpenHotMarketingAdvance, onClose }: RefineHotNewsProps) {
  const [result, setResult] = useState<HotNewsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [introduced, setIntroduced] = useState<Set<string>>(new Set());
  const reqSeq = useRef(0);
  const everFetched = useRef(false);

  const ind = (industry || '其他').trim() || '其他';
  const cat = (category || '').trim();
  const cacheKey = `${ind}|${cat}`;

  // 榜单秒回后，异步拉 AI 洞察/钩子渐进填充（失败留空不阻塞）；结果同步进共享缓存
  const loadInsights = async (r: HotNewsResult, seq: number) => {
    const needTitles = r.items.filter(it => !it.insight && !it.hook).map(it => it.title);
    if (!needTitles.length) return;
    setInsightLoading(true);
    try {
      const ai = await fetchHotInsights(ind, r.board, needTitles);
      if (seq !== reqSeq.current) return;
      if (ai && ai.length) {
        const byTitle = new Map(ai.map(x => [x.title, x]));
        const merged: HotNewsResult = {
          ...r,
          items: r.items.map(it => {
            const m = byTitle.get(it.title);
            return m ? { ...it, insight: m.insight || it.insight || '', hook: m.hook || it.hook || '' } : it;
          }),
        };
        setResult(merged);
        hotCacheSet(cacheKey, merged);
      }
    } catch { /* 留空即可 */ }
    finally { if (seq === reqSeq.current) setInsightLoading(false); }
  };

  const doFetch = async (force = false) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(false);
    setInsightLoading(false);
    try {
      const cached = force ? null : hotCacheGet(cacheKey);
      const r = cached || await fetchHotNews(ind, REFINE_HOT_TOP, cat);
      if (seq !== reqSeq.current) return;
      if (r && r.items.length) {
        const top6: HotNewsResult = { ...r, items: r.items.slice(0, REFINE_HOT_TOP) };
        setResult(top6);
        hotCacheSet(cacheKey, top6);
        void loadInsights(top6, seq);
      } else {
        setResult(null);
        setError(true);
      }
    } catch {
      if (seq !== reqSeq.current) return;
      setResult(null);
      setError(true);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  };

  // 首次激活才拉取（懒加载）；行业切换时重置
  useEffect(() => {
    if (active && !everFetched.current) {
      everFetched.current = true;
      doFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    everFetched.current = false;
    setResult(null);
    setError(false);
    setInsightLoading(false);
    setSelected(new Set());
    setIntroduced(new Set());
    if (active) { everFetched.current = true; doFetch(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind]);

  const itemKey = (it: HotNewsItem) => it.url || String(it.rank);
  const canSelect = (it: HotNewsItem) => !!(it.hook || it.insight);

  const toggleOne = (it: HotNewsItem) => {
    const key = itemKey(it);
    if (!canSelect(it) || introduced.has(key)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 批量引入：勾选的钩子（无钩子则洞察兜底）拼成多行，回传父组件追加进优化输入框
  const handleIntroduce = () => {
    if (!result) return;
    const lines: string[] = [];
    const done = new Set<string>();
    for (const it of result.items) {
      const key = itemKey(it);
      if (!selected.has(key) || introduced.has(key)) continue;
      const text = (it.hook || it.insight || '').trim();
      if (!text) continue;
      lines.push(it.hook ? `【可借钩子】${text}` : `【热点洞察】${text}`);
      done.add(key);
    }
    if (!lines.length) return;
    onIntroduce(lines.join('\n'));
    setIntroduced(prev => new Set([...prev, ...done]));
    setSelected(prev => {
      const next = new Set(prev);
      done.forEach(k => next.delete(k));
      return next;
    });
  };

  const doneCount = result?.items.filter(it => it.hook || it.insight).length || 0;
  const selectedCount = result
    ? result.items.filter(it => selected.has(itemKey(it)) && !introduced.has(itemKey(it)) && canSelect(it)).length
    : 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 面板头部 */}
      <div className="px-4 py-3 border-b border-orange-100 bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-sm shrink-0">
            <Flame className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink-800 leading-tight">🔥 热点营销参考</p>
            <p className="text-[10px] text-ink-400 leading-tight truncate">同行业抖音热榜 · AI 提炼可借钩子，勾选后批量引入优化方向</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-ink-400"
              title="收起面板">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {onOpenHotMarketingAdvance && (
          <button
            type="button"
            onClick={() => onOpenHotMarketingAdvance()}
            title="生成完整热点营销方案（S/A/B/C 分级机会卡），切换到右侧热点营销进阶面板"
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 text-white text-[11px] font-bold px-2 py-1.5 hover:from-orange-600 hover:to-rose-600 transition-colors shadow-sm"
          >
            <Rocket className="w-3.5 h-3.5" />
            热点营销进阶（S/A/B/C 机会卡 · 右侧面板）
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-ink-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
            正在抓取抖音同行业热点…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <p className="text-[11px] text-ink-500">同行业热点暂时拉取失败（第三方榜单限频），不影响脚本优化。</p>
            <button type="button" onClick={() => doFetch(true)}
              className="mt-0.5 text-[11px] px-2.5 py-1 rounded-md bg-orange-500 text-white hover:opacity-90">
              重新拉取
            </button>
          </div>
        )}

        {!loading && !error && result && result.items.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              {result.board && (
                <span className="text-[10.5px] text-orange-600 bg-orange-50 rounded-full px-2 py-0.5 truncate">
                  {result.board}
                </span>
              )}
              {doneCount > 0 && (
                <span className="shrink-0 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold px-1.5 py-0.5">{doneCount} 条可引入</span>
              )}
              <button
                type="button"
                onClick={() => doFetch(true)}
                disabled={loading}
                className="ml-auto flex items-center gap-1 text-[10.5px] text-ink-400 hover:text-orange-500 disabled:opacity-50 shrink-0"
                title="刷新热点"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                刷新
              </button>
            </div>
            {insightLoading && (
              <p className="flex items-center gap-1.5 text-[10.5px] text-orange-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <Sparkles className="w-3 h-3" />
                AI 正在逐条解读爆火洞察与可借钩子，稍后自动补全…
              </p>
            )}
            <ul className="space-y-2">
              {result.items.map((it) => {
                const key = itemKey(it);
                const checked = selected.has(key);
                const already = introduced.has(key);
                const selectable = canSelect(it);
                return (
                  <li key={key} className="flex gap-2 rounded-lg border border-line-soft bg-surface-2/50 px-2 py-1.5">
                    <span className="shrink-0 w-[18px] h-[18px] mt-0.5 rounded-md bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center">
                      {it.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-snug text-ink-800 line-clamp-2">{it.title}</p>
                      {it.insight && (
                        <p className="mt-0.5 flex items-start gap-1 text-[10.5px] leading-snug text-ink-500">
                          <Lightbulb className="w-3 h-3 mt-px shrink-0 text-amber-500" />
                          <span><span className="text-ink-400">洞察·</span>{it.insight}</span>
                        </p>
                      )}
                      {it.hook && (
                        <p className="mt-0.5 flex items-start gap-1 text-[10.5px] leading-snug">
                          <Zap className="w-3 h-3 mt-px shrink-0 text-emerald-600" />
                          <span className="inline-flex items-start gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                            <input
                              type="checkbox"
                              checked={checked || already}
                              disabled={!selectable || already}
                              onChange={() => toggleOne(it)}
                              className="mt-px w-3 h-3 accent-orange-500 shrink-0 cursor-pointer disabled:cursor-default"
                              title={already ? '已引入优化方向' : '勾选后批量引入'}
                            />
                            <span><span className="font-semibold">钩子·</span>{it.hook}</span>
                          </span>
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="shrink-0 text-[10px] text-ink-400">
                          抖音{it.source ? ` · ${it.source}` : ''}{it.viewsText ? ` · ${it.viewsText}` : ''}
                        </span>
                        {it.url && (
                          <a href={it.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-medium shrink-0 hover:underline">
                            <ExternalLink className="w-2.5 h-2.5" />看原视频
                          </a>
                        )}
                        {/* 无钩子仅有洞察时，兜底展示勾选框 */}
                        {!it.hook && (
                          <label className={`ml-auto inline-flex items-center gap-1 shrink-0 ${selectable && !already ? 'cursor-pointer' : 'opacity-50'}`}>
                            <input
                              type="checkbox"
                              checked={checked || already}
                              disabled={!selectable || already}
                              onChange={() => toggleOne(it)}
                              className="w-3.5 h-3.5 accent-orange-500 cursor-pointer disabled:cursor-default"
                            />
                            <span className="text-[10.5px] font-bold text-orange-600">{already ? '已引入' : selectable ? '勾选引入' : 'AI 解读中…'}</span>
                          </label>
                        )}
                        {it.hook && already && (
                          <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 rounded-md bg-ok-bg text-ok-ink border border-ok-line px-1.5 py-0.5 text-[10px] font-bold">
                            <CheckCircle2 className="w-2.5 h-2.5" />已引入
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={handleIntroduce}
              disabled={selectedCount === 0}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {selectedCount > 0 ? `✅ 引入已选内容到优化方向（${selectedCount} 条钩子）` : '✅ 引入已选内容到优化方向'}
            </button>
            <p className="text-[10px] text-ink-400 leading-relaxed">
              勾选钩子后点上方按钮，内容会追加到左侧方向卡「✏️ 优化迭代」输入框并自动展开，再点「重新生成」即可；AI 会围绕本商品卖点改写，不照搬热点内容。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
