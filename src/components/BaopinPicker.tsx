import { useState, useEffect, useMemo } from 'react';
import { X, Search, Package, Loader2, CheckCircle2, ChevronRight } from 'lucide-react';
import { fetchBaopinList, type BaopinItem } from '../lib/baopin';

// ============================================================
// 📦 爆品库引用选择器（商品分析 / 内容脚本 / 达人匹配 均可引用已有爆品）
// 临时实现：满足当前 App 调用契约；如需更丰富版本可在此扩展。
// ============================================================

interface BaopinPickerProps {
  open: boolean;
  context: string;            // 调用场景（展示用）
  agency?: string;            // 对内=当前服务商；对外为空（按登录 token 过滤）
  onSelect: (item: BaopinItem) => void;
  onClose: () => void;
}

const LEVEL_CHIP: Record<string, string> = {
  P0: 'bg-red-600 text-white',
  P1: 'bg-orange-500 text-white',
  P2: 'bg-gray-400 text-white',
};

export default function BaopinPicker({ open, context, agency, onSelect, onClose }: BaopinPickerProps) {
  const [items, setItems] = useState<BaopinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [pickedId, setPickedId] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(''); setKeyword(''); setPickedId('');
    fetchBaopinList(agency)
      .then(d => setItems(d.list))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, agency]);

  const filtered = useMemo(() => {
    const k = keyword.trim();
    return items
      .filter(it => !k || it.name.includes(k))
      .sort((a, b) => b.score - a.score);
  }, [items, keyword]);

  // 按 P0 / P1 / P2 / 其他 分组（搜索时同样分组，便于按优先级挑选）
  const groups = useMemo(() => {
    const g: { key: string; label: string; hint: string; list: BaopinItem[] }[] = [
      { key: 'P0', label: 'P0', hint: '全力押注', list: [] },
      { key: 'P1', label: 'P1', hint: '重点孵化', list: [] },
      { key: 'P2', label: 'P2', hint: '保守观察', list: [] },
      { key: '其他', label: '其他', hint: '未分层', list: [] },
    ];
    for (const it of filtered) {
      const gk = g.find(x => x.key === it.level) || g[g.length - 1];
      gk.list.push(it);
    }
    return g.filter(x => x.list.length > 0);
  }, [filtered]);

  if (!open) return null;

  const pick = (it: BaopinItem) => {
    setPickedId(it.id);
    onSelect(it);
    setTimeout(onClose, 260);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line-soft">
          <Package className="w-4 h-4 text-brand-600" />
          <div>
            <h3 className="text-[13px] font-bold text-ink-900">从爆品库选择商品</h3>
            <p className="text-[10.5px] text-ink-400">{context ? `用于：${context} · ` : ''}选中后自动带入商品名称/链接等信息</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-canvas text-ink-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索商品名"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-line text-xs" />
          </div>
        </div>

        <div className="overflow-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-ink-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在加载爆品库…
            </div>
          )}
          {!loading && error && <div className="text-center text-red-600 text-xs py-12">{error}</div>}
          {!loading && !error && !filtered.length && (
            <div className="text-center text-ink-400 text-xs py-12">爆品库中暂无商品</div>
          )}
          <div className="space-y-3">
            {groups.map(g => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-1.5 px-0.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                    LEVEL_CHIP[g.key] || LEVEL_CHIP.P2}`}>{g.label}</span>
                  <span className="text-[10.5px] text-ink-400">{g.hint}</span>
                  <span className="ml-auto text-[10px] text-ink-300 tabnum">{g.list.length} 件</span>
                </div>
                <div className="space-y-1.5">
                  {g.list.map(it => (
                    <button key={it.id} type="button" onClick={() => pick(it)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition ${
                        pickedId === it.id ? 'border-green-300 bg-green-50' : 'border-line-soft hover:border-brand-300 hover:bg-brand-50/40'}`}>
                      <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                        LEVEL_CHIP[it.level] || LEVEL_CHIP.P2}`}>
                        {it.level || 'P2'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-ink-800 truncate">{it.name}</div>
                        <div className="text-[10.5px] text-ink-400">
                          综合 {it.score} · 推荐分层 {it.level || '未分层'} · 匹配达人 {it.matchCount}{it.industry ? ` · ${it.industry}` : ''}
                        </div>
                      </div>
                      {pickedId === it.id
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
