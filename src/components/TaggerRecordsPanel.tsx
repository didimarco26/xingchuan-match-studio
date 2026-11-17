import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Loader2, ClipboardList, User as UserIcon, FileSpreadsheet,
  ChevronDown, ChevronUp, Inbox,
} from 'lucide-react';
import { FAAS_URL } from '../lib/api';

// ============================================================
// 📋 服务商达人上传记录（仅对内站启用）
//   读取 GitHub 公开版服务商自助打标后回传的记录（FaaS tagger_records_list ← 飞书多维表格）。
// ============================================================

interface RecDetail { tier: string; medal: string; name: string; id: string; score: number; sLevel: string; douyin?: string }
interface TaggerRecord {
  rid: string; name: string; source: string; fileName: string; at: string; ts: number;
  total: number; summary: Record<string, number>; detail: RecDetail[];
}

const TIER_STYLE: Record<string, { bg: string; fg: string }> = {
  '标杆': { bg: '#FEF3C7', fg: '#B45309' },
  '主力': { bg: '#DCFCE7', fg: '#15803D' },
  '潜力': { bg: '#E0E7FF', fg: '#4338CA' },
  '储备': { bg: '#F3F4F6', fg: '#6B7280' },
};

async function fetchRecords(): Promise<TaggerRecord[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'tagger_records_list', limit: 100 }),
      signal: ctrl.signal,
    });
    const body = await resp.json();
    if (!resp.ok || !body || body.ok === false) throw new Error(body?.error || `服务异常（HTTP ${resp.status}）`);
    return body?.data?.records || [];
  } finally { clearTimeout(timer); }
}

export default function TaggerRecordsPanel({ onBack }: { onBack: () => void }) {
  const [records, setRecords] = useState<TaggerRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openRid, setOpenRid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRecords(await fetchRecords()); }
    catch (e) { setError('记录加载失败：' + (e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalAll = records?.reduce((s, r) => s + (r.total || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button type="button" onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> 切换模式
          </button>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-btn shrink-0">
            <ClipboardList className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-ink-900">📋 服务商达人上传记录</h1>
            <p className="text-[11px] text-ink-400">GitHub 公开版服务商自助打标回传 · 飞书多维表格实时同步</p>
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-bold text-ink-700 hover:border-brand-300 transition disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 刷新
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        {records && records.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: '上传批次', value: records.length },
              { label: '累计打标达人', value: totalAll },
              { label: '活跃服务商', value: new Set(records.map(r => r.name)).size },
              { label: '最近上传', value: records[0]?.at?.slice(5, 16) || '—' },
            ].map(k => (
              <div key={k.label} className="rounded-2xl bg-white border border-line p-3.5 shadow-card">
                <p className="text-[11px] text-ink-400">{k.label}</p>
                <p className="text-[20px] font-bold text-ink-900 mt-1 leading-none">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-white border border-line px-4 py-14 text-center shadow-card">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500 mx-auto mb-2" />
            <p className="text-xs text-ink-400">正在读取上传记录…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3.5 text-[12px] text-rose-800">{error}</div>
        )}

        {!loading && !error && records && records.length === 0 && (
          <div className="rounded-2xl bg-white border border-line px-4 py-16 text-center shadow-card">
            <Inbox className="w-8 h-8 mx-auto text-ink-300 mb-2" />
            <p className="text-[13px] font-bold text-ink-700">暂无服务商上传记录</p>
            <p className="text-[11.5px] text-ink-400 mt-1">服务商在 GitHub 公开版完成自助打标后，记录会自动回传到这里。</p>
          </div>
        )}

        {!loading && !error && records && records.length > 0 && (
          <div className="space-y-3">
            {records.map((r, idx) => {
              const open = openRid === r.rid;
              const detail = r.detail || [];
              return (
                <motion.div key={r.rid || idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white border border-line shadow-card overflow-hidden">
                  <button type="button" onClick={() => setOpenRid(open ? null : r.rid)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 flex-wrap hover:bg-surface-2/40 transition">
                    <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-bold text-ink-900 flex items-center gap-2">
                        {r.name || '未署名服务商'}
                        <span className="text-[10px] font-semibold text-ink-500 bg-surface-2 px-1.5 py-0.5 rounded">{r.source || 'GitHub公开版'}</span>
                      </p>
                      <p className="text-[11px] text-ink-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" />{r.fileName || '—'}</span>
                        <span>· {r.at}</span>
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-ink-600 bg-surface-2 px-2 py-0.5 rounded-full">共 {r.total} 位</span>
                      {['标杆', '主力', '潜力', '储备'].map(t => (
                        <span key={t} className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: TIER_STYLE[t].bg, color: TIER_STYLE[t].fg }}>
                          {t === '标杆' ? '🥇' : t === '主力' ? '🥈' : t === '潜力' ? '🥉' : '⚪'} {r.summary?.[t] || 0}
                        </span>
                      ))}
                      {open ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-line-soft">
                      {detail.length === 0 ? (
                        <p className="px-4 py-6 text-center text-[12px] text-ink-400">该批次无明细数据</p>
                      ) : (
                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                          <table className="w-full text-[12px]">
                            <thead className="sticky top-0">
                              <tr className="bg-surface-2 text-ink-500 text-left">
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">达人</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">分层</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">得分</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">星川等级</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.map((d, i) => {
                                const st = TIER_STYLE[d.tier] || TIER_STYLE['储备'];
                                return (
                                  <tr key={i} className="border-t border-line-soft">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <p className="font-semibold text-ink-900">{d.name || '(未命名)'}</p>
                                      <p className="text-[10.5px] text-ink-400 font-mono">{d.id || '—'}</p>
                                      {d.douyin && <p className="text-[10.5px] text-ink-500 font-mono">🎵 {d.douyin}</p>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}>
                                        {d.medal} {d.tier}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono font-bold text-ink-900">{d.score}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-ink-600">{d.sLevel || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
