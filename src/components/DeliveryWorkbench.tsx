import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, RefreshCw, X, AlertTriangle, ClipboardList, Target,
  Package, Users, ShieldAlert, CheckCircle2, PencilLine, Inbox, Boxes,
} from 'lucide-react';
import {
  deliveryList, deliverySaveTask, deliverySaveRecord, deliveryUpdateRecord,
  searchLocalCreators, priorityFromScore,
  STATUS_LABEL, STATUS_STYLE,
  type DeliveryListData, type DeliveryRecord, type DeliveryTask, type LocalCreator,
} from '../lib/delivery';
import { fetchMyProductList } from '../lib/baopin';

// ---------- 小工具 ----------
const toDtLocal = (ms: number | null): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromDtLocal = (s: string): number | '' => (s ? new Date(s).getTime() : '');
const fmtDate = (ms: number | null | undefined) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtDateTime = (ms: number | null | undefined) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const inputCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const labelCls = 'block text-[11.5px] font-semibold text-gray-600 mb-1';
const selectCls = inputCls + ' appearance-none pr-8';

// ---------- 通用弹窗 ----------
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4.5 h-4.5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------- 达人库联动输入 ----------
function CreatorPicker({
  nickname, creatorId, onPick,
}: {
  nickname: string; creatorId: string;
  onPick: (c: { nickname: string; creatorId: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<LocalCreator[]>([]);
  useEffect(() => {
    if (!open) return;
    setMatches(searchLocalCreators(nickname));
  }, [open, nickname]);
  return (
    <div className="relative">
      <input className={inputCls} value={nickname} placeholder="输入昵称从我的达人库带出"
        onFocus={() => setOpen(true)}
        onChange={e => { onPick({ nickname: e.target.value, creatorId }); setOpen(true); }} />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.length === 0 && <p className="px-3 py-2.5 text-[12px] text-gray-400">达人库无匹配（可先用「服务商达人自助打标」沉淀达人库）</p>}
          {matches.map(c => (
            <button key={c.id || c.name} type="button"
              className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center justify-between gap-2"
              onClick={() => { onPick({ nickname: c.name, creatorId: c.id }); setOpen(false); }}>
              <span className="text-[12.5px] text-gray-800">{c.name}</span>
              <span className="text-[10.5px] text-gray-400 shrink-0">
                {c.sLevel ? `${c.sLevel} · ` : ''}{c.tier || ''}{c.score != null ? ` ${c.score}分` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 新建任务弹窗 ----------
function NewTaskModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [score, setScore] = useState<number | ''>('');
  const [due, setDue] = useState('');
  const [bd, setBd] = useState('');
  const [priority, setPriority] = useState('中');
  const [autoP, setAutoP] = useState(true);
  const [note, setNote] = useState('');
  const [products, setProducts] = useState<{ id?: string; name: string; total: number }[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchMyProductList().then(r => setProducts(r.list)).catch(() => {});
  }, []);
  useEffect(() => {
    if (autoP) {
      const p = priorityFromScore(score === '' ? null : Number(score));
      if (p) setPriority(p);
    }
  }, [score, autoP]);

  const filtered = useMemo(() => {
    const k = product.trim().toLowerCase();
    return products.filter(p => !k || p.name.toLowerCase().includes(k)).slice(0, 7);
  }, [products, product]);

  const submit = async () => {
    if (!name.trim()) { setErr('请填写任务名称'); return; }
    setSaving(true); setErr('');
    try {
      await deliverySaveTask({
        '任务名称': name.trim(), '商品': product.trim(),
        '商品分数': score === '' ? null : Number(score),
        '截止日期': due ? new Date(due).getTime() : null,
        '默认BD负责人': bd.trim(), '任务优先级': priority, '任务备注': note.trim(),
      });
      onSaved();
    } catch (e) { setErr(String((e as Error).message)); } finally { setSaving(false); }
  };

  return (
    <Modal title="新建任务" onClose={onClose} wide>
      <div className="space-y-3.5">
        <div>
          <span className={labelCls}>任务名称 <span className="text-red-500">*</span></span>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="例：秋冬防脱洗发水达人投放" />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="relative">
            <span className={labelCls}>商品（可从我的爆品库带出分数）</span>
            <input className={inputCls} value={product}
              onFocus={() => setOpen(true)}
              onChange={e => { setProduct(e.target.value); setOpen(true); }} placeholder="商品名" />
            {open && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {filtered.map(p => (
                  <button key={p.id ?? p.name} type="button" className="w-full text-left px-3 py-2 hover:bg-brand-50 flex justify-between"
                    onClick={() => { setProduct(p.name); setScore(p.total); setOpen(false); }}>
                    <span className="text-[12px] text-gray-800">{p.name}</span>
                    <span className="text-[11px] text-brand-600 font-semibold">{p.total}分</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-[12px] text-gray-400">爆品库无匹配</p>}
              </div>
            )}
          </div>
          <div>
            <span className={labelCls}>商品分数（商品分析自动带入）</span>
            <input type="number" className={inputCls} value={score}
              onChange={e => setScore(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0-100" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <span className={labelCls}>截止日期</span>
            <input type="date" className={inputCls} value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>默认BD负责人</span>
            <input className={inputCls} value={bd} onChange={e => setBd(e.target.value)} placeholder="BD 姓名" />
          </div>
          <div>
            <span className={labelCls}>任务优先级（按分数自动，可改）</span>
            <select className={selectCls} value={priority}
              onChange={e => { setPriority(e.target.value); setAutoP(false); }}>
              {['高', '中', '低'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className={labelCls}>任务备注</span>
          <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        {err && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}创建任务
          </button>
        </div>
      </div>
    </Modal>
  );
}

const POOL_OPTIONS = ['存量达人', '增量达人', '潜力达人', '服务商自有'];
const TAG_CHIPS = ['已建联', '已确认接单', 'brief 已确认', '已寄样', '已签收', '制作中', '已交付（待验收）', '返工中'];

// ---------- 新增交付记录弹窗 ----------
function NewRecordModal({
  tasks, presetTaskId, onClose, onSaved,
}: {
  tasks: DeliveryTask[]; presetTaskId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [taskId, setTaskId] = useState(presetTaskId || tasks[0]?.task_id || '');
  const task = tasks.find(t => t.task_id === taskId);
  const [pool, setPool] = useState('存量达人');
  const [nickname, setNickname] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [bd, setBd] = useState(task?.['默认BD负责人'] || '');
  const [sla, setSla] = useState<number | ''>(5);
  const [tags, setTags] = useState<string[]>([]);
  const [nextStep, setNextStep] = useState('');
  const [execStatus, setExecStatus] = useState('待执行');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = tasks.find(x => x.task_id === taskId);
    if (t && !bd) setBd(t['默认BD负责人']);
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const submit = async () => {
    if (!taskId) { setErr('请选择挂载任务'); return; }
    if (!nickname.trim()) { setErr('请填写达人昵称'); return; }
    setSaving(true); setErr('');
    try {
      await deliverySaveRecord({
        task_id: taskId, '任务名称': task?.['任务名称'] || '', '商品': task?.['商品'] || '',
        '截止日期': task?.['截止日期'] || null, '供给池': pool,
        '达人昵称': nickname.trim(), '达人ID': creatorId.trim(),
        'BD负责人': bd.trim(), '阶段SLA(天)': sla === '' ? null : Number(sla),
        '过程标签': tags.join('、'), '下一步动作': nextStep.trim(),
        '服务商执单状态': execStatus,
      });
      onSaved();
    } catch (e) { setErr(String((e as Error).message)); } finally { setSaving(false); }
  };

  return (
    <Modal title="新增交付记录" onClose={onClose} wide>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <span className={labelCls}>挂载任务 <span className="text-red-500">*</span></span>
            <select className={selectCls} value={taskId} onChange={e => setTaskId(e.target.value)}>
              {tasks.map(t => <option key={t.task_id} value={t.task_id}>{t['任务名称']}</option>)}
            </select>
          </div>
          <div>
            <span className={labelCls}>供给池</span>
            <select className={selectCls} value={pool} onChange={e => setPool(e.target.value)}>
              {POOL_OPTIONS.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <span className={labelCls}>达人昵称 <span className="text-red-500">*</span>（联动我的达人库）</span>
            <CreatorPicker nickname={nickname} creatorId={creatorId}
              onPick={c => { setNickname(c?.nickname || ''); setCreatorId(c?.creatorId || ''); }} />
          </div>
          <div>
            <span className={labelCls}>达人ID（达人库自动带出，可手改）</span>
            <input className={inputCls} value={creatorId} onChange={e => setCreatorId(e.target.value)} placeholder="星图达人ID" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <span className={labelCls}>BD负责人</span>
            <input className={inputCls} value={bd} onChange={e => setBd(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>阶段SLA(天)</span>
            <input type="number" className={inputCls} value={sla} onChange={e => setSla(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <span className={labelCls}>服务商执单状态</span>
            <select className={selectCls} value={execStatus} onChange={e => setExecStatus(e.target.value)}>
              {['待执行', '执行中', '已完成'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className={labelCls}>初始化过程标签（可多选；系统据此自动映射 S0-S6）</span>
          <div className="flex flex-wrap gap-1.5">
            {TAG_CHIPS.map(t => (
              <button key={t} type="button" onClick={() => toggleTag(t)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] border ${
                  tags.includes(t) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={labelCls}>下一步动作</span>
          <input className={inputCls} value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="例：今日内完成建联并记录触达证明" />
        </div>
        {err && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}添加交付记录
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- BD 标记弹窗 ----------
function BdMarkModal({ record, onClose, onSaved }: { record: DeliveryRecord; onClose: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState(record['过程标签']);
  const [trackNo, setTrackNo] = useState(record['寄样单号']);
  const [signStatus, setSignStatus] = useState(record['签收状态'] || '未寄样');
  const [draftAt, setDraftAt] = useState(toDtLocal(record['初稿提交时间']));
  const [uploadAt, setUploadAt] = useState(toDtLocal(record['正式上传时间']));
  const [accResult, setAccResult] = useState(record['验收结果'] || '待验收');
  const [sla, setSla] = useState<number | ''>(record['阶段SLA(天)'] ?? '');
  const [nextStep, setNextStep] = useState(record['下一步动作']);
  const [execStatus, setExecStatus] = useState(record['服务商执单状态'] || '执行中');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const appendTag = (t: string) => {
    const cur = tags.split(/[,，、;；]+/).map(s => s.trim()).filter(Boolean);
    if (!cur.includes(t)) setTags([...cur, t].join('、'));
  };

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      await deliveryUpdateRecord({
        recordId: record.recordId,
        '过程标签': tags, '寄样单号': trackNo, '签收状态': signStatus,
        '初稿提交时间': fromDtLocal(draftAt), '正式上传时间': fromDtLocal(uploadAt),
        '验收结果': accResult,
        '阶段SLA(天)': sla === '' ? null : Number(sla),
        '下一步动作': nextStep, '服务商执单状态': execStatus,
      });
      onSaved();
    } catch (e) { setErr(String((e as Error).message)); } finally { setSaving(false); }
  };

  return (
    <Modal title={`BD 过程标记 · ${record['达人昵称']}`} onClose={onClose} wide>
      <div className="space-y-3.5">
        <div>
          <span className={labelCls}>过程标签（可点下方快捷标签追加）</span>
          <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TAG_CHIPS.concat(['已归档']).map(t => (
              <button key={t} type="button" onClick={() => appendTag(t)}
                className="px-2 py-0.5 rounded-full text-[11px] border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600">
                + {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <span className={labelCls}>寄样单号</span>
            <input className={inputCls} value={trackNo} onChange={e => setTrackNo(e.target.value)} placeholder="快递单号" />
          </div>
          <div>
            <span className={labelCls}>签收状态</span>
            <select className={selectCls} value={signStatus} onChange={e => setSignStatus(e.target.value)}>
              {['未寄样', '已寄样', '已签收'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <span className={labelCls}>阶段SLA(天)</span>
            <input type="number" className={inputCls} value={sla} onChange={e => setSla(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <span className={labelCls}>初稿提交时间</span>
            <input type="datetime-local" className={inputCls} value={draftAt} onChange={e => setDraftAt(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>正式上传时间</span>
            <input type="datetime-local" className={inputCls} value={uploadAt} onChange={e => setUploadAt(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>验收结果</span>
            <select className={selectCls} value={accResult} onChange={e => setAccResult(e.target.value)}>
              {['待验收', '验收通过', '验收不通过'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <span className={labelCls}>下一步动作</span>
            <input className={inputCls} value={nextStep} onChange={e => setNextStep(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>服务商执单状态</span>
            <select className={selectCls} value={execStatus} onChange={e => setExecStatus(e.target.value)}>
              {['待执行', '执行中', '已完成'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11.5px] text-gray-400">保存后系统自动重算当前状态（S0-S6）、状态进入时间与风险标签，并同步任务总表阶段。</p>
        {err && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}保存并落表
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- 概览卡 ----------
function OverviewCard({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-4.5 h-4.5" /></div>
      <div>
        <p className="text-[11px] text-gray-400 leading-none">{label}</p>
        <p className="text-[20px] font-bold text-gray-900 leading-tight mt-1">{value}</p>
      </div>
    </div>
  );
}

// ---------- 主工作台 ----------
export default function DeliveryWorkbench() {
  const [data, setData] = useState<DeliveryListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [modal, setModal] = useState<'' | 'task' | 'record' | 'mark'>('');
  const [markTarget, setMarkTarget] = useState<DeliveryRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try { setData(await deliveryList()); }
    catch (e) { setErr(String((e as Error).message)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const stats = useMemo(() => {
    if (!data) return null;
    const records = data.records;
    return {
      tasks: data.tasks.length,
      total: records.length,
      risk: records.filter(r => r._risks.length).length,
      waiting: records.filter(r => r._status === 'S5').length,
      archived: records.filter(r => r._status === 'S6').length,
      executing: records.filter(r => !['S6'].includes(r._status)).length,
    };
  }, [data]);

  const shownRecords = useMemo(() => {
    if (!data) return [];
    if (!selectedTaskId) return data.records;
    return data.records.filter(r => r.task_id === selectedTaskId);
  }, [data, selectedTaskId]);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-24 text-gray-400 text-[13px] gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> 正在加载达人交付数据…
    </div>;
  }

  return (
    <div className="space-y-5">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2 mr-auto">
          <ClipboardList className="w-4.5 h-4.5 text-brand-600" /> 达人交付管理
        </h2>
        <button onClick={() => void refresh()} className="px-3 py-2 text-[12.5px] text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
        <button onClick={() => setModal('task')}
          className="px-3.5 py-2 text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />新建任务
        </button>
        <button onClick={() => setModal('record')}
          disabled={!data?.tasks.length}
          className="px-3.5 py-2 text-[12.5px] font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" />新增交付记录
        </button>
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-[12.5px] text-red-700 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />{err}
      </div>}

      {/* 经营概览 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <OverviewCard icon={Target} label="当前任务数" value={stats.tasks} tone="bg-brand-50 text-brand-600" />
          <OverviewCard icon={Inbox} label="总交付单数" value={stats.total} tone="bg-blue-50 text-blue-600" />
          <OverviewCard icon={Boxes} label="执行中" value={stats.executing} tone="bg-cyan-50 text-cyan-600" />
          <OverviewCard icon={ShieldAlert} label="风险单量" value={stats.risk} tone="bg-red-50 text-red-600" />
          <OverviewCard icon={CheckCircle2} label="待验收单量" value={stats.waiting} tone="bg-violet-50 text-violet-600" />
          <OverviewCard icon={Package} label="已归档单量" value={stats.archived} tone="bg-emerald-50 text-emerald-600" />
        </div>
      )}

      {/* 任务总表 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-[13.5px] font-bold text-gray-900">任务总表</h3>
          <span className="text-[11px] text-gray-400">点击任务联动下方交付执行列表</span>
          {selectedTaskId && (
            <button onClick={() => setSelectedTaskId(null)}
              className="ml-auto text-[11.5px] text-brand-600 flex items-center gap-1">
              <X className="w-3 h-3" />清除筛选（看全部 {data?.records.length} 单）
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[900px]">
            <thead>
              <tr className="text-gray-400 text-[11px]">
                {['任务', '商品', '截止', '默认BD', '当前进度', '交付单', '已归档', '待验收', '风险', '协同BD', '阶段', '操作'].map(h =>
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data?.tasks.map(t => {
                const total = t.total ?? 0;
                const pct = total ? Math.round(((t.archived ?? 0) / total) * 100) : 0;
                const active = selectedTaskId === t.task_id;
                return (
                  <tr key={t.task_id}
                    onClick={() => setSelectedTaskId(active ? null : t.task_id)}
                    className={`border-t border-gray-50 cursor-pointer ${active ? 'bg-brand-50/60' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{t['任务名称']}</td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[150px] truncate">{t['商品'] || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(t['截止日期'])}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{t['默认BD负责人'] || '—'}</td>
                    <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10.5px] text-gray-400 tabnum">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 tabnum">{total}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabnum">{t.archived ?? 0}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabnum">{t.waiting ?? 0}</td>
                    <td className="px-3 py-2.5 tabnum">
                      {(t.risk ?? 0) > 0
                        ? <span className="text-red-600 font-semibold">{t.risk}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-[11.5px]">{(t._bds || []).join('、') || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        t['任务状态'] === '已完成' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : t['任务状态'] === '风险' ? 'bg-red-50 text-red-700 border-red-200'
                        : t['任务状态'] === '进行中' ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {t['任务状态'] || '未启动'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setSelectedTaskId(t.task_id); setModal('record'); }}
                        className="text-brand-600 hover:bg-brand-50 px-2 py-1 rounded text-[11.5px] flex items-center gap-1">
                        <Plus className="w-3 h-3" />交付
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!data?.tasks.length && (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400 text-[12.5px]">
                  还没有任务，点击右上角「新建任务」开始
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 交付执行列表 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[13.5px] font-bold text-gray-900">
            交付执行列表 {selectedTaskId && <span className="text-gray-400 font-normal">· 已按任务联动</span>}
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {shownRecords.map(r => (
            <div key={r.recordId} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11.5px] border ${STATUS_STYLE[r._status]}`}>
                {r._statusLabel || STATUS_LABEL[r._status]}
              </span>
              <div className="min-w-[140px]">
                <p className="text-[13px] font-semibold text-gray-900">{r['达人昵称']}</p>
                <p className="text-[10.5px] text-gray-400">{r['达人ID'] || '无ID'} · {r['供给池']}</p>
              </div>
              <div className="text-[11.5px] text-gray-500 min-w-[130px]">
                <p>{r['任务名称']}</p>
                <p className="text-gray-400">进入状态 {fmtDateTime(r['状态进入时间'])}</p>
              </div>
              {r['过程标签'] && (
                <span className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 max-w-[220px] truncate">
                  {r['过程标签']}
                </span>
              )}
              {r['下一步动作'] && (
                <span className="text-[11.5px] text-gray-500 max-w-[220px] truncate">
                  下一步：{r['下一步动作']}
                </span>
              )}
              {r._risks.length > 0 ? (
                <span className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{r._risks.join('、')}
                </span>
              ) : null}
              <span className="ml-auto shrink-0">
                <button onClick={() => { setMarkTarget(r); setModal('mark'); }}
                  className="px-3 py-1.5 text-[12px] font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 flex items-center gap-1.5">
                  <PencilLine className="w-3.5 h-3.5" />BD标记
                </button>
              </span>
            </div>
          ))}
          {!shownRecords.length && (
            <div className="px-4 py-10 text-center text-gray-400 text-[12.5px] flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              {selectedTaskId ? '该任务下暂无交付记录，可在任务总表点「交付」新增' : '暂无交付记录，点「新增交付记录」开始'}
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      {modal === 'task' && <NewTaskModal onClose={() => setModal('')} onSaved={() => { setModal(''); void refresh(); }} />}
      {modal === 'record' && data && (
        <NewRecordModal tasks={data.tasks} presetTaskId={selectedTaskId || undefined}
          onClose={() => setModal('')} onSaved={() => { setModal(''); void refresh(); }} />
      )}
      {modal === 'mark' && markTarget && (
        <BdMarkModal record={markTarget} onClose={() => { setModal(''); setMarkTarget(null); }}
          onSaved={() => { setModal(''); setMarkTarget(null); void refresh(); }} />
      )}
    </div>
  );
}
