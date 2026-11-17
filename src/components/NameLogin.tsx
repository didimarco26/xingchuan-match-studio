import { useEffect, useState } from 'react';
import { X, User as UserIcon, Check, PencilLine } from 'lucide-react';
import { getUserName, getUserDisplay, setUserName, clearUserName, hasLocalName } from '../lib/user';
import { isGhPages, getGhAuth, clearGhAuth } from '../lib/gh';

// 轻量化登录弹窗：
// - 对内：只需填写一个名字（无密码、无账号体系）
// - 对外 GitHub 版：身份为服务商主账号制（主账号/授权成员），只读展示，可退出重新登录
export default function NameLogin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [current, setCurrent] = useState('');
  const [display, setDisplay] = useState('');
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      const n = getUserName();
      setCurrent(n);
      setDisplay(getUserDisplay());
      setName(n.startsWith('gh::') ? '' : n);
      setEditing(!n);
      setErr('');
    }
  }, [open]);

  if (!open) return null;

  const ghAuthed = isGhPages() && !!getGhAuth();

  const submit = () => {
    const n = name.trim();
    if (!n) { setErr('请填写一个名字，例如 正阳-小陈'); return; }
    if (n.length > 30) { setErr('名字最长 30 个字'); return; }
    setUserName(n);
    onClose();
  };

  const logout = () => {
    clearUserName();
    // 对外版身份来自 GhGate 主账号登录态：退出后回到登录门；对内版只清本地名字
    if (ghAuthed) { clearGhAuth(); window.location.reload(); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[400px] bg-white rounded-[22px] shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h2 className="text-[16px] font-extrabold text-ink-900">{current && !editing ? '当前使用者' : '登录工作台'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#F5F4FB] flex items-center justify-center text-ink-400">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="px-6 pb-6">
          {current && !editing ? (
            <div>
              <div className="mt-3 flex items-center gap-3 p-4 rounded-2xl bg-brand-50/70 border border-brand-100">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-btn shrink-0">
                  <UserIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink-900 truncate">{display || current}</p>
                  <p className="text-[11.5px] text-ink-500 mt-0.5">
                    {ghAuthed
                      ? '服务商账号（主账号/授权成员），云端台账按服务商归并'
                      : `历史记录按该名字归档在本机${hasLocalName() ? '' : '（来自服务商登记名）'}`}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex gap-2.5">
                {!ghAuthed && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex-1 h-11 rounded-xl bg-white border border-[#E2E0F0] text-[13.5px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <PencilLine className="w-4 h-4" /> 切换名称
                  </button>
                )}
                <button
                  type="button"
                  onClick={logout}
                  className={`h-11 rounded-xl bg-white border border-[#E2E0F0] text-[13.5px] font-semibold text-ink-500 hover:border-rose-200 hover:text-rose-600 transition-colors ${ghAuthed ? 'w-full' : 'flex-1'}`}
                >
                  {ghAuthed ? '退出登录' : '退出名称'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed">
                填一个名字即可登录，<b className="text-ink-700">无需密码</b>。你的商品分析、脚本、达人匹配等使用记录会按这个名字保存在本机，方便随时回看。
              </p>
              <div className="mt-4 flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-[#F8F7FE] border border-[#E7E4F8] focus-within:border-brand-300 focus-within:bg-white transition-colors">
                <UserIcon className="w-[18px] h-[18px] text-brand-500 shrink-0" />
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  placeholder="你的名字 / 花名，如 正阳-小陈"
                  maxLength={30}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] text-ink-900 placeholder:text-ink-400"
                />
              </div>
              {err && <p className="mt-2 text-[12px] text-danger-DEFAULT">{err}</p>}
              <button
                type="button"
                onClick={submit}
                className="mt-5 w-full h-11 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[14px] font-bold shadow-btn hover:brightness-105 transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> 登录
              </button>
              <p className="mt-3 text-center text-[11px] text-ink-400">仅保存在本浏览器，不会上传账号信息</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
