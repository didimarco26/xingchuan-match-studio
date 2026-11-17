import { useState } from 'react';
import {
  LayoutGrid, RefreshCw, Check, ArrowRight, Loader2, ClipboardList, Gauge, Pencil,
} from 'lucide-react';
import { demoLatency } from '../lib/demo';
import {
  DEMO_BOARD_CLIENTS, DEFAULT_TIER_RULES, tierOf,
  type BoardClient, type TierRule,
} from '../lib/demo-showcase';

type TierMap = Record<string, 'A' | 'B' | 'C' | 'D'>;

function computeTiers(cs: BoardClient[], rs: TierRule[]): TierMap {
  const m: TierMap = {};
  cs.forEach(c => { m[c.name] = tierOf(c, rs).tier as TierMap[string]; });
  return m;
}

export default function DemoBoard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clients, setClients] = useState<BoardClient[]>(() => DEMO_BOARD_CLIENTS.map(c => ({ ...c })));
  const [rules, setRules] = useState<TierRule[]>(() => DEFAULT_TIER_RULES.map(r => ({ ...r })));

  // 结果门控：首测分层快照 + 调整口径后的重算快照；初始均为 null（空看板）
  const [baseTiers, setBaseTiers] = useState<TierMap | null>(null);
  const [adjusted, setAdjusted] = useState<{ rules: TierRule[]; tiers: TierMap } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  // 第 3 步当前展示的分层与口径：已重算用调整口径，否则用默认口径首测结果
  const showTiers: TierMap | null = adjusted ? adjusted.tiers : baseTiers;
  const activeRules: TierRule[] = adjusted ? adjusted.rules : DEFAULT_TIER_RULES;

  const patchClient = (i: number, patch: Partial<BoardClient>) => {
    setClients(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    // 输入一旦改动，已测算结果即作废，需重新点击「测算」（保持点击驱动）
    setBaseTiers(null);
    setAdjusted(null);
  };
  const patchRule = (i: number, patch: Partial<TierRule>) =>
    setRules(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const numOf = (v: string) => { const n = Number(v); return isNaN(n) ? 0 : n; };

  /** 第 2 步：点击「测算」→ 短 loading → 默认口径 A/B/C/D */
  const runCalc = async () => {
    if (calcLoading) return;
    setCalcLoading(true);
    await demoLatency();
    setBaseTiers(computeTiers(clients, DEFAULT_TIER_RULES));
    setAdjusted(null);
    setRules(DEFAULT_TIER_RULES.map(r => ({ ...r })));
    setCalcLoading(false);
  };

  /** 第 3 步：改完口径点击「重算」→ 短 loading → 新分层 */
  const runRecalc = async () => {
    if (recalcLoading) return;
    setRecalcLoading(true);
    await demoLatency();
    setAdjusted({ rules: rules.map(r => ({ ...r })), tiers: computeTiers(clients, rules) });
    setRecalcLoading(false);
  };

  const tierBadge = (t?: string) => {
    if (!t) return <span className="inline-block w-6 h-6 text-center leading-6 text-gray-300">—</span>;
    const cls = t === 'A' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : t === 'B' ? 'bg-brand-50 text-brand-700 border-brand-100'
      : t === 'C' ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-gray-100 text-gray-500 border-gray-200';
    return <span className={`inline-flex w-6 h-6 rounded-full border items-center justify-center text-[12px] font-extrabold ${cls}`}>{t}</span>;
  };

  // 晋层条件（基于当前展示口径）
  const promoteOf = (c: BoardClient): string => {
    const cur = showTiers?.[c.name] ?? 'D';
    const idx = activeRules.findIndex(r => r.tier === cur);
    if (idx <= 0) return '已是最高层 A，保持当前消耗与 ROI 即可';
    const next = activeRules[idx - 1];
    const sg = Math.max(0, Math.round((next.spend - c.spend) * 10) / 10);
    const rg = Math.max(0, Math.round((next.roi - c.roi) * 10) / 10);
    return `进入 ${next.tier} 需：日消耗≥${next.spend}万${sg ? `（差 +${sg}）` : '（已达标）'} 且 ROI≥${next.roi}${rg ? `（差 +${rg}）` : '（已达标）'}`;
  };

  /** 分层分布条（测算/重算后展示） */
  const DistBar = ({ tiers }: { tiers: TierMap }) => {
    const order = ['A', 'B', 'C', 'D'] as const;
    const counts = order.map(t => [t, Object.values(tiers).filter(x => x === t).length] as const);
    const color: Record<string, string> = { A: 'bg-emerald-500', B: 'bg-brand-500', C: 'bg-amber-400', D: 'bg-gray-300' };
    return (
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          {counts.map(([t, n]) => n > 0 && (
            <div key={t} className={`${color[t]} h-full`} style={{ width: `${(n / clients.length) * 100}%` }} title={`${t} · ${n}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-ink-500">
          {counts.map(([t, n]) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color[t]}`} />{t} 层 <b className="text-ink-800">{n}</b> 个客户
            </span>
          ))}
        </div>
      </div>
    );
  };

  const STEPS = [
    { n: 1 as const, t: '填报消耗样例', icon: ClipboardList },
    { n: 2 as const, t: '补 ROI/投放阶段生成分层', icon: Gauge },
    { n: 3 as const, t: '调整分层口径重算', icon: Pencil },
  ];

  const miniInput = 'w-20 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[12px] tabnum focus:outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100';

  const gotoStep = (n: 1 | 2 | 3) => {
    // 第 3 步必须先完成首测
    if (n === 3 && !baseTiers) return;
    setStep(n);
  };

  // 口径草稿是否与最近一次重算不同（决定是否提示需重算）
  const rulesDirty = adjusted
    ? JSON.stringify(rules) !== JSON.stringify(adjusted.rules)
    : JSON.stringify(rules) !== JSON.stringify(DEFAULT_TIER_RULES);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-btn shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-ink-900">星川服务商经营看板
              <span className="ml-2 text-[10px] font-semibold text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-100 px-1.5 py-0.5 rounded">演示预置数据</span>
            </h1>
            <p className="text-[11px] text-ink-400">填报消耗 → 点击测算补 ROI/阶段生成分层 → 调整口径后点击重算</p>
          </div>
          <button type="button" onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 切换模式
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 三步指示 */}
        <div className="flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-3 flex-1 min-w-0">
              <button type="button" onClick={() => gotoStep(s.n)}
                className="flex items-center gap-2 whitespace-nowrap group">
                <span className={`w-[24px] h-[24px] rounded-full grid place-items-center text-[12px] font-bold border transition-colors ${
                  step === s.n ? 'bg-brand-600 text-white border-brand-600'
                  : s.n < step ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-ink-400 border-line'}`}>
                  {s.n < step ? <Check className="w-3.5 h-3.5" /> : s.n}
                </span>
                <span className={`text-[12.5px] font-semibold ${step === s.n ? 'text-brand-700' : 'text-ink-400 group-hover:text-ink-700'}`}>{s.t}</span>
              </button>
              {i < 2 && <div className="flex-1 h-0.5 bg-line rounded-full" />}
            </div>
          ))}
        </div>

        {/* ===== 第 1 步：填报消耗样例（空态，无任何结果） ===== */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-ink-900">第 1 步 · 填报星川日消耗（万元）样例</h2>
            <p className="text-[12px] text-ink-400 mt-1">先只填消耗；ROI 与投放阶段在第 2 步补充，本页所有数字可改。</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[420px]">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th className="py-2 pr-4 font-medium">客户 / 店铺</th>
                    <th className="py-2 font-medium">星川日消耗（万元）</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <tr key={c.name} className="border-t border-gray-50">
                      <td className="py-2.5 pr-4 text-ink-800 font-medium">{c.name}</td>
                      <td className="py-2.5">
                        <input type="number" min={0} step={0.1} value={c.spend}
                          onChange={e => patchClient(i, { spend: numOf(e.target.value) })} className={miniInput} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[13px] font-bold shadow-btn hover:brightness-105">
                下一步 · 补 ROI / 投放阶段 <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ===== 第 2 步：补 ROI/投放阶段 → 点击「测算」才出 A/B/C/D ===== */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-ink-900">第 2 步 · 补充 ROI 与投放阶段，点击测算生成 A/B/C/D</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink-500">
              {DEFAULT_TIER_RULES.slice(0, 3).map(r => (
                <span key={r.tier} className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                  {r.tier}：消耗≥{r.spend}万 且 ROI≥{r.roi}
                </span>
              ))}
              <span className="bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">其余 → D</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12px] min-w-[760px]">
                <thead>
                  <tr className="text-gray-400 text-left">
                    {['客户', '日消耗(万)', '支付 ROI', '投放阶段', '分层'].map(h => (
                      <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <tr key={c.name} className="border-t border-gray-50">
                      <td className="py-2.5 pr-3 text-ink-800 font-medium whitespace-nowrap">{c.name}</td>
                      <td className="py-2.5 pr-3 tabnum">{c.spend}</td>
                      <td className="py-2.5 pr-3">
                        <input type="number" min={0} step={0.1} value={c.roi}
                          onChange={e => patchClient(i, { roi: numOf(e.target.value) })} className={miniInput} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <select value={c.stage}
                          onChange={e => patchClient(i, { stage: e.target.value as BoardClient['stage'] })}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[12px] focus:outline-none focus:border-brand-400 focus:bg-white">
                          {(['冷启', '起量', '稳定'] as const).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5">
                        {calcLoading
                          ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                          : tierBadge(baseTiers?.[c.name])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 测算结果分布（点击测算后出现） */}
            {calcLoading ? (
              <div className="mt-4 flex items-center gap-2 text-[12px] text-brand-600">
                <Loader2 className="w-4 h-4 animate-spin" /> 正在按默认口径测算分层…
              </div>
            ) : baseTiers ? (
              <DistBar tiers={baseTiers} />
            ) : (
              <p className="mt-4 text-[12px] text-ink-400">分层尚未生成 —— 填好 ROI / 投放阶段后，点下方「测算 A/B/C/D 分层」。</p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep(1)}
                className="inline-flex items-center h-10 px-4 rounded-xl bg-white border border-line text-[13px] font-medium text-ink-700 hover:border-brand-300">
                上一步
              </button>
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={runCalc} disabled={calcLoading}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 text-white text-[13px] font-bold shadow-btn hover:brightness-105 disabled:opacity-60">
                  {calcLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
                  测算 A/B/C/D 分层
                </button>
                <button type="button" onClick={() => setStep(3)} disabled={!baseTiers || calcLoading}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[13px] font-bold shadow-btn hover:brightness-105 disabled:opacity-50">
                  下一步 · 调整分层口径 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== 第 3 步：调整口径 → 点击「重算」才出结果与晋层条件 ===== */}
        {step === 3 && baseTiers && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink-900">第 3 步 · 调整分层口径（改门槛后点「重算」生效）</h2>
                <button type="button"
                  onClick={() => setRules(DEFAULT_TIER_RULES.map(r => ({ ...r })))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line text-[12px] font-medium text-ink-700 hover:border-brand-300">
                  <RefreshCw className="w-3.5 h-3.5" /> 恢复默认口径
                </button>
              </div>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                {rules.slice(0, 3).map((r, i) => (
                  <div key={r.tier} className="rounded-xl border border-gray-100 p-3.5">
                    <p className="text-[12.5px] font-bold text-ink-900">{r.tier} · {r.name}</p>
                    <div className="mt-2 space-y-2 text-[12px]">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-ink-400">消耗门槛(万)</span>
                        <input type="number" min={0} step={0.1} value={r.spend}
                          onChange={e => patchRule(i, { spend: numOf(e.target.value) })} className={miniInput} />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-ink-400">ROI 门槛</span>
                        <input type="number" min={0} step={0.1} value={r.roi}
                          onChange={e => patchRule(i, { roi: numOf(e.target.value) })} className={miniInput} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-ink-400">提示：降低门槛会让客户向上晋层；阈值须保持 A ≥ B ≥ C，否则可能出现高层比低层更宽松的情况。</p>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={runRecalc} disabled={recalcLoading}
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 text-white text-[13px] font-bold shadow-btn hover:brightness-105 disabled:opacity-60">
                  {recalcLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  按新口径重算
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-ink-900">{adjusted ? '重算结果 · 晋层条件' : '首测结果 · 晋层条件'}</h2>
                <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded border ${adjusted ? 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100' : 'text-brand-700 bg-brand-50 border-brand-100'}`}>
                  {adjusted ? '调整后口径' : '默认口径'}
                </span>
                {rulesDirty && !recalcLoading && (
                  <span className="text-[11px] text-amber-600">口径已修改，点「按新口径重算」后生效</span>
                )}
              </div>

              {recalcLoading ? (
                <div className="py-10 flex flex-col items-center gap-2 text-ink-400">
                  <Loader2 className="w-6 h-6 animate-spin text-fuchsia-500" />
                  <p className="text-xs">正在按新口径重新测算分层…</p>
                </div>
              ) : showTiers ? (
                <>
                  <DistBar tiers={showTiers} />
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[760px]">
                      <thead>
                        <tr className="text-gray-400 text-left">
                          {['客户', '日消耗(万)', 'ROI', '阶段', '最新分层', '晋层条件'].map(h => (
                            <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map(c => (
                          <tr key={c.name} className="border-t border-gray-50">
                            <td className="py-2.5 pr-3 text-ink-800 font-medium whitespace-nowrap">{c.name}</td>
                            <td className="py-2.5 pr-3 tabnum">{c.spend}</td>
                            <td className="py-2.5 pr-3 tabnum">{c.roi}</td>
                            <td className="py-2.5 pr-3">{c.stage}</td>
                            <td className="py-2.5 pr-3">{tierBadge(showTiers[c.name])}</td>
                            <td className="py-2.5 text-brand-700">{promoteOf(c)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <div className="mt-5">
                <button type="button" onClick={() => setStep(2)}
                  className="inline-flex items-center h-10 px-4 rounded-xl bg-white border border-line text-[13px] font-medium text-ink-700 hover:border-brand-300">
                  上一步
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
