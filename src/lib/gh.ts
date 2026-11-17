import { FAAS_URL } from './api';
import { MATCH_ONLY } from '../match-only';

// GitHub Pages 公开版工作台：访问授权 + 使用追踪 + 历史记录
// 仅在 GitHub Pages 域名（或本地强制开关）下启用；内站（aime-app.bytedance.net）下所有函数静默 no-op。
const AUTH_KEY = 'xc_gh_auth';
const PENDING_KEY = 'xc_gh_pending';
const FORCE_KEY = 'xc_gh_force';

// GitHub 公开版访问总开关：false = 开放（正常走「授权申请 → 飞书审批 → 7天免审」流程）；
// 如需再次临时关闭，改为 true 并重新部署即可显示「暂未开放」封锁页。
export const GH_ACCESS_CLOSED = false;

export interface GhAuthInfo {
  token: string;
  exp: number;
  name: string;
  agency?: string;  // 服务商登录简称
  phone?: string;   // 本人手机号
  role?: 'master' | 'member';  // 主账号 / 已授权成员
}
export interface GhPendingInfo {
  rid: string;
  name: string;
  agency?: string;
  phone?: string;
  at: number;
}
export interface GhHistoryItem {
  id: string;
  name: string;
  time: number;        // ms epoch
  feature: string;
  product: string;
  inputSummary: string;
  outputSummary: string;
}

// 是否启用 GitHub 版授权/追踪：github.io 域名，或本地强制开关（localStorage xc_gh_force=1 / URL ?ghgate=1）
export function isGhPages(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const host = (window.location.hostname || '').toLowerCase();
    if (host.includes('github.io')) return true;
    if (host.includes('xingchuan-advisor.surge.sh')) return true; // 备用公开域名也启用
    if (localStorage.getItem(FORCE_KEY) === '1') return true;
    if (new URLSearchParams(window.location.search).get('ghgate') === '1') return true;
    return false;
  } catch {
    return false;
  }
}

// 是否运行在「真实的对外公开域名」（github.io / surge.sh）——只看 host，不受本地调试开关影响。
// 专用于对内专属功能的显隐判断：对内域名（aime-app.bytedance.net）/本机调试下恒为 false，
// 确保对内入口不会因 localStorage xc_gh_force 或 ?ghgate=1 公开版预览开关而消失。
export function isPublicHost(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const host = (window.location.hostname || '').toLowerCase();
    return host.includes('github.io') || host.includes('xingchuan-advisor.surge.sh');
  } catch {
    return false;
  }
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStorage(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 隐私模式等 */ }
}
function removeStorage(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function getGhAuth(): GhAuthInfo | null {
  const a = readStorage<GhAuthInfo>(AUTH_KEY);
  if (!a || !a.token || !a.exp) return null;
  if (Date.now() > a.exp - 30_000) return null; // 过期（留 30s 冗余）
  return a;
}
export function saveGhAuth(a: GhAuthInfo) { writeStorage(AUTH_KEY, a); }
export function clearGhAuth() { removeStorage(AUTH_KEY); }
export function getGhPending(): GhPendingInfo | null { return readStorage<GhPendingInfo>(PENDING_KEY); }
export function saveGhPending(p: GhPendingInfo) { writeStorage(PENDING_KEY, p); }
export function clearGhPending() { removeStorage(PENDING_KEY); }
// 当前已授权使用者名称（未授权返回空）
export function getGhName(): string {
  return getGhAuth()?.name || '';
}

async function ghPost<T = any>(stage: string, payload: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, ...payload }),
      signal: controller.signal,
    });
    const body = await resp.json().catch(() => null);
    // 非 2xx 时优先透传服务端 JSON 里的具体原因（如 404「申请不存在」），
    // 否则门禁只能看到笼统的「HTTP 404」，无法把永久失效与网络抖动区分开
    if (!resp.ok) {
      if (body && typeof body.error === 'string') throw new Error(body.error);
      throw new Error(`服务返回异常（HTTP ${resp.status}）`);
    }
    if (!body) throw new Error('服务返回异常（响应为空）');
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

interface GhResp<T> { ok: boolean; data?: T; error?: string; duplicated?: boolean; }

// 旧版登记提交（保留兼容）：服务商名称+姓名+手机号；新账号 pending（等审批），已批准 approved+token，已拒绝 rejected
export async function ghAccessApply(agency: string, name: string, phone: string): Promise<GhStatusData & { error?: string }> {
  try {
    const body = await ghPost<GhResp<GhStatusData>>('gh_access_apply', {
      agency: agency.trim(), name: name.trim(), phone: phone.trim(),
    }, 20_000);
    if (body.ok && body.data?.status) return body.data;
    return { status: 'pending', error: body.error || '网络异常，提交失败，请稍后重试' };
  } catch (e) {
    return { status: 'pending', error: String((e as Error)?.message || e) };
  }
}

export interface GhStatusData {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rid?: string;
  name?: string;
  agency?: string;
  phone?: string;
  reason?: string;  // 管理员拒绝理由（rejected 时回传，展示给申请人）
  token?: string;
  exp?: number;
  role?: 'master' | 'member';  // 主账号制：主账号注册/成员申请批准后签发的角色
  error?: string;  // 查询失败原因（如「申请不存在」），门禁据此区分「永久失效」与「网络抖动」
}
export async function ghAccessStatus(rid: string): Promise<GhStatusData> {
  try {
    const body = await ghPost<GhResp<GhStatusData>>('gh_access_status', { rid }, 20_000);
    if (body.ok && body.data) return body.data;
    // 服务端明确查无此申请（台账清理/记录失效）：透传错误，门禁按失效处理，避免永久卡在等待页
    return { status: 'pending', error: body.error || '申请状态查询失败' };
  } catch (e) {
    // 网络抖动 / 超时：仍报 pending + error，门禁继续轮询
    return { status: 'pending', error: String((e as Error)?.message || e) };
  }
}

export async function ghGetHistory(token: string): Promise<GhHistoryItem[]> {
  const body = await ghPost<GhResp<{ items: GhHistoryItem[] }>>('gh_get_history', { token }, 20_000);
  if (body.ok && body.data?.items) return body.data.items;
  throw new Error(body.error || '历史记录加载失败');
}

// 使用埋点扩展信息（可选）：完整原文/全量输入/脚本全文/达人完整名单
// 台账要求全量留痕：这些字段不再做摘要截断，由 FaaS 侧做 9 万字兜底上限
export interface GhTrackExtra {
  /** 从输入中抽取出的可点击商品链接（FaaS 会再次正则抽取） */
  productUrl?: string;
  /** 服务商粘贴的完整链接 / 抖音分享文案原文 */
  rawInput?: string;
  /** 服务商填写的全部输入项（JSON 字符串，全量） */
  fullInput?: string;
  /** 内容脚本：三个方向的脚本全文 */
  scripts?: string;
  /** 匹配/导出的达人总数 */
  creatorCount?: number;
  /** 达人完整名单（换行分隔，含库别/粉丝量/匹配分/达人ID） */
  creators?: string;

  // —— 商品分析记录 ——
  /** 品牌（单列） */
  brand?: string;
  /** 卖点（单列） */
  sellingPoints?: string;
  /** 目标人群（单列） */
  audience?: string;
  /** 打分总分 */
  scoreTotal?: number;
  /** 各维度得分（文本，如 投放预算 20/25；ROI 22/25…） */
  scoreDims?: string;
  /** 适配层级 */
  scoreLevel?: string;
  /** 分析结论全文（红线/策略/风险/优化建议/总评） */
  scoreConclusion?: string;
  /** 输出全量 JSON（评分结果等结构化输出） */
  outputJson?: string;

  // —— 内容脚本迭代链路 ——
  /** 迭代类型：初次生成/自定义优化/热点优化/千川爆款拆解优化 */
  iterType?: '初次生成' | '自定义优化' | '热点优化' | '千川爆款拆解优化';
  /** 迭代轮次（初次=0，之后 1/2/3…） */
  iterRound?: number;
  /** 本轮优化输入（用户提的优化需求原文） */
  iterInput?: string;
  /** 参考星川爆款品牌（完整列表） */
  refBrands?: string;
  /** 参考爆款钩子（完整列表） */
  refHooks?: string;

  // —— 达人匹配迭代链路 ——
  /** 匹配记录类型：达人匹配/优化重匹配/达人导出/星图达人推荐/潜力星川推荐/KOC契合度论证 */
  matchType?: '达人匹配' | '优化重匹配' | '达人导出' | '星图达人推荐' | '潜力星川推荐' | 'KOC契合度论证';
  /** 匹配轮次（第几次优化） */
  matchRound?: number;
  /** 本轮调整说明（用户改了什么条件） */
  adjustNote?: string;

  // —— Brief 拆解层（gen_brief）——
  /** gen_brief 产出的 3-5 条 Brief 方向全量（JSON/格式化文本） */
  briefs?: string;
  /** 用户实际勾选的 Brief 方向名称（/ 分隔） */
  selectedBriefs?: string;

  // —— 迭代链 ——
  /** 关联上一条记录ID（追踪完整迭代链） */
  parentId?: string;
}

// 使用埋点（fire-and-forget，不影响主流程）；未启用/未授权/失败均静默。
// 返回服务端落库记录ID（Promise，可能为 undefined），用于串联「关联上一条记录ID」迭代链。
export function ghTrack(feature: string, product: string, inputSummary: string, outputSummary: string, extra?: GhTrackExtra): Promise<string | undefined> {
  const noop = async () => undefined;
  try {
    if (!isGhPages()) return noop();
    const auth = getGhAuth();
    if (!auth) return noop();
    const payload: Record<string, unknown> = {
      token: auth.token,
      name: auth.name,
      feature: String(feature || '').slice(0, 30),
      product: String(product || ''),
      inputSummary: String(inputSummary || ''),
      outputSummary: String(outputSummary || ''),
    };
    const strKeys: (keyof GhTrackExtra)[] = [
      'productUrl', 'rawInput', 'fullInput', 'scripts', 'creators',
      'brand', 'sellingPoints', 'audience', 'scoreDims', 'scoreLevel', 'scoreConclusion', 'outputJson',
      'iterType', 'iterInput', 'refBrands', 'refHooks', 'matchType', 'adjustNote', 'parentId',
      'briefs', 'selectedBriefs',
    ];
    for (const k of strKeys) {
      const v = extra?.[k];
      if (v != null && String(v) !== '') payload[k] = String(v);
    }
    if (Number.isFinite(extra?.scoreTotal)) payload.scoreTotal = extra!.scoreTotal;
    if (Number.isFinite(extra?.creatorCount) && (extra!.creatorCount as number) >= 0) {
      payload.creatorCount = Math.min(Math.round(extra!.creatorCount as number), 1000000);
    }
    if (Number.isFinite(extra?.iterRound) && (extra!.iterRound as number) >= 0) payload.iterRound = Math.round(extra!.iterRound as number);
    if (Number.isFinite(extra?.matchRound) && (extra!.matchRound as number) >= 0) payload.matchRound = Math.round(extra!.matchRound as number);
    return ghPost<GhResp<{ id?: string }>>('gh_track_event', payload, 30_000)
      .then(b => (b.ok ? b.data?.id : undefined))
      .catch(() => undefined);
  } catch {
    return noop();
  }
}

// ============ 全量登录留痕 ============
/**
 * 登录成功后登记一条「登录记录」（fire-and-forget，绝不阻塞登录流程）。
 * 仅对外版启用；服务商/账号/账号类型由 FaaS 从登录 token 内签名信息提取，前端无需也无法伪造。
 * 每次登录（含 7 天内再次主动登录）都记一条，不做任何去重。
 */
export function ghTrackLogin(): void {
  try {
    if (!isGhPages()) return;
    const auth = getGhAuth();
    if (!auth?.token) return;
    void ghPost<GhResp<{ recordId?: string }>>('track_login', { token: auth.token }, 15_000)
      .catch(() => undefined);
  } catch { /* 留痕永不影响登录 */ }
}

// ============ 服务商达人打标：结果自动上云 + 绑定登录账号 + 历史再下载 ============
/** 打标完成后回传完整结果（全量达人+全字段，绑定服务商账号） */
export async function ghTaggerUpload(payload: {
  fileName: string; total: number; foundCount: number;
  summary: Record<string, number>; inputInfo?: string; results: unknown[];
}): Promise<string | undefined> {
  try {
    const auth = getGhAuth();
    if (!auth || !isGhPages()) return undefined;
    const body = await ghPost<GhResp<{ rid?: string }>>('tagger_record', {
      source: 'GitHub公开版',
      token: auth.token,
      name: auth.name,
      fileName: payload.fileName,
      total: payload.total,
      foundCount: payload.foundCount,
      summary: payload.summary || {},
      inputInfo: payload.inputInfo || '',
      results: payload.results || [],
    }, 60_000);
    return body?.ok ? body.data?.rid : undefined;
  } catch {
    return undefined;
  }
}

export interface GhTaggerHistItem {
  rid: string;
  fileName: string;
  at: string;          // 展示时间
  ts: number;
  total: number;       // 上传达人数量
  foundCount: number;  // 打标完成达人数量
  status?: string;     // 批次状态：进行中/已完成
  summary: Record<string, number>;
  hasSource?: boolean; // 台账是否已挂原始上传文件
  hasResult?: boolean; // 台账是否已挂打标结果文件
}
/** 拉取当前登录账号的打标历史（只回列表摘要，不含全量结果） */
export async function ghTaggerMyHistory(): Promise<GhTaggerHistItem[]> {
  const auth = getGhAuth();
  if (!auth) throw new Error('未登录');
  const body = await ghPost<GhResp<{ records?: GhTaggerHistItem[] }>>('tagger_my_records', { token: auth.token }, 30_000);
  if (!body.ok) throw new Error(body.error || '历史加载失败');
  return body.data?.records || [];
}
/** 下载某条历史打标的全量结果（校验归属本人账号） */
export async function ghTaggerDownload(rid: string): Promise<{ fileName: string; results: any[] }> {
  const auth = getGhAuth();
  if (!auth) throw new Error('未登录');
  const body = await ghPost<GhResp<{ fileName?: string; results?: any[] }>>('tagger_get_record', { token: auth.token, rid }, 30_000);
  if (!body.ok) throw new Error(body.error || '下载失败');
  return { fileName: body.data?.fileName || '', results: Array.isArray(body.data?.results) ? body.data!.results! : [] };
}

export interface GhTaggerBatchResp { rid?: string; saved?: number; total?: number; status?: string }
/**
 * 逐条实时上云：打标过程中每完成一位达人即增量上报。
 * 同一 batchId 服务端按达人ID/名称幂等去重合并，乱序/重试/断网补传都安全；
 * finished=true 或 saved>=total 时批次置「已完成」。返回服务端权威已保存条数。
 */
export async function ghTaggerBatchUpsert(payload: {
  batchId: string; fileName: string; total: number;
  results: unknown[]; finished?: boolean;
  sourceFileToken?: string;  // 原始名单附件 file_token（建记录/首次上云时带入）
  resultFileToken?: string;  // 打标结果 CSV 附件 file_token（完成时带入，兜底用）
}): Promise<GhTaggerBatchResp> {
  const auth = getGhAuth();
  if (!auth || !isGhPages()) throw new Error('未登录');
  const body = await ghPost<GhResp<GhTaggerBatchResp>>('tagger_batch_upsert', {
    token: auth.token, ...payload,
  }, 60_000);
  if (!body.ok) throw new Error(body.error || '上云失败');
  return body.data || {};
}

export interface GhTaggerFileResp { fileToken?: string; attachedTo?: string; size?: number }
/**
 * 附件归档：把服务商原始名单 / 打标结果 CSV（base64）交给 FaaS 上传到台账附件字段。
 * - 记录已存在（批次进行中/完成、或旧版工具整批上云拿到 rid）：服务端直接挂到对应附件字段；
 * - 记录还没建（打标开始前先传原件）：返回 fileToken，由首次 tagger_batch_upsert 带入建记录。
 */
export async function ghTaggerUploadFile(payload: {
  batchId?: string; rid?: string; kind: 'source' | 'result';
  fileName: string; dataBase64: string;
}): Promise<GhTaggerFileResp> {
  const auth = getGhAuth();
  if (!auth || !isGhPages()) throw new Error('未登录');
  const body = await ghPost<GhResp<GhTaggerFileResp>>('tagger_file_upload', {
    token: auth.token, ...payload,
  }, 90_000);
  if (!body.ok) throw new Error(body.error || '文件归档失败');
  return body.data || {};
}

/** ArrayBuffer → base64（兼容 xlsx 二进制与大文件分块） */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}
/** UTF-8 文本（含 BOM/中文）→ base64 */
export function textToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
/** 附件归档单文件大小上限（与 FaaS 11MB 口径一致） */
export const GH_TAGGER_FILE_MAX = 11 * 1024 * 1024;

export function formatGhTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- 品牌名称：GitHub 公开版面向服务商，内站面向渠道，两处部署各显示各的名称 ----
export const GH_APP_TITLE = '星川决策工作台-服务商';
export const GH_APP_SUBTITLE = '服务商决策工具 · 商品分析 / 内容创意（痛点分析·卖点分析·放大功效·加速转化） / 达人匹配 / 经营看板';
const INTERNAL_APP_TITLE = '星川决策工作台-渠道';
const INTERNAL_APP_SUBTITLE = '渠道决策工具 · 商品分析 / 内容创意（痛点分析·卖点分析·放大功效·加速转化） / 达人匹配 / 经营看板';
// 独立达人匹配站品牌（编译期锁定，仅达人匹配 + 三个新增达人库）
const MATCH_APP_TITLE = '星川达人匹配工作台';
const MATCH_APP_SUBTITLE = '达人匹配工具 · 优质星川 / 潜力星川达人推荐 / 星图达人推荐 三库智能匹配';

export function ghAppTitle(): string {
  if (MATCH_ONLY) return MATCH_APP_TITLE;
  return isGhPages() ? GH_APP_TITLE : INTERNAL_APP_TITLE;
}
export function ghAppSubtitle(): string {
  if (MATCH_ONLY) return MATCH_APP_SUBTITLE;
  return isGhPages() ? GH_APP_SUBTITLE : INTERNAL_APP_SUBTITLE;
}

// 运行时品牌覆盖：浏览器标签标题 + React 挂载前的启动屏标题（仅 GitHub 版生效）
export function applyGhBranding() {
  if (!isGhPages()) return;
  try { document.title = GH_APP_TITLE; } catch { /* noop */ }
  try {
    const bt = document.querySelector('.boot-title');
    if (bt) bt.textContent = GH_APP_TITLE;
  } catch { /* noop */ }
  try {
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', '星川决策工作台-服务商：商品分析、四段式内容脚本（痛点分析·卖点分析·放大功效·加速转化）生成与达人匹配框架。');
  } catch { /* noop */ }
}

// =====================================================================
// 服务商主账号制 API（PM 系列 stage）
// =====================================================================
export interface ProviderInfo {
  name: string;       // 登录简称
  fullName: string;   // 服务商全称
  hasMaster: boolean;
  internal: boolean;
}
export interface PmLoginResult {
  token: string; exp: number; name: string; agency: string; role: 'master' | 'member';
}
export interface PmMemberItem {
  recordId: string; rid: string; tail4: string; note: string; kind: string; time: number; decideTime: number;
}
export interface PmMembersData {
  agency: string; pending: PmMemberItem[]; authorized: PmMemberItem[];
}
export type PmLoginResp =
  | PmLoginResult
  | { type: 'pending'; rid: string }
  | { type: 'rejected'; rid: string; reason: string }
  | { type: 'need_register' }
  | { type: 'need_apply' };

export async function pmGetProviderList(): Promise<ProviderInfo[]> {
  const body = await ghPost<GhResp<{ providers: ProviderInfo[] }>>('get_provider_list', {});
  if (!body.ok) throw new Error(body.error || '服务商名单获取失败');
  return body.data?.providers || [];
}
export async function pmLoginProvider(agency: string, phone: string, password: string, note: string): Promise<PmLoginResp> {
  const body = await ghPost<GhResp<PmLoginResp>>('login_provider', { agency, phone, password, note });
  if (!body.ok) throw new Error(body.error || '登录失败');
  return body.data as PmLoginResp;
}
export async function pmApplyAccount(
  kind: 'master' | 'member', agency: string, phone: string, password: string, note: string,
): Promise<{ type: string; rid: string }> {
  const body = await ghPost<GhResp<{ type: string; rid: string }>>('apply_account', { kind, agency, phone, password, note });
  if (!body.ok) throw new Error(body.error || '提交失败');
  return body.data || { type: 'pending', rid: '' };
}
export async function pmGetMembers(agency?: string): Promise<PmMembersData> {
  const auth = getGhAuth();
  if (!auth?.token) throw new Error('未登录');
  const body = await ghPost<GhResp<PmMembersData>>('get_pending_members', { token: auth.token, agency });
  if (!body.ok) throw new Error(body.error || '成员列表获取失败');
  return body.data as PmMembersData;
}
export async function pmApproveMember(recordId: string): Promise<void> {
  const auth = getGhAuth();
  const body = await ghPost<GhResp<unknown>>('approve_member', { token: auth?.token, recordId });
  if (!body.ok) throw new Error(body.error || '授权失败');
}
export async function pmRejectMember(recordId: string, reason: string): Promise<void> {
  const auth = getGhAuth();
  const body = await ghPost<GhResp<unknown>>('reject_member', { token: auth?.token, recordId, reason });
  if (!body.ok) throw new Error(body.error || '操作失败');
}
// 登录结果判定：返回 token 登录成功；否则为分支类型
export function pmIsLoginSuccess(d: PmLoginResp): d is PmLoginResult {
  return typeof (d as PmLoginResult).token === 'string';
}
