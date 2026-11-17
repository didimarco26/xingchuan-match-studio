import { useEffect, useState, useCallback } from 'react';
import { FileText, Loader2, ChevronDown, ChevronUp, Trash2, Save, Clapperboard, Image as ImageIcon } from 'lucide-react';
import {
  listContentHistory, deleteContentHistory, currentProviderName,
  type ContentHistoryRecord,
} from '../lib/local-history-db';
import { CONCEPT_SEG_LABEL } from '../lib/concept-video';

// ============================================================
// 本机内容库（IndexedDB content-history）：对外版「我的工作台 → 内容脚本」
// 展开查看：商品信息 / Brief 拆解 / 参考爆款摘要 / 钩子 / 各方向四段全文 + AI 镜头
// ============================================================
function fmt(ts: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const SEG_ORDER: Array<keyof NonNullable<NonNullable<ContentHistoryRecord['directions']>[number]['current']['script']>> =
  ['pain', 'sell', 'release', 'close'];

export default function LocalContentLibrary() {
  const [list, setList] = useState<ContentHistoryRecord[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await listContentHistory(currentProviderName());
      setList(rows.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id?: number) => {
    if (id == null) return;
    if (!confirm('确定删除这条本机内容记录？删除后不可恢复')) return;
    await deleteContentHistory(id);
    if (openId === id) setOpenId(null);
    void load();
  };

  return (
    <div className="mb-5">
      <p className="text-[12px] font-bold text-ink-700 mb-2 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5 text-brand-600" /> 本机内容库（{list ? list.length : '…'}）
        <span className="text-[11px] font-normal text-ink-400">仅存储在当前浏览器，点击展开查看 Brief / 脚本全文 / AI 镜头</span>
      </p>
      {error && <p className="text-xs text-red-600 py-3">{error}</p>}
      {!list && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>}
      {list && list.length === 0 && (
        <p className="text-[12px] text-ink-400 rounded-xl border border-dashed border-line-soft px-4 py-6 text-center">
          本机还没有保存内容。在「内容创意」生成脚本后点击「存至内容库」即可在此查看。
        </p>
      )}
      <div className="space-y-2.5">
        {list?.map(rec => {
          const id = rec.id ?? -1;
          const open = openId === id;
          const mediaCount = rec.directions.reduce((n, d) => n + Object.keys(d.segMedia || {}).length, 0);
          return (
            <div key={id} className="rounded-xl border border-line-soft bg-white overflow-hidden">
              <button
                type="button" onClick={() => setOpenId(open ? null : id)}
                className="w-full px-4 py-3 flex items-center gap-2.5 text-left hover:bg-canvas/50"
              >
                <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="text-[13px] font-bold text-ink-900 truncate">{rec.productName || '未命名商品'}</span>
                {rec.brand && <span className="text-[11px] text-ink-400 shrink-0">{rec.brand}</span>}
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                  {rec.directions.length} 个脚本方向
                </span>
                {rec.briefs?.length ? (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 shrink-0">
                    {rec.briefs.length} 个 Brief
                  </span>
                ) : null}
                {mediaCount > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 shrink-0">
                    🎬 {mediaCount} 个 AI 镜头
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ink-400 shrink-0">{fmt(rec.createdAt)}</span>
                {open ? <ChevronUp className="w-4 h-4 text-ink-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" />}
              </button>

              {open && (
                <div className="px-4 pb-4 pt-1 border-t border-line-soft/70 space-y-4 text-[12px]">
                  {/* 商品信息 */}
                  <div>
                    <p className="font-bold text-ink-800 mb-1">商品信息</p>
                    <div className="text-ink-600 leading-relaxed">
                      {[rec.brand && `品牌：${rec.brand}`, rec.industry && `行业：${rec.industry}`, (rec.category) && `类目：${rec.category}`].filter(Boolean).join('　｜　') || '—'}
                      {rec.url && <span>　｜　<a className="text-brand-600 underline break-all" href={rec.url} target="_blank" rel="noreferrer">商品链接</a></span>}
                    </div>
                  </div>

                  {/* Brief 拆解 */}
                  {rec.briefs?.length ? (
                    <div>
                      <p className="font-bold text-ink-800 mb-1">📋 Brief 拆解方向</p>
                      <ol className="list-decimal pl-5 space-y-1">
                        {rec.briefs.map((b, i) => (
                          <li key={i} className="text-ink-600">
                            <b>{b.name}</b>
                            <span className="text-ink-400">｜{b.coreSellingPoint}｜人群：{b.targetAudience}｜验证：{b.validationGoal}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {/* 参考爆款素材摘要 */}
                  {(rec.matchedCases.length || rec.moreCases.length) ? (
                    <div>
                      <p className="font-bold text-ink-800 mb-1">📦 参考爆款素材摘要</p>
                      <ul className="list-disc pl-5 space-y-0.5 text-ink-600">
                        {rec.matchedCases.map((c, i) => <li key={i}>案例 {c.caseIndex}：{c.reason}</li>)}
                        {rec.moreCases.map((c, i) => (
                          <li key={`m${i}`}>{c.brand ? `${c.brand}·` : ''}{c.title}{c.hookDesign ? `｜钩子：${c.hookDesign}` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* 爆款钩子 */}
                  {rec.refHooks && (
                    <div>
                      <p className="font-bold text-ink-800 mb-1">爆款钩子列表</p>
                      <p className="text-ink-600 whitespace-pre-line leading-relaxed">{rec.refHooks}</p>
                    </div>
                  )}

                  {/* 脚本方向全文 */}
                  <div>
                    <p className="font-bold text-ink-800 mb-1.5">📝 脚本全文（四段：痛点 / 卖点 / 放大 / 转化）</p>
                    <div className="space-y-3">
                      {rec.directions.map(snap => {
                        const d = snap.current || snap.original;
                        return (
                          <div key={snap.index} className="rounded-xl border border-line-soft p-3">
                            <p className="font-bold text-ink-800">方向 {snap.index + 1} · {snap.angle}｜{d.title}</p>
                            {d.concept && <p className="text-ink-500 mt-0.5">{d.concept}</p>}
                            {d.hooks?.length ? <p className="text-amber-700 mt-1">钩子：{d.hooks.join(' / ')}</p> : null}
                            <div className="mt-2 space-y-2">
                              {SEG_ORDER.map(key => {
                                const seg = d.script?.[key];
                                const media = snap.segMedia?.[key];
                                if (!seg) return null;
                                return (
                                  <div key={key} className="rounded-lg bg-canvas/60 px-3 py-2">
                                    <p className="font-bold text-ink-700 text-[11.5px]">{CONCEPT_SEG_LABEL[key]}</p>
                                    {seg.visual && <p className="text-ink-600 mt-0.5">画面：{seg.visual}</p>}
                                    {seg.voiceover && <p className="text-ink-600 mt-0.5">口播：{seg.voiceover}</p>}
                                    {media && (
                                      <a href={media.url} target="_blank" rel="noreferrer"
                                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 hover:bg-fuchsia-100">
                                        {media.mediaType === 'video' ? <Clapperboard className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                        {media.mediaType === 'video' ? '查看 AI 镜头视频（3s MP4）' : '查看 AI 镜头图'}
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {d.shootingTip && <p className="text-ink-500 mt-2">📷 拍摄建议：{d.shootingTip}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => void remove(rec.id)}
                      className="inline-flex items-center gap-1 text-[11.5px] text-red-500 hover:text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5">
                      <Trash2 className="w-3.5 h-3.5" /> 删除本条
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
