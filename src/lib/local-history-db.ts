// ============================================================
// 本地历史记录（IndexedDB）——对外 GitHub 版专用
//   数据库：xingchuan-workbench-db
//   表：
//     content-history     内容脚本历史
//     influencer-history  达人匹配历史
//   主键 id 自增；索引 providerName（服务商维度隔离）+ createdAt
// ============================================================
import type { CreativeDirection, MatchedCaseRef, MoreCaseItem, BriefDirection } from './api';
import type {
  InfluencerCandidate, PnewFilters, PotentialFilters,
} from './influencer-match';
import type { ConceptSeg } from './concept-video';
import { getGhAuth } from './gh';

export const DB_NAME = 'xingchuan-workbench-db';
export const DB_VERSION = 1;
export const STORE_CONTENT = 'content-history';
export const STORE_INFLUENCER = 'influencer-history';

// —— 当前登录服务商（用于记录归属与查询隔离）——
export function currentProviderName(): string {
  const auth = getGhAuth();
  return (auth?.agency || auth?.name || '').trim() || '未登记服务商';
}

// ============================================================
// 内容脚本历史
// ============================================================

/** 单次优化迭代（每轮一个新版本，保留与台账 parentId 对应的链路信息） */
export interface ContentIteration {
  round: number;
  iterType: string;             // 自定义优化 / 热点优化 / 千川爆款拆解优化
  note: string;                 // 本轮优化需求原文
  logId?: string;               // 台账记录 ID（对应 Base parentId 链路）
  at: number;
  direction: CreativeDirection; // 本轮迭代后的完整方向脚本
}

/** 单个创意方向的快照（原始版 + 当前版 + 全部迭代） */
export interface ContentDirectionSnapshot {
  index: number;
  angle: string;
  original: CreativeDirection;
  current: CreativeDirection;
  version: number;
  iterations: ContentIteration[];
  /** 四段（痛/买/放/转）各自已生成的 AI 镜头图/视频（如已生成） */
  segMedia?: Partial<Record<ConceptSeg, { url: string; mediaType: 'video' | 'image' }>>;
}

export interface ContentHistoryRecord {
  id?: number;
  providerName: string;
  productName: string;
  brand: string;
  industry: string;
  category: string;
  createdAt: number;
  url: string;
  /** 本次确认的拍摄 Brief 方向全量（Brief 拆解结果） */
  briefs?: BriefDirection[];
  /** 参考爆款素材（匹配引用：序号 + 匹配理由） */
  matchedCases: MatchedCaseRef[];
  /** 更多参考爆款素材（富素材池：样式/视频/结构/钩子全字段） */
  moreCases: MoreCaseItem[];
  /** 参考爆款钩子 */
  refHooks: string;
  /** 三个方向的完整四段脚本 + 迭代链路 */
  directions: ContentDirectionSnapshot[];
  /** AI 概念视频 URL（若有） */
  conceptVideoUrl: string;
  /** 参考营销热点 */
  hotMarketingRef: string;
  /** 拆解千川爆款素材内容 */
  qianchuanBreakdown: string;
}

// ============================================================
// 达人匹配历史
// ============================================================

export interface InfluencerHistoryConditions {
  industry: string;
  category: string;
  stockCount: number;
  incrCount: number;
  pnewCount: number;
  potCount: number;
  tags: string[];
  pnewFilters: PnewFilters;
  potFilters: PotentialFilters;
}

export interface InfluencerHistoryPools {
  /** 存量星川 */
  stock: InfluencerCandidate[];
  /** 增量（优质星川） */
  incr: InfluencerCandidate[];
  /** 潜力星川 */
  pnew: InfluencerCandidate[];
  /** 星图达人推荐 */
  pot: InfluencerCandidate[];
}

export interface InfluencerHistoryRecord {
  id?: number;
  providerName: string;
  productName: string;
  createdAt: number;
  /** 匹配条件（行业/类目/CPM/GMV 门槛等输入参数） */
  conditions: InfluencerHistoryConditions;
  /** 完整达人名单（四库分别记录，含全字段） */
  pools: InfluencerHistoryPools;
  /** 各库匹配数量 */
  counts: { stock: number; incr: number; pnew: number; pot: number; total: number };
  /** 匹配轮次 */
  matchRound: number;
  /** 调整说明 */
  adjustNote: string;
}

// ============================================================
// DB 打开/升级
// ============================================================

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持本地存储（IndexedDB）'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      [STORE_CONTENT, STORE_INFLUENCER].forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('providerName', 'providerName', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('本地存储打开失败'));
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = run(t.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('本地存储操作失败'));
    t.onabort = () => reject(t.error || new Error('本地存储事务中断'));
  }));
}

/** 按服务商读取并按时间倒序返回 */
function listByProvider<T>(storeName: string, providerName: string): Promise<T[]> {
  return openDB().then((db) => new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(storeName, 'readonly');
    const store = t.objectStore(storeName);
    const idx = store.index('createdAt');
    const out: T[] = [];
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const value = cursor.value as T & { providerName?: string };
      if (!value.providerName || value.providerName === providerName) out.push(value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error || new Error('本地历史读取失败'));
  }));
}

// —— 内容脚本 ——
export function addContentHistory(rec: Omit<ContentHistoryRecord, 'id'>): Promise<number> {
  return tx(STORE_CONTENT, 'readwrite', (store) => store.add(rec) as IDBRequest<number>);
}
export function listContentHistory(providerName: string): Promise<ContentHistoryRecord[]> {
  return listByProvider<ContentHistoryRecord>(STORE_CONTENT, providerName);
}
export function deleteContentHistory(id: number): Promise<void> {
  return tx(STORE_CONTENT, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}

// —— 达人匹配 ——
export function addInfluencerHistory(rec: Omit<InfluencerHistoryRecord, 'id'>): Promise<number> {
  return tx(STORE_INFLUENCER, 'readwrite', (store) => store.add(rec) as IDBRequest<number>);
}
export function listInfluencerHistory(providerName: string): Promise<InfluencerHistoryRecord[]> {
  return listByProvider<InfluencerHistoryRecord>(STORE_INFLUENCER, providerName);
}
export function deleteInfluencerHistory(id: number): Promise<void> {
  return tx(STORE_INFLUENCER, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}
