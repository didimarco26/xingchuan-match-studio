import { useCallback, useEffect, useRef, useState } from 'react';
import { accessApply, accessAdminEnter, accessStatus, accessVerify } from '../lib/api';

// 工作台访问授权门：未授权访客只能看到申请页，授权（7天 token）后才渲染工作台
type GateState = 'boot' | 'form' | 'submitting' | 'waiting' | 'rejected' | 'expired' | 'authed';

const AUTH_KEY = 'xc_gate_auth';
const PENDING_KEY = 'xc_gate_pending';
const POLL_INTERVAL = 6000;

interface AuthInfo {
  token: string;
  exp: number;
  name: string;
  admin?: boolean;
}
interface PendingInfo {
  rid: string;
  name: string;
  org: string;
  at: number;
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景忽略 */
  }
}
function clearStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 55%, #faf5ff 100%)' }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-purple-200/60 border border-purple-100/80 px-7 py-9 sm:px-10">
        {children}
      </div>
    </div>
  );
}

function BrandHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="text-center mb-7">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center text-2xl shadow-lg shadow-purple-300/50">
        🔐
      </div>
      <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
      {sub && <p className="mt-2 text-sm text-gray-500 leading-relaxed">{sub}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('boot');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [pending, setPending] = useState<PendingInfo | null>(null);
  const [notifyHint, setNotifyHint] = useState('');
  const [authedName, setAuthedName] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<PendingInfo | null>(null);

  const enterAuthed = useCallback((auth: AuthInfo) => {
    writeStorage(AUTH_KEY, auth);
    clearStorage(PENDING_KEY);
    setAuthedName(auth.name);
    setState('authed');
  }, []);

  const checkStatus = useCallback(async (info: PendingInfo) => {
    try {
      const d = await accessStatus(info.rid);
      if (d.status === 'approved' && d.token && d.exp) {
        enterAuthed({ token: d.token, exp: d.exp, name: d.name || info.name });
        return true;
      }
      if (d.status === 'rejected') {
        clearStorage(PENDING_KEY);
        setPending(null);
        pendingRef.current = null;
        setState('rejected');
        return true;
      }
      if (d.status === 'expired') {
        clearStorage(PENDING_KEY);
        setPending(null);
        pendingRef.current = null;
        setState('expired');
        return true;
      }
    } catch {
      /* 网络抖动保持等待，下轮继续 */
    }
    return false;
  }, [enterAuthed]);

  const startPolling = useCallback((info: PendingInfo) => {
    pendingRef.current = info;
    setPending(info);
    setState('waiting');
    if (timerRef.current) clearInterval(timerRef.current);
    checkStatus(info);
    timerRef.current = setInterval(() => {
      const cur = pendingRef.current;
      if (cur) checkStatus(cur);
    }, POLL_INTERVAL);
  }, [checkStatus]);

  // 启动：先验本地 token，再恢复待审批状态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = readStorage<AuthInfo>(AUTH_KEY);
      if (auth?.token && auth.exp > Date.now() + 5000) {
        try {
          const d = await accessVerify(auth.token);
          if (!cancelled && d?.rid) {
            setAuthedName(auth.name);
            setState('authed');
            return;
          }
        } catch {
          /* 校验失败落到申请流程 */
        }
      }
      if (auth) clearStorage(AUTH_KEY);
      if (cancelled) return;
      const pend = readStorage<PendingInfo>(PENDING_KEY);
      if (pend?.rid) {
        startPolling(pend);
      } else {
        setState('form');
      }
    })();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingRef.current) checkStatus(pendingRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    const n = name.trim();
    const o = org.trim();
    if (n.length < 2) {
      setErrMsg('请填写真实姓名（至少 2 个字）');
      return;
    }
    if (o.length < 2) {
      setErrMsg('请填写公司 / 来意，方便管理员确认');
      return;
    }
    setErrMsg('');
    setState('submitting');
    try {
      const d = await accessApply(n, o);
      const info: PendingInfo = { rid: d.rid, name: n, org: o, at: Date.now() };
      writeStorage(PENDING_KEY, info);
      setNotifyHint(d.notify === false ? '申请已记录，通知通道待管理员配置，请稍候或联系管理员' : '');
      startPolling(info);
    } catch (e: any) {
      setErrMsg(e?.message || '提交失败，请重试');
      setState('form');
    }
  };

  const handleAdmin = async () => {
    const pass = window.prompt('请输入管理员口令：');
    if (!pass) return;
    try {
      const d = await accessAdminEnter(pass.trim());
      enterAuthed({ token: d.token, exp: d.exp, name: '管理员', admin: true });
    } catch (e: any) {
      window.alert(e?.message || '口令不正确');
    }
  };

  if (state === 'authed') {
    return (
      <>
        {authedName && (
          <div className="fixed top-3 right-3 z-[9999] flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur border border-purple-200 px-3 py-1 text-xs text-purple-700 shadow-sm">
            <span>🪪</span><span>已授权：{authedName}</span>
          </div>
        )}
        {children}
      </>
    );
  }

  if (state === 'boot') {
    return (
      <Shell>
        <div className="text-center py-10">
          <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-gray-400">正在校验访问权限…</p>
        </div>
      </Shell>
    );
  }

  if (state === 'waiting') {
    return (
      <Shell>
        <BrandHead title="申请已提交" sub="管理员通过后本页面将自动进入工作台，无需刷新" />
        <div className="rounded-2xl bg-purple-50/80 border border-purple-100 px-5 py-4 text-sm space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-gray-400 shrink-0">申请人</span>
            <span className="text-gray-800 font-medium text-right">{pending?.name}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-400 shrink-0">公司 / 来意</span>
            <span className="text-gray-800 text-right break-all">{pending?.org}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-violet-700">
            <span className="inline-block w-4 h-4 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            <span>等待管理员授权中…</span>
          </div>
        </div>
        {notifyHint && <p className="mt-3 text-xs text-amber-600 text-center">{notifyHint}</p>}
        <p className="mt-4 text-xs text-gray-400 text-center">
          授权通过后 7 天内访问无需再次申请；如长时间未响应，请直接联系管理员
        </p>
        <button
          onClick={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            clearStorage(PENDING_KEY);
            pendingRef.current = null;
            setPending(null);
            setState('form');
          }}
          className="mt-5 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition"
        >
          信息填错了？重新填写
        </button>
      </Shell>
    );
  }

  if (state === 'rejected' || state === 'expired') {
    return (
      <Shell>
        <BrandHead
          title={state === 'rejected' ? '申请未通过' : '授权已过期'}
          sub={state === 'rejected'
            ? '很遗憾，您的访问申请未获通过。如有疑问请联系管理员，或重新提交申请。'
            : '本次授权已超过 7 天有效期，请重新提交访问申请。'}
        />
        <div className="text-center text-4xl mb-4">{state === 'rejected' ? '🚫' : '⏳'}</div>
        <button
          onClick={() => { setErrMsg(''); setState('form'); }}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-300/50 hover:opacity-95 active:scale-[0.99] transition"
        >
          重新申请访问
        </button>
      </Shell>
    );
  }

  // form / submitting
  return (
    <Shell>
      <BrandHead
        title="星川工作台 · 访问申请"
        sub="本工作台仅对授权用户开放，请提交访问申请，管理员审批通过后自动进入"
      />
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">姓名 <span className="text-red-400">*</span></label>
          <input
            className={inputCls}
            placeholder="您的真实姓名"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">公司 / 来意 <span className="text-red-400">*</span></label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder="例如：广州明日互动 / 代理商同学，需要使用商品分析与达人匹配"
            value={org}
            maxLength={200}
            onChange={(e) => setOrg(e.target.value)}
          />
        </div>
        {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
        <button
          onClick={handleSubmit}
          disabled={state === 'submitting'}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-300/50 hover:opacity-95 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state === 'submitting' && (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {state === 'submitting' ? '正在提交申请…' : '提交访问申请'}
        </button>
      </div>
      <p className="mt-5 text-xs text-gray-400 text-center leading-relaxed">
        提交后管理员会即时收到飞书通知；审批通过后授权 7 天内有效
      </p>
      <div className="mt-6 text-center">
        <button onClick={handleAdmin} className="text-xs text-gray-300 hover:text-gray-400 transition">
          管理员入口
        </button>
      </div>
    </Shell>
  );
}
