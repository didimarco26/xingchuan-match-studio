import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Globe, Building2, Phone, ShieldCheck, XCircle, Loader2, Lock, ChevronDown,
  Users, KeyRound, StickyNote, Crown, Clock,
} from 'lucide-react';
import {
  isGhPages, getGhAuth, saveGhAuth, clearGhAuth,
  getGhPending, saveGhPending, clearGhPending,
  ghAccessStatus, GH_APP_TITLE, GH_ACCESS_CLOSED,
  pmGetProviderList, pmLoginProvider, pmApplyAccount, pmIsLoginSuccess,
  ghTrackLogin,
  type ProviderInfo,
} from '../lib/gh';
import { isDemoMode } from '../lib/demo';

// 封锁页：GitHub 版暂停对外开放时展示（无申请入口、不渲染工作台）
function ClosedGate() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#FFFFFF] to-[#F3F3FA] px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-[22px] shadow-[0_24px_70px_-24px_rgba(124,92,255,0.4)] border border-[#ECEAF6] p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F3F1FE] flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-brand-500" />
        </div>
        <div className="text-lg font-bold text-ink-900 mb-2">星川决策工作台 · 暂未开放</div>
        <div className="text-sm text-ink-500 leading-relaxed">
          工作台正在升级维护，开放时间请留意服务商群通知。
        </div>
      </div>
    </div>
  );
}

function BootScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-[#FFFFFF] to-[#F3F3FA]">
      <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
    </div>
  );
}

// 待审批等待页（每 6s 轮询；审批通过自动进入，拒绝自动切拒绝页）
function WaitingView({ agency, phone, onRefresh, onCancel, refreshing, hint }: {
  agency: string; phone?: string; onRefresh: () => void; onCancel: () => void;
  refreshing?: boolean; hint?: string;
}) {
  const masked = phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '';
  return (
    <div className="w-full max-w-md bg-white rounded-[22px] shadow-[0_24px_70px_-24px_rgba(124,92,255,0.35)] border border-[#ECEAF6] p-8 text-center">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-4" />
      <div className="text-lg font-bold text-ink-900 mb-2">申请已提交，等待审批…</div>
      <div className="text-sm text-ink-500 mb-5">
        {agency ? `服务商「${agency}」` : ''}{masked ? ` · ${masked}` : ''}
        <br />审批通过后将自动进入，无需重复提交
      </div>
      {hint && <div className="mb-3 text-[11.5px] text-amber-600">{hint}</div>}
      <button onClick={onRefresh} disabled={refreshing}
        className="text-xs text-brand-500 hover:text-brand-600 disabled:opacity-60">
        {refreshing ? '正在检查…' : '立即刷新状态'}
      </button>
      <div className="mt-6 border-t border-[#F1EFFA] pt-4">
        <button onClick={onCancel}
          className="text-xs text-ink-400 hover:text-rose-500 transition-colors">
          取消申请，返回登录
        </button>
      </div>
    </div>
  );
}

function RejectedView({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="w-full max-w-md bg-white rounded-[22px] shadow-[0_24px_70px_-24px_rgba(255,120,90,0.30)] border border-[#F7E4DE] p-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-[#FEF1EE] flex items-center justify-center mb-4">
        <XCircle className="w-7 h-7 text-[#F26B4C]" />
      </div>
      <div className="text-lg font-bold text-ink-900 mb-2">申请未通过</div>
      <div className="text-sm text-ink-500 leading-relaxed mb-6">
        {reason || '审批未通过，如有疑问请联系渠道经理'}
      </div>
      <button onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition">
        重新填写申请
      </button>
    </div>
  );
}

function ExpiredView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="w-full max-w-md bg-white rounded-[22px] shadow-[0_24px_70px_-24px_rgba(124,92,255,0.35)] border border-[#ECEAF6] p-8 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F3F1FE] flex items-center justify-center mb-4">
        <Clock className="w-7 h-7 text-brand-500" />
      </div>
      <div className="text-lg font-bold text-ink-900 mb-2">申请已过期</div>
      <div className="text-sm text-ink-500 leading-relaxed mb-6">超过 7 天未审批，请重新提交申请</div>
      <button onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition">
        重新申请
      </button>
    </div>
  );
}

// GitHub Pages 版访问门禁 · 服务商主账号制
// 登录四栏：服务商登录帐号（下拉）/ 服务商主账号（本人手机号）/ 登陆密码（默认手机后6位）/ 备注（选填）
// 分支：A 无主账号→申请注册；B 主账号本人→直接登录（7天免登）；C 非主账号→联系主账号授权/提交申请
// 内站（aime-app.bytedance.net）下 isGhPages()=false，直接透传 children，零影响。
type GateState = 'boot' | 'form' | 'submitting' | 'waiting' | 'rejected' | 'expired' | 'authed';
type BranchHint = '' | 'need_register' | 'need_apply';

const POLL_INTERVAL = 6000;
const PENDING_TTL_MS = 7 * 864e5; // 本地申请记录最长保留 7 天，超期按「申请已过期」处理

const inputCls =
  'w-full rounded-xl border border-[#E4E1F4] bg-[#FAFAFE] pl-9 pr-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100';
const selectCls =
  'w-full appearance-none rounded-xl border border-[#E4E1F4] bg-[#FAFAFE] pl-9 pr-9 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100';

export default function GhGate({ children }: { children: ReactNode }) {
  // 🎬 演示模式开启时绕过登录门禁，直接透传
  const enabled = isGhPages() && !isDemoMode();
  const [state, setState] = useState<GateState>(enabled ? 'boot' : 'authed');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [agency, setAgency] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [branch, setBranch] = useState<BranchHint>('');
  const [err, setErr] = useState('');
  const [authedName, setAuthedName] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [waitHint, setWaitHint] = useState('');          // 等待页网络异常等提示
  const [refreshing, setRefreshing] = useState(false);   // 手动「立即刷新」进行中
  const waitStartRef = useRef<number>(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualPollRef = useRef<() => void>(() => {});

  const loadProviders = useRef(async () => {
    try { setProviders(await pmGetProviderList()); } catch { setProviders([]); }
  });

  useEffect(() => {
    if (!enabled || GH_ACCESS_CLOSED) return;
    void loadProviders.current();
    try {
      const existing = getGhAuth();
      if (existing) { setAuthedName(existing.name); setState('authed'); return; }
      const pending = getGhPending();
      if (pending) {
        setAgency(pending.agency || ''); setPhone(pending.phone || '');
        setState('waiting');
        return;
      }
      setState('form');
    } catch {
      setState('form');
    }
  }, [enabled]);

  // 待审批轮询（沿用 gh_access_status：approved 时服务端直接签发 token）
  useEffect(() => {
    if (!enabled || state !== 'waiting') return;
    waitStartRef.current = Date.now();
    setWaitHint('');
    const pending = getGhPending();
    const rid = pending?.rid;
    if (!rid) { setState('form'); return; }
    // 客户端兜底：本地申请记录超过 7 天直接按过期处理（服务端台账缺失时也能自救）
    if (pending.at && Date.now() - pending.at > PENDING_TTL_MS) {
      clearGhPending();
      setState('expired');
      return;
    }

    // 服务端明确否定（申请不存在/已失效）→ 终止等待；网络类错误 → 继续轮询
    const isTerminalMsg = (m?: string) =>
      !!m && /不存在|失效|过期|无效|not\s*found|invalid|expired/i.test(m);
    const isNetworkMsg = (m?: string) =>
      !!m && /网络|超时|服务返回异常|abort|failed|fetch|断开|http/i.test(m);

    const poll = async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const r = await ghAccessStatus(rid);
        if (r.status === 'approved' && r.token) {
          saveGhAuth({
            token: r.token, exp: r.exp || Date.now() + 7 * 864e5,
            name: r.name || pending?.name || '', agency: r.agency || pending?.agency || '', phone: r.phone || pending?.phone || '',
            role: r.role === 'master' ? 'master' : (r.role === 'member' ? 'member' : undefined),
          });
          clearGhPending();
          setAuthedName(r.name || pending?.name || '');
          setState('authed');
          ghTrackLogin(); // 审批通过进入 = 登录成功，全量登记一条（异步不阻塞）
        } else if (r.status === 'rejected') {
          clearGhPending();
          setRejectReason(r.reason || '');
          setState('rejected');
        } else if (r.status === 'expired') {
          clearGhPending();
          setState('expired');
        } else if (isTerminalMsg(r.error)) {
          // 申请记录在服务端已不存在（台账清理/记录失效）：清掉本地 pending，回登录页
          clearGhPending();
          setErr('该申请记录已失效或不存在，请直接登录或重新提交申请');
          setState('form');
        } else {
          setWaitHint(isNetworkMsg(r.error) ? '网络异常，仍在自动重试…' : '');
        }
      } finally {
        if (manual) setRefreshing(false);
      }
    };
    manualPollRef.current = () => { void poll(true); };
    void poll();
    timer.current = setInterval(() => { void poll(); }, POLL_INTERVAL);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [enabled, state]);

  // 等待页「取消申请，返回登录」：清掉本地 pending，保留已填服务商/手机号
  const cancelWaiting = () => {
    clearGhPending();
    setWaitHint('');
    setState('form');
  };

  const resetForm = () => {
    setAgency(''); setPhone(''); setPassword(''); setNote(''); setErr(''); setRejectReason(''); setBranch('');
  };

  const isInternal = agency === '内部人员';
  const validPhone = /^1[3-9]\d{9}$/.test(phone);

  // 主按钮：默认走登录；命中 need_register/need_apply 后走对应申请
  const submit = async () => {
    const a = agency.trim();
    const ph = phone.trim();
    const pw = password.trim();
    const nt = note.trim();
    if (!a) { setErr('请选择服务商'); return; }
    if (!isInternal && !validPhone) { setErr('请填写正确的 11 位手机号'); return; }
    if (pw.length < 6) { setErr('请填写登录密码（默认手机号后 6 位）'); return; }
    setErr('');
    // 分支申请模式
    if (branch === 'need_register' || branch === 'need_apply') {
      setState('submitting');
      try {
        const kind = branch === 'need_register' ? 'master' : 'member';
        const r = await pmApplyAccount(kind, a, ph, pw, nt);
        if (r.rid) {
          try { saveGhPending({ rid: r.rid, name: nt, agency: a, phone: ph, at: Date.now() }); } catch { /* noop */ }
          setState('waiting');
        } else setState('form');
      } catch (e) {
        setErr(String(e)); setState('form');
      }
      return;
    }
    // 登录验证
    setState('submitting');
    try {
      const d = await pmLoginProvider(a, ph, pw, nt);
      if (pmIsLoginSuccess(d)) {
        try {
          saveGhAuth({ token: d.token, exp: d.exp, name: d.name, agency: d.agency, phone: ph, role: d.role });
        } catch { /* 存储不可用也放行 */ }
        clearGhPending();
        setAuthedName(d.name);
        setState('authed');
        ghTrackLogin(); // 账号密码登录成功，全量登记一条（异步不阻塞）
        return;
      }
      if (d.type === 'pending') {
        try { saveGhPending({ rid: d.rid, name: nt, agency: a, phone: ph, at: Date.now() }); } catch { /* noop */ }
        setState('waiting');
        return;
      }
      if (d.type === 'rejected') { setRejectReason(d.reason || ''); setState('rejected'); return; }
      if (d.type === 'need_register' || d.type === 'need_apply') { setBranch(d.type); setState('form'); return; }
    } catch (e) {
      setErr(String(e));
    }
    setState('form');
  };

  if (enabled && GH_ACCESS_CLOSED) return <ClosedGate />;
  if (!enabled || state === 'authed') return <>{children}</>;

  const selectedProv = providers.find(p => p.name === agency);
  const buttonLabel = branch === 'need_register' ? '申请注册为主账号'
    : branch === 'need_apply' ? '提交授权申请' : '登 录';

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(900px 380px at 50% -60px, rgba(124,92,255,0.10), transparent 70%), linear-gradient(180deg,#FFFFFF 0%,#F7F7FC 45%,#F3F3FA 100%)' }}>

      {state === 'boot' && <BootScreen />}
      {state === 'waiting' && <WaitingView agency={agency} phone={phone} refreshing={refreshing} hint={waitHint} onRefresh={() => manualPollRef.current?.()} onCancel={cancelWaiting} />}
      {state === 'rejected' && <RejectedView reason={rejectReason} onRetry={resetForm} />}
      {state === 'expired' && <ExpiredView onRetry={resetForm} />}

      {state !== 'boot' && state !== 'waiting' && state !== 'rejected' && state !== 'expired' && (
        <div className="w-full max-w-md bg-white rounded-[22px] shadow-[0_24px_70px_-24px_rgba(124,92,255,0.35)] border border-[#ECEAF6] p-7">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <div className="text-base font-bold text-ink-900 leading-tight">{GH_APP_TITLE} · 登录</div>
              <div className="text-[11px] text-ink-400">主账号制 · 登录后 7 天内免登</div>
            </div>
          </div>

          <div className="h-px bg-[#F1EFFA] my-4" />

          {/* 1. 服务商登录帐号 */}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-brand-400" />服务商登录帐号
            </span>
            <div className="relative">
              <Building2 className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select value={agency}
                onChange={(e) => { setAgency(e.target.value); setBranch(''); setErr(''); }}
                className={selectCls}>
                <option value="">请选择服务商（22 家）</option>
                {providers.filter(p => !p.internal).map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
                <option value="内部人员">内部人员（测试）</option>
              </select>
              <ChevronDown className="w-4 h-4 text-ink-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

          {/* 2. 服务商主账号 */}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-brand-400" />服务商主账号
            </span>
            <div className="relative">
              <Phone className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={phone} inputMode="numeric" maxLength={11}
                disabled={isInternal}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setPhone(v);
                  setBranch(''); setErr('');
                  // 默认密码=手机号后 6 位，自动填充
                  if (v.length === 11) setPassword(v.slice(-6));
                }}
                placeholder={isInternal ? '内部人员无需填写手机号' : '填写本人 11 位手机号'}
                className={inputCls} />
            </div>
          </label>

          {/* 3. 登陆密码 */}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-brand-400" />登陆密码
              <span className="font-normal text-ink-400">（默认=手机号后 6 位）</span>
            </span>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={password} inputMode="numeric" maxLength={12}
                onChange={(e) => { setPassword(e.target.value.replace(/\D/g, '').slice(0, 12)); setErr(''); }}
                placeholder="输入登录密码"
                className={inputCls} />
            </div>
          </label>

          {/* 4. 申请人姓名 */}
          <label className="block mb-1">
            <span className="text-xs font-semibold text-ink-700 mb-1.5 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-brand-400" />申请人姓名
              <span className="font-normal text-ink-400">（选填：本人姓名/职位，供审批参考）</span>
            </span>
            <div className="relative">
              <StickyNote className="w-4 h-4 text-brand-400 absolute left-3 top-3 pointer-events-none" />
              <textarea value={note} rows={2}
                onChange={(e) => { setNote(e.target.value.slice(0, 60)); setErr(''); }}
                placeholder="如：张三 · 投放负责人"
                className={inputCls.replace('py-2.5', 'py-2').replace('pl-9', 'pl-9 resize-none')} />
            </div>
          </label>

          {selectedProv && !isInternal && (
            <div className={'mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ' +
              (selectedProv.hasMaster ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
              {selectedProv.hasMaster
                ? '该服务商已有主账号：主账号本人可直接登录；其他成员请联系主账号获取授权。'
                : '该服务商尚无主账号：填好后点「申请注册」，审批通过即成为唯一主账号。'}
            </div>
          )}

          {branch === 'need_apply' && (
            <div className="mt-2 rounded-lg bg-orange-50 text-orange-700 px-3 py-2 text-[11px] leading-relaxed flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>该服务商已有主账号，请联系主账号获取授权后登录；也可点下方「提交授权申请」，由内部协助通知主账号审批。</span>
            </div>
          )}
          {branch === 'need_register' && (
            <div className="mt-2 rounded-lg bg-amber-50 text-amber-700 px-3 py-2 text-[11px] leading-relaxed flex items-start gap-1.5">
              <Crown className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>确认提交后，你将申请成为「{agency}」唯一主账号，审批通过即可登录并管理本服务商成员。</span>
            </div>
          )}

          {err && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />{err}
            </div>
          )}

          <button onClick={submit} disabled={state === 'submitting'}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white transition">
            {state === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {buttonLabel}
          </button>
        </div>
      )}
    </div>
  );
}
