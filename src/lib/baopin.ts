// 代理商爆品库 + 对外版个人工作台 API 层
// FaaS stages：baopin_list / baopin_upsert / save_product_level / gen_capacity_plan
//               batch_import_products / add_to_hit_products / update_hit_product_tier
//               my_records_summary / my_product_records / my_script_records / my_influencer_stats / my_match_records
import { FAAS_URL } from './api';
import { isDemoMode } from './demo';
import { getGhAuth, isGhPages } from './gh';

export type PLevel = 'P0' | 'P1' | 'P2';
export type AnyGrade = PLevel | 'P3';

// 爆品库 6 个投放参数
export interface BaopinInputs {
  xcBudgetWan: number | null;   // 星川日预算（万元/天）
  price: number | null;         // 产品客单价（元）
  stableRoi: number | null;     // 千川稳定ROI
  targetRoi: number | null;     // 追投下星川目标ROI
  reverseSelectPct: number | null; // 达人反选比例（%）
  materialChasePct: number | null; // 达人素材追投数量比例（%）
}

export interface BaopinItem {
  id: string;
  name: string;
  industry: string;
  score: number;
  level: PLevel | string;       // AI 推荐分层（只读）
  manualTier: string;           // 服务商自主分层（可改）
  matchCount: number;
  agency: string;
  time: number;
  advice: string;
  manual: boolean;
  url: string;
  report: string;               // 一页纸报告全文
  matchSummary: string;         // 达人匹配摘要
  inputs: BaopinInputs;
}

export interface MySummary {
  identity: { agency: string; name: string };
  products: { total: number; latest: number };
  baopin: { total: number; levels: Record<PLevel, number> };
  scripts: { total: number; latest: number };
  tagger: { total: number; batches: number };
  matches: { total: number; latest: number };
}

export interface MyProductItem {
  id: string;
  name: string;
  total: number;
  level: string;
  time: number;
  url: string;
  agency?: string;   // 对内全量视图：归属服务商
  operator?: string;   // 审计附属：操作人姓名（同服务商成员）
  phoneMask?: string;  // 审计附属：脱敏手机号
}
export interface MyProductDetail {
  id: string;
  name: string;
  total: number;
  time: number;
  url: string;
  dims: string;
  conclusion: string;
  videos: string[];
  brand: string;
  sellingPoints: string;
  audience: string;
  layer: string;
}

export interface MyScriptItem {
  id: string;
  product: string;
  iterType: string;
  round: number;
  exported: string;
  time: number;
  refHot: string;
  refBrand: string;
  refBreakdown: string;
  summary: string;
  agency?: string;
  operator?: string;
  phoneMask?: string;
}

export interface NameCount { name: string; count: number }
export interface MyInfluencerDetail {
  id: string; name: string; sLevel: string; tier: string;
  industry: string[]; persona: string[]; forms: string[]; score: number;
  agency?: string;      // 对内全量视图：首个归属服务商
  agencies?: string[]; // 多服务商共同打标时的归属列表
}
export interface MyInfluencerStats {
  total: number;
  sLevelDist: NameCount[];
  industryDist: NameCount[];
  tierDist: NameCount[];
  industryOptions?: string[]; // 行业标签预设（主库存量达人库字段选项口径，服务端下发）
  details: MyInfluencerDetail[];
}

// 达人库自助编辑字段：level=星川等级 S0-S6（''清空）/ tier=分层 P0-P1-P2（''=储备）/ industryTags=行业标签多选
export type InfluencerField = 'level' | 'tier' | 'industryTags';
export type InfluencerValue = string | string[];

export interface MyMatchItem {
  id: string;
  product: string;
  time: number;
  total: number;
  hits: { stock: number; incr: number; potential: number; xingtu: number };
  agency?: string;
  operator?: string;
  phoneMask?: string;
}

async function postStage<T>(stage: string, payload: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
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
    if (!resp.ok || !body) throw new Error(`服务返回异常（HTTP ${resp.status}）`);
    if (body.ok !== true) throw new Error(body.error || '请求失败');
    return body.data as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 对外版自动带登录 token
function withToken(extra: Record<string, unknown>): Record<string, unknown> {
  if (isGhPages()) return { token: getGhAuth()?.token || '', ...extra };
  return extra;
}

// ---- 爆品库 ----
export async function fetchBaopinList(agency?: string): Promise<{ list: BaopinItem[]; agency: string }> {
  return postStage('baopin_list', withToken(agency ? { agency } : {}));
}
export async function saveProductLevel(recordId: string, level: PLevel): Promise<{ recordId: string; level: string }> {
  return postStage('save_product_level', withToken({ recordId, level }));
}
export async function genCapacityPlan(agency?: string): Promise<{ plan: string; count: number; agency: string }> {
  return postStage('gen_capacity_plan', withToken(agency ? { agency } : {}), 180_000);
}

// 商品分析完成 → 自动汇聚爆品库
export async function upsertBaopin(payload: {
  product: { productName: string; level1?: string; url?: string };
  scoreResult: { total: number; dims: Array<{ name: string; score: number; max: number }> };
  category?: { envMedian?: number | null; posShare?: number | null; rank?: number };
  history?: { dailySpend?: number; stableRoi?: number };
  agency?: string;
}): Promise<{ ok: boolean }> {
  // 🎬 demo 模式：不写真实爆品库
  if (isDemoMode()) return { ok: true };
  return postStage('baopin_upsert', withToken(payload as any), 120_000);
}

// ---- 批量导入 / 单条加入 / 服务商分层 ----

// 批量导入单条分析结果（客户端逐条调用，每条分析完立即写库）
export interface HitProductUpsertPayload {
  product: {
    productName: string;
    brand?: string;
    level1?: string;
    level2?: string;
    url?: string;
  };
  scoreResult: { total: number; dims: Array<{ name: string; score: number; max: number }> };
  category?: Record<string, unknown> | null;
  history?: { dailySpend?: number | null; stableRoi?: number | null };
  inputs?: Partial<BaopinInputs>;
  reportText?: string;
  matchSummary?: string;
  batchId?: string;
  manualTier?: PLevel;
  agency?: string;
  // 商品分析页当前已算好的综合分（100 分制）：透传给 FaaS 直接写入「综合评分」，避免入库重算导致分数不一致
  score?: number;
}

export interface HitProductUpsertResult {
  existed: boolean;
  updated: boolean;
  recordId: string;
  level: string;
  comp: number;
  matchCount: number;
  industry: string;
  manualTier: string;
  index?: number;
  total?: number;
}

// 批量导入：逐条写入（已存在直接覆盖）
export async function batchImportProduct(
  payload: HitProductUpsertPayload,
  batchMeta: { batchId: string; index: number; total: number },
): Promise<HitProductUpsertResult> {
  return postStage('batch_import_products',
    withToken({ ...payload, ...batchMeta } as any), 120_000);
}

// 单条加入爆品库：已存在且 confirmUpdate=false 时不写入（前端据此弹「是否更新」）
export async function addToHitProducts(
  payload: HitProductUpsertPayload,
  confirmUpdate = false,
): Promise<HitProductUpsertResult> {
  return postStage('add_to_hit_products',
    withToken({ ...payload, confirmUpdate } as any), 120_000);
}

// 服务商手动修改定级（写「服务商分层」字段，不动系统推荐定级；''=清除手选恢复推荐）
export async function updateHitProductTier(
  recordId: string,
  tier: AnyGrade | '',
): Promise<{ recordId: string; tier: AnyGrade | '' }> {
  return postStage('update_hit_product_tier', withToken({ recordId, tier }), 60_000);
}

// ---- 个人工作台 ----
export async function fetchMySummary(): Promise<MySummary> {
  return postStage('my_records_summary', withToken({}));
}
export async function fetchMyProductList(): Promise<{ list: MyProductItem[] }> {
  return postStage('my_product_records', withToken({}));
}
export async function fetchMyProductDetail(recordId: string): Promise<{ detail: MyProductDetail }> {
  return postStage('my_product_records', withToken({ recordId }));
}
export async function fetchMyScripts(): Promise<{ list: MyScriptItem[] }> {
  return postStage('my_script_records', withToken({}));
}
export async function fetchMyInfluencerStats(): Promise<MyInfluencerStats> {
  return postStage('my_influencer_stats', withToken({}));
}

// 服务商在「我的工作台-达人库情况」自助编辑达人等级/分层/行业标签，即时回写台账 Base
export async function updateInfluencerField(
  recordId: string, name: string, field: InfluencerField, value: InfluencerValue,
): Promise<{ recordId: string; field: InfluencerField; value: InfluencerValue; updatedPeople: number; updatedBatches: number }> {
  return postStage('update_influencer_field', withToken({ recordId, name, field, value }));
}
export async function fetchMyMatchList(): Promise<{ list: MyMatchItem[] }> {
  return postStage('my_match_records', withToken({}));
}
export async function fetchMyMatchDetail(recordId: string): Promise<{ detail: { id: string; names: string[] } }> {
  return postStage('my_match_records', withToken({ recordId }));
}
