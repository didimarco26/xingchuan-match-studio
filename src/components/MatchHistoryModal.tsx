import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, History, Loader2, Search, Trash2, ChevronLeft, Inbox, Users,
  ExternalLink, Target, Tag, Settings2, ListOrdered, RefreshCw,
} from 'lucide-react';
import {
  listInfluencerHistory, deleteInfluencerHistory, currentProviderName,
  type InfluencerHistoryRecord,
} from '../lib/local-history-db';
import {
  formatFollowers, type InfluencerCandidate,
  PNEW_FANS_BUCKET_OPTIONS,
} from '../lib/influencer-match';

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const POOL_META = [
  { key: 'stock' as const, label: '存量星川达人', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'incr' as const, label: '增量 · 优质星川达人', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'pnew' as const, label: '潜力星川达人', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'pot' as const, label: '星图达人推荐', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
];

function chips(list: string[]): string {
  return list.filter(Boolean).join('、') || '不限';
}

// 单个达人完整信息（全字段，不截断）
function CandidateFull({ c, rank }: { c: InfluencerCandidate; rank: number }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3.5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-bold grid place-items-center mt-0.5">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-bold text-gray-900 break-words">{c.name}</p>
            {c.level && (
              <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-brand-600 text-white">{c.level}</span>
            )}
            {c.tier && (
              <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded border bg-gray-50 text-gray-700">{c.tier}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5 break-all">
            ID：{c.douyinId || '—'} · 粉丝：{formatFollowers(c.followers)}
          </p>
        </div>
        {typeof c.aiScore === 'number' && (
          <div className="shrink-0 text-right">
            <p className="text-base font-extrabold text-brand-700 tabnum leading-none">{c.aiScore}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">匹配分</p>
          </div>
        )}
      </div>

      {c.reason && (
        <p className="mt-2.5 text-[11.5px] text-gray-600 bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
          {c.reason}
        </p>
      )}

      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {c.tags.length > 0 && <p className="text-gray-500 break-words"><span className="text-gray-400">行业标签：</span>{chips(c.tags)}</p>}
        {c.persona.length > 0 && <p className="text-gray-500 break-words"><span className="text-gray-400">人设：</span>{chips(c.persona)}</p>}
        {c.forms.length > 0 && <p className="text-gray-500 break-words"><span className="text-gray-400">内容形式：</span>{chips(c.forms)}</p>}
        {c.category && <p className="text-gray-500 break-words"><span className="text-gray-400">带货类目：</span>{c.category}</p>}
        {c.highlight && <p className="text-gray-500 break-words"><span className="text-gray-400">爆款方向：</span>{c.highlight}</p>}
        {c.coop && <p className="text-gray-500 break-words"><span className="text-gray-400">合作状态：</span>{c.coop}</p>}
        {c.wechat && <p className="text-gray-500 break-words"><span className="text-gray-400">企微状态：</span>{c.wechat}</p>}
        {c.agent && <p className="text-gray-500 break-words"><span className="text-gray-400">所属服务商：</span>{c.agent}</p>}
        {c.seed && <p className="text-gray-500 break-words"><span className="text-gray-400">种草价值：</span>{c.seed}</p>}
        {c.spread && <p className="text-gray-500 break-words"><span className="text-gray-400">传播价值：</span>{c.spread}</p>}
        {c.conf && <p className="text-gray-500 break-words"><span className="text-gray-400">打标置信度：</span>{c.conf}</p>}
        {/* 星图推荐池特有 */}
        {c.fansTier && <p className="text-gray-500 break-words"><span className="text-gray-400">粉丝量级：</span>{c.fansTier}</p>}
        {c.identity && <p className="text-gray-500 break-words"><span className="text-gray-400">达人身份：</span>{c.identity}</p>}
        {typeof c.price20 === 'number' && <p className="text-gray-500 break-words"><span className="text-gray-400">1-20s 刊例：</span>{c.price20} 元</p>}
        {typeof c.cpm20 === 'number' && <p className="text-gray-500 break-words"><span className="text-gray-400">预期 CPM：</span>{c.cpm20} 元</p>}
        {typeof c.femalePct === 'number' && <p className="text-gray-500 break-words"><span className="text-gray-400">女粉占比：</span>{c.femalePct}%</p>}
        {/* 潜力星川池特有 */}
        {c.industryOp && <p className="text-gray-500 break-words"><span className="text-gray-400">行业(运营)：</span>{c.industryOp}</p>}
        {c.xcLevel && <p className="text-gray-500 break-words"><span className="text-gray-400">星川等级：</span>{c.xcLevel}</p>}
        {typeof c.projects === 'number' && <p className="text-gray-500 break-words"><span className="text-gray-400">交付项目数：</span>{c.projects}</p>}
        {typeof c.xcSpend === 'number' && <p className="text-gray-500 break-words"><span className="text-gray-400">星图消耗：</span>{c.xcSpend} 元</p>}
        {c.ecomLevel && <p className="text-gray-500 break-words"><span className="text-gray-400">电商等级：</span>{c.ecomLevel}</p>}
      </div>

      <div className="mt-2.5 flex items-center gap-3 flex-wrap">
        {c.homepage && (
          <a href={c.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline break-all">
            <ExternalLink className="w-3 h-3 shrink-0" /> 抖音主页
          </a>
        )}
        {c.video && (
          <a href={c.video} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline break-all">
            <ExternalLink className="w-3 h-3 shrink-0" /> 代表视频
          </a>
        )}
        {c.xingtuUrl && (
          <a href={c.xingtuUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline break-all">
            <ExternalLink className="w-3 h-3 shrink-0" /> 星图商单
          </a>
        )}
      </div>
    </div>
  );
}

// 历史详情（完整匹配参数 + 四库全量名单，不截断）
function HistoryDetail({ rec, onBack }: { rec: InfluencerHistoryRecord; onBack: () => void }) {
  const { conditions: c, pools, counts } = rec;
  const fansLabel = (keys: string[]) => keys
    .map((k) => PNEW_FANS_BUCKET_OPTIONS.find((o) => o.key === k)?.label || k).join('、');

  return (
    <div className="space-y-4">
      <button onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
        <ChevronLeft className="w-3.5 h-3.5" /> 返回历史列表
      </button>

      {/* 基本信息 */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-900 break-words">{rec.productName}</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 text-[11.5px]">
          <p className="text-gray-500">服务商：<span className="text-gray-700 font-medium break-all">{rec.providerName}</span></p>
          <p className="text-gray-500">匹配时间：<span className="text-gray-700 font-medium">{fmtTime(rec.createdAt)}</span></p>
          <p className="text-gray-500">匹配轮次：<span className="text-gray-700 font-medium">{rec.matchRound}</span></p>
          <p className="text-gray-500">匹配总数：<span className="text-brand-700 font-bold">{counts.total}</span></p>
        </div>
      </div>

      {/* 匹配条件 */}
      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-3">
          <Settings2 className="w-3.5 h-3.5 text-brand-600" /> 匹配条件（输入参数）
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
          {c.industry && <p className="text-gray-500 break-words"><span className="text-gray-400">行业：</span>{c.industry}</p>}
          {c.category && <p className="text-gray-500 break-words"><span className="text-gray-400">类目：</span>{c.category}</p>}
          <p className="text-gray-500 break-words"><span className="text-gray-400">存量数量：</span>{c.stockCount}</p>
          <p className="text-gray-500 break-words"><span className="text-gray-400">增量数量：</span>{c.incrCount}</p>
          <p className="text-gray-500 break-words"><span className="text-gray-400">潜力数量：</span>{c.pnewCount}</p>
          <p className="text-gray-500 break-words"><span className="text-gray-400">星图数量：</span>{c.potCount}</p>
          {c.tags.length > 0 && (
            <p className="col-span-2 text-gray-500 break-words"><span className="text-gray-400">内容偏好标签：</span>{chips(c.tags)}</p>
          )}
        </div>

        {/* 潜力星川 · 四维硬筛选 */}
        <div className="mt-3 rounded-lg bg-violet-50/60 border border-violet-100 p-3 text-[11.5px] space-y-1">
          <p className="font-bold text-violet-700 flex items-center gap-1"><Target className="w-3 h-3" /> 潜力星川筛选（CPM/GMV 门槛）</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">行业运营：</span>{chips(c.pnewFilters.industries)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">粉丝量级：</span>{fansLabel(c.pnewFilters.fansBuckets) || '不限'}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">人设：</span>{chips(c.pnewFilters.personas)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">内容形式：</span>{chips(c.pnewFilters.forms)}</p>
        </div>

        {/* 星图推荐 · 六维筛选 */}
        <div className="mt-2.5 rounded-lg bg-amber-50/60 border border-amber-100 p-3 text-[11.5px] space-y-1">
          <p className="font-bold text-amber-700 flex items-center gap-1"><Tag className="w-3 h-3" /> 星图推荐筛选</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">万粉标签：</span>{chips(c.potFilters.industries)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">粉丝量级：</span>{chips(c.potFilters.tiers)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">人设：</span>{chips(c.potFilters.personas)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">身份：</span>{chips(c.potFilters.identities)}</p>
          <p className="text-gray-600 break-words"><span className="text-gray-400">内容维度：</span>{chips(c.potFilters.dims)}</p>
          <p className="text-gray-600"><span className="text-gray-400">性别倾向：</span>{c.potFilters.femaleDir || '不限'}</p>
        </div>
      </div>

      {/* 调整说明 */}
      {rec.adjustNote && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1.5">
            <ListOrdered className="w-3.5 h-3.5 text-brand-600" /> 调整说明
          </p>
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{rec.adjustNote}</p>
        </div>
      )}

      {/* 四库完整名单 */}
      {POOL_META.map((m) => {
        const list = pools[m.key];
        if (!list || list.length === 0) return null;
        return (
          <div key={m.key}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${m.cls}`}>{m.label}</span>
              <span className="text-[11px] text-gray-400">{list.length} 人</span>
              <span className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="space-y-2">
              {list.map((cand, i) => <CandidateFull key={`${cand.cid}-${i}`} c={cand} rank={i + 1} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 达人匹配历史弹窗
// ============================================================
export default function MatchHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const providerName = currentProviderName();
  const [records, setRecords] = useState<InfluencerHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<InfluencerHistoryRecord | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listInfluencerHistory(providerName)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [providerName]);

  useEffect(() => {
    if (open) { setDetail(null); setKeyword(''); load(); }
  }, [open, load]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return kw ? records.filter((r) => r.productName.toLowerCase().includes(kw)) : records;
  }, [records, keyword]);

  const handleDelete = async (rec: InfluencerHistoryRecord) => {
    if (rec.id == null) return;
    await deleteInfluencerHistory(rec.id);
    load();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="w-full max-w-[760px] max-h-[86vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-200 shrink-0">
                <Users className="w-[18px] h-[18px] text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-gray-900">达人库历史记录</h3>
                <p className="text-[11px] text-gray-400 truncate">服务商：{providerName} · 共 {records.length} 条 · 仅存储在本机浏览器</p>
              </div>
              <button onClick={onClose}
                className="shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 grid place-items-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!detail && (
              <div className="px-5 py-3 border-b border-gray-50 shrink-0 flex items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={keyword} onChange={(e) => setKeyword(e.target.value)}
                    placeholder="按商品名称搜索…"
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {loading && (
                <div className="py-16 flex flex-col items-center gap-2.5 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                  <p className="text-xs">正在读取本地历史…</p>
                </div>
              )}

              {!loading && !detail && records.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
                  <Inbox className="w-9 h-9" />
                  <p className="text-sm font-semibold text-gray-500">暂无达人匹配历史</p>
                  <p className="text-[11px]">达人匹配完成后，点「💾 储存到达人匹配记录」即可在此查看</p>
                </div>
              )}

              {!loading && !detail && filtered.length === 0 && records.length > 0 && (
                <p className="py-12 text-center text-xs text-gray-400">没有匹配「{keyword}」的记录</p>
              )}

              {!loading && detail ? (
                <HistoryDetail rec={detail} onBack={() => setDetail(null)} />
              ) : (
                !loading && (
                  <div className="space-y-2">
                    {filtered.map((rec) => (
                      <div key={rec.id}
                        className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-gray-200 hover:border-brand-200 hover:bg-brand-50/50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 grid place-items-center shrink-0">
                          <Users className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{rec.productName}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {fmtTime(rec.createdAt)} · 匹配 <span className="font-semibold text-emerald-700">{rec.counts.total}</span> 位达人
                          </p>
                        </div>
                        <button onClick={() => setDetail(rec)}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-[11px] font-bold hover:bg-brand-700 transition-colors">
                          查看
                        </button>
                        <button onClick={() => void handleDelete(rec)} title="删除"
                          className="shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 grid place-items-center transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
