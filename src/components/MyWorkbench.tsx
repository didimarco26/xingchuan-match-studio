import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Loader2, Package, FileText, Users, User as UserIcon, RefreshCw,
  ChevronDown, ChevronUp, Inbox, Boxes, ShieldCheck, CheckCircle2, XCircle, Crown,
  PencilLine, X, Plus, Check, AlertCircle, ClipboardList,
} from 'lucide-react';
import {
  fetchMySummary, fetchMyProductList, fetchMyProductDetail,
  fetchMyScripts, fetchMyInfluencerStats, fetchMyMatchList, fetchMyMatchDetail,
  updateInfluencerField,
  type MySummary, type MyProductItem, type MyProductDetail,
  type MyScriptItem, type MyInfluencerStats, type MyMatchItem,
  type MyInfluencerDetail, type InfluencerField, type InfluencerValue,
} from '../lib/baopin';
import {
  getGhAuth, pmGetMembers, pmApproveMember, pmRejectMember, pmGetProviderList,
  isGhPages,
  type ProviderInfo,
} from '../lib/gh';
import BaopinLibrary from './BaopinLibrary';
import DeliveryWorkbench from './DeliveryWorkbench';
import LocalContentLibrary from './LocalContentLibrary';

// ============================================================
// 🏢 服务商工作台（仅对外版，服务商主账号制）
//   记录按「服务商维度」归并；主账号额外拥有「成员管理」（审批/授权/拒绝）
// ============================================================

type Tab = 'products' | 'baopin' | 'delivery' | 'scripts' | 'influencers' | 'matches' | 'members';

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 操作人审计小字：同服务商成员记录合并展示，仅附属标注实际操作人（不参与分组）
function OperatorTag({ operator, phoneMask }: { operator?: string; phoneMask?: string }) {
  if (!operator) return null;
  const tail = phoneMask && phoneMask.includes('****') ? phoneMask.split('****')[1] : '';
  return <span className="ml-1.5 text-ink-400">· {operator}{tail ? ` ****${tail}` : ''}</span>;
}

const TABS: Array<{ key: Tab; label: string; icon: typeof Package }> = [
  { key: 'products', label: '商品分析历史', icon: Package },
  { key: 'baopin', label: '爆品库', icon: Boxes },
  { key: 'delivery', label: '达人交付管理', icon: ClipboardList },
  { key: 'scripts', label: '内容脚本', icon: FileText },
  { key: 'influencers', label: '达人库情况', icon: Users },
  { key: 'matches', label: '达人匹配记录', icon: RefreshCw },
];

// ① 商品分析历史
function ProductHistory({ internal }: { internal?: boolean }) {
  const [list, setList] = useState<MyProductItem[] | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, MyProductDetail | 'loading'>>({});

  const load = useCallback(async () => {
    setList(null); setError('');
    try { setList((await fetchMyProductList()).list); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (item: MyProductItem) => {
    if (expanded[item.id]) {
      setExpanded(v => { const n = { ...v }; delete n[item.id]; return n; });
      return;
    }
    setExpanded(v => ({ ...v, [item.id]: 'loading' }));
    try {
      const d = (await fetchMyProductDetail(item.id)).detail;
      setExpanded(v => ({ ...v, [item.id]: d }));
    } catch {
      setExpanded(v => { const n = { ...v }; delete n[item.id]; return n; });
    }
  };

  // 五维分渲染（各维度得分是 JSON 字符串）
  const renderDims = (raw: string) => {
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* 原样展示 */ }
    if (parsed) {
      const dims = Array.isArray(parsed) ? parsed : (parsed.dims || parsed.results || []);
      if (Array.isArray(dims) && dims.length) {
        return (
          <div className="space-y-1.5">
            {dims.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-20 shrink-0 text-ink-600">{d.name || d.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-500 to-rose-500"
                    style={{ width: `${Math.min(100, (Number(d.score) / (Number(d.max) || 100)) * 100)}%` }} />
                </div>
                <span className="w-14 text-right text-ink-500">{d.score}/{d.max || 100}</span>
              </div>
            ))}
          </div>
        );
      }
    }
    return <pre className="whitespace-pre-wrap text-[12px] text-ink-600 font-sans">{raw}</pre>;
  };

  if (error) return <div className="text-center text-red-600 text-sm py-14">{error}</div>;
  if (!list) return <div className="flex justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  if (!list.length) return <Empty text="还没有商品分析记录" />;

  return (
    <div className="space-y-2">
      {list.map(item => {
        const ex = expanded[item.id];
        return (
          <div key={item.id} className="rounded-xl border border-line-soft bg-white overflow-hidden">
            <button type="button" onClick={() => toggle(item)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas/60">
              {item.level
                ? <span className="w-9 h-9 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-[12px] font-bold text-ink-700">{item.level}</span>
                : <span className="w-9 h-9 shrink-0 rounded-lg bg-gray-100" />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-ink-900 truncate">{item.name}</div>
                <div className="text-[11px] text-ink-400">{fmtTime(item.time)}
                  {internal && item.agency && <span className="ml-2 inline-flex px-1.5 py-px rounded bg-brand-50 text-brand-700 font-semibold">{item.agency}</span>}
                  <OperatorTag operator={item.operator} phoneMask={item.phoneMask} /></div>
              </div>
              <span className="text-[12px] text-ink-500">总分 <b className="text-brand-700 text-[14px]">{item.total}</b></span>
              {ex ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
            </button>
            {ex && (
              <div className="px-4 pb-4 pt-1 border-t border-line-soft">
                {ex === 'loading'
                  ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /></div>
                  : (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-bold text-ink-400 mb-1.5">五维分详情</div>
                        {ex.dims ? renderDims(ex.dims) : <span className="text-[12px] text-ink-400">无</span>}
                      </div>
                      {ex.conclusion && (
                        <div>
                          <div className="text-[11px] font-bold text-ink-400 mb-1">AI 结论全文</div>
                          <pre className="whitespace-pre-wrap text-[12px] leading-5 text-ink-700 font-sans">{ex.conclusion}</pre>
                        </div>
                      )}
                      {ex.videos.length > 0 && (
                        <div>
                          <div className="text-[11px] font-bold text-ink-400 mb-1">参考爆款视频</div>
                          <div className="space-y-1">
                            {ex.videos.map(v => (
                              <a key={v} href={v} target="_blank" rel="noreferrer"
                                className="block truncate text-[12px] text-brand-700 hover:underline">{v}</a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ③ 内容脚本（按商品聚合）：对外版顶部展示本机内容库（IndexedDB），下方为云端留痕记录
function ScriptHistory({ internal }: { internal?: boolean }) {
  return (
    <div>
      {isGhPages() && <LocalContentLibrary />}
      <ServerScriptHistory internal={internal} />
    </div>
  );
}

function ServerScriptHistory({ internal }: { internal?: boolean }) {
  const [list, setList] = useState<MyScriptItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchMyScripts().then(d => setList(d.list)).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const groups = useMemo(() => {
    const m = new Map<string, MyScriptItem[]>();
    (list || []).forEach(it => {
      const arr = m.get(it.product) || [];
      arr.push(it); m.set(it.product, arr);
    });
    return [...m.entries()].map(([product, items]) => ({ product, items }));
  }, [list]);

  if (error) return <div className="text-center text-red-600 text-sm py-14">{error}</div>;
  if (!list) return <div className="flex justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  if (!list.length) return isGhPages() ? null : <Empty text="还没有内容脚本记录" />;

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <div key={g.product} className="rounded-xl border border-line-soft bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-canvas/60 text-[13px] font-bold text-ink-900 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-brand-600" /> {g.product}
            <span className="ml-auto text-[11px] font-normal text-ink-400">{g.items.length} 条脚本</span>
          </div>
          <div className="divide-y divide-line-soft">
            {g.items.map(it => (
              <div key={it.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {internal && it.agency && <span className="inline-flex px-1.5 py-px rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">{it.agency}</span>}
                <span className="text-[12px] font-medium text-ink-800">{it.iterType || '脚本'}</span>
                <span className="text-[11px] text-ink-400">第 {it.round} 轮</span>
                {it.exported && it.exported !== '否' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">已导出</span>
                )}
                {it.refHot && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">参考热点</span>}
                {it.refBrand && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">参考爆款拆解</span>}
                {it.refBreakdown && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">参考千川拆解</span>}
                <span className="ml-auto text-[11px] text-ink-400">{fmtTime(it.time)}<OperatorTag operator={it.operator} phoneMask={it.phoneMask} /></span>
                {it.summary && <p className="w-full text-[11px] text-ink-500 line-clamp-1">{it.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ④ 达人库情况
const LEVEL_OPTIONS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const TIER_OPTIONS = ['P0', 'P1', 'P2'];
const detailKey = (d: MyInfluencerDetail) => (d.id ? `id:${d.id}` : `name:${d.name}`);

// 本地按最新明细重算三个分布（口径与 FaaS myInfluencerStatsStage 保持一致）
function recomputeInfluencerDist(details: MyInfluencerDetail[]) {
  const sDist: Record<string, number> = {};
  const indDist: Record<string, number> = {};
  const tierDist: Record<string, number> = {};
  details.forEach(x => {
    const sl = x.sLevel || '未评级';
    sDist[sl] = (sDist[sl] || 0) + 1;
    const tier = x.tier || '未分层';
    tierDist[tier] = (tierDist[tier] || 0) + 1;
    (x.industry || []).forEach(v => {
      const k = String(v || '').slice(0, 12);
      if (k) indDist[k] = (indDist[k] || 0) + 1;
    });
  });
  const toPairs = (m: Record<string, number>) =>
    Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { sLevelDist: toPairs(sDist), tierDist: toPairs(tierDist), industryDist: toPairs(indDist).slice(0, 15) };
}

// 乐观更新某达人某字段后的整份 stats（明细 + 分布一起重算）
function withPatchedDetail(stats: MyInfluencerStats, key: string, field: InfluencerField, value: InfluencerValue): MyInfluencerStats {
  const details = stats.details.map(x => {
    if (detailKey(x) !== key) return x;
    if (field === 'level') return { ...x, sLevel: String(value) };
    if (field === 'tier') return { ...x, tier: String(value || '') };
    return { ...x, industry: (value as string[]).map(v => String(v)) };
  });
  return { ...stats, details, ...recomputeInfluencerDist(details) };
}

function InfluencerStatsPanel({ internal }: { internal?: boolean }) {
  const [stats, setStats] = useState<MyInfluencerStats | null>(null);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [saveError, setSaveError] = useState('');
  const busyRef = useRef(new Set<string>());
  const [, setBusyTick] = useState(0);
  const statsRef = useRef<MyInfluencerStats | null>(null);
  const errTimer = useRef<number | null>(null);
  statsRef.current = stats;

  useEffect(() => {
    let alive = true;
    setError('');
    fetchMyInfluencerStats()
      .then(d => { if (alive) setStats(d); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [reloadTick]);

  const flashError = (msg: string) => {
    setSaveError(msg);
    if (errTimer.current) window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setSaveError(''), 4000);
  };

  // 即时保存：乐观更新 → 调 FaaS 回写台账 → 失败回滚
  const patchField = useCallback(async (d: MyInfluencerDetail, field: InfluencerField, value: InfluencerValue) => {
    const cur = statsRef.current;
    if (!cur) return;
    const key = detailKey(d);
    const bk = `${key}:${field}`;
    if (busyRef.current.has(bk)) return;
    busyRef.current.add(bk); setBusyTick(t => t + 1);
    const before = cur;
    setStats(withPatchedDetail(cur, key, field, value));
    try {
      await updateInfluencerField(d.id, d.name, field, value);
    } catch (e) {
      setStats(before);
      flashError(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      busyRef.current.delete(bk); setBusyTick(t => t + 1);
    }
  }, []);

  if (error) return <div className="text-center text-red-600 text-sm py-14">{error}</div>;
  if (!stats) return <div className="flex justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  if (!stats.total) return <Empty text="还没有达人打标记录，去「服务商达人打标」试试" />;

  const maxCount = (arr: { count: number }[]) => Math.max(1, ...arr.map(x => x.count));
  const blockColors = ['bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-500', 'bg-violet-500', 'bg-gray-400'];

  const Bars = ({ title, dist }: { title: string; dist: { name: string; count: number }[] }) => (
    <div className="rounded-xl border border-line-soft bg-white p-4">
      <div className="text-[12px] font-bold text-ink-800 mb-2.5">{title}</div>
      <div className="space-y-1.5">
        {dist.map((d, i) => (
          <div key={d.name + i} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 shrink-0 truncate text-ink-600">{d.name || '未评'}</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${blockColors[i % blockColors.length]}`}
                style={{ width: `${(d.count / maxCount(dist)) * 100}%` }} />
            </div>
            <span className="w-7 text-right text-ink-500">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const presets = stats.industryOptions || [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-brand-600 to-rose-600 px-4 py-3 text-white flex items-center gap-3">
        <Users className="w-5 h-5" />
        <span className="text-[13px]">已打标达人总数</span>
        <span className="ml-auto text-2xl font-bold">{stats.total}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Bars title="星川等级分布" dist={stats.sLevelDist} />
        <Bars title="行业覆盖分布" dist={stats.industryDist} />
      </div>
      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{saveError}
        </div>
      )}
      <div className="rounded-xl border border-line-soft bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-canvas/60 text-[12px] font-bold text-ink-800 flex items-center gap-2">
          达人明细（{stats.details.length}）
          <button type="button" onClick={() => setReloadTick(t => t + 1)}
            title="重新从台账拉取"
            className="ml-auto inline-flex items-center gap-1 font-normal text-[11px] text-ink-400 hover:text-brand-600">
            <RefreshCw className="w-3 h-3" />刷新
          </button>
        </div>
        <div className="px-4 py-1.5 border-b border-line-soft text-[11px] text-ink-400 flex items-center gap-1.5">
          <PencilLine className="w-3 h-3" />等级 / 分层 / 行业标签可直接编辑，修改后自动保存到台账
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white text-ink-400 z-10">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">达人名</th>
                {internal && <th className="px-3 py-2 font-medium">服务商</th>}
                <th className="px-2 py-2 font-medium w-[92px]">等级</th>
                <th className="px-2 py-2 font-medium w-[92px]">分层</th>
                <th className="px-2 py-2 font-medium w-[190px]">行业标签</th>
                <th className="px-2 py-2 font-medium">内容形式</th>
                <th className="px-4 py-2 font-medium text-right">得分</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {stats.details.map(d => {
                const key = detailKey(d);
                const levelBusy = busyRef.current.has(`${key}:level`);
                const tierBusy = busyRef.current.has(`${key}:tier`);
                const tagBusy = busyRef.current.has(`${key}:industryTags`);
                const legacyLevel = d.sLevel && !LEVEL_OPTIONS.includes(d.sLevel) ? d.sLevel : '';
                const tierVal = TIER_OPTIONS.includes(d.tier) ? d.tier : '';
                const legacyTier = d.tier && !TIER_OPTIONS.includes(d.tier) && d.tier !== '储备' ? d.tier : '';
                return (
                  <tr key={key} className="hover:bg-canvas/50">
                    <td className="px-4 py-2 font-medium text-ink-800 max-w-[160px] truncate">{d.name}</td>
                    {internal && (
                      <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[130px]">
                        <span className="inline-block truncate max-w-full align-bottom" title={d.agencies?.join('、') || d.agency || ''}>
                          {d.agencies && d.agencies.length > 1
                            ? `${d.agency || d.agencies[0]} 等${d.agencies.length}家`
                            : (d.agency || '—')}
                        </span>
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      <div className="relative inline-flex items-center">
                        <select className="appearance-none rounded-md border border-transparent hover:border-slate-300 hover:bg-white bg-transparent pl-1.5 pr-5 py-1 text-[12px] text-ink-700 outline-none focus:border-brand-400 focus:bg-white disabled:opacity-60 cursor-pointer"
                          value={legacyLevel || d.sLevel}
                          disabled={levelBusy}
                          onChange={e => { if (e.target.value !== (legacyLevel || d.sLevel)) void patchField(d, 'level', e.target.value); }}>
                          <option value="">未评级</option>
                          {LEVEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          {legacyLevel && <option value={legacyLevel}>{legacyLevel}（历史）</option>}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                        {levelBusy && <Loader2 className="w-3 h-3 animate-spin text-brand-500 absolute -right-4" />}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="relative inline-flex items-center">
                        <select className="appearance-none rounded-md border border-transparent hover:border-slate-300 hover:bg-white bg-transparent pl-1.5 pr-5 py-1 text-[12px] text-ink-700 outline-none focus:border-brand-400 focus:bg-white disabled:opacity-60 cursor-pointer"
                          value={legacyTier || tierVal}
                          disabled={tierBusy}
                          onChange={e => { const v = e.target.value; if (v !== (legacyTier || tierVal)) void patchField(d, 'tier', v); }}>
                          <option value="">储备</option>
                          {TIER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          {legacyTier && <option value={legacyTier} disabled>{legacyTier}（历史）</option>}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
                        {tierBusy && <Loader2 className="w-3 h-3 animate-spin text-brand-500 absolute -right-4" />}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <IndustryCell d={d} presets={presets} busy={tagBusy}
                        onPatch={next => void patchField(d, 'industryTags', next)} />
                    </td>
                    <td className="px-2 py-2 text-ink-500 max-w-[150px] truncate">{d.forms.join('/') || '—'}</td>
                    <td className="px-4 py-2 text-right font-bold text-brand-700">{d.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 行业标签多选编辑单元格：预设勾选 + 自定义新增 + 标签删除（portal 弹层避免被滚动容器裁剪）
function IndustryCell({ d, presets, busy, onPatch }: {
  d: MyInfluencerDetail; presets: string[]; busy: boolean;
  onPatch: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const tags = d.industry || [];

  const openPop = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 288, H = 380;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const top = r.bottom + 6 + H < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - H - 6);
    setPos({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (popRef.current?.contains(n) || btnRef.current?.contains(n)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = (t: string) => onPatch(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]);
  const remove = (t: string) => onPatch(tags.filter(x => x !== t));
  const addCustom = () => {
    const v = draft.trim().slice(0, 12);
    setDraft('');
    if (v && !tags.includes(v)) onPatch([...tags, v]);
  };

  return (
    <>
      <button ref={btnRef} type="button" disabled={busy}
        onClick={() => (open ? setOpen(false) : openPop())}
        title="点击编辑行业标签"
        className="w-full text-left inline-flex items-center gap-1 rounded-md border border-transparent hover:border-slate-300 hover:bg-white px-1.5 py-1 disabled:opacity-60">
        {tags.length === 0
          ? <span className="text-[11px] text-ink-300 inline-flex items-center gap-1"><PencilLine className="w-3 h-3" />添加</span>
          : (
            <span className="flex items-center gap-1 min-w-0">
              {tags.slice(0, 2).map(t => (
                <span key={t} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{t}</span>
              ))}
              {tags.length > 2 && <span className="text-[10px] text-ink-400 shrink-0">+{tags.length - 2}</span>}
            </span>
          )}
        {busy
          ? <Loader2 className="w-3 h-3 animate-spin text-brand-500 ml-auto shrink-0" />
          : <ChevronDown className="w-3 h-3 text-ink-300 ml-auto shrink-0" />}
      </button>
      {open && createPortal(
        <div ref={popRef} onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 288, zIndex: 80 }}
          className="rounded-xl border border-line-soft bg-white shadow-2xl p-3">
          <div className="text-[11px] font-semibold text-ink-700 mb-2">行业标签（多选，可自定义）</div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-[10px] pl-1.5 pr-1 py-0.5 rounded bg-sky-50 text-sky-700">
                  {t}
                  <button type="button" disabled={busy} onClick={() => remove(t)}
                    className="hover:text-red-600 disabled:opacity-50"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-ink-400 mb-1">预设标签</div>
          <div className="grid grid-cols-2 gap-1 max-h-[190px] overflow-y-auto pr-0.5">
            {presets.map(t => {
              const on = tags.includes(t);
              return (
                <button key={t} type="button" disabled={busy} onClick={() => toggle(t)}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] transition text-left ${
                    on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line-soft text-ink-500 hover:bg-canvas/70'
                  } disabled:opacity-60`}>
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                    on ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 bg-white'}`}>
                    {on && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="自定义标签，回车添加" maxLength={12}
              className="flex-1 min-w-0 rounded-md border border-line-soft bg-white px-2 py-1 text-[11px] outline-none focus:border-brand-400" />
            <button type="button" disabled={busy} onClick={addCustom}
              className="inline-flex items-center gap-0.5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 px-2 py-1 text-[11px] text-white shrink-0">
              <Plus className="w-3 h-3" />添加
            </button>
          </div>
        </div>, document.body)}
    </>
  );
}

// ⑤ 达人匹配记录
function MatchHistory({ internal }: { internal?: boolean }) {
  const [list, setList] = useState<MyMatchItem[] | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, string[] | 'loading'>>({});

  useEffect(() => {
    fetchMyMatchList().then(d => setList(d.list)).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const toggle = async (item: MyMatchItem) => {
    if (expanded[item.id]) {
      setExpanded(v => { const n = { ...v }; delete n[item.id]; return n; });
      return;
    }
    setExpanded(v => ({ ...v, [item.id]: 'loading' }));
    try {
      const d = (await fetchMyMatchDetail(item.id)).detail;
      setExpanded(v => ({ ...v, [item.id]: d.names }));
    } catch {
      setExpanded(v => { const n = { ...v }; delete n[item.id]; return n; });
    }
  };

  if (error) return <div className="text-center text-red-600 text-sm py-14">{error}</div>;
  if (!list) return <div className="flex justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;
  if (!list.length) return <Empty text="还没有达人匹配记录" />;

  return (
    <div className="space-y-2">
      {list.map(item => {
        const ex = expanded[item.id];
        const hitChips = [
          ['存量', item.hits.stock], ['增量', item.hits.incr],
          ['潜力', item.hits.potential], ['星图', item.hits.xingtu],
        ].filter(([, n]) => Number(n) > 0);
        return (
          <div key={item.id} className="rounded-xl border border-line-soft bg-white overflow-hidden">
            <button type="button" onClick={() => toggle(item)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas/60">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-ink-900 truncate">{item.product}</div>
                <div className="text-[11px] text-ink-400 mt-0.5">
                  {internal && item.agency && <span className="mr-2 inline-flex px-1.5 py-px rounded bg-slate-100 text-slate-600 font-semibold">{item.agency}</span>}
                  {fmtTime(item.time)}<OperatorTag operator={item.operator} phoneMask={item.phoneMask} />
                  {hitChips.map(([k, n]) => (
                    <span key={k} className="ml-2 text-ink-500">{k}库 <b>{n}</b></span>
                  ))}
                </div>
              </div>
              <span className="text-[12px] text-ink-500">共 <b className="text-brand-700 text-[14px]">{item.total}</b> 人</span>
              {ex ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
            </button>
            {ex && (
              <div className="px-4 pb-4 pt-2 border-t border-line-soft">
                {ex === 'loading'
                  ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /></div>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {ex.map((n, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-canvas text-[11px] text-ink-700">{n}</span>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-ink-400">
      <Inbox className="w-9 h-9" />
      <span className="text-xs">{text}</span>
    </div>
  );
}

// ⑥ 成员管理（主账号：审批/授权/拒绝；内部人员：选服务商后管理）
function MemberManage({ internal, fixedAgency }: { internal: boolean; fixedAgency?: string }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [agency, setAgency] = useState(fixedAgency || '');
  const [data, setData] = useState<{ pending: any[]; authorized: any[] } | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [rejecting, setRejecting] = useState<Record<string, string>>({}); // recordId -> 理由草稿
  const [showAuthorized, setShowAuthorized] = useState(false);

  useEffect(() => {
    if (internal) pmGetProviderList().then(ps => setProviders(ps.filter(p => !p.internal))).catch(() => setProviders([]));
  }, [internal]);

  const load = useCallback(async (a: string) => {
    if (!a) { setData(null); return; }
    setData(null); setError('');
    try { setData(await pmGetMembers(a)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { if (agency) void load(agency); }, [agency, load]);

  const approve = async (recordId: string) => {
    setBusyId(recordId); setError('');
    try { await pmApproveMember(recordId); await load(agency); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusyId('');
  };
  const reject = async (recordId: string) => {
    const reason = (rejecting[recordId] || '').trim();
    if (reason.length < 2) { setError('请先填写拒绝理由（≥2 字）'); return; }
    setBusyId(recordId); setError('');
    try { await pmRejectMember(recordId, reason); setRejecting(v => { const n = { ...v }; delete n[recordId]; return n; }); await load(agency); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusyId('');
  };

  if (internal) {
    return (
      <div className="space-y-3">
        <select value={agency} onChange={e => setAgency(e.target.value)}
          className="w-full rounded-xl border border-line-soft bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400">
          <option value="">请选择要管理的服务商（22 家）</option>
          {providers.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        {agency && <MemberList data={data} error={error} busyId={busyId} rejecting={rejecting}
          setRejecting={setRejecting} onApprove={approve} onReject={reject}
          showAuthorized={showAuthorized} setShowAuthorized={setShowAuthorized} />}
      </div>
    );
  }
  return <MemberList data={data} error={error} busyId={busyId} rejecting={rejecting}
    setRejecting={setRejecting} onApprove={approve} onReject={reject}
    showAuthorized={showAuthorized} setShowAuthorized={setShowAuthorized} />;
}

function MemberList(props: {
  data: { pending: any[]; authorized: any[] } | null; error: string; busyId: string;
  rejecting: Record<string, string>; setRejecting: (v: Record<string, string>) => void;
  onApprove: (id: string) => void; onReject: (id: string) => void;
  showAuthorized: boolean; setShowAuthorized: (v: boolean) => void;
}) {
  const { data, error, busyId, rejecting, setRejecting, onApprove, onReject, showAuthorized, setShowAuthorized } = props;
  if (error) return <div className="text-center text-red-600 text-sm py-14">{error}</div>;
  if (!data) return <div className="flex justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white flex items-center gap-3">
        <ShieldCheck className="w-5 h-5" />
        <span className="text-[13px]">待审批成员申请</span>
        <span className="ml-auto text-2xl font-bold">{data.pending.length}</span>
      </div>

      {data.pending.length === 0
        ? <div className="rounded-xl border border-line-soft bg-white py-8 text-center text-xs text-ink-400">暂无待审批成员</div>
        : data.pending.map(m => (
          <div key={m.recordId} className="rounded-xl border border-line-soft bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-bold text-ink-900">
                {m.note || '（未留备注）'}
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                {m.kind === '主账号注册' ? '主账号注册' : '成员申请'}
              </span>
              <span className="ml-auto text-[11px] text-ink-400">{fmtTime(m.time)}</span>
            </div>
            <div className="mt-1 text-[11px] text-ink-500">手机号 ****{m.tail4 || '—'}</div>
            <input value={rejecting[m.recordId] || ''}
              onChange={e => setRejecting({ ...rejecting, [m.recordId]: e.target.value.slice(0, 120) })}
              placeholder="如拒绝，请填写理由（申请人下次登录可见）"
              className="mt-2.5 w-full rounded-lg border border-line-soft bg-canvas/60 px-3 py-2 text-[12px] outline-none focus:border-brand-400 focus:bg-white" />
            <div className="mt-2.5 flex gap-2">
              <button type="button" disabled={busyId === m.recordId}
                onClick={() => onApprove(m.recordId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-white transition">
                {busyId === m.recordId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                授权
              </button>
              <button type="button" disabled={busyId === m.recordId}
                onClick={() => onReject(m.recordId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-line-soft hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-ink-700 transition">
                <XCircle className="w-3.5 h-3.5" />拒绝
              </button>
            </div>
          </div>
        ))}

      <button type="button" onClick={() => setShowAuthorized(!showAuthorized)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-line-soft px-4 py-2.5 text-xs text-ink-600 hover:bg-canvas/60">
        已授权成员（{data.authorized.length}）
        {showAuthorized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {showAuthorized && (
        data.authorized.length === 0
          ? <div className="text-center text-[11px] text-ink-400 py-4">暂无已授权成员</div>
          : <div className="rounded-xl border border-line-soft bg-white divide-y divide-line-soft">
            {data.authorized.map(m => (
              <div key={m.recordId} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-medium text-ink-800">{m.note || '—'}</span>
                <span className="text-ink-400">****{m.tail4 || '—'}</span>
                <span className="ml-auto text-[11px] text-ink-400">{fmtTime(m.decideTime)}</span>
              </div>
            ))}
          </div>
      )}
    </div>
  );
}

export default function MyWorkbench({ onBack, initialTab }: { onBack: () => void; initialTab?: Tab }) {
  const gh = isGhPages();
  const auth = gh ? getGhAuth() : null;
  const isInternal = !gh;                       // 对内工作台：全服务商全量，不走 gh 登录
  // 成员管理仅对外版主账号可见（对内工作台只展示六个业务 Tab）
  const canManage = !isInternal && auth?.role === 'master';
  const [tab, setTab] = useState<Tab>(initialTab && initialTab !== 'members' ? initialTab : 'products');
  const [summary, setSummary] = useState<MySummary | null>(null);
  const reloadSummary = useCallback(() => {
    fetchMySummary().then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(() => { reloadSummary(); /* 每次进入工作台刷新汇总 */ }, [reloadSummary]);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Package }> = canManage
    ? [...TABS, { key: 'members' as Tab, label: '成员管理', icon: ShieldCheck }]
    : TABS;

  const roleBadge = isInternal
    ? <span className="ml-1 px-1.5 py-px rounded bg-red-500/80 text-[10px] font-bold text-white">内部全量</span>
    : auth?.role === 'master'
      ? <span className="ml-1 px-1.5 py-px rounded bg-amber-400/90 text-[10px] font-bold text-white">主账号</span>
      : <span className="ml-1 px-1.5 py-px rounded bg-white/20 text-[10px] font-bold text-white">成员</span>;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white/10 border border-white/10 text-xs font-medium text-white hover:bg-white/20 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 切换模式
          </button>
          <div className="w-9 h-9 rounded-[10px] bg-white/10 flex items-center justify-center shrink-0">
            <UserIcon className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-white">{isInternal ? '🏢 全服务商工作台' : '🏢 服务商工作台'} {roleBadge}</h1>
            <p className="text-[11px] text-white/50 truncate">
              {summary ? `${summary.identity.agency} · ${summary.identity.name}`
                : isInternal ? '全服务商记录中心（所有服务商全量数据，不按登录过滤）' : '服务商记录中心（本服务商全员记录汇总）'}
            </p>
          </div>
        </div>
      </header>

      {/* 子 Tab 栏 */}
      <div className="bg-white border-b border-line-soft sticky top-[60px] z-10">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`shrink-0 inline-flex items-center px-3 py-2.5 text-xs font-medium border-b-2 transition ${
                  tab === t.key
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
                <Icon className="w-3.5 h-3.5 mr-1" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        {tab === 'products' && <ProductHistory internal={isInternal} />}
        {tab === 'baopin' && <BaopinLibrary />}
        {tab === 'delivery' && <DeliveryWorkbench />}
        {tab === 'scripts' && <ScriptHistory internal={isInternal} />}
        {tab === 'influencers' && <InfluencerStatsPanel internal={isInternal} />}
        {tab === 'matches' && <MatchHistory internal={isInternal} />}
        {tab === 'members' && <MemberManage internal={isInternal} fixedAgency={isInternal ? undefined : auth?.agency} />}
      </main>
    </div>
  );
}
