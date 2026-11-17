import { useEffect, useState } from 'react';
import { X, History, Loader2, ChevronLeft, Gauge, Clapperboard, Users, Flame, FileText, Sparkles } from 'lucide-react';
import { ghGetHistory, getGhAuth, formatGhTime, isGhPages, type GhHistoryItem } from '../lib/gh';
import { getUserName, getLocalHistory, displayIdentity } from '../lib/user';

const FEATURE_STYLE: Record<string, { cls: string; icon: typeof Gauge }> = {
  '商品分析': { cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: Gauge },
  '商品打分': { cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: Gauge },
  '内容脚本': { cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clapperboard },
  '达人匹配': { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Users },
  '热点营销': { cls: 'bg-orange-50 text-orange-700 border-orange-200', icon: Flame },
  '一页纸报告': { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: FileText },
  '素材拆解': { cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: Sparkles },
};

function featureStyle(f: string) {
  return FEATURE_STYLE[f] || { cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: Sparkles };
}
// 早期记录类别名为「商品打分」，统一展示为「商品分析」
const featureLabel = (f: string) => (f === '商品打分' ? '商品分析' : f);

export default function GhHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<GhHistoryItem[] | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<GhHistoryItem | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setItems(null);
    setError('');

    // 统一身份：优先本地登录名，对外版回退主账号登录名
    const userName = getUserName();
    setName(userName);
    if (!userName) {
      setItems([]);
      setError('尚未填写使用者名字，请先点「登录」填写名字后再查看历史记录。');
      return;
    }

    let cancelled = false;
    (async () => {
      // 1) 本地历史（对内对外都有，按当前名字归档）
      let merged: GhHistoryItem[] = getLocalHistory(userName);
      // 2) 对外版额外合并服务端 FaaS 历史（跨设备），按 id 去重
      if (isGhPages()) {
        const auth = getGhAuth();
        if (auth) {
          try {
            const remote = await ghGetHistory(auth.token);
            if (!cancelled && remote?.length) {
              const seen = new Set(merged.map((it) => it.id));
              // 服务端历史已按申请账号(rid)过滤，直接全部合并
              for (const it of remote) {
                if (!seen.has(it.id)) { merged.push(it); seen.add(it.id); }
              }
            }
          } catch {
            /* 服务端历史失败不影响本地记录查看 */
          }
        }
      }
      if (cancelled) return;
      merged.sort((a, b) => b.time - a.time);
      setItems(merged);
    })();

    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">我的使用记录</h2>
              <p className="text-[11px] text-slate-400">{name ? `使用者：${displayIdentity(name)} · ` : ''}按时间倒序，点击单条查看详情</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="py-16 text-center text-sm text-red-500">{error}</div>
          ) : items === null ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              <span className="text-sm">正在加载历史记录…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              暂无使用记录。<br />完成一次商品分析 / 脚本生成 / 达人匹配后，记录会出现在这里。
            </div>
          ) : detail ? (
            <div>
              <button
                onClick={() => setDetail(null)}
                className="mb-3 inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 返回列表
              </button>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {(() => {
                    const st = featureStyle(detail.feature);
                    const Icon = st.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${st.cls}`}>
                        <Icon className="w-3.5 h-3.5" /> {featureLabel(detail.feature)}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-slate-400">{formatGhTime(detail.time)}</span>
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400 mb-0.5">商品名称</dt>
                    <dd className="text-slate-800 font-medium">{detail.product || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400 mb-0.5">输出摘要</dt>
                    <dd className="text-slate-700 bg-teal-50/60 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed">{detail.outputSummary || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400 mb-0.5">关键输入摘要</dt>
                    <dd className="text-slate-600 bg-slate-50 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed text-[13px]">{detail.inputSummary || '—'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => {
                const st = featureStyle(it.feature);
                const Icon = st.icon;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => setDetail(it)}
                      className="w-full text-left px-2 py-3 rounded-lg hover:bg-slate-50 transition flex items-start gap-3"
                    >
                      <span className={`mt-0.5 shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${st.cls}`}>
                        <Icon className="w-3.5 h-3.5" /> {featureLabel(it.feature)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800 truncate">{it.product || '（未填商品名）'}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{formatGhTime(it.time)}</span>
                        </div>
                        <p className="text-[13px] text-slate-500 truncate mt-0.5">{it.outputSummary || '—'}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
