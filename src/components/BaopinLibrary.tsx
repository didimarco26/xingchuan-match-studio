import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Loader2, Package, ChevronDown, Inbox,
  ClipboardList, X, ExternalLink, FileText, Users, PackagePlus, Download,
} from 'lucide-react';
import {
  fetchBaopinList, genCapacityPlan, updateHitProductTier,
  type BaopinItem, type PLevel,
} from '../lib/baopin';
import { isPublicHost } from '../lib/gh';
import { GRADE_STYLE, GRADE_ORDER, type Grade } from '../lib/grade';
import BatchImportModal from './BatchImportModal';

// ============================================================
// 📦 代理商爆品库（对内 + 对外）
//   商品分析自动汇聚 → 商品五维分数
//   服务商适配分析（达人库 × 分层规则V1）→ 商品 P0/P1/P2/P3 定级（可手选）
//   支持 Excel/表单批量导入 + 一键导出
// ============================================================

const isGrade = (s: string | null | undefined): s is Grade => !!s && GRADE_ORDER.includes(s as Grade);

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 运力建议弹窗
function CapacityModal({ agency, onClose }: { agency?: string; onClose: () => void }) {
  const [plan, setPlan] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    genCapacityPlan(agency)
      .then(d => setPlan(d.plan))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [agency]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[86vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-line-soft">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-rose-500 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-ink-900">📋 季度运力建议</h3>
            <p className="text-[11px] text-ink-400">AI 综合 P0/P1/P2 三级爆品 · 达人排期与预算侧重</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-canvas text-ink-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-ink-400">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <span className="text-xs">正在生成运力建议，约需 20-40 秒…</span>
            </div>
          )}
          {error && <div className="text-[13px] text-red-600 py-8 text-center">{error}</div>}
          {!loading && !error && (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-ink-800">{plan}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BaopinLibrary({ onBack, agency }: { onBack?: () => void; agency?: string }) {
  const publicHost = isPublicHost();
  const [items, setItems] = useState<BaopinItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tierSavingId, setTierSavingId] = useState('');
  const [tierError, setTierError] = useState('');
  const [openGradeId, setOpenGradeId] = useState('');
  const [exporting, setExporting] = useState(false);
  // 展开区：key = `${id}-report` / `${id}-match`
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => setOpenSections(s => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // 筛选
  const [industry, setIndustry] = useState('全部');
  const [minScore, setMinScore] = useState(0);
  const [timeRange, setTimeRange] = useState<'all' | '30d' | '7d'>('all');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await fetchBaopinList(agency);
      setItems(d.list);
    } catch (e) {
      setError('爆品库加载失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [agency]);

  useEffect(() => { void load(); }, [load]);

  const industries = useMemo(() => {
    const s = new Set<string>();
    items?.forEach(it => it.industry && s.add(it.industry));
    return ['全部', ...[...s].sort()];
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    items?.forEach(it => {
      const g = isGrade(it.manualTier) ? it.manualTier : isGrade(it.level) ? it.level : null;
      if (g) c[g]++;
    });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return (items || [])
      .filter(it => industry === '全部' || it.industry === industry)
      .filter(it => it.score >= minScore)
      .filter(it => {
        if (timeRange === 'all') return true;
        const max = timeRange === '7d' ? 7 * 86400_000 : 30 * 86400_000;
        return now - it.time <= max;
      })
      .filter(it => !keyword.trim() || it.name.includes(keyword.trim()))
      .sort((a, b) => b.score - a.score || b.time - a.time);
  }, [items, industry, minScore, timeRange, keyword]);

  // 服务商自主分层回写（不影响系统推荐定级）
  const handleSaveManualTier = async (item: BaopinItem, lv: PLevel | '') => {
    setTierSavingId(item.id); setTierError(''); setOpenGradeId('');
    try {
      if (lv) {
        await updateHitProductTier(item.id, lv);
      } else {
        // 清除手选 → 置空（回到系统推荐）
        await updateHitProductTier(item.id, '');
      }
      setItems(list => (list || []).map(x => x.id === item.id ? { ...x, manualTier: lv } : x));
    } catch (e) {
      setTierError('定级保存失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTierSavingId('');
    }
  };

  // 一键导出：当前筛选结果（默认全部），CSV 含分数与定级
  const exportCsv = () => {
    setExporting(true);
    try {
      const esc = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const header = ['商品名', '行业', '服务商', '综合得分', '系统推荐定级', '我的定级', '达人匹配数',
        '星川日预算(万/天)', '客单价(元)', '千川稳定ROI', '追投目标ROI', '反选比例(%)', '素材追投比例(%)',
        'AI运营建议', '商品链接', '录入时间'];
      const rows = filtered.map(it => [
        it.name, it.industry, it.agency, it.score,
        isGrade(it.level) ? it.level : '', isGrade(it.manualTier) ? it.manualTier : '', it.matchCount,
        it.inputs?.xcBudgetWan ?? '', it.inputs?.price ?? '', it.inputs?.stableRoi ?? '',
        it.inputs?.targetRoi ?? '', it.inputs?.reverseSelectPct ?? '', it.inputs?.materialChasePct ?? '',
        it.advice, it.url, fmtTime(it.time),
      ]);
      const csv = '\ufeff' + [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `代理商爆品库_${new Date().toISOString().slice(0, 10)}_${filtered.length}件.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally { setExporting(false); }
  };

  const statCard = (g: Grade, title: string, desc: string) => {
    const st = GRADE_STYLE[g];
    return (
      <div className="rounded-2xl border px-4 py-3.5 flex items-center gap-3"
        style={{ borderColor: st.border, background: st.bg }}>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[15px] font-bold text-white"
          style={{ background: st.dot }}>{g}</span>
        <div className="min-w-0">
          <div className="text-xl font-bold leading-tight" style={{ color: st.text }}>{counts[g]}</div>
          <div className="text-[11px] text-ink-500 truncate">{title} · {desc}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition">
              <ArrowLeft className="w-3.5 h-3.5" /> 切换模式
            </button>
          )}
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-btn shrink-0">
            <Package className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-ink-900">📦 代理商爆品库</h1>
            <p className="text-[11px] text-ink-400">商品分析汇聚 · 商品五维分数 · 服务商适配定级（P0/P1/P2/P3）</p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button type="button" onClick={exportCsv} disabled={exporting || !filtered.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-bold text-ink-700 hover:border-brand-300 hover:text-brand-700 transition disabled:opacity-50">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} 一键导出
            </button>
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-gradient-to-r from-brand-600 to-rose-600 text-white text-xs font-bold shadow-btn hover:opacity-95 transition">
              <PackagePlus className="w-3.5 h-3.5" /> 批量导入
            </button>
            <button type="button" onClick={load} disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white border border-line text-xs font-bold text-ink-700 hover:border-brand-300 transition disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 刷新
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        {/* 定级统计（有效定级 = 我的定级优先，否则系统推荐） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCard('P0', '核心增产', '高分+供给强')}
          {statCard('P1', '带动/补齐', '中分或供给待补')}
          {statCard('P2', '观察验证', '低分或能力不突出')}
          {statCard('P3', '暂缓汰换', '<60或硬门槛')}
        </div>

        {/* 筛选条 */}
        <div className="mt-4 bg-white rounded-xl border border-line-soft p-3 flex flex-wrap items-center gap-2">
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-line text-xs text-ink-700 bg-white">
            {industries.map(i => <option key={i} value={i}>{i === '全部' ? '全部行业' : i}</option>)}
          </select>
          <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg border border-line text-xs text-ink-700 bg-white">
            <option value={0}>全部</option>
            <option value={75}>≥75 分</option>
            <option value={50}>≥50 分</option>
          </select>
          <div className="inline-flex rounded-lg border border-line overflow-hidden">
            {([['all', '全部时间'], ['7d', '近7天'], ['30d', '近30天']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTimeRange(k)}
                className={`px-2.5 py-1.5 text-xs ${timeRange === k ? 'bg-brand-600 text-white font-bold' : 'bg-white text-ink-600 hover:bg-canvas'}`}>
                {label}
              </button>
            ))}
          </div>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索商品名"
            className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-lg border border-line text-xs" />
          <button type="button" onClick={() => setCapacityOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-rose-600 text-white text-xs font-bold shadow-btn">
            <ClipboardList className="w-3.5 h-3.5" /> 生成运力建议
          </button>
        </div>

        {/* 列表 */}
        <div className="mt-4">
          {tierError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 flex items-center gap-2">
              <X className="w-3.5 h-3.5" /> {tierError}
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-ink-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" /> 正在加载爆品库…
            </div>
          )}
          {!loading && error && <div className="text-center text-red-600 text-sm py-16">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-ink-400">
              <Inbox className="w-9 h-9" />
              <span className="text-xs">暂无符合条件的商品，可批量导入或去「商品分析」分析单个商品</span>
              <button type="button" onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-rose-600 text-white text-xs font-bold shadow-btn">
                <PackagePlus className="w-3.5 h-3.5" /> 批量导入爆品
              </button>
            </div>
          )}
          <div className="space-y-2.5">
            {filtered.map((it, idx) => {
              const reportKey = `${it.id}-report`;
              const matchKey = `${it.id}-match`;
              const reportOpen = openSections.has(reportKey);
              const matchOpen = openSections.has(matchKey);
              const recG = isGrade(it.level) ? it.level : null;
              const manG = isGrade(it.manualTier) ? it.manualTier : null;
              const effG: Grade | null = manG ?? recG;
              const gst = effG ? GRADE_STYLE[effG] : null;
              const gradeMenuOpen = openGradeId === it.id;
              return (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(idx * 0.02, 0.3) }}
                  className="rounded-xl border border-line-soft bg-white px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold text-ink-900 truncate">{it.name}</span>
                        {it.industry && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px] font-medium text-ink-600">{it.industry}</span>
                        )}
                        {it.url && (
                          <a href={it.url} target="_blank" rel="noreferrer" className="text-ink-300 hover:text-brand-600">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-ink-600 leading-5 line-clamp-2">{it.advice}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400 flex-wrap">
                        <span>匹配达人 <b className="text-ink-700">{it.matchCount}</b> 人</span>
                        {!publicHost && it.agency && <span>服务商：{it.agency}</span>}
                        <span className="hidden sm:inline">{fmtTime(it.time)}</span>
                      </div>
                    </div>

                    {/* 右侧：分数 + 定级 */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* 分数 */}
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] text-ink-400">分数</span>
                        <span className="text-[17px] font-extrabold text-ink-900 leading-none tabnum">{it.score}</span>
                      </div>
                      <div className="w-px h-8 bg-line-soft" />
                      {/* 定级 */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-ink-400">定级</span>
                        <div className="relative">
                          <button
                            type="button"
                            title={effG ? `${effG}（${manG ? '手选，点击修改' : '系统推荐，点击修改'}）` : '未定级，点击选择'}
                            onClick={() => setOpenGradeId(v => v === it.id ? '' : it.id)}
                            disabled={tierSavingId === it.id}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold transition disabled:opacity-50"
                            style={gst
                              ? { color: gst.text, background: gst.bg, border: `2px solid ${gst.dot}` }
                              : { color: '#98A2B3', background: '#fff', border: '2px dashed #D0D5DD' }}
                          >
                            {tierSavingId === it.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : effG || <span className="text-[14px] leading-none">○</span>}
                          </button>
                          {gradeMenuOpen && (
                            <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-line bg-white shadow-pop p-1.5">
                              {GRADE_ORDER.map(g => (
                                <button key={g} type="button"
                                  onClick={() => void handleSaveManualTier(it, g as PLevel)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-bold hover:bg-surface-2"
                                  style={{ color: GRADE_STYLE[g].text }}>
                                  <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[9px]"
                                    style={{ borderColor: GRADE_STYLE[g].dot }}>{g}</span>
                                  {g === 'P0' ? '核心增产' : g === 'P1' ? '能力带动/补齐' : g === 'P2' ? '观察验证' : '暂缓/汰换'}
                                  {g === recG && !manG && <span className="ml-auto text-[9px] font-normal text-ink-400">推荐</span>}
                                </button>
                              ))}
                              {manG && (
                                <button type="button"
                                  onClick={() => void handleSaveManualTier(it, '')}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-ink-400 hover:bg-surface-2 border-t border-line-soft mt-1 pt-1.5">
                                  ↩ 清除手选，恢复推荐
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-[8.5px] leading-none"
                          style={{ color: manG ? GRADE_STYLE[manG].text : effG ? '#98A2B3' : '#C0C6CF' }}>
                          {manG ? '手选' : effG ? '推荐' : '未定级'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 展开操作行 */}
                  {(it.report || it.matchSummary) && (
                    <div className="mt-2.5 pt-2.5 border-t border-line-soft flex items-center gap-2 flex-wrap">
                      {it.report && (
                        <button type="button" onClick={() => toggleSection(reportKey)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                            reportOpen ? 'bg-brand-50 border-brand-200 text-brand-700'
                              : 'border-line text-ink-600 hover:border-brand-300 hover:text-brand-700'}`}>
                          <FileText className="w-3 h-3" /> 一页纸报告
                          <ChevronDown className={`w-3 h-3 transition-transform ${reportOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {it.matchSummary && (
                        <button type="button" onClick={() => toggleSection(matchKey)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                            matchOpen ? 'bg-brand-50 border-brand-200 text-brand-700'
                              : 'border-line text-ink-600 hover:border-brand-300 hover:text-brand-700'}`}>
                          <Users className="w-3 h-3" /> 达人匹配分析
                          <ChevronDown className={`w-3 h-3 transition-transform ${matchOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  )}
                  {reportOpen && it.report && (
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[11.5px] leading-5 text-ink-700 bg-canvas/70 rounded-lg px-3 py-2.5 font-sans">
                      {it.report}
                    </pre>
                  )}
                  {matchOpen && it.matchSummary && (
                    <div className="mt-2 text-[11.5px] leading-5 text-ink-700 bg-canvas/70 rounded-lg px-3 py-2.5">
                      {it.matchSummary}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      {capacityOpen && <CapacityModal agency={agency} onClose={() => setCapacityOpen(false)} />}
      {showImport && (
        <BatchImportModal
          agency={agency}
          onClose={() => setShowImport(false)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}
