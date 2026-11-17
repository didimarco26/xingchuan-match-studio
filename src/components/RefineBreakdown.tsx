import { useCallback, useRef, useState } from 'react';
import {
  Clapperboard, UploadCloud, Film, AlertTriangle, Lightbulb, CheckCircle2, Loader2,
  Zap, Trash2, RotateCw, X,
} from 'lucide-react';
import {
  analyzeVideoBreakdown,
  type BreakdownProductCtx,
  type BreakdownResult,
} from '../lib/api';
import { extractFrames } from '../lib/video-frames';

// ============================================================
// 脚本方向卡 · 🎬 千川爆款素材灵感（右侧侧边面板内容）
// 挂载于画布右侧：宽屏 sticky 内嵌、窄屏右侧抽屉。上传 mp4/mov → 前端 canvas 抽 8-12 帧
// → FaaS 多模态拆解（钩子/卖点/结构/跑量因素/逐镜头/风险）；每条结论可勾选，
// 底部「✅ 引入已选内容到优化方向」把勾选结论（≤600字）追加到方向卡优化输入框。
// 组件常驻挂载，已上传视频与拆解结果不随面板开关丢失。
// ============================================================

type ItemStatus = 'extracting' | 'analyzing' | 'done' | 'error';

interface BreakdownItem {
  id: string;
  file: File;
  fileName: string;
  status: ItemStatus;
  progress: string;
  result?: BreakdownResult;
  error?: string;
}

const MAX_VIDEOS = 3;

// 可勾选引入的结论字段
const SEL_FIELDS = ['hook', 'sellingPoints', 'structure', 'offerAndCta', 'successFactors', 'replicate'] as const;
type SelField = typeof SEL_FIELDS[number];
const FIELD_LABELS: Record<SelField, string> = {
  hook: '前3秒钩子',
  sellingPoints: '核心卖点表达',
  structure: '内容节奏结构',
  offerAndCta: '价格福利与 CTA',
  successFactors: '为什么能跑量',
  replicate: '值得复刻',
};
const DEFAULT_CHECKED: SelField[] = ['hook', 'sellingPoints', 'structure'];

function fieldAvailable(r: BreakdownResult, f: SelField): boolean {
  if (f === 'successFactors') return r.successFactors.length > 0;
  if (f === 'replicate') return r.replicate.length > 0;
  return !!String((r as any)[f] || '').trim();
}
function fieldText(r: BreakdownResult, f: SelField): string {
  if (f === 'successFactors') return r.successFactors.slice(0, 3).join('；');
  if (f === 'replicate') return r.replicate.slice(0, 3).join('；');
  return String((r as any)[f] || '');
}

/** 把勾选的拆解结论浓缩为 ≤600 字注入文本 */
function buildSelectedText(items: BreakdownItem[], selected: Set<string>): string {
  const blocks: string[] = [];
  for (const it of items) {
    if (it.status !== 'done' || !it.result) continue;
    const lines: string[] = [];
    for (const f of SEL_FIELDS) {
      if (!selected.has(`${it.id}:${f}`)) continue;
      const val = fieldText(it.result, f);
      if (val.trim()) lines.push(`· ${FIELD_LABELS[f]}：${val}`);
    }
    if (lines.length) blocks.push(`参考素材《${it.fileName}》：\n${lines.join('\n')}`);
  }
  if (!blocks.length) return '';
  let text = '【千川爆款参考素材拆解】请借鉴其钩子结构/节奏/卖点表达/CTA套路，围绕本商品卖点改写脚本，勿照搬原素材品牌名、口播原文及违规夸大表达：\n'
    + blocks.join('\n\n');
  if (text.length > 600) text = text.slice(0, 600) + '…';
  return text;
}

const STATUS_BADGE: Record<ItemStatus, { text: string; cls: string }> = {
  extracting: { text: '抽帧中', cls: 'bg-brand-100 text-brand-700' },
  analyzing: { text: 'AI 拆解中', cls: 'bg-brand-100 text-brand-700' },
  done: { text: '已完成', cls: 'bg-ok-bg text-ok-ink' },
  error: { text: '失败', cls: 'bg-danger-bg text-danger-ink' },
};

/** 带勾选框的结论块：勾选后随「引入已选内容」批量注入优化方向 */
function SelectableBlock({ label, checked, disabled, introduced, accent, onToggle, children }: {
  label: string; checked: boolean; disabled: boolean; introduced: boolean; accent?: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${accent ? 'border-brand-200 bg-brand-50/70' : 'border-line-soft bg-surface-2/60'} ${disabled && !introduced ? 'opacity-60' : ''}`}>
      <label className={`flex items-center gap-1.5 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="w-3 h-3 accent-brand-600 shrink-0 cursor-pointer disabled:cursor-default"
        />
        <span className="text-[10px] font-semibold text-ink-400 select-none">{label}</span>
        {introduced && (
          <span className="ml-auto shrink-0 text-[9px] font-bold text-ok-ink">已引入</span>
        )}
      </label>
      <div className="mt-0.5 text-[11.5px] leading-snug text-ink-800 whitespace-pre-wrap">{children}</div>
    </div>
  );
}

interface RefineBreakdownProps {
  product: BreakdownProductCtx;
  /** 点「✅ 引入已选内容到优化方向」：把 ≤600 字勾选结论回传给父组件填入迭代输入框 */
  onInject: (text: string) => void;
  /** 关闭面板 */
  onClose?: () => void;
}

export default function RefineBreakdown({ product, onInject, onClose }: RefineBreakdownProps) {
  const [items, setItems] = useState<BreakdownItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [introduced, setIntroduced] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const idSeq = useRef(0);
  const countRef = useRef(0);   // 当前素材条数（含处理中/失败），用于上传时限流

  const patch = useCallback((id: string, p: Partial<BreakdownItem>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const clearItemSelection = useCallback((id: string) => {
    const drop = (s: Set<string>) => new Set([...s].filter(k => !k.startsWith(`${id}:`)));
    setSelected(prev => drop(prev));
    setIntroduced(prev => drop(prev));
  }, []);

  const processOne = useCallback(
    async (file: File, reuseId?: string) => {
      const id = reuseId || `bd-${Date.now()}-${idSeq.current++}`;
      if (!reuseId) {
        countRef.current += 1;
        setItems(prev => [...prev, { id, file, fileName: file.name, status: 'extracting', progress: '准备中…' }]);
      } else {
        patch(id, { status: 'extracting', progress: '准备中…', error: '', result: undefined });
        clearItemSelection(id);
      }
      setInjected(false);
      try {
        const { frames, times, duration } = await extractFrames(file, msg => patch(id, { progress: msg }));
        patch(id, { status: 'analyzing', progress: '多模态拆解中（约 1-2 分钟）…' });
        const result = await analyzeVideoBreakdown(frames, times, product, duration);
        patch(id, { status: 'done', progress: '', result });
        // 拆解完成默认勾选核心三项（前3秒钩子/卖点表达/节奏结构），可自行调整
        setSelected(prev => {
          const next = new Set(prev);
          DEFAULT_CHECKED.forEach(f => {
            if (fieldAvailable(result, f)) next.add(`${id}:${f}`);
          });
          return next;
        });
      } catch (e: any) {
        patch(id, { status: 'error', progress: '', error: e?.message || '分析失败，请重试' });
      }
    },
    [patch, product, clearItemSelection],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const vids = Array.from(files).filter(
        f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi)$/i.test(f.name),
      );
      if (!vids.length) return;
      setBusy(true);
      // 串行处理，避免并发抽帧/AI 压力导致超时；面板内最多保留 MAX_VIDEOS 条
      let slot = MAX_VIDEOS - countRef.current;
      for (const f of vids) {
        if (slot <= 0) break;
        slot -= 1;
        await processOne(f);
      }
      setBusy(false);
    },
    [processOne],
  );

  const removeItem = (id: string) => {
    countRef.current = Math.max(0, countRef.current - 1);
    setItems(prev => prev.filter(it => it.id !== id));
    clearItemSelection(id);
    setInjected(false);
  };

  const toggleField = (id: string, f: SelField, enabled: boolean) => {
    if (!enabled) return;
    const k = `${id}:${f}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // 当前可引入（已勾选且未引入过、字段仍有效）的结论条数
  const selectedCount = items.reduce((n, it) => {
    if (it.status !== 'done' || !it.result) return n;
    return n + SEL_FIELDS.filter(
      f => fieldAvailable(it.result!, f) && selected.has(`${it.id}:${f}`) && !introduced.has(`${it.id}:${f}`),
    ).length;
  }, 0);

  const handleInject = () => {
    const text = buildSelectedText(items, selected);
    if (!text) return;
    onInject(text);
    // 已注入的勾选项标记为「已引入」并取消勾选，防重复注入
    const doneKeys = new Set<string>();
    items.forEach(it => {
      if (it.status !== 'done' || !it.result) return;
      SEL_FIELDS.forEach(f => {
        const k = `${it.id}:${f}`;
        if (selected.has(k) && fieldAvailable(it.result!, f)) doneKeys.add(k);
      });
    });
    setIntroduced(prev => new Set([...prev, ...doneKeys]));
    setSelected(prev => {
      const next = new Set(prev);
      doneKeys.forEach(k => next.delete(k));
      return next;
    });
    setInjected(true);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 面板头部 */}
      <div className="px-4 py-3 border-b border-brand-100 bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm shrink-0">
            <Clapperboard className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink-800 leading-tight">🎬 千川爆款素材灵感</p>
            <p className="text-[10px] text-ink-400 leading-tight truncate">传真实跑量视频，AI 逐帧拆解钩子/卖点/节奏，勾选结论引入优化方向（最多 {MAX_VIDEOS} 条）</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-ink-400"
              title="收起面板">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {/* 上传区（demo 与正式版一致；demo 仅预置数据，上传功能正常可用） */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-3 py-5 text-center transition ${
            dragOver ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-white hover:bg-brand-50/50'
          }`}
        >
          <UploadCloud className="w-6 h-6 text-brand-500 mx-auto mb-1" />
          <div className="text-[12px] font-semibold text-brand-700">
            {busy ? '正在处理视频…' : '点击或拖拽上传爆款视频（mp4 / mov）'}
          </div>
          <div className="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
            抖音 App 打开爆款 →「分享 → 保存本地」后上传<br />自动抽 8-12 帧，视频仅用于分析不存储
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* 结果卡片 */}
        {items.map(it => (
          <div key={it.id} className="rounded-lg border border-line-soft bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Film className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span className="truncate text-[12px] font-semibold text-ink-700">{it.fileName}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[it.status].cls}`}>
                  {STATUS_BADGE[it.status].text}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {it.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => processOne(it.file, it.id)}
                    className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-700 hover:underline"
                  >
                    <RotateCw className="w-3 h-3" /> 重试
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="inline-flex items-center gap-1 text-[10.5px] text-ink-400 hover:text-danger-ink"
                >
                  <Trash2 className="w-3 h-3" /> 移除
                </button>
              </div>
            </div>

            {(it.status === 'extracting' || it.status === 'analyzing') && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-brand-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                {it.progress}
              </div>
            )}

            {it.status === 'error' && (
              <div className="mt-1.5 rounded-md bg-danger-bg px-2 py-1.5 text-[11px] text-danger-ink">
                分析失败，请重试（建议缩短时长或更换更清晰的视频）。
              </div>
            )}

            {it.status === 'done' && it.result && (
              <div className="mt-2 space-y-1.5">
                {it.result.verdict && (
                  <div className="rounded-md border-l-[3px] border-brand-500 bg-brand-50 px-2 py-1.5 text-[11.5px] font-medium leading-snug text-brand-900 flex items-start gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-px" />
                    <span>{it.result.verdict}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1.5">
                  {it.result.hook && (
                    <SelectableBlock
                      label={FIELD_LABELS.hook} accent
                      checked={selected.has(`${it.id}:hook`) || introduced.has(`${it.id}:hook`)}
                      disabled={introduced.has(`${it.id}:hook`)}
                      introduced={introduced.has(`${it.id}:hook`)}
                      onToggle={() => toggleField(it.id, 'hook', !introduced.has(`${it.id}:hook`))}
                    >
                      {it.result.hook}
                    </SelectableBlock>
                  )}
                  {it.result.sellingPoints && (
                    <SelectableBlock
                      label={FIELD_LABELS.sellingPoints}
                      checked={selected.has(`${it.id}:sellingPoints`) || introduced.has(`${it.id}:sellingPoints`)}
                      disabled={introduced.has(`${it.id}:sellingPoints`)}
                      introduced={introduced.has(`${it.id}:sellingPoints`)}
                      onToggle={() => toggleField(it.id, 'sellingPoints', !introduced.has(`${it.id}:sellingPoints`))}
                    >
                      {it.result.sellingPoints}
                    </SelectableBlock>
                  )}
                  {it.result.structure && (
                    <SelectableBlock
                      label={FIELD_LABELS.structure}
                      checked={selected.has(`${it.id}:structure`) || introduced.has(`${it.id}:structure`)}
                      disabled={introduced.has(`${it.id}:structure`)}
                      introduced={introduced.has(`${it.id}:structure`)}
                      onToggle={() => toggleField(it.id, 'structure', !introduced.has(`${it.id}:structure`))}
                    >
                      {it.result.structure}
                    </SelectableBlock>
                  )}
                  {it.result.offerAndCta && (
                    <SelectableBlock
                      label={FIELD_LABELS.offerAndCta}
                      checked={selected.has(`${it.id}:offerAndCta`) || introduced.has(`${it.id}:offerAndCta`)}
                      disabled={introduced.has(`${it.id}:offerAndCta`)}
                      introduced={introduced.has(`${it.id}:offerAndCta`)}
                      onToggle={() => toggleField(it.id, 'offerAndCta', !introduced.has(`${it.id}:offerAndCta`))}
                    >
                      {it.result.offerAndCta}
                    </SelectableBlock>
                  )}
                </div>
                {it.result.successFactors.length > 0 && (
                  <SelectableBlock
                    label={FIELD_LABELS.successFactors}
                    checked={selected.has(`${it.id}:successFactors`) || introduced.has(`${it.id}:successFactors`)}
                    disabled={introduced.has(`${it.id}:successFactors`)}
                    introduced={introduced.has(`${it.id}:successFactors`)}
                    onToggle={() => toggleField(it.id, 'successFactors', !introduced.has(`${it.id}:successFactors`))}
                  >
                    <ul className="list-disc space-y-0.5 pl-4">
                      {it.result.successFactors.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </SelectableBlock>
                )}
                {it.result.shots.length > 0 && (
                  <details className="rounded-md border border-line-soft">
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-[10.5px] font-semibold text-brand-700 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> 逐镜头拆解（{it.result.shots.length} 镜，点击展开）
                    </summary>
                    <table className="w-full text-[10.5px]">
                      <tbody>
                        {it.result.shots.slice(0, 8).map((s, i) => (
                          <tr key={i} className="border-t border-line-soft align-top">
                            <td className="whitespace-nowrap px-2 py-1 font-mono text-brand-700">{s.t}</td>
                            <td className="px-2 py-1 text-ink-700">{s.visual}</td>
                            <td className="whitespace-nowrap px-2 py-1 text-ink-400">{s.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                <div className="grid grid-cols-1 gap-1.5">
                  {it.result.replicate.length > 0 && (
                    <SelectableBlock
                      label={FIELD_LABELS.replicate}
                      checked={selected.has(`${it.id}:replicate`) || introduced.has(`${it.id}:replicate`)}
                      disabled={introduced.has(`${it.id}:replicate`)}
                      introduced={introduced.has(`${it.id}:replicate`)}
                      onToggle={() => toggleField(it.id, 'replicate', !introduced.has(`${it.id}:replicate`))}
                    >
                      <ul className="list-disc space-y-0.5 pl-4">
                        {it.result.replicate.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </SelectableBlock>
                  )}
                  {it.result.risks.length > 0 && (
                    <div className="rounded-md border border-danger-line bg-danger-bg/60 px-2 py-1.5">
                      <div className="text-[10px] font-semibold text-danger-ink mb-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 风险 / 不应照搬
                      </div>
                      <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] leading-snug text-ink-700">
                        {it.result.risks.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* 引入已选结论到优化方向 */}
        {items.some(i => i.status === 'done') && (
          <>
            <button
              type="button"
              onClick={handleInject}
              disabled={selectedCount === 0}
              className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-colors ${
                selectedCount === 0 && injected
                  ? 'bg-ok-bg text-ok-ink border border-ok-line cursor-default'
                  : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {selectedCount > 0
                ? `✅ 引入已选内容到优化方向（${selectedCount} 条结论）`
                : injected
                  ? '已引入（可继续勾选其他结论补充）'
                  : '✅ 引入已选内容到优化方向'}
            </button>
            <p className="text-[10px] text-ink-400 leading-relaxed">
              勾选结论后点上方按钮，内容会追加到左侧方向卡「✏️ 优化迭代」输入框并自动展开，再点「重新生成」即可；AI 会借鉴钩子/节奏/卖点但围绕本商品重写，不照搬原素材。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
