/**
 * 达人交付管理工作台 · 数据层
 * 状态映射 S0-S6 与风险规则的前端镜像（权威落表仍在 FaaS），并耦合：
 * ① 服务商存量达人库 localStorage（xc_my_influencer_lib_v1）
 * ② 商品打分分数 → 任务优先级
 */
import { FAAS_URL } from './api';
import { isGhPages } from './gh';

export type DeliveryStatus = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  S0: 'S0 待建联', S1: 'S1 已建联', S2: 'S2 已接单', S3: 'S3 寄样中',
  S4: 'S4 制作中', S5: 'S5 已交付', S6: 'S6 已归档',
};

export interface DeliveryRecord {
  recordId: string;
  '交付单号': string;
  task_id: string;
  '任务名称': string;
  '商品': string;
  '截止日期': number | null;
  '供给池': string;
  '达人ID': string;
  '达人昵称': string;
  'BD负责人': string;
  '状态进入时间': number | null;
  '过程标签': string;
  '寄样单号': string;
  '签收状态': string;
  '初稿提交时间': number | null;
  '正式上传时间': number | null;
  '验收结果': string;
  '阶段SLA(天)': number | null;
  '下一步动作': string;
  '服务商执单状态': string;
  _status: DeliveryStatus;
  _statusLabel: string;
  _risks: string[];
}

export interface DeliveryTask {
  recordId?: string;
  task_id: string;
  '任务名称': string;
  '商品': string;
  '商品分数'?: number | null;
  '截止日期': number | null;
  '默认BD负责人': string;
  '任务优先级': string;
  '任务状态': string;
  '任务备注'?: string;
  total?: number;
  risk?: number;
  waiting?: number;
  archived?: number;
  executing?: number;
  _bds?: string[];
  _aggregated?: boolean;
}

export interface DeliveryListData {
  tasks: DeliveryTask[];
  records: DeliveryRecord[];
}

async function callStage(stage: string, body?: Record<string, unknown>): Promise<any> {
  const resp = await fetch(FAAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, body }),
  });
  const b = await resp.json();
  // FaaS wrapStage 成功时直接返回 stage 数据本体；失败时返回 {ok:false,error}（HTTP 仍为 200）
  if (!resp.ok || b?.ok === false) throw new Error(String(b?.error || '请求失败'));
  return b;
}

export const deliveryList = (): Promise<DeliveryListData> => callStage('delivery_list');
export const deliverySaveTask = (body: Record<string, unknown>) => callStage('delivery_save_task', body);
export const deliverySaveRecord = (body: Record<string, unknown>) => callStage('delivery_save_record', body);
export const deliveryUpdateRecord = (body: Record<string, unknown>) => callStage('delivery_update_record', body);

/** 商品分数 → 任务优先级 */
export function priorityFromScore(score: number | null | undefined): string {
  const s = Number(score);
  if (!Number.isFinite(s)) return '';
  if (s >= 75) return '高';
  if (s >= 60) return '中';
  return '低';
}

// ---- 服务商存量达人库（localStorage，自助打标沉淀）----
export interface LocalCreator {
  id: string;
  name: string;
  fans?: number | string;
  sLevel?: string;
  tier?: string;
  score?: number;
  mainCategory?: string;
  [k: string]: unknown;
}

const LIB_KEY = 'xc_my_influencer_lib_v1';

/** 读取本机服务商达人库（仅对外版可用；字段兼容自助打标两种写入结构） */
export function loadLocalCreators(): LocalCreator[] {
  if (!isGhPages()) return [];
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const out: LocalCreator[] = [];
    for (const r of rows) {
      const id = String(r?.id || r?.达人ID || r?.['达人ID(星图)'] || '').trim();
      const name = String(r?.name || r?.达人名称 || r?.name0 || '').trim();
      const key = id || name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id, name,
        fans: r?.fans ?? r?.粉丝量,
        sLevel: r?.sLevel ?? r?.星川等级,
        tier: r?.tier ?? r?.分层,
        score: r?.score != null ? Number(r.score) : Number(r?.评分),
        mainCategory: r?.mainCategory ?? r?.主要带货类目,
      });
    }
    return out;
  } catch { return []; }
}

/** 按 ID 或昵称前缀/包含匹配达人库 */
export function searchLocalCreators(keyword: string): LocalCreator[] {
  const k = keyword.trim().toLowerCase();
  const all = loadLocalCreators();
  if (!k) return all.slice(0, 8);
  return all.filter(c =>
    c.id.toLowerCase().includes(k) || c.name.toLowerCase().includes(k)).slice(0, 8);
}

export const STATUS_STYLE: Record<DeliveryStatus, string> = {
  S0: 'bg-gray-100 text-gray-600 border-gray-200',
  S1: 'bg-blue-50 text-blue-700 border-blue-200',
  S2: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  S3: 'bg-amber-50 text-amber-700 border-amber-200',
  S4: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  S5: 'bg-violet-50 text-violet-700 border-violet-200',
  S6: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
