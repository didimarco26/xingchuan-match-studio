
// ============================================================
// 第三部分：达人匹配推荐（基于第二部分产品分析结果）
// FaaS stage：match_candidates（拉取存量星川/优质星川达人库 + 服务端预筛）
//             match_score（每批 ≤6 个达人，单次 AI 调用评分+推荐理由）
//             potential_overview（星图达人推荐池/激励候选库 字段概况，不参与本轮匹配）
//             potential_candidates（星图达人推荐：按筛选条件硬过滤+规则打分 → 前端分批 AI 评分）
//             potential_new_candidates（潜力星川达人推荐：行业硬门槛+6步确定性打分+分层，不调 AI）
// 前端编排：1 次候选拉取 → 分批（6 个/批）并发 3 路调用 AI 评分 → 按分排序取 Top N
// ============================================================

import { FAAS_URL } from './api';
import { isGhPages } from './gh';
import { MATCH_ONLY } from '../match-only';
// 🎬 演示模式：开启后以下函数直接返回本地预置达人数据，不走 FaaS / 网络
import { isDemoMode, demoLatency } from './demo';
import {
  demoMatchResult, demoPotentialOverview,
  demoPotentialMatchResult, demoPotentialNewResult, demoMatchRound2,
} from './demo-data';

/** 达人匹配用的产品画像（沿用第二部分分析结果，无需用户重新填写） */
export interface MatchProduct {
  productName: string;
  brand: string;
  industry: string;
  category: string;
  sellingPoints: string;
  targetAudience: string;
  tags: string[];          // 行业标签（对应达人库「行业标签」字段）
  /** 第二部分内容创意方向摘要 + wrap 目标达人画像（自动带入，用于 match_score 加权） */
  creativeSummary?: string;
  /** 结果页「优化匹配方向」补充的偏好（软筛选 + AI 评分加权），如"偏生活类/侧重男性粉丝/需有母婴合作经验" */
  refineNote?: string;
}

/** 达人候选/结果（字段以多维表格实际字段为准） */
export interface InfluencerCandidate {
  cid: string;
  /**
   * 来源库：
   *   stock         = 存量星川达人库
   *   incr          = 优质星川达人库（增量库）
   *   potential_new = 潜力星川达人推荐（wiki 星川分级达人池，行业硬门槛+确定性打分，不调 AI）
   *   potential     = 星图达人推荐（精选联盟激励候选池，筛选+规则打分后分批 AI 评分）
   */
  pool: 'stock' | 'incr' | 'potential_new' | 'potential';
  name: string;            // 达人名称
  douyinId: string;        // 达人ID
  followers: number;       // 粉丝量
  tags: string[];          // 行业标签
  persona: string[];       // 达人人设标签
  forms: string[];         // 内容形式标签
  category: string;        // 主要带货类目（历史合作类目）
  seed: string;            // 种草价值
  spread: string;          // 传播价值
  conf: string;            // 打标置信度
  coop: string;            // 合作状态
  wechat: string;          // 企微添加状态
  agent: string;           // 所属代理商
  homepage: string;        // 抖音主页链接（优质星川库无主页时兜底为代表视频）
  video: string;           // 代表视频链接
  xingtuUrl: string;       // 星图达人主页链接（H5 公开资料页，品牌主/服务商均可访问）
  highlight: string;       // 近期爆款内容方向（存量星川库）
  level: string;           // 星川达人等级（优质星川库 S0-S5）
  rank: number | null;     // 排名（优质星川库）
  // AI 评分阶段回填
  aiScore?: number;        // 0-100 匹配分
  reason?: string;         // AI 推荐理由
  // 潜力星川库（精选联盟刊例）特有字段
  fansTier?: string;       // 粉丝量级档位：<10W / 10-30W / 30-50W / 50-100W / 100-500W
  identity?: string;       // 达人身份：野生达人 / MCN机构 / PGC达人
  price20?: number;        // 1-20s 刊例报价（元）
  cpm20?: number;          // 1-20s 预期 CPM（元）
  femalePct?: number;      // 女粉占比 %
  malePct?: number;        // 男粉占比 %
  // —— 潜力星川达人推荐池（pool='potential_new'，星川分级达人）专用 ——
  industryOp?: string;     // 行业(运营)：彩妆个护/食品饮料/母婴宠物/服装配饰/日化/滋补保健/家居/3C电器
  xcLevel?: string;        // 星川等级 S0-S5
  projects?: number;       // 平台审核通过的星图项目数
  xcSpend?: number;        // 星图消耗(元)
  ecomLevel?: string;      // 电商达人等级 L0-L5
  tier?: string;           // 分层：标杆/主力/潜力/储备
  tierRank?: number;       // 分层排序 0标杆 1主力 2潜力 3储备
}

export interface MatchMeta {
  stockTotal?: number;
  incrTotal?: number;
  stockRows?: number;
  incrRows?: number;
  stockPicked?: number;
  incrPicked?: number;
  stockCount?: number;
  incrCount?: number;
}

export interface MatchResult {
  stock: InfluencerCandidate[];   // Top N 存量星川达人
  incr: InfluencerCandidate[];    // Top N 优质星川达人
  meta: MatchMeta;
}

export interface MatchProgress {
  phase: 'fetch' | 'score';
  done: number;
  total: number;
  label: string;
}

const MATCH_BATCH_SIZE = 6;      // 每批送评达人数（受 magic.ai 单次输出 ~1200 字限制）
const MATCH_CONCURRENCY = 3;     // AI 评分并发批数
const MATCH_TIMEOUT_MS = 180_000;
const LOCAL_STOCK_KEY = 'xc_my_influencer_lib_v1';

/** GitHub 服务商版：读取「达人自助打标」沉淀在本机浏览器的存量达人库。内站永远返回 null。 */
export function loadLocalStockCandidates(): InfluencerCandidate[] | null {
  if (!isGhPages()) return null;
  try {
    const raw = localStorage.getItem(LOCAL_STOCK_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    const out: InfluencerCandidate[] = [];
    for (const r of rows) {
      const id = String(r?.id || '').trim();
      const name = String(r?.name || '').trim();
      const key = id || name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const videos = Array.isArray(r?.videoLinks) ? r.videoLinks.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [];
      out.push(normalizeCandidate({
        cid: `local_stock_${id || name}`,
        name: name || `达人${id}`,
        douyinId: id,
        followers: Number(r?.fans) || 0,
        tags: [...(Array.isArray(r?.industry) ? r.industry : []), ...(Array.isArray(r?.tags) ? r.tags : [])],
        persona: Array.isArray(r?.persona) ? r.persona : [],
        forms: Array.isArray(r?.forms) ? r.forms : [],
        category: String(r?.mainCategory || ''),
        seed: String(r?.tier || ''),
        spread: String(r?.hotDirection || ''),
        conf: String(r?.confidence || ''),
        coop: '服务商本地存量',
        agent: '我的达人库',
        homepage: videos[0] || '',
        video: videos[0] || '',
        highlight: String(r?.hotDirection || r?.aiSuggestion || ''),
        level: String(r?.sLevel || ''),
      }, 'stock'));
    }
    return out;
  } catch { return []; }
}

/** GitHub 服务商版当前本机存量达人数量；内站返回 null，供 UI 严格区分两套口径。 */
export function getLocalStockCount(): number | null {
  const rows = loadLocalStockCandidates();
  return rows === null ? null : rows.length;
}

/** 通用 FaaS POST（2 次尝试），返回 body.data */
async function callFaasMatch(body: Record<string, unknown>): Promise<any> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MATCH_TIMEOUT_MS);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let json: any = null;
      try { json = await resp.json(); } catch { /* 非 JSON */ }
      if (resp.ok && json && json.ok === true && json.data) return json.data;
      lastErr = json?.error ? String(json.error) : `服务返回异常（HTTP ${resp.status}）`;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? `请求超时（${Math.round(MATCH_TIMEOUT_MS / 1000)} 秒）` : '网络连接失败，请检查网络后重试';
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(lastErr || 'FaaS 调用失败');
}

function normalizeCandidate(raw: any, pool: 'stock' | 'incr'): InfluencerCandidate {
  const arr = (v: any): string[] => Array.isArray(v)
    ? v.map((x: any) => String(typeof x === 'object' ? (x?.text || x?.name || '') : x ?? '').trim()).filter(Boolean)
    : (v == null ? [] : [String(v).trim()].filter(Boolean));
  return {
    cid: String(raw?.cid || `${pool}_${Math.random().toString(36).slice(2, 9)}`),
    pool,
    name: String(raw?.name || '未命名达人').slice(0, 60),
    douyinId: String(raw?.douyinId || '').slice(0, 40),
    followers: Number(raw?.followers) || 0,
    tags: arr(raw?.tags).slice(0, 6),
    persona: arr(raw?.persona).slice(0, 5),
    forms: arr(raw?.forms).slice(0, 5),
    category: String(raw?.category || '').slice(0, 120),
    seed: String(raw?.seed || ''),
    spread: String(raw?.spread || ''),
    conf: String(raw?.conf || ''),
    coop: String(raw?.coop || ''),
    wechat: String(raw?.wechat || ''),
    agent: String(raw?.agent || ''),
    homepage: String(raw?.homepage || ''),
    video: String(raw?.video || ''),
    xingtuUrl: (() => {
      // 优先用 FaaS/表格返回的星图主页；历史数据里的旧 H5 mtact 链接已下线，就地改写为公开主页
      const direct = String(raw?.xingtuUrl || '').trim()
        .replace(/^https:\/\/www\.xingtu\.cn\/h5\/mtact\/act\/author\/detail\?author_id=(\d+).*$/,
          'https://www.xingtu.cn/xingtu/author/$1');
      if (direct) return direct;
      const id = String(raw?.douyinId || '').trim();
      // 星图公开达人主页 /xingtu/author/{id}：品牌主/服务商等任意登录身份均可访问；
      // /sup/ 仅品牌主可进、/ad/ 仅广告主会话可进，旧 H5 mtact 链接已下线（302 跳 404 fallback）。
      return /^\d{6,}$/.test(id) ? `https://www.xingtu.cn/xingtu/author/${id}` : '';
    })(),
    highlight: String(raw?.highlight || '').slice(0, 200),
    level: String(raw?.level || ''),
    rank: Number(raw?.rank) || null,
  };
}

/** 送评前只保留 prompt 需要的字段，减小请求体 */
function stripForScoring(c: InfluencerCandidate) {
  return {
    cid: c.cid, name: c.name, followers: c.followers,
    tags: c.tags, persona: c.persona, category: c.category,
    level: c.level, highlight: c.highlight, coop: c.coop,
  };
}

/**
 * 达人匹配主流程：
 * 1) match_candidates 拉取两库并服务端预筛
 * 2) 候选合并分批，match_score 并发 AI 评分（进度回调）
 * 3) 按 AI 分排序，取 stock_count / incr_count 条返回
 */
export async function matchInfluencers(
  product: MatchProduct,
  stockCount: number,
  incrCount: number,
  onProgress?: (p: MatchProgress) => void,
): Promise<MatchResult> {
  const stockN = Math.max(1, Math.min(50, Math.round(stockCount) || 10));
  const incrN = Math.max(1, Math.min(50, Math.round(incrCount) || 20));
  if (isDemoMode()) {
    await demoLatency();
    // 带 refineNote = 用户点「调整 / 重新匹配」→ 返回第 2 轮（砍高报价补黑马）
    const demoResult = product.refineNote ? demoMatchRound2(stockN, incrN) : demoMatchResult(stockN, incrN);
    // 独立匹配站演示数据同样严格限定三池，不展示预置存量达人
    if (MATCH_ONLY) {
      return {
        ...demoResult,
        stock: [],
        meta: {
          ...demoResult.meta,
          stockTotal: 0,
          stockRows: 0,
          stockPicked: 0,
          stockCount: 0,
        },
      };
    }
    return demoResult;
  }

  // 产品画像 + 第二部分创意方向摘要 + 用户补充偏好（match_candidates / match_score 共用）
  const prodPayload = {
    productName: product.productName, brand: product.brand, industry: product.industry,
    category: product.category, sellingPoints: product.sellingPoints,
    targetAudience: product.targetAudience, tags: product.tags,
    creativeSummary: product.creativeSummary || '',
    refineNote: product.refineNote || '',
  };

  const localStock = MATCH_ONLY ? null : loadLocalStockCandidates();
  const publicMode = localStock !== null;
  onProgress?.({ phase: 'fetch', done: 0, total: 1, label: MATCH_ONLY
    ? '正在拉取优质星川达人库…'
    : publicMode
      ? (localStock.length ? `正在读取本机存量达人库（${localStock.length} 位）并拉取优质星川达人库…` : '本机暂无存量达人库，正在拉取优质星川达人库…')
      : '正在拉取存量星川 / 优质星川达人库…' });
  const data = await callFaasMatch({
    stage: 'match_candidates',
    product: prodPayload,
    stock_count: MATCH_ONLY ? 0 : stockN,
    incr_count: incrN,
    // 独立匹配站：恒传空数组，明确跳过存量池（不读本机库、不回退平台旧存量库），只保留优质/增量池
    // 仅 GitHub 服务商版传入本机存量；空数组同样表示跳过存量池
    ...(MATCH_ONLY ? { local_stock: [] }
      : publicMode ? { local_stock: localStock!.map(c => ({
        cid: c.cid, name: c.name, douyinId: c.douyinId, followers: c.followers,
        tags: c.tags, persona: c.persona, forms: c.forms, category: c.category,
        seed: c.seed, spread: c.spread, conf: c.conf, homepage: c.homepage,
        video: c.video, xingtuUrl: c.xingtuUrl, highlight: c.highlight, level: c.level,
      })) } : {}),
  });

  const stockCands: InfluencerCandidate[] = (Array.isArray(data?.stock) ? data.stock : [])
    .map((x: any) => normalizeCandidate(x, 'stock'));
  const incrCands: InfluencerCandidate[] = (Array.isArray(data?.incr) ? data.incr : [])
    .map((x: any) => normalizeCandidate(x, 'incr'));
  if (!stockCands.length && !incrCands.length) {
    throw new Error(MATCH_ONLY ? '优质星川达人库未匹配到达人，请检查行业标签后重试' : '两个达人库均未匹配到达人，请检查行业标签后重试');
  }

  const all = [...stockCands, ...incrCands];
  const batches: InfluencerCandidate[][] = [];
  for (let i = 0; i < all.length; i += MATCH_BATCH_SIZE) {
    batches.push(all.slice(i, i + MATCH_BATCH_SIZE));
  }

  let done = 0;
  onProgress?.({ phase: 'score', done: 0, total: batches.length, label: `AI 相关性评估中（0/${batches.length} 批）…` });

  const scoreOneBatch = async (batch: InfluencerCandidate[]) => {
    try {
      const r = await callFaasMatch({
        stage: 'match_score',
        product: prodPayload,
        batch: batch.map(stripForScoring),
      });
      const results = Array.isArray(r?.results) ? r.results : [];
      for (const item of results) {
        const idx = Number(item?.i);
        const cand = Number.isInteger(idx) ? batch[idx] : undefined;
        if (!cand) continue;
        cand.aiScore = Math.max(0, Math.min(100, Math.round(Number(item?.s) || 50)));
        const reason = String(item?.r || '').trim();
        if (reason) cand.reason = reason;
      }
    } catch {
      // 单批失败不阻塞整体：未评分候选按基础匹配分兜底展示
    }
    done += 1;
    onProgress?.({
      phase: 'score', done, total: batches.length,
      label: `AI 相关性评估中（${done}/${batches.length} 批）…`,
    });
  };

  for (let i = 0; i < batches.length; i += MATCH_CONCURRENCY) {
    await Promise.all(batches.slice(i, i + MATCH_CONCURRENCY).map(scoreOneBatch));
  }

  // 未拿到 AI 分的候选给中性兜底分，保证排序稳定
  for (const c of all) {
    if (c.aiScore == null) {
      c.aiScore = 50;
      c.reason = c.reason || '基础标签匹配度较高（AI 详评暂缺），建议人工复核后触达。';
    }
  }

  const byScore = (a: InfluencerCandidate, b: InfluencerCandidate) =>
    (b.aiScore! - a.aiScore!) || b.followers - a.followers;
  stockCands.sort(byScore);
  incrCands.sort(byScore);

  return {
    stock: stockCands.slice(0, stockN),
    incr: incrCands.slice(0, incrN),
    meta: (data?.meta || {}) as MatchMeta,
  };
}

/** 粉丝量展示格式化：≥1 万显示「xx.x万」 */
export function formatFollowers(n: number): string {
  const v = Number(n) || 0;
  if (v >= 10000) {
    const w = v / 10000;
    return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return v.toLocaleString('zh-CN');
}


// ============================================================
// 星图达人推荐（精选联盟·筛选结果-激励达人候选（初版），独立 Base 第三张表 12,829 人）
// 独立 Base、字段口径不同于存量/优质库；筛选口径=万粉标签/人设/内容维度/身份/量级/女粉方向
// （报价/CPM/MCN/GMV 不做筛选项）；硬过滤+规则打分后，前端分批 AI 评分排序。
// ============================================================

/** 星图达人推荐池概况（FaaS stage: potential_overview，抽样约 2000 行做分布统计） */
export interface PotentialOverview {
  source: string;                 // 数据源说明
  baseUrl: string;                // 底表链接
  tables: string[];               // 底表名
  totalDeclared: number;          // 全表声明人数（12,829）
  sampled: number;                // 实际抽样读取人数
  fieldsNote: string;             // 字段口径说明
  fansTier: { name: string; count: number }[];     // 粉丝量级五档分布
  identity: { name: string; count: number }[];     // 达人身份分布
  personas: { name: string; count: number }[];     // 六大人设分布
  contentDims: { name: string; count: number }[];  // 内容维度分布
  industryTags: { name: string; count: number }[]; // 万粉一级标签（40 类行业）分布
  withPrice: number;              // 抽样中有刊例报价人数
  withHomepage: number;           // 有抖音主页链接人数
  withXingtu: number;             // 有星图主页人数
  withSecUid: number;             // 有抖音 sec_uid 人数
  matchingStatus: string;         // 匹配逻辑接入状态说明
}

// 模块级缓存（6 小时），同一工作台会话内不重复拉取
let potentialCache: { at: number; data: PotentialOverview } | null = null;
const POTENTIAL_CACHE_MS = 6 * 3600 * 1000;

/** 拉取潜力星川达人库概况；失败/降级返回 null（前端隐藏卡片，不阻塞主流程） */
export async function fetchPotentialOverview(force = false): Promise<PotentialOverview | null> {
  if (isDemoMode()) { await demoLatency(); return demoPotentialOverview(); }
  if (!force && potentialCache && Date.now() - potentialCache.at < POTENTIAL_CACHE_MS) {
    return potentialCache.data;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000); // 抽样拉取两表，给足冷启时间
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'potential_overview' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    const d = json?.data;
    if (!json?.ok || !d || !Array.isArray(d.industryTags)) return null;
    const data: PotentialOverview = {
      source: String(d.source || '精选联盟·Q3 精选达人刊例'),
      baseUrl: String(d.baseUrl || 'https://bytedance.larkoffice.com/base/N9r9bHCFZa10YcsgGqZcBLuQni0'),
      tables: Array.isArray(d.tables) ? d.tables.map(String) : [],
      totalDeclared: Number(d.totalDeclared) || 0,
      sampled: Number(d.sampled) || 0,
      fieldsNote: String(d.fieldsNote || ''),
      fansTier: Array.isArray(d.fansTier) ? d.fansTier : [],
      identity: Array.isArray(d.identity) ? d.identity : [],
      personas: Array.isArray(d.personas) ? d.personas : [],
      contentDims: Array.isArray(d.contentDims) ? d.contentDims : [],
      industryTags: Array.isArray(d.industryTags) ? d.industryTags : [],
      withPrice: Number(d.withPrice) || 0,
      withHomepage: Number(d.withHomepage) || 0,
      withXingtu: Number(d.withXingtu) || 0,
      withSecUid: Number(d.withSecUid) || 0,
      matchingStatus: String(d.matchingStatus || ''),
    };
    potentialCache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}


// ============================================================
// 星图达人推荐匹配（精选联盟·激励达人候选池，独立筛选 + 独立查询）
// FaaS stage：potential_candidates（拉底表 → 筛选条件硬过滤 → 规则打分排序，不调 AI）
//             match_score（复用 AI 评分；星图批次按 粉丝量级/行业标签/人设/内容/女粉 评估）
// ============================================================

/** 星图达人筛选面板条件（与 FaaS normPotFilters 对应） */
export interface PotentialFilters {
  industries: string[];   // 万粉一级标签（40 类）
  personas: string[];     // 达人人设（底表单选 6 选项，硬匹配）
  tiers: string[];        // 粉丝量级：<10W/10-30W/30-50W/50-100W/100-500W
  identities: string[];   // 达人身份：野生达人/MCN机构/PGC达人（+语义人设项）
  dims: string[];         // 内容维度：创意内容/深度测评/人感种草
  femaleDir: '' | '偏女' | '均衡' | '偏男';
}

export const POTENTIAL_TIER_OPTIONS = ['<10W', '10-30W', '30-50W', '50-100W', '100-500W'];

/** 达人人设（底表「达人人设」单选 6 选项） */
export const POTENTIAL_PERSONA_OPTIONS = [
  '专业测评/消费决策官',
  '剧情脑洞/角色演绎派',
  '知识观点/行业洞察者',
  '审美视觉/氛围创意师',
  '才艺娱乐/强互动表达者',
  '生活场景/真实种草家',
];
// 人设类型：3 个原生身份 + 6 个语义人设（FaaS 侧按关键词映射到底表）
export const POTENTIAL_IDENTITY_OPTIONS = ['野生达人', 'KOC素人', '宝妈达人', '学生党', '职场白领', '专业博主', 'MCN机构', 'PGC达人', '品牌官号'];
// 内容类型：3 个原生内容维度 + 8 个语义内容风格
export const POTENTIAL_DIM_OPTIONS = ['创意内容', '剧情植入', '日常vlog', '生活种草', '人感种草', '口播直销', '深度测评', '开箱测评', '对比测评', '专业科普', '福利直播'];
export const POTENTIAL_FEMALE_OPTIONS: Array<PotentialFilters['femaleDir']> = ['偏女', '均衡', '偏男'];

export const EMPTY_POTENTIAL_FILTERS: PotentialFilters = {
  industries: [],
  personas: [],
  tiers: [],
  identities: [],
  dims: [],
  femaleDir: '',
};

/** 工作台 17 行业标签 → 星图万粉标签（预填行业筛选时用，与 FaaS PROD_TAG_TO_XINGTU 同口径） */
export const PROD_TAG_TO_XINGTU: Record<string, string[]> = {
  '美妆': ['时尚', '颜值'],
  '个人护理': ['颜值', '时尚', '生活记录'],
  '家清纸品': ['生活家居', '生活记录'],
  '服装': ['时尚', '颜值'],
  '母婴用品': ['母婴', '亲子'],
  '食品饮料': ['美食'],
  '水饮冲调': ['美食'],
  '家居家装': ['生活家居', '生活记录'],
  '3C数码家电': ['科技'],
  '运动户外': ['体育', '旅行'],
  '宠物生活': ['动物'],
  '生鲜食品': ['美食', '三农'],
  '图书教育': ['教育校园', '人文社科'],
  '珠宝配饰': ['时尚', '颜值'],
  '本地生活': ['美食', '旅行', '随拍'],
  '健康滋补': ['医疗健康', '保健食品/营养健康'],
  '其他': [],
};

/** 行业标签栏的语义扩展项（非刊例星图万粉原生标签，FaaS 侧按关键词映射匹配） */
export const POTENTIAL_EXTRA_INDUSTRIES = ['保健食品/营养健康'];

/** 根据产品行业标签预填星图行业标签（仅保留概况卡 40 标签内存在的） */
export function prefillXingtuTags(productTags: string[], allowedTags: string[]): string[] {
  const set = new Set<string>();
  for (const t of productTags) (PROD_TAG_TO_XINGTU[t] || []).forEach(x => set.add(x));
  return [...set].filter(t => allowedTags.includes(t));
}

export interface PotentialMatchMeta {
  pulled: number;        // 本次抽样读取的刊例达人数
  matched: number;       // 通过筛选条件的达人数
  picked: number;        // 送 AI 评分的候选数
  count: number;         // 服务商要求的数量
  totalDeclared: number; // 刊例全表声明人数
  filters: PotentialFilters;
  errors?: string[];
  relaxed?: boolean;     // 严格条件命中不足，服务端已逐级放宽
  relaxedNote?: string;  // 放宽说明（展示给用户）
}

export interface PotentialMatchResult {
  list: InfluencerCandidate[];
  meta: PotentialMatchMeta;
}

function normalizePotentialCandidate(raw: any): InfluencerCandidate {
  const arr = (v: any): string[] => Array.isArray(v)
    ? v.map((x: any) => String(typeof x === 'object' ? (x?.text || x?.name || '') : x ?? '').trim()).filter(Boolean)
    : (v == null ? [] : [String(v).trim()].filter(Boolean));
  return {
    cid: String(raw?.cid || `potential_${Math.random().toString(36).slice(2, 9)}`),
    pool: 'potential',
    name: String(raw?.name || '未命名达人').slice(0, 60),
    douyinId: String(raw?.douyinId || '').slice(0, 40),
    followers: 0,
    fansTier: String(raw?.fansTier || '').slice(0, 12),
    tags: arr(raw?.tags).slice(0, 6),
    persona: arr(raw?.persona).slice(0, 5),
    forms: arr(raw?.forms).slice(0, 5),
    identity: String(raw?.identity || '').slice(0, 12),
    category: '', seed: '', spread: '', conf: '', coop: '', wechat: '', agent: '',
    homepage: String(raw?.homepage || ''),
    video: '',
    xingtuUrl: String(raw?.xingtuUrl || ''),
    highlight: '', level: '', rank: null,
    price20: Number(raw?.price20) || 0,
    cpm20: Number(raw?.cpm20) || 0,
    femalePct: Number(raw?.femalePct) || 0,
    malePct: Number(raw?.malePct) || 0,
  };
}

/** 星图批次送评：只保留底表口径字段（粉丝量级/万粉标签/人设/内容/身份/女粉） */
function stripPotentialForScoring(c: InfluencerCandidate) {
  return {
    cid: c.cid, name: c.name, pool: 'potential' as const,
    fansTier: c.fansTier || '', tags: c.tags, persona: c.persona, forms: c.forms,
    identity: c.identity || '', femalePct: c.femalePct || 0,
  };
}

/**
 * 星图达人推荐匹配主流程：
 * 1) potential_candidates 拉底表 + 硬过滤 + 规则打分（FaaS 内，不调 AI）
 * 2) 候选分批，match_score 并发 AI 评分（进度回调；评分失败的批次保留候选、不阻塞）
 * 3) 按 AI 分（无分时回退规则序）排序，取 count 条
 */
export async function matchPotentialInfluencers(
  product: MatchProduct,
  filters: PotentialFilters,
  count: number,
  onProgress?: (p: MatchProgress) => void,
): Promise<PotentialMatchResult> {
  const wantCount = Math.max(1, Math.min(50, Math.round(count) || 20));
  if (isDemoMode()) { await demoLatency(); return demoPotentialMatchResult(wantCount); }
  onProgress?.({ phase: 'fetch', done: 0, total: 1, label: '星图达人库筛选中…' });
  const data = await callFaasMatch({
    stage: 'potential_candidates',
    product,
    filters,
    count: wantCount,
  });
  const candidates = (Array.isArray(data?.potential) ? data.potential : [])
    .map(normalizePotentialCandidate);
  const meta: PotentialMatchMeta = {
    pulled: Number(data?.meta?.pulled) || 0,
    matched: Number(data?.meta?.matched) || 0,
    picked: candidates.length,
    count: wantCount,
    totalDeclared: Number(data?.meta?.totalDeclared) || 0,
    filters,
    errors: Array.isArray(data?.meta?.errors) ? data.meta.errors.filter(Boolean) : [],
    relaxed: Boolean(data?.meta?.relaxed),
    relaxedNote: String(data?.meta?.relaxedNote || ''),
  };
  if (!candidates.length) return { list: [], meta };

  // 分批并发 AI 评分（与存量/优质同口径，星图批次 prompt 由 FaaS 按 pool 识别）
  const batches: InfluencerCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += MATCH_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + MATCH_BATCH_SIZE));
  }
  let done = 0;
  const scoreOneBatch = async (batch: InfluencerCandidate[]) => {
    try {
      const sd = await callFaasMatch({
        stage: 'match_score',
        product,
        batch: batch.map(stripPotentialForScoring),
      });
      const results = Array.isArray(sd?.results) ? sd.results : [];
      for (const item of results) {
        const idx = Number(item?.i);
        const cand = Number.isInteger(idx) ? batch[idx] : undefined;
        if (!cand) continue;
        cand.aiScore = Math.max(0, Math.min(100, Math.round(Number(item?.s) || 50)));
        const reason = String(item?.r || '').trim();
        if (reason) cand.reason = reason;
      }
    } catch { /* 该批评分失败：保留候选按规则序排列，不阻塞 */ }
    done += 1;
    onProgress?.({ phase: 'score', done, total: batches.length, label: `星图达人 AI 评估 ${done}/${batches.length} 批` });
  };
  for (let i = 0; i < batches.length; i += MATCH_CONCURRENCY) {
    await Promise.all(batches.slice(i, i + MATCH_CONCURRENCY).map(scoreOneBatch));
  }
  // 未拿到 AI 分的候选给中性兜底分，保证排序稳定（卡片分数环中性灰）
  for (const c of candidates) {
    if (c.aiScore == null) {
      c.aiScore = 50;
      c.reason = c.reason || '标签与筛选条件匹配（AI 详评暂缺），建议人工复核后触达。';
    }
  }
  const byScore = (a: InfluencerCandidate, b: InfluencerCandidate) => (b.aiScore! - a.aiScore!);
  candidates.sort(byScore);
  return { list: candidates.slice(0, wantCount), meta };
}

// ============================================================
// 潜力星川达人推荐（pool='potential_new'，wiki 星川分级达人池 13,742 人，已落 N9r9 Base 新表）
// FaaS stage：potential_new_candidates（行业硬门槛 → 星川等级30+交付项目20+星图消耗20+电商等级10+画像加分
//             确定性打分 → 🥇标杆/🥈主力/🥉潜力/⚪储备 分层），不调 AI。
// ============================================================

export interface PotentialNewMeta {
  pulled: number;        // 底表拉取人数
  matched: number;       // 通过行业硬门槛人数
  eligible?: number;     // 通过用户四维筛选后的合格池人数（未筛选时 = matched）
  picked: number;        // 返回条数
  count: number;         // 请求数量
  totalDeclared: number; // 底表声明人数（13,742）
  tierCounts: Record<string, number>; // 合格池的分层分布（标杆/主力/潜力/储备）
  facets?: PnewFacets;   // 行业合格池各筛选维度的可选人数（不受已选筛选影响）
  errors?: string[];
  relaxed?: boolean;     // 严格条件/行业池命中不足，服务端已逐级放宽补位
  relaxedNote?: string;  // 放宽说明（展示给用户）
}

export interface PotentialNewResult {
  list: InfluencerCandidate[];
  meta: PotentialNewMeta;
}

/** 潜力星川达人推荐 · 「优化筛选」四维硬筛选（维度内 OR、维度间 AND；服务端执行） */
export interface PnewFilters {
  industries: string[];  // 行业运营枚举值（彩妆个护/食品饮料/母婴宠物…）
  fansBuckets: string[]; // 粉丝量级桶：lt10 / r10_50 / r50_100 / gt100
  personas: string[];    // 人设标签 key（见 PNEW_PERSONA_OPTIONS）
  forms: string[];       // 内容形式标签 key（见 PNEW_FORM_OPTIONS）
}
export const EMPTY_PNEW_FILTERS: PnewFilters = { industries: [], fansBuckets: [], personas: [], forms: [] };

export interface PnewFacets {
  industries: Record<string, number>;
  fansBuckets: Record<string, number>;
  personas: Record<string, number>;
  forms: Record<string, number>;
}

/** 粉丝量级四桶（与 FaaS potNewFansBucket 口径一致；底表原始枚举 <10W/10-30W/30-50W/50-100W/100-500W） */
export const PNEW_FANS_BUCKET_OPTIONS = [
  { key: 'lt10', label: '10万以下' },
  { key: 'r10_50', label: '10-50万' },
  { key: 'r50_100', label: '50-100万' },
  { key: 'gt100', label: '100万+' },
] as const;

/** 人设标签（关键词命中「行业运营 + 万粉标签」，口径与 FaaS PNEW_PERSONA_KW 一致） */
export const PNEW_PERSONA_OPTIONS = [
  { key: 'beauty', label: '美妆护肤达人' },
  { key: 'fashion', label: '时尚穿搭达人' },
  { key: 'food', label: '美食达人' },
  { key: 'maternal', label: '母婴亲子达人' },
  { key: 'home', label: '家居生活达人' },
  { key: 'tech', label: '科技数码达人' },
  { key: 'health', label: '健康养生达人' },
  { key: 'pet', label: '萌宠动物达人' },
  { key: 'edu', label: '教育校园达人' },
  { key: 'drama', label: '剧情演绎达人' },
  { key: 'acg', label: '二次元达人' },
  { key: 'casual', label: '随拍记录达人' },
] as const;

/** 内容形式标签（关键词命中万粉二级标签，口径与 FaaS PNEW_FORM_KW 一致） */
export const PNEW_FORM_OPTIONS = [
  { key: 'review', label: '好物评测' },
  { key: 'seeding', label: '产品种草' },
  { key: 'tutorial', label: '教程教学' },
  { key: 'show', label: '展示随拍' },
  { key: 'drama', label: '剧情演绎' },
] as const;

function normalizePotentialNewCandidate(raw: any): InfluencerCandidate {
  const arr = (v: any): string[] => Array.isArray(v)
    ? v.map((x: any) => String(typeof x === 'object' ? (x?.text || x?.name || '') : x ?? '').trim()).filter(Boolean)
    : (v == null ? [] : [String(v).trim()].filter(Boolean));
  const tierMap: Record<string, number> = { 标杆: 0, 主力: 1, 潜力: 2, 储备: 3 };
  return {
    cid: String(raw?.cid || `pnew_${Math.random().toString(36).slice(2, 9)}`),
    pool: 'potential_new',
    name: String(raw?.name || '未命名达人').slice(0, 60),
    douyinId: String(raw?.douyinId || '').slice(0, 40),
    followers: 0,
    fansTier: String(raw?.fansTier || '').slice(0, 12),
    tags: arr(raw?.tags).slice(0, 6),
    persona: arr(raw?.persona).slice(0, 5),
    forms: arr(raw?.forms).slice(0, 5),
    identity: String(raw?.identity || '').slice(0, 12),
    category: '', seed: '', spread: '', conf: '', coop: '', wechat: '', agent: '',
    homepage: String(raw?.homepage || ''),
    video: String(raw?.video || ''),
    xingtuUrl: String(raw?.xingtuUrl || ''),
    highlight: '',
    level: String(raw?.level || raw?.xcLevel || ''),
    rank: null,
    price20: 0, cpm20: 0,
    femalePct: Number(raw?.femalePct) || 0,
    malePct: Number(raw?.malePct) || 0,
    industryOp: String(raw?.industryOp || ''),
    xcLevel: String(raw?.xcLevel || raw?.level || ''),
    projects: Number(raw?.projects) || 0,
    xcSpend: Number(raw?.xcSpend) || 0,
    ecomLevel: String(raw?.ecomLevel || ''),
    tier: String(raw?.tier || '储备'),
    tierRank: Number.isInteger(Number(raw?.tierRank)) ? Number(raw.tierRank)
      : (tierMap[String(raw?.tier)] ?? 3),
    aiScore: Math.max(0, Math.min(100, Math.round(Number(raw?.aiScore) || 0))),
    reason: String(raw?.reason || ''),
  };
}

/**
 * 潜力星川达人推荐主流程（纯确定性，不调 AI）：
 * FaaS 内完成行业硬门槛过滤 + 6 步打分 + 分层，前端直接展示。
 */
export async function matchPotentialNewInfluencers(
  product: MatchProduct,
  count: number,
  filters?: PnewFilters,
): Promise<PotentialNewResult> {
  const wantCount = Math.max(1, Math.min(50, Math.round(count) || 30));
  if (isDemoMode()) { await demoLatency(); return demoPotentialNewResult(wantCount); }
  const body: Record<string, unknown> = {
    stage: 'potential_new_candidates',
    product,
    count: wantCount,
    filters: filters && (filters.industries.length || filters.fansBuckets.length || filters.personas.length || filters.forms.length)
      ? filters
      : undefined,
  };
  let data: any = await callFaasMatch(body);
  // 底表分片拉取降级（冷启动超时/限流导致空池或覆盖率不足 95%）时，等待 1.5s 自动补拉一次
  // （此时限频已缓解、实例缓存可能已建立），并优先采用拉取人数更多的结果
  const declared = Number(data?.meta?.totalDeclared) || 13742;
  const degradedLowCoverage = (d: any) => Array.isArray(d?.meta?.errors) && d.meta.errors.length > 0
    && Number(d?.meta?.pulled || 0) < declared * 0.95;
  if (degradedLowCoverage(data)) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const retry: any = await callFaasMatch(body);
      if (Number(retry?.meta?.pulled || 0) > Number(data?.meta?.pulled || 0)) data = retry;
    } catch { /* 保留首次降级结果，错误信息透传给前端 */ }
  }
  const list = (Array.isArray(data?.potentialNew) ? data.potentialNew : [])
    .map(normalizePotentialNewCandidate);
  const meta: PotentialNewMeta = {
    pulled: Number(data?.meta?.pulled) || 0,
    matched: Number(data?.meta?.matched) || 0,
    eligible: Number(data?.meta?.eligible) || 0,
    picked: list.length,
    count: wantCount,
    totalDeclared: Number(data?.meta?.totalDeclared) || 13742,
    tierCounts: (data?.meta?.tierCounts && typeof data.meta.tierCounts === 'object')
      ? data.meta.tierCounts
      : { 标杆: 0, 主力: 0, 潜力: 0, 储备: 0 },
    facets: (data?.meta?.facets && typeof data.meta.facets === 'object') ? data.meta.facets : undefined,
    errors: Array.isArray(data?.meta?.errors) ? data.meta.errors.filter(Boolean) : [],
    relaxed: Boolean(data?.meta?.relaxed),
    relaxedNote: String(data?.meta?.relaxedNote || ''),
  };
  return { list, meta };
}

/** 分层展示元信息（顺序、奖牌、配色） */
export const POTENTIAL_NEW_TIERS = [
  { key: '标杆', medal: '🥇', label: '标杆达人', desc: '星川 S4/S5，已验证的头部跑量达人', color: '#b45309', bg: '#fef3c7' },
  { key: '主力', medal: '🥈', label: '主力达人', desc: 'S2/S3 且有交付项目、有星图消耗', color: '#334155', bg: '#f1f5f9' },
  { key: '潜力', medal: '🥉', label: '潜力达人', desc: 'S1/S2 且已有星图消耗，可放量测试', color: '#92400e', bg: '#ffedd5' },
  { key: '储备', medal: '⚪', label: '储备达人', desc: 'S0 或暂无星图消耗，低价冷启备选', color: '#475569', bg: '#f8fafc' },
] as const;
