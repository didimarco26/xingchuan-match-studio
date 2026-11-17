import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, History, Loader2, Search, Trash2, ChevronLeft, Inbox,
  FileText, Clapperboard, Lightbulb, ShieldAlert, ExternalLink, Film, Flame,
} from 'lucide-react';
import {
  listContentHistory, deleteContentHistory, currentProviderName,
  type ContentHistoryRecord, type ContentDirectionSnapshot,
} from '../lib/local-history-db';
import type { CreativeDirection } from '../lib/api';

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const SEG_LABEL: Record<string, string> = {
  pain: '痛点分析', sell: '卖点分析', release: '放大功效', close: '加速转化',
};
const SEG_CLS: Record<string, string> = {
  pain: 'bg-red-50 text-red-700 border-red-200',
  sell: 'bg-blue-50 text-blue-700 border-blue-200',
  release: 'bg-violet-50 text-violet-700 border-violet-200',
  close: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// 单个方向的完整四段脚本（全量不截断）
function DirectionFull({ snap }: { snap: ContentDirectionSnapshot }) {
  const d: CreativeDirection = snap.current;
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-600 text-white">
          方向{snap.index + 1} · {snap.angle}
        </span>
        <p className="text-[13px] font-bold text-gray-800">{d.title}</p>
        {snap.version > 0 && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            已优化 v{snap.version}
          </span>
        )}
      </div>
      <div className="p-3.5 space-y-3">
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-bold text-gray-700">方向逻辑：</span>{d.concept}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(['pain', 'sell', 'release', 'close'] as const).map((seg) => {
            const x = d.script[seg];
            return (
              <div key={seg} className="rounded-xl border border-gray-100 p-3">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${SEG_CLS[seg]}`}>
                  {SEG_LABEL[seg]}
                </span>
                <p className="text-[11px] text-gray-400 mt-2.5 mb-1">核心画面</p>
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{x.visual}</p>
                <p className="text-[11px] text-gray-400 mt-2 mb-1">口播原话</p>
                <p className="text-xs text-gray-800 leading-relaxed font-medium border-l-2 border-brand-300 pl-2.5 italic whitespace-pre-wrap break-words">
                  “{x.voiceover}”
                </p>
                {x.refCaseTitle && (
                  <p className="text-[10px] text-gray-400 mt-2 break-words">参考案例：{x.refCaseTitle}</p>
                )}
              </div>
            );
          })}
        </div>
        {d.hooks.length > 0 && (
          <div>
            <p className="text-[11px] text-gray-400 mb-1.5">备选开场钩子</p>
            <div className="flex flex-wrap gap-1.5">
              {d.hooks.map((h, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 break-all">{h}</span>
              ))}
            </div>
          </div>
        )}
        {d.shootingTip && (
          <p className="text-[11px] text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
            <span className="font-bold text-amber-700">拍摄建议：</span>{d.shootingTip}
          </p>
        )}

        {/* 优化迭代记录（每轮新版本，全量展示） */}
        {snap.iterations.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2.5">
            <p className="text-[11px] font-bold text-gray-600 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> 优化迭代记录（共 {snap.iterations.length} 轮）
            </p>
            {snap.iterations.map((it) => (
              <div key={it.round} className="rounded-lg bg-white border border-gray-100 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-brand-600 text-white">v{it.round}</span>
                  <span className="text-[11px] font-semibold text-gray-700">{it.iterType}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{fmtTime(it.at)}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 mb-1">本轮优化需求：</p>
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{it.note}</p>
                {it.logId && (
                  <p className="text-[10px] text-gray-400 mt-1.5 break-all">台账记录ID：{it.logId}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 历史详情（全量字段，不截断）
function HistoryDetail({ rec, onBack }: { rec: ContentHistoryRecord; onBack: () => void }) {
  const casePool = [...(rec.matchedCases || []), ...(rec.moreCases || [])];
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
          <p className="text-gray-500">分析时间：<span className="text-gray-700 font-medium">{fmtTime(rec.createdAt)}</span></p>
          {rec.brand && <p className="text-gray-500">品牌：<span className="text-gray-700 font-medium break-all">{rec.brand}</span></p>}
          {rec.industry && <p className="text-gray-500">行业：<span className="text-gray-700 font-medium break-all">{rec.industry}</span></p>}
          {rec.category && <p className="col-span-2 text-gray-500">品类：<span className="text-gray-700 font-medium break-all">{rec.category}</span></p>}
        </div>
        {rec.url && (
          <a href={rec.url} target="_blank" rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline break-all">
            <ExternalLink className="w-3 h-3 shrink-0" /> {rec.url}
          </a>
        )}
      </div>

      {/* AI 概念视频 */}
      {rec.conceptVideoUrl && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1.5">
            <Film className="w-3.5 h-3.5 text-brand-600" /> AI 概念视频
          </p>
          <a href={rec.conceptVideoUrl} target="_blank" rel="noreferrer"
            className="text-[12px] text-brand-700 hover:underline break-all inline-flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0" /> {rec.conceptVideoUrl}
          </a>
        </div>
      )}

      {/* 参考爆款素材（样式/视频/结构） */}
      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-3">
          <FileText className="w-3.5 h-3.5 text-brand-600" /> 参考爆款素材（样式 / 视频 / 结构）
          <span className="text-[11px] font-normal text-gray-400">{casePool.length} 条</span>
        </p>
        {casePool.length === 0 ? (
          <p className="text-[11px] text-gray-400">无参考素材</p>
        ) : (
          <div className="space-y-2.5">
            {rec.matchedCases?.map((c, i) => (
              <div key={`m${i}`} className="rounded-lg border border-gray-100 p-3 flex items-start gap-2.5">
                <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-md bg-brand-600 text-white leading-none mt-0.5">
                  #{c.caseIndex}
                </span>
                <p className="text-[11.5px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="text-gray-400">匹配理由：</span>{c.reason || '—'}
                </p>
              </div>
            ))}
            {rec.moreCases?.map((c, i) => (
              <div key={`x${i}`} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-gray-800 break-words">{c.title || '—'}</p>
                  {c.videoLink && (
                    <a href={c.videoLink} target="_blank" rel="noreferrer" className="shrink-0 text-brand-600 mt-0.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-brand-600 mt-1 break-all">{c.brand || '未知品牌'}</p>
                {c.hookDesign && (
                  <p className="text-[11px] text-gray-500 mt-1.5 whitespace-pre-wrap break-words">钩子：{c.hookDesign}</p>
                )}
                {c.structure && (
                  <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap break-words">结构：{c.structure}</p>
                )}
                {c.aiReason && <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap break-words">{c.aiReason}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 参考爆款钩子 */}
      {rec.refHooks && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-2">
            <Flame className="w-3.5 h-3.5 text-orange-500" /> 参考爆款钩子
          </p>
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{rec.refHooks}</p>
        </div>
      )}

      {/* 参考营销热点 */}
      {rec.hotMarketingRef && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <p className="text-xs font-bold text-orange-700 flex items-center gap-1.5 mb-2">
            <Flame className="w-3.5 h-3.5" /> 参考营销热点
          </p>
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{rec.hotMarketingRef}</p>
        </div>
      )}

      {/* 拆解千川爆款素材 */}
      {rec.qianchuanBreakdown && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-2">
            <Clapperboard className="w-3.5 h-3.5 text-brand-600" /> 拆解千川爆款素材
          </p>
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{rec.qianchuanBreakdown}</p>
        </div>
      )}

      {/* 生成的完整脚本 */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <Clapperboard className="w-3.5 h-3.5 text-brand-600" /> 生成的完整脚本（{rec.directions.length} 个方向）
        </p>
        {rec.directions.map((s) => <DirectionFull key={s.index} snap={s} />)}
      </div>
    </div>
  );
}

// ============================================================
// 内容脚本历史弹窗
// ============================================================
export default function ContentHistoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const providerName = currentProviderName();
  const [records, setRecords] = useState<ContentHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<ContentHistoryRecord | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listContentHistory(providerName)
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

  const handleDelete = async (rec: ContentHistoryRecord) => {
    if (rec.id == null) return;
    await deleteContentHistory(rec.id);
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
            className="w-full max-w-[720px] max-h-[86vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-200 shrink-0">
                <History className="w-[18px] h-[18px] text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-gray-900">内容库历史记录</h3>
                <p className="text-[11px] text-gray-400 truncate">服务商：{providerName} · 共 {records.length} 条 · 仅存储在本机浏览器</p>
              </div>
              <button onClick={onClose}
                className="shrink-0 w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 grid place-items-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!detail && (
              <div className="px-5 py-3 border-b border-gray-50 shrink-0">
                <div className="relative">
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
                  <p className="text-sm font-semibold text-gray-500">暂无内容历史</p>
                  <p className="text-[11px]">内容分析完成后，点「存至内容库 / 储存到内容库」即可在此查看</p>
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
                        <div className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center shrink-0">
                          <FileText className="w-4 h-4 text-brand-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{rec.productName}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{fmtTime(rec.createdAt)}</p>
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
