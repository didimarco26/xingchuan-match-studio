// 星川对内工作台 · 核心 API 层（FaaS 中继版）
// 流程：商品链接识别(可选，CORS 代理抓标题) → 行业映射 → 本地素材匹配打分
//   → 串行调用妙笔 FaaS 5 个阶段（score→dir1→dir2→dir3→wrap，模型调用在服务端，网页无需任何 Key）
// 复用对外版的数据 JSON（旧 5 行业）与匹配模式，业务逻辑为对内 BD 场景。

import casesRaw from '../data/hot-cases.json';
import { inferCaseBrand } from './case-brand';
import formulasRaw from '../data/content-formulas.json';
// 🎬 演示模式：开启后以下函数直接返回本地预置数据，不走 FaaS / 网络
import { isDemoMode, demoLatency } from './demo';
import {
  demoScoringAi, demoScoringReport, demoAnalyzeResult, demoDirections,
  demoHotPlan, demoUrlExtract,
  demoScentAnalyzeResult, demoScentDirections, isScentProduct,
  DEMO_BENCH, DEMO_SCORING_DISPLAY_CARD, DEMO_SCORING_DISPLAY_SUBS,
} from './demo-data';
import { demoAgencyFit, demoIndustryAdvantage } from './demo-fit';

// ============================================================
// 常量集中区（后续调整只需改这里）
// ============================================================

// 妙笔 FaaS 中继（已发布）：单次只跑一个阶段，模型 Key 保存在服务端，网页侧零 Key
// v7：dir1/2/3 创意脚本阶段改用精简 payload + 前端超时放宽到 200s，修复 dir3 偶发超时
// v8：新增 case_reasons（更多案例 AI 匹配理由）/ script_export（30s 完整拍摄脚本）阶段；达人补 xingtuUrl（星图主页）
const FAAS_URL = 'https://magic.solutionsuite.cn/api/faas/vu19pYRBTEZ';
export { FAAS_URL };
// 单次 stage 请求超时（FaaS 单阶段约 20-60 秒，创意脚本阶段偶发偏慢，放宽到 200 秒）
const FAAS_TIMEOUT_MS = 200_000;

// FaaS 阶段定义（串行调用顺序）。热点营销方案不进主流程，仅右侧面板独立调用 hot_marketing_plan stage
// 新内容创意链路：score/skip → wrap（爆款案例+公式）→ gen_brief（Brief 方向拆解）→ 用户勾选编辑 → dir1..dirN（按 Brief 生成四段脚本）
export type FaasStage = 'score' | 'recommend_directions' | 'gen_brief' | 'dir1' | 'dir2' | 'dir3' | 'dir4' | 'dir5' | 'wrap';
export const FAAS_STAGE_ORDER: FaasStage[] = ['score', 'recommend_directions', 'dir1', 'dir2', 'dir3', 'wrap'];
export const FAAS_STAGE_LABELS: Record<FaasStage, string> = {
  score: '商品分析',
  recommend_directions: 'AI 定制脚本方向',
  gen_brief: 'Brief 方向拆解',
  dir1: '创意脚本①',
  dir2: '创意脚本②',
  dir3: '创意脚本③',
  dir4: '创意脚本④',
  dir5: '创意脚本⑤',
  wrap: '公式与达人',
};

// 对内版行业（6+1：保健食品从食品饮料拆出为独立行业）
export const INTERNAL_INDUSTRIES = ['个护美妆', '食品饮料', '保健食品', '母婴宠物', '服饰鞋包', '家居家清', '其他'] as const;
export type InternalIndustry = (typeof INTERNAL_INDUSTRIES)[number];

// 新行业 → 数据 JSON 旧 5 行业映射；null = 不过滤（全量素材）
export const INDUSTRY_TO_LEGACY: Record<InternalIndustry, string | null> = {
  个护美妆: '个护美妆',
  食品饮料: '食品饮料',
  保健食品: '食品饮料',   // 保健食品案例/素材沿用食品饮料库
  母婴宠物: '母婴宠物',
  服饰鞋包: '服饰&家居电器',
  家居家清: '家清纸品',
  其他: null,
};

// 17 个匹配达人行业标签（多选 chip）
export const INFLUENCER_TAGS = [
  '美妆', '个人护理', '家清纸品', '服装', '母婴用品', '食品饮料',
  '水饮冲调', '家居家装', '3C数码家电', '运动户外', '宠物生活', '生鲜食品',
  '图书教育', '珠宝配饰', '本地生活', '健康滋补', '其他',
] as const;

// 行业 → 默认勾选的达人标签
export const DEFAULT_TAGS_BY_INDUSTRY: Record<InternalIndustry, string[]> = {
  个护美妆: ['美妆', '个人护理'],
  食品饮料: ['食品饮料', '水饮冲调', '生鲜食品'],
  保健食品: ['健康滋补', '食品饮料'],
  母婴宠物: ['母婴用品', '宠物生活'],
  服饰鞋包: ['服装', '珠宝配饰'],
  家居家清: ['家清纸品', '家居家装'],
  其他: ['其他'],
};

// 五维打分满分
export const SCORE_MAX = { budget: 25, roiTolerance: 25, delivery: 15, trend: 20, pricePoint: 15 } as const;

// 星川 AI 工作台多维表格（具体达人名单入口）
export const LARK_BASE_URL = 'https://bytedance.larkoffice.com/base/Ph1QbuxpmapknksJdoqcQschnZe';

// ============================================================
// 类型定义
// ============================================================

export interface ProductInput {
  url: string;                    // 商品链接（必填）
  productName: string;            // 产品名*
  brand: string;                  // 品牌*
  industry: InternalIndustry;     // 行业*（新 5+1）
  category: string;               // 品类/细分类目
  price: number | null;           // 客单价(元)*
  usageScene: string;             // 使用场景
  sellingPoints: string;          // 核心卖点
  targetAudience: string;         // 目标人群
  // 五项服务商打分输入
  qianchuanDailySpend: number | null;  // 千川近14天日均消耗(元)*
  targetPenetration: number | null;    // 星川目标渗透率(%)* 默认15
  stableRoi: number | null;            // 千川稳定ROI*
  targetRoi: number | null;            // 追投下星川目标ROI（追投素材持续跑量后ROI才有下降空间）*
  reverseSelectPct: number | null;    // 达人反选比例(%)* 0-100 反向线性×5分（0%=5分，越低越好）
  materialChasePct: number | null;    // 达人素材追投数量比例(%)* 0-100 线性×10分
  influencerTags: string[];            // 匹配达人行业标签
  hotNewsRef?: string;                 // 行业热点参考文本（用户勾选「纳入创作参考」后注入 dir/recommend prompt，opt-in）
}

export type Confidence = 'high' | 'mid' | 'low';

export interface ScoreItem {
  score: number;                 // 实际采用分（硬算维度为硬算值）
  rationale: string;
  confidence: Confidence;
  dataNeeded?: string;           // confidence=low 时说明需要补充什么数据
  aiScore?: number;              // AI 参考分（硬算维度与 AI 不一致时展示）
}

export interface RedLine {
  name: string;
  hit: boolean;
  reason: string;
}

export interface Competitor {
  name: string;
  priceBand: string;
  contentStrategy: string;
}

export interface ProductAnalysis {
  sellingPoints: string[];
  targetAudience: string;
  // FaaS score 阶段为精简版，可能不返回 competitors/differentiators；缺省时渲染层跳过对应子块
  competitors?: Competitor[];
  contentStyle: string;
  differentiators?: string[];
  risks: string[];
}

export interface ScoringBlock {
  scores: {
    budget: ScoreItem;
    roiTolerance: ScoreItem;
    delivery: ScoreItem;
    trend: ScoreItem;
    pricePoint: ScoreItem;
  };
  redLines: RedLine[];
  strategyAdvice: string[];
}

export interface MatchedCaseRef {
  caseIndex: number;   // 引用喂入案例的序号（1-based）
  reason: string;
}

export interface MatchedCaseDetail {
  caseIndex: number;     // 1-based
  title: string;
  brand: string;
  coverImageUrl: string;
  videoLink: string;
  reason: string;
}

// 「查看更多爆款案例」展开项：多品牌去重后的案例池，含完整素材结构字段，AI 匹配理由懒加载
export interface MoreCaseItem {
  id: string;
  title: string;
  brand: string;
  industry: string;
  category: string;
  creativeDirection: string;
  coverImageUrl: string;
  videoLink: string;
  hotAnalysis: string;        // 爆款内容简述（hot_analysis）
  hookDesign: string;         // 钩子设计（一级/二级开场钩子 + 前3秒口播）
  structure: string;          // 素材结构（中段结构 钩子→卖点→转化 + 结尾转化）
  consumption: string;        // 星川消耗量级
  aiReason?: string;          // AI 匹配理由（case_reasons 阶段懒加载回填）
}

// 30s 完整拍摄脚本（script_export 阶段）
export interface ScriptExportSegment {
  range: string;       // 时间段，如 0-5s
  phase: string;       // 四段环节名（痛点分析/卖点分析/放大功效/加速转化）
  visual: string;      // 画面描述/分镜
  voiceover: string;   // 台词/口播
  subtitle: string;    // 字幕建议
}
export interface ScriptExport {
  title: string;
  segments: ScriptExportSegment[];
  shootingTips: string[];   // 拍摄注意事项
}

export interface CustomFormulaStage {
  stage: string;       // 环节
  technique: string;   // 手法
  detail: string;      // 具体内容
  goal: string;        // 目的
}

export interface ScriptSeg {
  visual: string;
  voiceover: string;
  refCaseTitle: string;
}

export interface CreativeDirection {
  angle: string;       // 动态方向名（AI 推荐，如「油头前后对比」；兜底为 痛点触达/反向劝阻·避坑/福利钩子）
  title: string;
  concept: string;
  hookType?: string;   // 主要钩子类型（痛点/对比/证明/福利/情绪/场景/测评/科普/反差）
  script: {
    pain: ScriptSeg;
    sell: ScriptSeg;
    release: ScriptSeg;
    close: ScriptSeg;
  };
  hooks: string[];     // 3 条备选开场钩子，各 ≤15 字
  shootingTip: string; // 该方向拍摄建议 1 条
  /** 本方向首选素材形式（真人出镜/桌拍特写/混剪/图文）+ 判断逻辑，FaaS 确定性计算；secondType 为次选形式 */
  materialPick?: { type: string; reason: string; secondType?: string; secondReason?: string };
  /** 热点强绑定：本方向借势的热点机会（来自前置热点营销方案；无则该方向为热点弱绑定/自由发挥） */
  hotOpp?: { grade: string; name: string; hook?: string };
}

/** AI 动态推荐的脚本方向（recommend_directions 阶段返回） */
export interface DirectionRec {
  dirName: string;    // 方向名称（4-8 字，如「油头前后对比」）
  dirAngle: string;   // 核心角度描述（一句话，指导后续 dir 生成）
  hookType: string;   // 主要钩子类型
  /** 来自用户选定/编辑的拍摄 Brief（新链路 brief→script：dir 阶段严格按 Brief 生成四段脚本） */
  brief?: BriefSeed;
  /** 热点强绑定时携带：该方向 1:1 对应的热点机会 */
  hotOpp?: { grade: string; name: string; hook?: string; angles?: string[] };
}

/** 拍摄 Brief 方向（gen_brief 阶段产出，位于「爆款素材参考」与「生成脚本」之间） */
export interface BriefDirection {
  id: string;                    // 前端稳定 id（brief-1…）
  name: string;                  // 方向名称
  coreSellingPoint: string;      // 核心卖点
  targetAudience: string;        // 目标人群
  materialFormat: string;        // 素材形式建议
  validationGoal: string;        // 验证目标
}

/** 传给 dir 阶段的 Brief 种子（不含前端 id） */
export interface BriefSeed {
  coreSellingPoint: string;
  targetAudience: string;
  materialFormat: string;
  validationGoal: string;
}

/** recommend_directions 失败时的兜底三方向（等价于旧版固定角度，保证不阻塞主流程） */
export const FALLBACK_DIRECTION_RECS: DirectionRec[] = [
  { dirName: '痛点触达', hookType: '痛点',
    dirAngle: '聚焦目标人群最痛最高频的核心使用场景，演透痛点强共鸣（「这说的就是我」），严禁写成避坑对比或福利促销' },
  { dirName: '反向劝阻/避坑', hookType: '对比',
    dirAngle: '反面切入（「先别乱买」「别交智商税」），错误做法 vs 正确选择对比反差建立信任再引出产品，严禁写成正面痛点共鸣或福利促销' },
  { dirName: '福利钩子/薅羊毛', hookType: '福利',
    dirAngle: '以价格机制/优惠/免费试用做开场主钩，福利拉停留再用真实效果佐证转化，口播务必简短口语，不堆砌促销话术' },
];

/** 校验 recommend_directions 返回，非法时返回 null（调用方兜底）；热点强绑定只回 1-2 个时用兜底方向补齐到 3 */
function normalizeDirectionRecs(data: any): DirectionRec[] | null {
  const arr = data?.directions;
  if (!Array.isArray(arr) || arr.length < 1) return null;
  const recs: DirectionRec[] = [];
  const seen = new Set<string>();
  for (const item of arr.slice(0, 3)) {
    const dirName = String(item?.dirName || '').trim().slice(0, 12);
    const dirAngle = String(item?.dirAngle || '').trim().slice(0, 220);
    const hookType = String(item?.hookType || '').trim().slice(0, 8) || '痛点';
    if (!dirName || !dirAngle || dirName.length < 2 || seen.has(dirName)) continue;
    seen.add(dirName);
    const rec: DirectionRec = { dirName, dirAngle, hookType };
    if (item?.hotOpp && item.hotOpp.name) {
      rec.hotOpp = {
        grade: String(item.hotOpp.grade || 'A').toUpperCase(),
        name: String(item.hotOpp.name || dirName).trim().slice(0, 16),
        hook: String(item.hotOpp.hook || '').trim().slice(0, 120) || undefined,
        angles: Array.isArray(item.hotOpp.angles) ? item.hotOpp.angles.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 2) : undefined,
      };
    }
    recs.push(rec);
  }
  if (recs.length === 0) return null;
  for (const fb of FALLBACK_DIRECTION_RECS) {
    if (recs.length >= 3) break;
    if (!seen.has(fb.dirName)) { recs.push({ ...fb }); seen.add(fb.dirName); }
  }
  return recs.length === 3 ? recs : null;
}

export interface InfluencerType {
  persona: string;       // 人设画像
  contentForm: string;   // 内容形式
  followerTier: string;  // 粉丝量级建议
  reason: string;        // 匹配理由
}

export interface AnalyzeResult {
  product: ProductAnalysis;
  scoring: ScoringBlock;
  matchedCases: MatchedCaseRef[];
  /** 拍摄 Brief 方向（gen_brief 产出，用户可查看/编辑/勾选，作为四段脚本生成的输入依据） */
  briefs: BriefDirection[];
  customFormula: CustomFormulaStage[];
  /** 第一阶段（商品洞察+爆款参考+Brief）时尚未生成脚本为空数组；用户点「生成脚本」后回填 */
  creativeDirections: CreativeDirection[];
  shootingTips: string[];      // 4 条
  complianceNotes: string[];   // 3 条
  influencerFramework: InfluencerType[]; // 3 种达人类型
  // 前端富化字段
  matchedCaseDetails: MatchedCaseDetail[];
  moreCases: MoreCaseItem[];          // 多品牌去重后的爆款案例池（「查看更多」展开用）
  industryCaseCount: number;   // 同行业案例命中数（素材供给红线依据）
  totalScore: number;
}

// 素材数据结构（裁剪版 JSON）
interface HotCase {
  id: string;
  title: string;
  hashtags: string[];
  industry: string;
  category: string;
  productSubCategory: string;
  creativeDirection: string;
  brand: string;
  productName: string;
  videoType: string;
  openingHookLevel1: string;
  openingHookLevel2: string;
  hook_line: string;
  hot_analysis: string;
  analysis_ending: string;
  analysis_pre3s_hook: string;
  analysis_middle_structure: string;
  videoLink?: string;
  coverImageUrl?: string;
  metrics?: { xingchuanConsumptionLevel?: string };
}

interface Formula {
  id: string;
  industry: string;
  category: string;
  productSubCategory: string;
  creativeDirection: string;
  formula: string;
  formulaSteps: Array<{ tag1?: string; sellingPoint?: string }>;
  xingchuanCostYuan?: string;
}

// ============================================================
// 数据加载
// ============================================================

// brand 缺失时从标题/话题标签推断品牌名，避免案例显示「未知品牌」
const allCases: HotCase[] = (casesRaw as unknown as HotCase[]).map(c => {
  if (c.brand && c.brand.trim()) return c;
  const b = inferCaseBrand(c.title, c.hashtags);
  return b ? { ...c, brand: b } : c;
});
const allFormulas: Formula[] = formulasRaw as unknown as Formula[];

// ============================================================
// 通用工具
// ============================================================

function isChineseChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim()) || /^www\./i.test(input.trim());
}

function getCaseConsumption(item: HotCase): number {
  const raw = item.metrics?.xingchuanConsumptionLevel;
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function getFormulaCost(item: Formula): number {
  if (!item.xingchuanCostYuan) return 0;
  const n = parseFloat(String(item.xingchuanCostYuan).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ============================================================
// 商品链接 / 分享文本识别（三级兜底，网页侧零 Key）：
//   1) 从粘贴文本提取首个 URL（含 v.douyin.com 短链、haohuo 精选联盟长链、裸域名）
//   2) CORS 代理快速抓页面标题（og:title/title/商品JSON），零 Key 秒回，失败不阻塞
//   3) 原文 + 抓取标题发给 FaaS parse 阶段（服务端 magic.ai；短链在服务端跟随跳转再抓一次）
//   4) 兜底：LLM/抓取都失败时，用域名 + 商品ID尾号生成非空占位名，绝不返回空表单
// ============================================================

// 从整段粘贴文本中提取第一个商品链接（支持无协议裸域名，如 v.douyin.com/xxx/）
export function extractFirstUrl(input: string): string | null {
  const m = input.match(/https?:\/\/[^\s，。、；）」』\]"')>]+/i)
    || input.match(/(?:v\.douyin\.com|haohuo\.jinritemai\.com|www\.jinritemai\.com|[\w-]+\.(?:jinritemai|douyin|iesdouyin)\.com)\/[^\s，。、；）」』\]"')>]*/i);
  if (!m) return null;
  return m[0].replace(/[.,，。!?！？;；:：]+$/, '');
}

// 纯数字商品ID：用户可能直接粘贴星图/精选联盟商品ID（15-20 位数字，无链接）
export function extractBareItemId(input: string): string {
  const m = String(input || '').match(/(?:^|[^\d])(\d{15,20})(?:[^\d]|$)/);
  return m ? m[1] : '';
}

// 商品ID → 精选联盟商品详情长链（星图「商品详情」同款格式）
export function haohuoUrlOf(itemId: string): string {
  return `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${itemId}`;
}

// 精选联盟商品详情 BFF 结构化信息（浏览器直连，免登录/免签名/跨域允许）
interface HaohuoPackInfo {
  title: string;
  shopName: string;
  shopScore: number | null;
  rankText: string;
  images: string[];
  activities: string[];
  commentCount: number | null;
  commentTags: string[];
}

/**
 * 从精选联盟 promotion_id 直读商品详情。
 * 背景：haohuo 详情页 2026 年改为 PIA 客户端渲染，公开 CORS 代理
 * （allorigins/codetabs/corsproxy）已全部失效；官方 BFF 允许跨域且不校验
 * a_bogus/msToken，最小 form body 即可拿到完整结构化数据。
 * 注意：该接口对机房服务器 IP 风控（FaaS 服务端直连返回 code=11001），
 * 必须在用户浏览器中调用。
 */
async function fetchHaohuoPackH5(itemId: string): Promise<HaohuoPackInfo | null> {
  if (!itemId) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(
      'https://haohuo.jinritemai.com/aweme/v2/shop/promotion/pack/h5/?is_h5=1&is_native_h5=1&origin_type=604',
      {
        method: 'POST',
        signal: controller.signal,
        credentials: 'omit',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `is_h5=1&origin_type=604&promotion_ids=${encodeURIComponent(itemId)}&bff_type=2&is_new_h5_bff=1`,
      },
    );
    if (!resp.ok) return null;
    const j = await resp.json();
    const p = j?.promotion_h5;
    const title = String(p?.basic_info_data?.title_info?.title || '').trim();
    if (!title) return null;

    const basicInfo = p?.shop_info?.basic_info || {};
    const shopName = String(basicInfo.shop_name || '').trim();
    const scoreNum = Number(basicInfo.grade_info?.score);
    const shopScore = isFinite(scoreNum) ? scoreNum : null;

    // 榜单标签：bottom_label_list → coms 内 type=text 的片段
    const bottomLabels: any[] = p?.basic_info_data?.bottom_label_list || [];
    const rankText = bottomLabels
      .map((lb) =>
        (lb?.coms || [])
          .filter((c: any) => c?.type === 'text' && c?.text)
          .map((c: any) => String(c.text).trim())
          .join(' '),
      )
      .map((t) => t.replace(/^[·\s]+/, '').trim())
      .filter(Boolean)
      .join('；');

    // 轮播图/视频：image 组取 url；video 组只取封面 cover_url
    const mediaList: any[] = p?.head_figure_data?.media_list || [];
    const images = mediaList
      .flatMap((g) => {
        const list: any[] = g?.content_list || [];
        if (g?.type === 'video') {
          return list
            .map((it) => String(it?.cover_url || '').trim())
            .filter(Boolean)
            .slice(0, 1);
        }
        return list.map((it) => String(it?.url || '').trim()).filter(Boolean);
      })
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 8);

    // 营销活动：券/满减文案（header+text）+ banner
    const rewardList: any[] = p?.product_support_info_data?.reward_content?.content_list || [];
    const activities = rewardList
      .flatMap((rw) => {
        const texts: string[] = [];
        for (const c of rw?.coms || []) {
          if (c?.type === 'text' && (c?.text || c?.header)) {
            texts.push(String(`${c.header || ''}${c.text || ''}`).trim());
          }
        }
        if (rw?.banner_info?.text) texts.push(String(rw.banner_info.text).trim());
        return texts;
      })
      .slice(0, 8);

    const goodComment = p?.comment_data?.good_comment || {};
    const cnt = Number(goodComment?.title_bar?.sum);
    const commentCount = isFinite(cnt) ? cnt : null;
    const commentTags = (goodComment?.tag_list || [])
      .map((tg: any) => String(tg?.text || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    return { title, shopName, shopScore, rankText, images, activities, commentCount, commentTags };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// FaaS parse 阶段：原文 + 标题提示 → 商品名/品牌/品类/行业（90s 超时 + 失败重试 1 次）
async function callFaasParse(text: string): Promise<any | null> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'parse', text }),
        signal: controller.signal,
      });
      let body: any = null;
      try { body = await resp.json(); } catch { /* 非 JSON 响应 */ }
      if (resp.ok && body && body.ok === true && body.data) return body.data as any;
      lastErr = body?.error ? String(body.error) : `服务返回异常（HTTP ${resp.status}）`;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? '请求超时（90 秒）' : '网络连接失败，请检查网络后重试';
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
  }
  console.warn('[link-parse] FaaS parse 阶段调用失败：', lastErr);
  return null;
}

// 行业关键词兜底分类（LLM 未给行业时，按商品名/品类词推断）
// 注意：保健食品排在食品饮料之前，维生素/益生菌/蛋白粉等专属词优先命中；传统滋补词（燕窝/阿胶等）同归保健食品
const INDUSTRY_KEYWORDS: Array<[InternalIndustry, string[]]> = [
  ['保健食品', ['保健品', '保健食品', '营养品', '营养补充', '膳食补充', '补充剂', '维生素', '益生菌', '益生元', '蛋白粉', '乳清蛋白', '肌酸', '鱼油', '鱼肝油', '叶黄素', 'dha', '钙铁锌', '补钙', '补铁', '补锌', '胶原蛋白', '胶原肽', '褪黑素', '氨糖', '软骨素', '辅酶', '叶酸', '酵素', '代餐', '功能食品', '特医食品', '滋补品', '燕窝', '阿胶', '灵芝', '孢子粉', '护肝', '养胃', '益生菌粉']],
  ['个护美妆', ['面膜', '精华', '洗发', '沐浴', '牙膏', '彩妆', '口红', '香水', '护肤', '洁面', '防晒', '护发', '身体乳', '卸妆', '爽肤水', '乳液', '面霜', '防脱', '洗护']],
  ['母婴宠物', ['奶粉', '纸尿裤', '婴儿', '宝宝', '辅食', '孕妇', '猫粮', '狗粮', '宠物', '尿片', '奶瓶', '湿巾']],
  ['食品饮料', ['零食', '饮料', '奶茶', '咖啡', '坚果', '牛奶', '白酒', '红酒', '果冻', '饼干', '冲调', '蜂蜜', '滋补', '生鲜', '水果', '海鲜', '牛肉', '猪肉', '茶']],
  ['服饰鞋包', ['连衣裙', 't恤', '衬衫', '外套', '羽绒服', '鞋', '包包', '内衣', '裤子', '袜子', '帽子', '围巾', '女装', '男装', '童装', '服饰']],
  ['家居家清', ['洗衣液', '纸巾', '抽纸', '垃圾袋', '清洁剂', '拖把', '收纳', '床品', '枕头', '被子', '厨具', '餐具', '香薰', '消毒液', '洗洁精', '家清']],
];

function guessIndustry(text: string): InternalIndustry | '' {
  const t = text.toLowerCase();
  for (const [ind, kws] of INDUSTRY_KEYWORDS) {
    if (kws.some(k => t.includes(k.toLowerCase()))) return ind;
  }
  return '';
}

export interface UrlExtractResult {
  url: string;                    // 规范化后的商品链接（回写表单）
  productName: string;            // 产品名（source='id' 半成功时为空，需用户手补）
  brand: string;
  industry: InternalIndustry | '';
  category: string;
  source: 'llm' | 'title' | 'fallback' | 'id';  // 识别来源，用于提示语；'id'=仅提取到商品ID的半成功状态
  itemId?: string;                // 商品ID（精选联盟/抖音商品，haohuo 长链或纯数字输入时提取）
  // parse 阶段 AI 推断的商品画像（识别成功后回填表单）
  price: number | null;           // 客单价（元），无法推断为 null
  sellingPoints: string;          // 核心卖点（/分隔）
  usageScene: string;             // 使用场景（/分隔）
  targetAudience: string;         // 目标人群
}

export async function extractFromUrl(rawInput: string): Promise<UrlExtractResult | null> {
  if (isDemoMode()) { await demoLatency(); return demoUrlExtract(); }
  const raw = rawInput.trim();
  if (!raw) return null;
  const url = extractFirstUrl(raw);
  // 纯数字商品ID（无链接）：星图/精选联盟商品ID 直接作为有效输入
  const bareItemId = !url ? extractBareItemId(raw) : '';
  // 既无链接、也无商品ID、去掉链接后也没有实质文字 → 无法识别
  if (!url && !bareItemId && raw.replace(/https?:\/\/\S+/gi, '').trim().length < 2) return null;
  // 纯数字ID 规范化为精选联盟商品页 URL（供回写与后续流程）
  const idUrl = bareItemId ? haohuoUrlOf(bareItemId) : '';

  // 1) 浏览器直连精选联盟 BFF 读取结构化详情（免登录/免签名/跨域允许）。
  //    haohuo 详情页已改为 PIA 客户端渲染，公开 CORS 代理全部失效；
  //    无 promotion_id 的短链（v.douyin.com）跳过，由 FaaS 服务端跟随跳转兜底。
  const promotionId = bareItemId || (url ? extractBareItemId(raw) : '');
  let packInfo: HaohuoPackInfo | null = null;
  if (promotionId) {
    try { packInfo = await fetchHaohuoPackH5(promotionId); } catch { packInfo = null; }
  }
  const title: string | null = packInfo?.title || null;

  // 2) FaaS parse：原文 + BFF 上下文（标题/店铺/榜单/活动/评价标签），服务端 AI 提取结构化字段
  const contextLines: string[] = [];
  if (packInfo) {
    contextLines.push(`【页面抓取到的标题】${packInfo.title}`);
    if (packInfo.shopName) contextLines.push(`店铺：${packInfo.shopName}`);
    if (packInfo.rankText) contextLines.push(`榜单：${packInfo.rankText}`);
    if (packInfo.activities.length) contextLines.push(`活动：${packInfo.activities.join(' / ')}`);
    if (packInfo.commentTags.length) contextLines.push(`高频评价标签：${packInfo.commentTags.join(' / ')}`);
  }
  const llmInput = contextLines.length ? `${raw}\n${contextLines.join('\n')}` : raw;
  const parsed = await callFaasParse(llmInput.slice(0, 4000));

  const productName = String(parsed?.productName || '').trim().slice(0, 80);
  const brand = String(parsed?.brand || '').trim().slice(0, 40);
  const category = String(parsed?.category || '').trim().slice(0, 40);
  const llmIndustry = String(parsed?.industry || '').trim();
  const industry: InternalIndustry | '' =
    (INTERNAL_INDUSTRIES as readonly string[]).includes(llmIndustry)
      ? (llmIndustry as InternalIndustry)
      : guessIndustry(`${productName}${category}${brand}${title || ''}`);
  const itemId = String(parsed?.itemId || bareItemId || '').trim();
  const normalizedUrl = String(parsed?.url || url || idUrl || '').trim();

  // parse 阶段 AI 推断的客单价 / 卖点 / 场景 / 人群（FaaS 已做长度与格式清洗）
  const priceNum = Number(parsed?.price);
  const price = isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 10) / 10 : null;
  // 卖点兼容数组（AI 偶尔返回数组）→ 统一用 / 连接
  let sp = parsed?.sellingPoints;
  if (Array.isArray(sp)) sp = sp.map((x: any) => String(x || '').trim()).filter(Boolean).join('/');
  const sellingPoints = String(sp || '').trim().slice(0, 200);
  const usageScene = String(parsed?.usageScene || '').trim().slice(0, 120);
  const targetAudience = String(parsed?.targetAudience || '').trim().slice(0, 80);

  // 3) 合并：LLM 提取结果优先
  if (productName) {
    return { url: normalizedUrl, productName, brand, industry, category, source: 'llm', itemId: itemId || undefined, price, sellingPoints, usageScene, targetAudience };
  }
  // 4) 代理抓到的页面标题兜底
  if (title) {
    return { url: url || idUrl || '', productName: title.slice(0, 80), brand, industry: industry || guessIndustry(title), category, source: 'title', itemId: itemId || undefined, price, sellingPoints, usageScene, targetAudience };
  }
  // 4.5) 仅提取到商品ID（精选联盟长链 JS 空壳 / 纯数字ID）：半成功状态，提示用户补充商品名
  if (itemId) {
    return { url: normalizedUrl || haohuoUrlOf(itemId), productName: '', brand, industry, category, source: 'id', itemId, price, sellingPoints, usageScene, targetAudience };
  }
  // 5) 最终兜底：链接有效但页面需登录/为 SPA 抓不到内容 → 生成非空占位名，提示人工补全
  if (url) {
    let label = '抖音商品';
    let idTail = '';
    try {
      const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (u.hostname.includes('haohuo') || u.hostname.includes('jinritemai')) label = '精选联盟商品';
      else if (u.hostname.includes('douyin')) label = '抖音商品';
      // 注意：did 是设备标识不是商品ID，只取商品类参数
      const id = u.searchParams.get('id') || u.searchParams.get('item_id') || u.searchParams.get('product_id') || '';
      if (id) idTail = `ID尾号${id.slice(-6)}，`;
    } catch { /* URL 解析失败用默认标签 */ }
    return {
      url,
      productName: `${label}（${idTail}链接已记录，请补全商品名）`,
      brand, industry, category, source: 'fallback',
      price, sellingPoints, usageScene, targetAudience,
    };
  }
  return null;
}

// ============================================================
// 素材匹配（复用对外版打分思路：bigram/关键词重合 + 品牌加分 + 消耗排序）
// ============================================================

function scoreItem(query: string, item: {
  title?: string; brand?: string; productName?: string; creativeDirection?: string;
  category?: string; productSubCategory?: string; industry?: string;
  hashtags?: string[]; analysis_pre3s_hook?: string;
}): number {
  const fields = [item.title, item.brand, item.productName, item.creativeDirection, item.category, item.productSubCategory, item.industry];
  if (Array.isArray(item.hashtags)) fields.push(...item.hashtags);
  if (item.analysis_pre3s_hook) fields.push(item.analysis_pre3s_hook);
  const text = fields.filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  for (const ch of query) { if (isChineseChar(ch) && text.includes(ch)) score++; }
  for (let i = 0; i < query.length - 1; i++) {
    const bigram = query.slice(i, i + 2);
    if ((isChineseChar(bigram[0]) || isChineseChar(bigram[1])) && text.includes(bigram)) score += 3;
  }
  const brand = String(item.brand || '').toLowerCase();
  if (brand && brand.length >= 2 && query.includes(brand)) score += 20;
  if (item.productSubCategory && query.includes(String(item.productSubCategory).toLowerCase().slice(0, 2))) score += 5;
  return score;
}

export interface RankedMaterials {
  cases: HotCase[];
  formulas: Formula[];
  industryCaseCount: number; // 同行业案例池命中数（素材供给红线依据）
}

// 喂给 FaaS 的案例条数（wrap 阶段 matchedCases 引用序号上限）
const FAAS_CASE_N = 8;
// 多品牌案例池条数（「查看更多爆款案例」展开用）
const MORE_CASE_N = 10;
// 案例池内同一品牌最多条数（保证多品牌覆盖，避免同品牌霸榜）
const MAX_CASE_PER_BRAND = 2;

/**
 * 多品牌去重选择：先按相关分/消耗降序，再限制同一品牌最多 maxPerBrand 条，
 * 优先覆盖更多品牌；不足 target 时放开品牌限制按分数补齐。
 */
function pickDiverseByBrand(
  sorted: Array<{ item: HotCase; score: number }>,
  target: number,
  maxPerBrand: number,
): HotCase[] {
  // 已知品牌按品牌名聚合限量；品牌字段缺失的案例（标题常含品牌但无法可靠解析）视为独立个体，
  // 不聚合到同一个"未知品牌"而互相误杀，保证有品牌的强去重、无品牌信息的不误伤。
  const brandOf = (it: HotCase) => {
    const b = (it.brand || '').trim();
    return b || `__nobrand_${it.id || it.title}`;
  };
  const picked: HotCase[] = [];
  const brandCount = new Map<string, number>();
  const seen = new Set<HotCase>();
  const push = (it: HotCase) => { picked.push(it); seen.add(it); };

  // 第一轮：同品牌限量，尽量覆盖多品牌
  for (const { item } of sorted) {
    if (picked.length >= target) break;
    const b = brandOf(item);
    if ((brandCount.get(b) || 0) >= maxPerBrand) continue;
    push(item);
    brandCount.set(b, (brandCount.get(b) || 0) + 1);
  }
  // 第二轮：不足 target 放开品牌限制，按分数补齐
  if (picked.length < target) {
    for (const { item } of sorted) {
      if (picked.length >= target) break;
      if (seen.has(item)) continue;
      push(item);
    }
  }
  return picked;
}

function rankMaterials(input: ProductInput): RankedMaterials {
  const legacyIndustry = INDUSTRY_TO_LEGACY[input.industry];
  // 行业过滤：其他(null) → 全量；映射行业无命中时退回全量
  let poolCases: HotCase[] = legacyIndustry ? allCases.filter(c => c.industry === legacyIndustry) : allCases;
  let poolFormulas: Formula[] = legacyIndustry ? allFormulas.filter(f => f.industry === legacyIndustry) : allFormulas;
  const industryCaseCount = poolCases.length;
  if (poolCases.length === 0) poolCases = allCases;
  if (poolFormulas.length === 0) poolFormulas = allFormulas;

  const q = [input.productName, input.brand, input.category, input.sellingPoints, input.usageScene]
    .filter(Boolean).join(' ').toLowerCase();

  const scoredCases = poolCases.map(item => ({ item, score: scoreItem(q, item) }));
  const hasPositive = scoredCases.some(s => s.score > 0);
  const filtered = hasPositive ? scoredCases.filter(s => s.score > 0) : scoredCases;
  filtered.sort((a, b) => b.score - a.score || getCaseConsumption(b.item) - getCaseConsumption(a.item));
  // 多品牌去重：取 MORE_CASE_N 条、同品牌最多 MAX_CASE_PER_BRAND 条，覆盖更多品牌（前 FAAS_CASE_N 条喂 FaaS）
  const topCases = pickDiverseByBrand(filtered, MORE_CASE_N, MAX_CASE_PER_BRAND);

  const scoredFormulas = poolFormulas.map(item => ({ item, score: scoreItem(q, item) }));
  const hasPosF = scoredFormulas.some(s => s.score > 0);
  const filteredF = hasPosF ? scoredFormulas.filter(s => s.score > 0) : scoredFormulas;
  filteredF.sort((a, b) => b.score - a.score || getFormulaCost(b.item) - getFormulaCost(a.item));
  const topFormulas = filteredF.slice(0, 8).map(s => s.item);

  return { cases: topCases, formulas: topFormulas, industryCaseCount };
}

// ============================================================
// 前端硬算打分（纯函数，前三维覆盖 AI 分）
// ============================================================

export interface HardScoreInput {
  qianchuanDailySpend: number;
  targetPenetration: number; // 百分比数值，如 15 表示 15%
  stableRoi: number;
  targetRoi: number;
  reverseSelectPct: number; // 达人反选比例(0-100)
  materialChasePct: number; // 达人素材追投数量比例(0-100)
}

export interface HardScoreResult {
  budget: { score: number; rationale: string; starDaily: number };
  roiTolerance: { score: number; rationale: string; tolerance: number };
  delivery: { score: number; rationale: string };
}

export function hardScores(input: HardScoreInput): HardScoreResult {
  // 1) 投放预算：星川日预算 = 千川14天日均消耗 × 目标渗透率
  const starDaily = input.qianchuanDailySpend * (input.targetPenetration / 100);
  let budgetScore = 0;
  if (starDaily >= 30000) budgetScore = 25;
  else if (starDaily >= 15000) budgetScore = 20;
  else if (starDaily >= 8000) budgetScore = 16;
  else if (starDaily >= 3000) budgetScore = 10;
  else if (starDaily > 0) budgetScore = 4;
  const budgetRationale =
    `星川日预算 = 千川日均消耗 ${input.qianchuanDailySpend.toLocaleString()} 元 × 渗透率 ${input.targetPenetration}% = ${starDaily.toLocaleString()} 元/天。` +
    `按经验阈值（≥3万满分/≥1.5万20分/≥8千16分/≥3千10分，阈值待各类目消耗数据校准），得 ${budgetScore}/25 分。`;

  // 2) ROI 下调容忍度 = (千川稳定ROI - 追投下星川目标ROI) / 千川稳定ROI
  let tol = 0;
  let roiScore = 0;
  if (input.stableRoi > 0) {
    tol = (input.stableRoi - input.targetRoi) / input.stableRoi;
    if (tol >= 0.3) roiScore = 25;
    else if (tol >= 0.2) roiScore = 20;
    else if (tol >= 0.1) roiScore = 15;
    else if (tol >= 0.05) roiScore = 9;
    else if (tol > 0) roiScore = 4;
    else roiScore = 0;
  }
  const roiRationale = input.stableRoi > 0
    ? `ROI 容忍空间 = (稳定ROI ${input.stableRoi} - 目标ROI ${input.targetRoi}) / ${input.stableRoi} = ${(tol * 100).toFixed(1)}%。` +
      (tol <= 0 ? '目标 ROI ≥ 稳定 ROI，无下调空间，得 0 分。' : `容忍空间越大越利于星川起量，得 ${roiScore}/25 分。`)
    : '稳定 ROI 数据缺失，按 0 分处理，请补全千川稳定 ROI。';

  // 3) 追投预算：达人反选比例 5 分（反向线性，0%=满分，越低越好）+ 达人素材追投数量比例 10 分（正向线性，100%=满分）
  const revPct = Math.min(Math.max(input.reverseSelectPct || 0, 0), 100);
  const chasePct = Math.min(Math.max(input.materialChasePct || 0, 0), 100);
  const reverseScore = Math.round((1 - revPct / 100) * 5 * 10) / 10;
  const chaseQtyScore = Math.round((chasePct / 100) * 10 * 10) / 10;
  const deliveryScore = Math.round((reverseScore + chaseQtyScore) * 10) / 10;
  const deliveryRationale =
    `追投预算维度：达人反选比例 ${revPct}%（0-100%反向线性，0%=5分，越低越好）得 ${reverseScore}/5 分；` +
    `达人素材追投数量比例 ${chasePct}%（0-100%线性）得 ${chaseQtyScore}/10 分；合计 ${deliveryScore}/15 分。`;

  return {
    budget: { score: budgetScore, rationale: budgetRationale, starDaily },
    roiTolerance: { score: roiScore, rationale: roiRationale, tolerance: tol },
    delivery: { score: deliveryScore, rationale: deliveryRationale },
  };
}

export type GradeTone = 'green' | 'yellow' | 'red';

export function computeGrade(total: number, redLineHit: boolean): { grade: string; tone: GradeTone } {
  if (redLineHit) return { grade: '⛔ 红线一票降级', tone: 'red' };
  if (total >= 80) return { grade: '高度适配', tone: 'green' };
  if (total >= 60) return { grade: '中度适配', tone: 'yellow' };
  return { grade: '低度适配', tone: 'red' };
}

// ============================================================
// FaaS 入参文本拼装（context / cases / formulas 三段）
// ============================================================

function buildContext(input: ProductInput, materials: RankedMaterials): string {
  return [
    '## 产品基础信息',
    `产品名：${input.productName}`,
    `品牌：${input.brand}`,
    `行业：${input.industry}`,
    `品类/细分类目：${input.category || '未填'}`,
    `客单价：${input.price ?? '未填'} 元`,
    `使用场景：${input.usageScene || '未填'}`,
    `核心卖点：${input.sellingPoints || '未填'}`,
    `目标人群：${input.targetAudience || '未填'}`,
    '',
    '## 服务商投放数据（打分用）',
    `千川近14天日均消耗：${input.qianchuanDailySpend ?? '未填'} 元`,
    `星川目标渗透率：${input.targetPenetration ?? 15}%`,
    `千川稳定ROI：${input.stableRoi ?? '未填'}`,
    `追投下星川目标ROI：${input.targetRoi ?? '未填'}（追投素材持续跑量后ROI才有下降空间）`,
    `达人反选比例：${input.reverseSelectPct ?? '未填'}%`,
    `达人素材追投数量比例：${input.materialChasePct ?? '未填'}%`,
    '',
    '## 达人匹配',
    `匹配达人行业标签：${input.influencerTags.length ? input.influencerTags.join('、') : '未选择'}`,
    '',
    '## 素材供给',
    `同行业案例命中数：${materials.industryCaseCount} 条（用于「无素材供给」红线判断）`,
  ].join('\n');
}

function buildCasesText(materials: RankedMaterials): string {
  return materials.cases.slice(0, FAAS_CASE_N).map((item, i) =>
    `案例${i + 1}｜标题:${item.title}｜品牌:${item.brand || '未知'}｜创意方向:${item.creativeDirection || ''}｜` +
    `一级开场钩子:${item.openingHookLevel1 || ''}｜前3秒口播:${(item.analysis_pre3s_hook || '').slice(0, 80)}｜星川消耗:${item.metrics?.xingchuanConsumptionLevel || 'N/A'}`
  ).join('\n');
}

function buildFormulasText(materials: RankedMaterials): string {
  return materials.formulas.map((item, i) => {
    const keywords = (item.formulaSteps || []).map(s => s.tag1 || '').filter(Boolean).slice(0, 5).join('/');
    return `公式${i + 1}｜跑量公式:${(item.formula || '').slice(0, 100)}｜创意方向:${item.creativeDirection || ''}｜` +
      `关键词:${keywords || '无'}｜星川消耗:${item.xingchuanCostYuan || 'N/A'}`;
  }).join('\n');
}

// ---- dir1/dir2/dir3 创意脚本阶段专用精简 payload ----
// 脚本生成只需产品核心信息 + 少量案例/公式参考；剔除投放数据/打分素材等无关长文本，
// 案例/公式由 8 条收敛到 5 条且字段更短，显著缩短 prompt、降低 magic.ai 响应耗时与超时概率。
function buildDirContext(input: ProductInput): string {
  return [
    '## 产品核心信息',
    `产品名：${input.productName}`,
    `品牌：${input.brand}`,
    `行业：${input.industry}`,
    `品类/细分类目：${input.category || '未填'}`,
    `客单价：${input.price ?? '未填'} 元`,
    `使用场景：${input.usageScene || '未填'}`,
    `核心卖点：${input.sellingPoints || '未填'}`,
    `目标人群：${input.targetAudience || '未填'}`,
    ...(input.qianchuanDailySpend ? [`千川日耗基线：${input.qianchuanDailySpend} 元/天`] : []),
    ...(input.targetPenetration ? [`星川目标渗透率：${input.targetPenetration}%（决定本场投放目标量级）`] : []),
    ...(input.stableRoi ? [`千川稳定期 ROI：${input.stableRoi}`] : []),
    ...(input.targetRoi ? [`追投星川目标 ROI：${input.targetRoi}（机制让利与转化话术须服务于该 ROI）`] : []),
    ...(input.reverseSelectPct ? [`达人反选比例：${input.reverseSelectPct}%`] : []),
    ...(input.materialChasePct ? [`素材追投数量比例：${input.materialChasePct}%（高追投=更依赖可放量素材）`] : []),
    `匹配达人行业标签：${input.influencerTags.length ? input.influencerTags.join('、') : '未选择'}`,
  ].join('\n');
}

function buildDirCasesText(materials: RankedMaterials): string {
  return materials.cases.slice(0, 5).map((item, i) =>
    `案例${i + 1}｜标题:${item.title}｜品牌:${item.brand || '未知'}｜创意方向:${item.creativeDirection || ''}｜` +
    `前3秒口播:${(item.analysis_pre3s_hook || '').slice(0, 60)}`
  ).join('\n');
}

function buildDirFormulasText(materials: RankedMaterials): string {
  return materials.formulas.slice(0, 5).map((item, i) => {
    const keywords = (item.formulaSteps || []).map(s => s.tag1 || '').filter(Boolean).slice(0, 4).join('/');
    return `公式${i + 1}｜跑量公式:${(item.formula || '').slice(0, 80)}｜关键词:${keywords || '无'}`;
  }).join('\n');
}

// ============================================================
// FaaS 单阶段调用（150s 超时 + 失败重试 1 次，错误带阶段名）
// ============================================================

interface FaasPayload {
  context: string;
  cases: string;
  formulas: string;
  /** gen_brief 专用：品类/细分类目（随请求单独传一个字段） */
  category?: string;
  /** dir1/2/3 专用：AI 动态推荐的定制方向（不传则 FaaS 用固定痛点/避坑/福利角度） */
  direction?: DirectionRec;
  /** 用户勾选「纳入创作参考」的行业热点文本；仅 recommend_directions/dir1-3 阶段被 FaaS 使用 */
  hotNewsRef?: string;
  /** 千川爆款素材拆解浓缩结论（用户上传视频逐帧拆解后勾选纳入）；recommend_directions/dir1-3/wrap 使用 */
  breakdownInsights?: string;
  /** 前置热点营销方案（3 个机会）；recommend_directions 据此与方向 1:1 强绑定 */
  hotPlan?: Array<{ name: string; grade: string; score?: number; whyNow?: string; fitClients?: string; angles?: string[]; hook?: string }>;
}

async function callFaasStage(stage: FaasStage | string, payload: FaasPayload): Promise<any> {
  const stageLabel = (FAAS_STAGE_LABELS as Record<string, string>)[stage] || stage;
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FAAS_TIMEOUT_MS);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage, context: payload.context, cases: payload.cases, formulas: payload.formulas,
          ...(payload.category ? { category: payload.category } : {}),
          ...(payload.direction ? { direction: payload.direction } : {}),
          ...(payload.hotNewsRef ? { hotNews: payload.hotNewsRef } : {}),
          ...(payload.breakdownInsights ? { breakdownInsights: payload.breakdownInsights } : {}),
          ...(payload.hotPlan && payload.hotPlan.length ? { hotPlan: payload.hotPlan } : {}),
        }),
        signal: controller.signal,
      });
      let body: any = null;
      try { body = await resp.json(); } catch { /* 非 JSON 响应，按网络/服务异常处理 */ }
      if (resp.ok && body && body.ok === true && body.data) {
        return body.data as any;
      }
      lastErr = body?.error ? String(body.error) : `服务返回异常（HTTP ${resp.status}）`;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? `请求超时（${Math.round(FAAS_TIMEOUT_MS / 1000)} 秒）` : '网络连接失败，请检查网络后重试';
    } finally {
      clearTimeout(timer);
    }
    // 重试前短暂等待（仅第一次失败后）
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`阶段「${stageLabel}」调用失败：${lastErr}。已自动重试 1 次仍失败，请点击重试`);
}

/** recommend_directions：AI 动态推荐 3 个定制脚本方向。90s 超时、2 次尝试；任何失败返回 null（调用方兜底固定三方向） */
async function fetchRecommendedDirections(payload: FaasPayload): Promise<DirectionRec[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'recommend_directions',
          context: payload.context, cases: payload.cases, formulas: payload.formulas,
          ...(payload.hotNewsRef ? { hotNews: payload.hotNewsRef } : {}),
          ...(payload.breakdownInsights ? { breakdownInsights: payload.breakdownInsights } : {}),
          ...(payload.hotPlan && payload.hotPlan.length ? { hotPlan: payload.hotPlan } : {}),
        }),
        signal: controller.signal,
      });
      const body: any = await resp.json().catch(() => null);
      if (resp.ok && body?.ok === true && body.data) {
        const recs = normalizeDirectionRecs(body.data);
        if (recs) return recs;
      }
    } catch { /* 超时/网络异常，重试或兜底 */ }
    finally { clearTimeout(timer); }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

// ============================================================
// 扩展阶段：case_reasons（更多案例 AI 匹配理由）/ script_export（30s 完整拍摄脚本）
// ============================================================

/** 通用 FaaS POST（自定义 body，2 次尝试），返回 body.data */
async function callFaasRaw(body: Record<string, unknown>): Promise<any> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FAAS_TIMEOUT_MS);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let b: any = null;
      try { b = await resp.json(); } catch { /* 非 JSON 响应 */ }
      if (resp.ok && b && b.ok === true && b.data) return b.data;
      lastErr = b?.error ? String(b.error) : `服务返回异常（HTTP ${resp.status}）`;
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? `请求超时（${Math.round(FAAS_TIMEOUT_MS / 1000)} 秒）` : '网络连接失败，请检查网络后重试';
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(lastErr || 'FaaS 调用失败');
}

// ============================================================
// 千川爆款素材拆解：上传视频 → 前端 canvas 抽帧 → FaaS 多模态图片模型逐帧拆解
// ============================================================

export interface BreakdownShot {
  /** 时间段，如 0-3s */
  t: string;
  /** 该段画面与字幕内容 */
  visual: string;
  /** 电商作用：拉停留/筛人群/造需求/包装卖点/建信任/价格锚定/CTA承接 */
  role: string;
}

export interface BreakdownResult {
  /** 一句话跑量判断 */
  verdict: string;
  /** 前3秒钩子 */
  hook: string;
  /** 目标人群与筛人方式 */
  audience: string;
  /** 核心卖点包装表达 */
  sellingPoints: string;
  /** 内容节奏结构 */
  structure: string;
  /** 跑量原因（原因→为何有效→画面） */
  successFactors: string[];
  /** 信任背书与场景代入 */
  trustAndScene: string;
  /** 价格福利与 CTA 承接 */
  offerAndCta: string;
  /** 逐镜头拆解 */
  shots: BreakdownShot[];
  /** 值得复刻 */
  replicate: string[];
  /** 合规风险 / 不应照搬 */
  risks: string[];
  /** ≤500字浓缩结论，注入脚本 prompt */
  insightsForScript: string;
}

export interface BreakdownProductCtx {
  productName?: string;
  brand?: string;
  industry?: string;
  category?: string;
  sellingPoints?: string;
  targetAudience?: string;
}

function normalizeBreakdown(d: any): BreakdownResult {
  const asArr = (v: any): string[] =>
    Array.isArray(v)
      ? v.map((x: any) => (typeof x === 'string' ? x : String(x?.visual || x?.text || x?.reason || ''))).filter(Boolean)
      : v ? [String(v)] : [];
  return {
    verdict: String(d?.verdict || ''),
    hook: String(d?.hook || ''),
    audience: String(d?.audience || ''),
    sellingPoints: String(d?.sellingPoints || ''),
    structure: String(d?.structure || ''),
    successFactors: asArr(d?.successFactors).slice(0, 5),
    trustAndScene: String(d?.trustAndScene || ''),
    offerAndCta: String(d?.offerAndCta || ''),
    shots: Array.isArray(d?.shots)
      ? d.shots
          .map((s: any) => ({ t: String(s?.t || ''), visual: String(s?.visual || ''), role: String(s?.role || '') }))
          .filter((s: BreakdownShot) => s.visual)
          .slice(0, 8)
      : [],
    replicate: asArr(d?.replicate).slice(0, 5),
    risks: asArr(d?.risks).slice(0, 5),
    insightsForScript: String(d?.insightsForScript || ''),
  };
}

/**
 * 千川爆款素材拆解：把视频关键帧（dataURL）+ 时间点 + 商品上下文发给 FaaS 多模态模型。
 * 多帧理解 + 长 JSON 输出耗时较长，超时给到 240s；FaaS 内部已做 1 轮 JSON 重试。
 */
export async function analyzeVideoBreakdown(
  frames: string[],
  times: number[],
  product: BreakdownProductCtx,
  durationSec: number,
): Promise<BreakdownResult> {
  if (!frames.length) throw new Error('未抽取到视频帧');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'breakdown', frames, times, product, durationSec }),
      signal: controller.signal,
    });
    const b: any = await resp.json().catch(() => null);
    if (resp.ok && b?.ok === true && b?.data) return normalizeBreakdown(b.data);
    throw new Error(b?.error ? `拆解失败：${String(b.error)}` : `拆解服务返回异常（HTTP ${resp.status}），请重试或减少视频时长`);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('拆解超时（240 秒），请重试或缩短视频');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 行业热点参考（hot_news stage）：抓 TopHub 抖音垂类榜单，确定性、不调 AI
// ============================================================
export interface HotNewsItem {
  rank: number;
  title: string;        // 视频标题（常含 #话题）
  url: string;          // 抖音原视频直链 www.douyin.com/video/{id}
  source: string;       // 来源账号/作者
  viewsText: string;    // 热度/播放量文本
  insight?: string;     // AI 热点洞察（≤20字：为什么火/核心情绪共鸣），失败留空
  hook?: string;        // AI 可借用钩子结构（≤25字：千川开场公式），失败留空
}

export interface HotNewsResult {
  board: string;        // 榜单名，如「抖音 ‧ 美食榜」
  industry: string;
  fetchedAt: string;
  items: HotNewsItem[];
  keywords: string[];   // 高频话题/钩子词
  degraded?: string;    // 非空表示降级（industry_board_unavailable / fetch_failed）
}

/** 拉取行业热点榜单（纯抓取 TopHub，秒回）。20s 超时、1 次重试；任何失败返回 null（调用方降级为「重试」态，绝不阻塞主流程） */
export async function fetchHotNews(industry: string, top = 10, category = ''): Promise<HotNewsResult | null> {
  const ind = (industry || '其他').trim() || '其他';
  const cat = (category || '').trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'hot_news', industry: ind, top, ...(cat ? { category: cat } : {}) }),
        signal: controller.signal,
      });
      const body: any = await resp.json().catch(() => null);
      if (resp.ok && body?.ok === true && body.data && Array.isArray(body.data.items)) {
        const d = body.data as HotNewsResult;
        // 归一化：insight/hook 兜底为空串（AI 失败时不阻塞展示）
        d.items = d.items.map((it: any) => ({
          ...it,
          insight: typeof it?.insight === 'string' ? it.insight : '',
          hook: typeof it?.hook === 'string' ? it.hook : '',
        }));
        return d;
      }
    } catch { /* 超时/网络异常，重试或返回 null */ }
    finally { clearTimeout(timer); }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

/** 把热点列表压缩成注入 prompt 的参考文本（用户勾选「纳入创作参考」后使用）；含 AI 洞察与可借钩子 */
export function hotNewsToRefText(hot: HotNewsResult | null, max = 8): string {
  if (!hot || !Array.isArray(hot.items) || !hot.items.length) return '';
  const kw = (hot.keywords || []).slice(0, 8).join('/') || '无';
  const lines = hot.items.slice(0, max).map((it, i) => {
    const head = `${i + 1}.《${(it.title || '').slice(0, 42)}》（作者:${it.source || '未知'}｜热度:${it.viewsText || '未知'}｜抖音原视频:${it.url}）`;
    const ai = (it.insight || it.hook)
      ? `\n   热点洞察:${it.insight || '（无）'}｜可借钩子结构:${it.hook || '（无）'}`
      : '';
    return head + ai;
  });
  return `榜单:${hot.board || '抖音热点'}｜高频话题词:${kw}\n` + lines.join('\n');
}

/** hot_insight 单条解读结果（index 对应入参 titles 顺序，从 1 开始） */
export interface HotInsight {
  index: number;
  title: string;
  insight: string;   // 热点洞察（≤20字），失败为空
  hook: string;      // 可借用钩子结构（≤25字），失败为空
}

/**
 * 拉取热点的 AI 洞察/钩子（独立慢调用，仅靠标题推断）。
 * 与榜单解耦：hot_news 秒回后再调本函数渐进填充；150s 超时、1 次重试；任何失败返回 null（调用方留空、不阻塞列表）。
 */
export async function fetchHotInsights(
  industry: string,
  board: string,
  titles: string[],
): Promise<HotInsight[] | null> {
  const list = (titles || []).map(t => String(t || '').trim()).filter(Boolean).slice(0, 10);
  if (!list.length) return [];
  const ind = (industry || '其他').trim() || '其他';
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150_000);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'hot_insight', industry: ind, board: board || '', items: list.map(t => ({ title: t })) }),
        signal: controller.signal,
      });
      const body: any = await resp.json().catch(() => null);
      if (resp.ok && body?.ok === true && body.data && Array.isArray(body.data.results)) {
        return (body.data.results as any[]).map((r, i) => ({
          index: Number(r?.index) || i + 1,
          title: typeof r?.title === 'string' ? r.title : list[i] || '',
          insight: typeof r?.insight === 'string' ? r.insight : '',
          hook: typeof r?.hook === 'string' ? r.hook : '',
        }));
      }
    } catch { /* 超时/网络异常，重试或返回 null */ }
    finally { clearTimeout(timer); }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

// ============================================================
// 热点营销方案（hot-marketing-planner 技能内嵌版 · 第一版保守口径）
//   窗口固定未来7天、场景固定千川竞价、用途固定短视频脚本借势；前端零输入、展开即跑。
//   实时热榜 + 近7天营销节点 → 六项模型打分分级 S/A/B/C → 3 张机会卡
//   （分级+评分+名称+适合客户+为什么现在跟+2个营销切口+短视频前3秒开场钩子）。
// ============================================================
export type MktWindow = '1d' | '7d' | '14d' | '1m' | '3m';
export type MktScenario = '竞价' | '品牌' | '种草';
export const MKT_WINDOW_OPTIONS: Array<{ value: MktWindow; label: string }> = [
  { value: '1d', label: '1天' },
  { value: '7d', label: '7天' },
  { value: '14d', label: '14天' },
  { value: '1m', label: '1个月' },
  { value: '3m', label: '3个月' },
];
export const MKT_SCENARIO_OPTIONS: MktScenario[] = ['竞价', '品牌', '种草'];
export type MktStyle = '干货种草' | '剧情植入' | '测评对比' | '福利直播' | '情感共鸣';
export const MKT_STYLE_OPTIONS: MktStyle[] = ['干货种草', '剧情植入', '测评对比', '福利直播', '情感共鸣'];

export interface HotMarketingInput {
  industry: string;        // 一级行业（InternalIndustry 中文）
  category?: string;       // 品类/细分类目
  brand?: string;          // 品牌
  product?: string;        // 产品名
  audience?: string;       // 目标人群
  sellingPoints?: string;  // 核心卖点
  win?: MktWindow;         // 时间窗口，默认 7d
  scenarios?: MktScenario[]; // 营销场景（可多选），默认 ['竞价']
  styles?: MktStyle[];     // 内容风格（可多选），空=不限
}

export interface HotMarketingOpp {
  name: string;
  type: string;            // 即时热点|可预期节点|行业趋势|平台信号
  score: number;           // 0-5
  grade: 'S' | 'A' | 'B' | 'C';
  timeliness: string;      // 立即跟进|24小时内|3-7天准备
  fitClients: string;
  whyNow: string;
  angles: string[];        // 2 个营销切口
  hook: string;            // 短视频前 3 秒开场钩子（可直接拍）
  scenario?: string;       // 该机会适用场景：竞价|品牌|种草
  style?: string;          // 内容风格：干货种草|剧情植入|测评对比|福利直播|情感共鸣
  videoUrl?: string;       // 关联热点视频直链（来自抖音热榜，可空）
  videoTitle?: string;
}
export interface HotMarketingItem {
  title: string;           // 行业热榜条目标题
  heat?: string;           // 热度/播放量文本
  url?: string;            // 抖音视频直链（可空）
  source?: string;         // 来源/作者
}
export interface HotMarketingPlan {
  summary: string;
  opportunities: HotMarketingOpp[];
  hotItems?: HotMarketingItem[];   // 行业热点榜（大盘，带视频直链）
  degraded?: boolean;
  salvaged?: boolean;
  hotLimited?: boolean;
  hotBoard?: string;
  hotCount?: number;
  win?: string;
  scenarios?: string[];
  styles?: string[];
  windowText?: string;
  fetchTime?: string;
}

function normalizeHotMarketing(d: any): HotMarketingPlan {
  const grade = (g: any, s: number): 'S' | 'A' | 'B' | 'C' => {
    const gv = String(g || '').toUpperCase();
    if (gv === 'S' || gv === 'A' || gv === 'B' || gv === 'C') return gv;
    return s >= 4.2 ? 'S' : s >= 3.5 ? 'A' : s >= 2.8 ? 'B' : 'C';
  };
  const opps: HotMarketingOpp[] = (Array.isArray(d?.opportunities) ? d.opportunities : []).map((o: any) => {
    const score = Math.max(0, Math.min(5, Number(o?.score) || 0));
    return {
      name: String(o?.name || '').trim(),
      type: String(o?.type || '可预期节点').trim(),
      score: Math.round(score * 10) / 10,
      grade: grade(o?.grade, score),
      timeliness: String(o?.timeliness || '').trim(),
      fitClients: String(o?.fitClients || '').trim(),
      whyNow: String(o?.whyNow || '').trim(),
      angles: Array.isArray(o?.angles) ? o.angles.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 2) : [],
      hook: String(o?.hook || '').trim(),
      scenario: String(o?.scenario || '').trim() || undefined,
      style: MKT_STYLE_OPTIONS.includes(String(o?.style || '').trim() as MktStyle) ? String(o.style).trim() : undefined,
      videoUrl: String(o?.videoUrl || '').trim() || undefined,
      videoTitle: String(o?.videoTitle || '').trim() || undefined,
    };
  }).filter((o: HotMarketingOpp) => o.name)
    .sort((a: HotMarketingOpp, b: HotMarketingOpp) => b.score - a.score)
    .slice(0, 3);
  const hotItems: HotMarketingItem[] = (Array.isArray(d?.hotItems) ? d.hotItems : []).map((h: any) => ({
    title: String(h?.title || '').trim(),
    heat: String(h?.heat || '').trim(),
    url: String(h?.url || '').trim(),
    source: String(h?.source || '').trim(),
  })).filter((h: HotMarketingItem) => h.title).slice(0, 8);
  return {
    summary: String(d?.summary || '').trim(),
    opportunities: opps,
    hotItems,
    degraded: !!d?.degraded,
    salvaged: !!d?.salvaged,
    hotLimited: !!d?.hotLimited,
    hotBoard: String(d?.hotBoard || '').trim(),
    hotCount: Number(d?.hotCount) || 0,
    win: String(d?.win || '7d').trim(),
    scenarios: Array.isArray(d?.scenarios) ? d.scenarios.map((x: any) => String(x || '').trim()).filter(Boolean) : ['竞价'],
    styles: Array.isArray(d?.styles) ? d.styles.map((x: any) => String(x || '').trim()).filter((x: string) => (MKT_STYLE_OPTIONS as string[]).includes(x)) : [],
    windowText: String(d?.windowText || '').trim(),
    fetchTime: String(d?.fetchTime || '').trim(),
  };
}

/** 生成热点营销方案（约30~50s）。时间窗口/营销场景可由筛选器传入（默认 7天/竞价）。
 *  返回始终带行业热榜 hotItems（AI 机会卡失败时 degraded，仍可展示大盘热点）；网络彻底失败才返回 null。 */
const mktPlanCache = new Map<string, { at: number; plan: HotMarketingPlan }>();
const MKT_PLAN_TTL = 25 * 60 * 1000;
export async function fetchHotMarketingPlan(input: HotMarketingInput): Promise<HotMarketingPlan | null> {
  if (isDemoMode()) { await demoLatency(); return demoHotPlan(); }
  const win = input.win || '7d';
  const scenarios = input.scenarios && input.scenarios.length ? input.scenarios : ['竞价'];
  const styles = input.styles || [];
  const key = [input.industry, input.category || '', input.brand || '', input.product || '', input.audience || '', win, scenarios.join('+'), styles.join('+')].join('|');
  const cached = mktPlanCache.get(key);
  if (cached && Date.now() - cached.at < MKT_PLAN_TTL) return cached.plan;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150_000);
    try {
      const resp = await fetch(FAAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'hot_marketing_plan',
          industry: (input.industry || '其他').trim() || '其他',
          category: input.category || '',
          brand: input.brand || '',
          product: input.product || '',
          audience: input.audience || '',
          sellingPoints: input.sellingPoints || '',
          win,
          scenarios,
          styles,
        }),
        signal: controller.signal,
      });
      const body: any = await resp.json().catch(() => null);
      if (resp.ok && body?.ok === true && body.data) {
        const plan = normalizeHotMarketing(body.data);
        if (plan.opportunities.length || plan.hotItems?.length) mktPlanCache.set(key, { at: Date.now(), plan });
        return plan;
      }
    } catch { /* 超时/网络异常，重试或返回 null */ }
    finally { clearTimeout(timer); }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

/** 把单个机会浓缩成可注入「优化迭代」输入框的文本（2 个切口 + 短视频开场钩子；用于脚本借势） */
export function hotMarketingOppToRefText(opp: HotMarketingOpp): string {
  const lines = [`【热点借势·${opp.grade}级 ${opp.name}】`];
  if (opp.whyNow) lines.push(`为什么现在跟：${opp.whyNow}`);
  opp.angles.forEach((a, i) => lines.push(`营销切口${i + 1}：${a}`));
  if (opp.hook) lines.push(`短视频前3秒开场钩子（可直接拍）：${opp.hook}`);
  lines.push('请围绕本商品卖点，把以上热点切口与开场钩子改写成千川带货短视频脚本（痛点分析·卖点分析·放大功效·加速转化 四段），不要照搬热点原内容、不出现违规夸大或擦边表达。');
  return lines.join('\n');
}

export async function fetchCaseReasons(
  product: { productName: string; brand: string; industry: string; category: string; sellingPoints?: string; targetAudience?: string },
  cases: MoreCaseItem[],
): Promise<string[]> {
  if (isDemoMode()) return cases.map(c => c.aiReason || '与本品卖点、目标人群高度相关，可参考其开场钩子与结构。');
  const data = await callFaasRaw({
    stage: 'case_reasons',
    product: {
      productName: product.productName, brand: product.brand,
      industry: product.industry, category: product.category,
      sellingPoints: product.sellingPoints || '', targetAudience: product.targetAudience || '',
    },
    cases: cases.map(c => ({
      title: c.title, brand: c.brand, industry: c.industry,
      creativeDirection: c.creativeDirection,
      opening1: c.hookDesign, opening2: '',
      hook: c.hookDesign, middle: c.structure, ending: '',
    })),
  });
  const results: Array<{ index?: number; reason?: string }> = Array.isArray(data?.results) ? data.results : [];
  const reasonByIdx = new Map<number, string>();
  for (const r of results) {
    const idx = Number(r?.index);
    if (Number.isInteger(idx) && idx >= 1) reasonByIdx.set(idx, String(r?.reason || '').trim());
  }
  return cases.map((_, i) => reasonByIdx.get(i + 1) || '');
}

/** 单条创意方向 → 30s 完整拍摄脚本（逐秒分镜 / 台词 / 画面 / 字幕 / 拍摄注意事项，四段式结构：痛点分析·卖点分析·放大功效·加速转化） */
export async function exportScript(
  product: { productName: string; brand: string; industry: string; category: string; price?: number | null; sellingPoints?: string; usageScene?: string; targetAudience?: string },
  dir: CreativeDirection,
): Promise<ScriptExport> {
  if (isDemoMode()) {
    await demoLatency();
    const rows: Array<[string, string, typeof dir.script.pain]> = [
      ['0-6s', '痛点分析', dir.script.pain], ['6-13s', '卖点分析', dir.script.sell],
      ['13-22s', '放大功效', dir.script.release], ['22-30s', '加速转化', dir.script.close],
    ];
    return {
      title: `30s 完整拍摄脚本 · ${dir.title || dir.angle}`,
      segments: rows.map(([range, phase, x]) => ({
        range, phase, visual: x.visual, voiceover: x.voiceover, subtitle: x.voiceover.slice(0, 14),
      })),
      shootingTips: ['同光线同角度拍摄前后对比', '真人素颜出镜增强可信度', '成分用微距特写', '前3秒快速给出痛点'],
    };
  }
  const data = await callFaasRaw({
    stage: 'script_export',
    product: {
      productName: product.productName, brand: product.brand, industry: product.industry,
      category: product.category, price: product.price ?? '',
      sellingPoints: product.sellingPoints || '', usageScene: product.usageScene || '',
      targetAudience: product.targetAudience || '',
    },
    direction: {
      angle: dir.angle, title: dir.title, concept: dir.concept,
      script: {
        pain: dir.script.pain, sell: dir.script.sell,
        release: dir.script.release, close: dir.script.close,
      },
      hooks: dir.hooks, shootingTip: dir.shootingTip,
    },
  });
  const segs = Array.isArray(data?.segments) ? data.segments : [];
  const segments: ScriptExportSegment[] = segs.slice(0, 4).map((s: any) => ({
    range: String(s?.range || '').slice(0, 12),
    phase: String(s?.phase || '').slice(0, 20),
    visual: String(s?.visual || '').slice(0, 300),
    voiceover: String(s?.voiceover || '').slice(0, 200),
    subtitle: String(s?.subtitle || '').slice(0, 60),
  }));
  const tips = Array.isArray(data?.shootingTips)
    ? data.shootingTips.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  return { title: String(data?.title || '30s 完整拍摄脚本'), segments, shootingTips: tips };
}

/** 脚本迭代优化：原四段式脚本（痛点分析·卖点分析·放大功效·加速转化）+ 用户优化方向 → 优化后的四段脚本（结构同 CreativeDirection，可反复迭代） */
export async function refineScript(
  product: { productName: string; brand: string; industry: string; category: string; price?: number | null; sellingPoints?: string; usageScene?: string; targetAudience?: string },
  original: CreativeDirection,
  refinement: string,
): Promise<CreativeDirection> {
  if (isDemoMode()) {
    await demoLatency();
    const note = String(refinement || '').trim();
    if (isScentProduct(product)) {
      let variant = '';
      if (/口语|自然|像朋友|说话/.test(note)) variant = '说真的，梅雨季屋里那股闷味，你就喷两下，哎，味道一下就舒服了，跟小时候晒过的被子一个味。';
      else if (/逼单|限时|库存|稀缺|手慢/.test(note)) variant = '就今天这个活动价，库存真不多，现在点购物车先囤一瓶，手慢无。';
      else if (/压缩|缩短|时长|更短/.test(note)) variant = '梅季霉味？喷一下，没了。十几块，点购物车。';
      if (variant) {
        return {
          ...original,
          concept: `${original.concept}（优化：${note.slice(0, 40)}）`,
          script: { ...original.script, close: { ...original.script.close, voiceover: variant } },
        };
      }
    }
    return {
      ...original,
      concept: note ? `${original.concept}（已按优化方向调整：${note.slice(0, 60)}）` : original.concept,
    };
  }
  const data = await callFaasRaw({
    stage: 'script_refine',
    product: {
      productName: product.productName, brand: product.brand, industry: product.industry,
      category: product.category, price: product.price ?? '',
      sellingPoints: product.sellingPoints || '', usageScene: product.usageScene || '',
      targetAudience: product.targetAudience || '',
    },
    originalScript: {
      angle: original.angle, title: original.title, concept: original.concept,
      script: {
        pain: original.script.pain, sell: original.script.sell,
        release: original.script.release, close: original.script.close,
      },
      hooks: original.hooks, shootingTip: original.shootingTip,
      materialPick: original.materialPick,
    },
    // 优化方向可能附带「可借钩子」与「参考爆款视频拆解（≤600字）」，额度给到 900 字（与 FaaS script_refine 对齐）
    refinement: String(refinement || '').slice(0, 900),
  });
  // 角度保持原版（FaaS 也会回传原 angle），内容用优化后的四段
  const refined = normalizeOneDirection(data, original.angle);
  // 参考案例标题兜底：AI 可能把角度名误填进 refCaseTitle，此时沿用原版真实案例标题
  (['pain', 'sell', 'release', 'close'] as const).forEach(k => {
    const r = refined.script[k]?.refCaseTitle?.trim();
    const o = original.script[k]?.refCaseTitle?.trim();
    if (o && (!r || r === refined.angle || r === refined.title || r.length < 4)) {
      refined.script[k].refCaseTitle = o;
    }
  });
  return refined;
}

/** 导出飞书文档（script_export_doc）入参片段 */
export interface ScriptDocSegment {
  key: string;
  label?: string;
  visual?: string;
  /** 口播各版说法（前端按说法①/②选择结果组装） */
  versions?: string[];
  /** 已生成的 AI 镜头视频/图片公网链接（视频以内联文件块写入文档） */
  videoUrl?: string;
  mediaType?: string;
}

export interface ScriptDocResult {
  url: string;
  documentId: string;
  title: string;
  videoCount: number;
  embeddedCount: number;
  warnings: string[];
  shareEntity: string;
}

/**
 * 四段脚本 + 完整话术 + 已生成 AI 镜头视频 → 新建飞书文档（视频作为文件块内联，便于跟踪与分享达人）。
 * 渠道经理会被自动加为文档协作者；公开链接权限取决于应用 scope，失败时返回 warnings。
 * demo 模式同样走真实创建链路（预填数据 + 自动开跑之外，功能与正式版完全一致）。
 */
export async function exportScriptDoc(payload: {
  title?: string;
  product: { productName?: string; brand?: string; industry?: string; category?: string; url?: string };
  direction: {
    angle?: string; title?: string; concept?: string; hooks?: string[]; shootingTip?: string;
    materialPick?: { type?: string; reason?: string; secondType?: string; secondReason?: string };
  };
  fullScript?: string;
  segments: ScriptDocSegment[];
}): Promise<ScriptDocResult> {
  const data = await callFaasRaw({ stage: 'script_export_doc', ...payload });
  return {
    url: String(data?.url || ''),
    documentId: String(data?.documentId || ''),
    title: String(data?.title || ''),
    videoCount: Number(data?.videoCount || 0),
    embeddedCount: Number(data?.embeddedCount || 0),
    warnings: Array.isArray(data?.warnings) ? data.warnings.map((w: any) => String(w)) : [],
    shareEntity: String(data?.shareEntity || ''),
  };
}

/** 把 ScriptExport 拼成可一键复制的完整脚本文本 */
export function scriptToText(se: ScriptExport, meta: { productName: string; direction: string }): string {
  const L: string[] = [];
  L.push(`【30s 完整拍摄脚本】${meta.productName} · ${meta.direction}`);
  L.push(se.title);
  L.push('');
  for (const s of se.segments) {
    L.push(`■ ${s.range} ${s.phase}`);
    L.push(`画面/分镜：${s.visual}`);
    L.push(`口播台词：${s.voiceover}`);
    L.push(`屏幕字幕：${s.subtitle}`);
    L.push('');
  }
  if (se.shootingTips.length) {
    L.push('【拍摄注意事项】');
    se.shootingTips.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  }
  return L.join('\n');
}

// ============================================================
// 第一部分：100 分制产品打分（评分模型v1，确定性在前端算）+ scoring_ai（红线/策略）
// ============================================================

export interface ScoringRedLine { name: string; hit: boolean; reason: string; }

/** scoring_ai 阶段返回：4 条红线 + 策略/风险/优化 + 总评/短板 */
export interface ScoringAi {
  redLines: ScoringRedLine[];
  strategy: string[];
  risks: string[];
  optimize: string[];
  summary: string;
  shortBoard: string;
}

export interface ScoringAiRequestBody {
  product: {
    productName: string; brand: string; industry: string; category: string;
    price: number | null; sellingPoints: string; agent?: string;
  };
  inputs: {
    xcBudgetWan?: number | null;
    dailySpend: number | null; penetration: number | null;
    stableRoi: number | null; targetRoi: number | null; reverseSelectPct: number | null; materialChasePct: number | null;
  };
  category: Record<string, unknown> | null;
  result: { total: number; level: string; budgetTier?: string | null; dims: { name: string; score: number; max: number; band: string }[] };
}

/** 调用 scoring_ai 阶段：红线 4 条评估 + 策略/风险/优化建议（100 分由前端确定性计算） */
export async function fetchScoringAi(body: ScoringAiRequestBody): Promise<ScoringAi> {
  if (isDemoMode()) { await demoLatency(); return demoScoringAi(); }
  const data = await callFaasRaw({ stage: 'scoring_ai', ...body });
  const redLines: ScoringRedLine[] = Array.isArray(data?.redLines)
    ? data.redLines.map((x: any) => ({ name: String(x?.name || '').slice(0, 30), hit: !!x?.hit, reason: String(x?.reason || '').slice(0, 60) }))
    : [];
  return {
    redLines,
    strategy: StringArr(data?.strategy).slice(0, 3),
    risks: StringArr(data?.risks).slice(0, 3),
    optimize: StringArr(data?.optimize).slice(0, 3),
    summary: String(data?.summary || '').slice(0, 120),
    shortBoard: String(data?.shortBoard || '').slice(0, 60),
  };
}

/** scoring_display 阶段返回（仅 github.io 来源由 FaaS 生成；内站返回 masked:false） */
export interface ScoringDisplay {
  card: { k: string; v: string }[];   // 类目参考绿卡 8 项：指标名 + 方向性值
  subs: Record<string, string[]>;      // 五维子项明细方向文案（key = dim.key，按下标对齐）
  bench?: { k: string; v: string }[];  // 当前类目脱敏基准 7 卡：仅区间/分位标签
}
export interface ScoringDisplayRequestBody {
  product: { price: number | null };
  inputs: {
    xcBudgetWan?: number | null;
    dailySpend: number | null; penetration: number | null;
    stableRoi: number | null; targetRoi: number | null; reverseSelectPct: number | null; materialChasePct: number | null;
  };
  category: Record<string, unknown> | null;
}

/** 拉取评分区展示包：FaaS 按请求来源决定精确/方向化；非 github 来源或失败均返回 null（前端回退本地精确渲染） */
export async function fetchScoringDisplay(body: ScoringDisplayRequestBody): Promise<ScoringDisplay | null> {
  if (isDemoMode()) {
    await demoLatency();
    return { card: DEMO_SCORING_DISPLAY_CARD, subs: DEMO_SCORING_DISPLAY_SUBS, bench: DEMO_BENCH };
  }
  try {
    const data = await callFaasRaw({ stage: 'scoring_display', ...body });
    if (!data || data.masked !== true) return null;
    const card = Array.isArray(data.card)
      ? data.card.map((x: any) => ({ k: String(x?.k || ''), v: String(x?.v || '') })).filter((x: any) => x.k && x.v)
      : [];
    const subs = (data.subs && typeof data.subs === 'object') ? data.subs as Record<string, string[]> : {};
    const bench = Array.isArray(data.bench)
      ? data.bench.map((x: any) => ({ k: String(x?.k || ''), v: String(x?.v || '') })).filter((x: any) => x.k && x.v)
      : [];
    if (!card.length && !bench.length) return null;
    return { card, subs, bench };
  } catch { return null; }
}

// ============================================================
// 一页纸报告：scoring_report（评分+红线诊断 → 服务商给品牌方的《星川内容策略评估报告》）
// ============================================================

export type ScoringDimKey = 'budget' | 'roi' | 'delivery' | 'trend' | 'price';

export interface ScoringReportDim {
  key: ScoringDimKey;
  opportunity: string;   // 机会点/现状（向品牌方解释的语言，引用具体数值）
  points: string[];      // 多条可落地策略动作（量化、可执行）
}

export interface ScoringActionItem {
  task: string;          // 核心行动（动词开头）
  cycle: string;         // 预期执行周期
  signal: string;        // 关键成功信号（量化指标）
}

export interface ScoringReport {
  headline: string;      // 一句话总结论
  narrative: string;     // 整体解读
  dimReports: ScoringReportDim[];  // 5 维，key 顺序 budget/roi/delivery/trend/price
  actionItems: ScoringActionItem[];  // 3-4 条核心行动项（带周期与成功信号）
  degraded?: boolean;    // true=AI 失败走了确定性兜底
}

export interface ScoringReportRequestBody {
  product: {
    productName: string; brand: string; industry: string; category: string;
    price: number | null; sellingPoints: string; agent?: string;
    usageScene?: string; targetAudience?: string;
  };
  inputs: {
    xcBudgetWan?: number | null;
    dailySpend: number | null; penetration: number | null;
    stableRoi: number | null; targetRoi: number | null; reverseSelectPct: number | null; materialChasePct: number | null;
  };
  category: Record<string, unknown> | null;
  result: {
    total: number; level: string;
    budgetRatio?: number | null; budgetTier?: 'P60+' | 'P40-P60' | 'P20-P40' | '<P20' | null;
    tolerance?: number | null;
    roiRatio?: number | null; priceDev?: number | null;
    dims: { name: string; score: number; max: number; band: string }[];
  };
  ai: ScoringAi | null;   // 已有 AI 红线/策略诊断时一并传入，报告内容与诊断保持一致
}

const REPORT_DIM_KEYS: ScoringDimKey[] = ['budget', 'roi', 'delivery', 'trend', 'price'];

/** 调用 scoring_report 阶段：生成给品牌方看的一页纸报告内容（AI 失败时 FaaS 侧确定性兜底，永不 502） */
export async function fetchScoringReport(body: ScoringReportRequestBody): Promise<ScoringReport> {
  if (isDemoMode()) { await demoLatency(); return demoScoringReport(); }
  const data = await callFaasRaw({ stage: 'scoring_report', ...body });
  const rawDims = Array.isArray(data?.dimReports) ? data.dimReports : [];
  const dimReports: ScoringReportDim[] = REPORT_DIM_KEYS.map((k) => {
    const f = rawDims.find((x: any) => String(x?.key || '').toLowerCase() === k) || {};
    const d = body.result.dims[REPORT_DIM_KEYS.indexOf(k)];
    // 兼容新 schema（points 数组）与旧 schema（action 单条字符串）
    let points = StringArr(f.points).map((s) => s.trim()).filter(Boolean);
    if (!points.length) {
      const single = String(f.action || '').trim();
      if (single) points = [single];
    }
    if (!points.length) points = ['按该维度得分档位制定专项优化动作，明确量化标准与责任人，补齐短板后推进星川小步测试。'];
    return {
      key: k,
      opportunity: String(f.opportunity || '').trim().slice(0, 200)
        || `${d?.name || '该维度'}得分 ${d?.score ?? '—'}/${d?.max ?? '—'}（${d?.band || '待评定'}），建议结合该档位向品牌方说明现状与提升机会。`,
      points: points.slice(0, 3),
    };
  });
  // 底部行动项：兼容新 actionItems{task,cycle,signal} 与旧 actions[string]
  const rawItems = Array.isArray(data?.actionItems) ? data.actionItems
    : (Array.isArray(data?.actions) ? data.actions.map((a: unknown) => ({ task: a })) : []);
  let actionItems: ScoringActionItem[] = rawItems.map((x: any) => ({
    task: String(x?.task || x?.action || '').trim().slice(0, 80),
    cycle: String(x?.cycle || x?.when || '').trim().slice(0, 50),
    signal: String(x?.signal || x?.metric || '').trim().slice(0, 80),
  })).filter((x: ScoringActionItem) => x.task);
  if (actionItems.length < 3) {
    const fbItems: ScoringActionItem[] = [
      { task: '先核验毛利/合规资质/库存履约/素材供给四项，确认无红线隐患', cycle: '第1周内完成', signal: '四项核验全部通过、留存核验记录' },
      { task: '按得分短板补齐预算与ROI机制后，启动7-14天星川小步测试', cycle: '第1-2周完成', signal: '测试期ROI连续3天达标、单日消耗稳定' },
      { task: '跑量素材及时追投并按日复盘迭代，达标后复制放量', cycle: '上线后2周内验证', signal: '单素材ROI连续3天达标、跑量素材占比提升' },
    ];
    while (actionItems.length < 3) actionItems.push(fbItems[actionItems.length]);
  }
  return {
    headline: String(data?.headline || '').trim().slice(0, 80)
      || `综合得分${body.result.total}分`,
    narrative: String(data?.narrative || '').trim().slice(0, 300)
      || body.ai?.summary
      || `本商品星川综合得分${body.result.total}分，服务商可按逐维度机会点与行动建议推进合作。`,
    dimReports,
    actionItems: actionItems.slice(0, 4),
    degraded: !!data?.degraded,
  };
}

// ============================================================
// 服务商达人库适配分析（一页纸报告内嵌模块）
//   stock_influencer_match_product：按调用来源取数——对内只读主库「存量达人库」归属行；
//                                   对外（github.io 登录态）只读服务商自助打标台账，按商品行业匹配
//   gen_industry_advantage：基于匹配达人真实标签分布 AI 生成约 200 字行业垂类服务优势
// ============================================================
export interface AgencyFitCreator {
  name: string;
  level: string;            // S5-S0 或 未分级
  tier: string;             // 标杆/主力/潜力/储备
  fans: number;
  fansTier: string;         // 万级以下/万级/十万级/百万级
  industry: string[];
  persona: string[];
}
export interface AgencyFitData {
  agency: string;           // 入参/登录态里的原始服务商名
  canonical: string;        // 归一到存量库「所属代理商」选项的名称
  source: 'stock' | 'tagger';  // stock=对内主库存量库；tagger=对外自助打标台账
  tags: string[];           // 本次匹配用的 17 类行业标签
  total: number;            // 该服务商达人库总数
  matchedCount: number;     // 行业匹配达人数
  fromStock: number;
  fromTagger: number;
  batches: number;
  levelDist: Record<string, number>;
  tierDist: Record<string, number>;
  fansDist: Record<string, number>;
  mainLevel: string;
  mainLevelN: number;
  mainTier: string;
  mainTierN: number;
  topFans: string;
  coverage: '强' | '中' | '弱';
  topCreators: AgencyFitCreator[];
  conclusion: string;
  personaTop: { name: string; n: number }[];
  formsTop: { name: string; n: number }[];
  styleTop: { name: string; n: number }[];
  empty: boolean;
}
export interface AgencyFitRequestBody {
  // 对内传 agent（自由文本，服务端按别名归一）；对外传 token（只认登录态三元组 agency）
  agent?: string;
  token?: string;
  tags?: string[];          // 商品行业标签（17 类闭集，前端勾选值优先）
  level1?: string;          // 门捷列夫一级类目（兜底映射）
  industry?: string;        // 对内 7 行业（再兜底）
  productName?: string;
}
/** 一页纸报告：拉取当前服务商达人库与商品行业的适配统计（永不 502，空库返回 empty=true） */
export async function fetchAgencyFit(body: AgencyFitRequestBody): Promise<AgencyFitData> {
  if (isDemoMode()) { await demoLatency(); return demoAgencyFit(body); }
  return await callFaasRaw({ stage: 'stock_influencer_match_product', ...body });
}
/** 一页纸报告：生成约 200 字行业垂类服务优势文案（AI 失败服务端确定性兜底） */
export async function fetchIndustryAdvantage(body: AgencyFitRequestBody): Promise<{ text: string; matchedCount: number }> {
  if (isDemoMode()) { await demoLatency(); return demoIndustryAdvantage(body); }
  return await callFaasRaw({ stage: 'gen_industry_advantage', ...body });
}

/** 服务商适配分析：把商品定级（推荐/手选）同步到代理商爆品库，同时更新分数与一页纸分级服务策略 */
export async function saveFitGrade(body: AgencyFitRequestBody & {
  score?: number | null;
  grade: 'P0' | 'P1' | 'P2' | 'P3';
  fitKind?: 'supply' | 'ability';   // P1 区分：供给补齐 / 能力带动
  manual?: boolean;
}): Promise<{ ok: boolean; recordId?: string; grade: string }> {
  // 🎬 demo：不写真实爆品库，直接回成功
  if (isDemoMode()) return { ok: true, recordId: 'demo-fit-record', grade: body.grade };
  return await callFaasRaw({ stage: 'baopin_save_fit_grade', ...body });
}

/** 报告 → 纯文本（「复制文字」导出用） */
export function reportToText(
  r: ScoringReport,
  meta: {
    productName: string; brand: string; agent: string; date: string;
    total: number; levelLabel: string;
    dims: { name: string; score: number; max: number }[];
    redLines: ScoringRedLine[];
    fitStrategy?: {
      grade: string; name: string; manual: boolean;
      strategy: {
        summary: string; resource: string; budget: string;
        creator: string; content: string; review: string;
      };
    } | null;
  },
): string {
  const L: string[] = [];
  const partner = meta.agent || '星川认证服务商';
  L.push(`星川 × ${partner} 内容策略评估报告`);
  L.push(`商品：${meta.productName || '—'}${meta.brand ? `｜品牌：${meta.brand}` : ''}`);
  L.push(`综合得分：${meta.total}/100｜适配等级：${meta.levelLabel}｜日期：${meta.date}`);
  L.push('');
  L.push(`【总结论】${r.headline}`);
  if (r.narrative) L.push(r.narrative);
  L.push('');
  L.push('【五维得分明细与机会点】');
  r.dimReports.forEach((d, i) => {
    const dim = meta.dims[i];
    L.push(`${i + 1}. ${dim?.name || d.key}：${dim?.score ?? '—'}/${dim?.max ?? '—'}分`);
    L.push(`   机会点：${d.opportunity}`);
    L.push(`   建议动作：`);
    d.points.forEach((pt) => L.push(`     · ${pt}`));
  });
  const hit = meta.redLines.filter(x => x.hit);
  L.push('');
  L.push(`【红线检测】${hit.length ? '⚠️ ' + hit.map(x => x.name).join('、') : '✅ 毛利/合规/库存履约/素材供给 4 条红线均未触发'}`);
  L.push('');
  L.push('【品牌方行动项】');
  r.actionItems.forEach((a, i) => {
    L.push(`${i + 1}. ${a.task}`);
    if (a.cycle) L.push(`   ⏱ 执行周期：${a.cycle}`);
    if (a.signal) L.push(`   ✅ 成功信号：${a.signal}`);
  });
  // 分级服务策略（服务商适配分析定级后输出）
  if (meta.fitStrategy) {
    const f = meta.fitStrategy;
    L.push('');
    L.push(`【分级服务策略】商品定级 ${f.grade} · ${f.name}${f.manual ? '（服务商手选）' : '（系统推荐）'}`);
    L.push(`总策略：${f.strategy.summary}`);
    L.push(`资源配置：${f.strategy.resource}`);
    L.push(`预算节奏：${f.strategy.budget}`);
    L.push(`达人策略：${f.strategy.creator}`);
    L.push(`内容素材：${f.strategy.content}`);
    L.push(`复盘止损：${f.strategy.review}`);
  }
  L.push('');
  L.push(`—— 星川 × ${partner} 内容策略评估报告 · ${meta.date} · 计分模型v1`);
  return L.join('\n');
}

/** 第一部分打分结果 → 传入第二部分（内容创意）作为上下文 */
export interface ScoringContext {
  total: number;
  level: 'high' | 'mid' | 'low' | 'none';
  levelLabel: string;            // 高度适配 / 中度适配 / 低度适配 / 待评定
  redLineHit: boolean;
  level2: string;                // 二级类目
  dims: { name: string; score: number; max: number; band: string }[]; // 顺序：预算/ROI/交付/趋势/客单
  redLines: ScoringRedLine[];
  strategy: string[];
  risks: string[];
  optimize: string[];
  summary: string;
}

/** 把第一部分打分结果拼成文本上下文，注入 dir1/2/3 与 wrap 阶段，实现"打分→内容"无缝带入 */
function buildScoringBlock(ctx: ScoringContext): string {
  const L: string[] = [];
  L.push('## 第一部分商品分析结果（100 分制·计分模型v1，权威结论，内容创意须与之对齐）');
  L.push(`综合得分：${ctx.total}/100｜适配等级：${ctx.levelLabel}｜二级类目：${ctx.level2 || '未选'}`);
  const hitRed = ctx.redLines.filter(r => r.hit);
  L.push(`红线检测：${hitRed.length ? '命中 ' + hitRed.map(r => r.name).join('、') : '4 条红线均未触发'}`);
  L.push('各维度得分：' + ctx.dims.map(d => `${d.name}${d.score}/${d.max}（${d.band}）`).join('；'));
  if (ctx.summary) L.push(`AI 总评：${ctx.summary}`);
  if (ctx.strategy.length) L.push('策略建议：' + ctx.strategy.join('；'));
  if (ctx.risks.length) L.push('风险提示：' + ctx.risks.join('；'));
  L.push('（创意方向与话术须围绕得分高的优势维度放大、命中的红线在话术中规避，目标人群与卖点以下方信息为准）');
  return L.join('\n');
}

// ============================================================
// 内容创意链路（两段式）：
//   第一阶段 analyzeBriefPhase   ：商品洞察 → wrap（爆款案例+跑量公式+合规）→ gen_brief（3-5 条 Brief 方向）
//   中间用户操作                 ：查看/编辑/勾选 Brief 方向
//   第二阶段 generateScriptsPhase：按选定 Brief 调 dir1..dirN 生成痛/买/放/转四段脚本（方向携带 direction.brief）
// ============================================================

/** gen_brief 返回规整：最多 5 条，补字段非空，前端 id 稳定 */
function normalizeBriefsData(data: any): BriefDirection[] {
  const arr = Array.isArray(data?.briefs) ? data.briefs : [];
  const out: BriefDirection[] = [];
  const seen = new Set<string>();
  arr.forEach((b: any, i: number) => {
    const name = String(b?.name || '').trim().slice(0, 12);
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({
      id: `brief-${i + 1}`,
      name,
      coreSellingPoint: String(b?.coreSellingPoint || '').trim().slice(0, 60) || '聚焦本品核心卖点',
      targetAudience: String(b?.targetAudience || '').trim().slice(0, 40) || '本品目标消费人群',
      materialFormat: String(b?.materialFormat || '').trim().slice(0, 70) || '达人口播+真实使用场景',
      validationGoal: String(b?.validationGoal || '').trim().slice(0, 60) || '验证3秒完播率与商品点击率',
    });
  });
  return out.slice(0, 5);
}

/** 网络异常导致 gen_brief 未返回时的前端兜底 3 条 Brief（字段可继续编辑） */
function fallbackBriefs(input: ProductInput): BriefDirection[] {
  const pName = input.productName.trim().slice(0, 20) || '本品';
  const firstSP = input.sellingPoints.split(/[、,，；;\/\n]+/).map(s => s.trim()).filter(Boolean)[0] || `${pName}核心体验点`;
  const aud = input.targetAudience.trim() || '本品目标消费人群';
  const mk = (i: number, name: string, cp: string, mf: string, vg: string): BriefDirection => ({
    id: `brief-${i}`, name, coreSellingPoint: cp, targetAudience: aud, materialFormat: mf, validationGoal: vg,
  });
  return [
    mk(1, '痛点场景', `抓住目标人群高频痛点，用${pName}解决「${firstSP.slice(0, 16)}」`,
      '达人口播+真实使用场景，痛点放大、前后对比，3秒抛出冲突', '验证3秒完播率与商品点击率'),
    mk(2, '测评对比', `实测${pName}核心表现，过程画面证明「${firstSP.slice(0, 16)}」`,
      '开箱/测评形式，过程实拍+要点呈现，结尾给使用建议', '验证完播率与评论区种草意向'),
    mk(3, '效果证明', `聚焦「${firstSP.slice(0, 16)}」真实效果，建立信任再转化`,
      '素人/达人使用记录+真实反馈，场景化演示卖点', '验证转化率与千川追投ROI'),
  ];
}

/** Brief → dir 阶段方向种子：名称作 dirName，四要素拼 dirAngle，并通过 brief 原样透传给 FaaS */
function briefToDirectionRec(b: BriefDirection): DirectionRec {
  const text = `${b.name} ${b.materialFormat}`;
  let hookType = '痛点';
  if (/测评|开箱|对比|实测/.test(text)) hookType = '测评';
  else if (/避坑|反向|劝阻|智商税/.test(text)) hookType = '对比';
  else if (/福利|优惠|活动|薅/.test(text)) hookType = '福利';
  else if (/剧情|故事|vlog|Vlog|日常/.test(text)) hookType = '场景';
  else if (/证明|反馈|效果|见证/.test(text)) hookType = '证明';
  else if (/科普|知识|成分/.test(text)) hookType = '科普';
  return {
    dirName: b.name.slice(0, 12),
    hookType,
    dirAngle: `核心卖点：${b.coreSellingPoint}；目标人群：${b.targetAudience}；素材形式：${b.materialFormat}；验证目标：${b.validationGoal}`,
    brief: {
      coreSellingPoint: b.coreSellingPoint,
      targetAudience: b.targetAudience,
      materialFormat: b.materialFormat,
      validationGoal: b.validationGoal,
    },
  };
}

// 主流程：串行调用 FaaS 阶段，合并为 AnalyzeResult
// ============================================================

/**
 * 第一阶段：商品洞察 + 爆款素材参考 + Brief 拆解。
 * 若第一部分已完成 100 分制打分（scoringCtx），复用其评分+AI红线，跳过 AI 'score' 阶段。
 * 返回 creativeDirections 为空数组，脚本由 generateScriptsPhase 在用户确认 Brief 后生成。
 */
export async function analyzeBriefPhase(
  input: ProductInput,
  onProgress?: (stage: string, partial: unknown) => void,
  scoringCtx?: ScoringContext,
  opts?: { skipScore?: boolean },
  breakdownInsights?: string,
): Promise<AnalyzeResult> {
  if (isDemoMode()) {
    await demoLatency();
    return isScentProduct(input) ? demoScentAnalyzeResult() : demoAnalyzeResult();
  }
  if (!input.productName.trim()) throw new Error('请填写产品名');
  if (!input.brand.trim()) throw new Error('请填写品牌');
  if (input.price == null) throw new Error('请填写客单价');

  // 1) 行业映射 → 本地素材匹配（rankMaterials 纯本地，不涉及模型）
  const materials = rankMaterials(input);
  const scoringBlock = scoringCtx ? buildScoringBlock(scoringCtx) : '';
  const payload: FaasPayload = {
    context: buildContext(input, materials) + (scoringBlock ? `\n\n${scoringBlock}` : ''),
    cases: buildCasesText(materials),
    formulas: buildFormulasText(materials),
  };
  // 创意链路使用精简 payload（产品核心信息 + 5 条案例/公式），缩短 prompt 防超时
  const dirPayload: FaasPayload = {
    context: buildDirContext(input) + (scoringBlock ? `\n\n${scoringBlock}` : ''),
    cases: buildDirCasesText(materials),
    formulas: buildDirFormulasText(materials),
    category: input.category || '',
    // 行业热点（用户勾选「纳入创作参考」才会有值）
    ...(input.hotNewsRef ? { hotNewsRef: input.hotNewsRef } : {}),
    ...(breakdownInsights ? { breakdownInsights } : {}),
  };

  // 2) 串行阶段。
  //    若第一部分已完成 100 分制打分（scoringCtx），直接复用其确定性评分+AI红线，
  //    跳过重复的 AI 'score' 阶段（该阶段输出不被 dir/wrap 使用），评分以评分模型v1 为准。
  //    否则走旧的 AI score 阶段（兼容）。
  let scoreData: any = null;
  if (scoringCtx) {
    scoreData = { scoring: { fromScoringModel: true }, _scoringCtx: scoringCtx };
    onProgress?.('score', scoreData);
  } else if (opts?.skipScore) {
    // 单独「内容脚本」模式：跳过 AI 打分阶段，直接进入创意脚本（dir1/2/3 + wrap）
    scoreData = {};
    onProgress?.('score', { skipped: true });
  } else {
    scoreData = await callFaasStage('score', payload);
    onProgress?.('score', scoreData);
  }

  // 3) wrap 前置：matchedCases（爆款素材参考 Top3）+ 跑量公式 + 拍摄/合规/达人画像
  const wrapData = await callFaasStage('wrap', breakdownInsights ? { ...payload, breakdownInsights } : payload);
  onProgress?.('wrap', wrapData);

  // 4) gen_brief：商品信息 + 类目 + 爆款素材参考摘要 + 跑量公式 → 3-5 条 Brief 方向；失败兜底不阻塞
  let briefs: BriefDirection[] = [];
  try {
    const briefData = await callFaasStage('gen_brief', dirPayload);
    briefs = normalizeBriefsData(briefData);
  } catch { /* 网络异常走前端兜底 */ }
  if (briefs.length === 0) briefs = fallbackBriefs(input);
  onProgress?.('gen_brief', { briefs });

  // 3) 组装评分块 ScoringBlock
  let scoring: ScoringBlock;
  let totalScore: number;

  if (scoringCtx) {
    // —— 第一部分 100 分制（评分模型v1）：5 维全部确定性测算（类目底表感知）——
    const d = scoringCtx.dims;
    const mk = (name: string, score: number, max: number, band: string): ScoreItem => ({
      score,
      rationale: `${name}：${band}（${score}/${max}）— 计分模型v1 按二级类目底表确定性测算`,
      confidence: 'high',
    });
    const dimScore = (i: number) => d[i]?.score ?? 0;
    scoring = {
      scores: {
        budget: mk('投放预算', dimScore(0), d[0]?.max ?? 25, d[0]?.band || ''),
        roiTolerance: mk('ROI 阈值', dimScore(1), d[1]?.max ?? 25, d[1]?.band || ''),
        delivery: mk('追投预算·反选/素材追投', dimScore(2), d[2]?.max ?? 15, d[2]?.band || ''),
        trend: mk('爆品趋势', dimScore(3), d[3]?.max ?? 20, d[3]?.band || ''),
        pricePoint: mk('客单价', dimScore(4), d[4]?.max ?? 15, d[4]?.band || ''),
      },
      redLines: (scoringCtx.redLines || []).map(r => ({ name: r.name, hit: !!r.hit, reason: r.reason })),
      strategyAdvice: [scoringCtx.summary, ...(scoringCtx.strategy || [])].filter(Boolean).slice(0, 4),
    };
    totalScore = scoringCtx.total;
  } else {
    // —— 兼容旧流程：硬算前三维 + AI 后两维 ——
    const hard = hardScores({
      qianchuanDailySpend: input.qianchuanDailySpend ?? 0,
      targetPenetration: input.targetPenetration ?? 15,
      stableRoi: input.stableRoi ?? 0,
      targetRoi: input.targetRoi ?? 0,
      reverseSelectPct: input.reverseSelectPct ?? 0,
      materialChasePct: input.materialChasePct ?? 0,
    });
    const scoringSrc = (scoreData?.scoring && typeof scoreData.scoring === 'object') ? scoreData.scoring : {};
    const scores = scoringSrc.scores || scoreData?.scores || {};
    const mergeHard = (ai: any, hardItem: { score: number; rationale: string }): ScoreItem => ({
      score: hardItem.score,
      rationale: hardItem.rationale,
      confidence: 'high',
      aiScore: typeof ai?.score === 'number' ? ai.score : undefined,
    });
    scoring = {
      scores: {
        budget: mergeHard(scores.budget, hard.budget),
        roiTolerance: mergeHard(scores.roiTolerance, hard.roiTolerance),
        delivery: mergeHard(scores.delivery, hard.delivery),
        trend: {
          score: clampScore(scores.trend?.score, SCORE_MAX.trend),
          rationale: String(scores.trend?.rationale || 'AI 未给出理由'),
          confidence: normConfidence(scores.trend?.confidence),
          dataNeeded: scores.trend?.dataNeeded ? String(scores.trend.dataNeeded) : undefined,
        },
        pricePoint: {
          score: clampScore(scores.pricePoint?.score, SCORE_MAX.pricePoint),
          rationale: String(scores.pricePoint?.rationale || 'AI 未给出理由'),
          confidence: normConfidence(scores.pricePoint?.confidence),
        },
      },
      redLines: normalizeRedLines(scoringSrc.redLines ?? scoreData?.redLines),
      strategyAdvice: StringArr(scoringSrc.strategyAdvice ?? scoreData?.strategyAdvice),
    };
    totalScore =
      scoring.scores.budget.score + scoring.scores.roiTolerance.score + scoring.scores.delivery.score +
      scoring.scores.trend.score + scoring.scores.pricePoint.score;
  }

  // 4) 产品拆解（第一部分打分上下文：卖点/人群取表单，风险取 AI 红线建议；旧流程取 score 阶段）
  const product: ProductAnalysis = {
    sellingPoints: input.sellingPoints
      ? input.sellingPoints.split(/[、,，；;\/\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 6)
      : StringArr(scoreData?.product?.sellingPoints),
    targetAudience: input.targetAudience || String(scoreData?.product?.targetAudience || ''),
    contentStyle: String(scoreData?.product?.contentStyle || ''),
    risks: scoringCtx ? (scoringCtx.risks || []) : StringArr(scoreData?.product?.risks),
  };
  if (!scoringCtx && Array.isArray(scoreData?.product?.competitors)) {
    product.competitors = scoreData.product.competitors.slice(0, 5).map((c: any) => ({
      name: String(c?.name || '未知竞品'),
      priceBand: String(c?.priceBand || '—'),
      contentStrategy: String(c?.contentStrategy || '—'),
    }));
  }
  if (!scoringCtx && Array.isArray(scoreData?.product?.differentiators)) {
    product.differentiators = StringArr(scoreData.product.differentiators);
  }

  // 5) 案例匹配富化（wrap 阶段 matchedCases 的 caseIndex 为 cases 文本序号，1-based → 本地 Top8 下标）
  const matchedCaseDetails: MatchedCaseDetail[] = [];
  const matchedCases: MatchedCaseRef[] = [];
  for (const mc of Array.isArray(wrapData?.matchedCases) ? wrapData.matchedCases : []) {
    const idx = Number(mc?.caseIndex);
    if (!idx || idx < 1 || idx > FAAS_CASE_N || idx > materials.cases.length) continue;
    const item = materials.cases[idx - 1];
    const reason = String(mc?.reason || '');
    matchedCases.push({ caseIndex: idx, reason });
    matchedCaseDetails.push({
      caseIndex: idx,
      title: item.title,
      brand: item.brand || '',
      coverImageUrl: item.coverImageUrl || '',
      videoLink: item.videoLink || '',
      reason,
    });
  }

  // 6) 多品牌爆款案例池（「查看更多」展开用）：本地素材字段组装，AI 匹配理由由 case_reasons 阶段懒加载
  const moreCases: MoreCaseItem[] = materials.cases.slice(0, MORE_CASE_N).map((item, i) => ({
    id: item.id || `more_case_${i}`,
    title: item.title,
    brand: item.brand || '',
    industry: item.industry || '',
    category: item.productSubCategory || item.category || '',
    creativeDirection: item.creativeDirection || '',
    coverImageUrl: item.coverImageUrl || '',
    videoLink: item.videoLink || '',
    hotAnalysis: String(item.hot_analysis || '').slice(0, 600),
    hookDesign: [item.openingHookLevel1 && `一级钩子：${item.openingHookLevel1}`,
                 item.openingHookLevel2 && `二级钩子：${item.openingHookLevel2}`,
                 item.hook_line && `钩子口播：${item.hook_line}`,
                 item.analysis_pre3s_hook && `前3秒：${item.analysis_pre3s_hook}`]
      .filter(Boolean).join('；').slice(0, 500),
    structure: [item.analysis_middle_structure && `中段结构：${item.analysis_middle_structure}`,
                item.analysis_ending && `结尾转化：${item.analysis_ending}`]
      .filter(Boolean).join('；').slice(0, 700),
    consumption: item.metrics?.xingchuanConsumptionLevel || '',
  }));

  return {
    product,
    scoring,
    matchedCases,
    briefs,
    customFormula: normalizeFormula(wrapData?.customFormula),
    creativeDirections: [],   // 第二阶段用户确认 Brief 后由 generateScriptsPhase 回填
    shootingTips: StringArr(wrapData?.shootingTips).slice(0, 4),
    complianceNotes: StringArr(wrapData?.complianceNotes).slice(0, 3),
    influencerFramework: normalizeInfluencers(wrapData?.influencerFramework),
    matchedCaseDetails,
    moreCases,
    industryCaseCount: materials.industryCaseCount,
    totalScore,
  };
}

// ---- 第二阶段：按选定 Brief 生成四段式脚本 ----

/**
 * 第二阶段：按用户选定/编辑的 Brief 逐条生成四段式脚本。
 * 串行调用 dir1..dirN（N=选中 Brief 数，最多 5），每方向携带 direction.brief，
 * FaaS 严格按 Brief 的核心买点/目标人群/素材形式/验证目标产出痛/买/放/转四段。
 */
export async function generateScriptsPhase(
  input: ProductInput,
  briefs: BriefDirection[],
  onProgress?: (stage: string, partial: unknown) => void,
  opts?: { scoringCtx?: ScoringContext; breakdownInsights?: string },
): Promise<CreativeDirection[]> {
  if (isDemoMode()) {
    await demoLatency();
    return isScentProduct(input) ? demoScentDirections() : demoDirections();
  }
  if (!input.productName.trim()) throw new Error('请填写产品名');
  if (!briefs.length) throw new Error('请至少选择 1 个 Brief 方向');

  const selected = briefs.slice(0, 5);
  const materials = rankMaterials(input);
  const scoringBlock = opts?.scoringCtx ? buildScoringBlock(opts.scoringCtx) : '';
  const dirPayload: FaasPayload = {
    context: buildDirContext(input) + (scoringBlock ? `\n\n${scoringBlock}` : ''),
    cases: buildDirCasesText(materials),
    formulas: buildDirFormulasText(materials),
    ...(input.hotNewsRef ? { hotNewsRef: input.hotNewsRef } : {}),
    ...(opts?.breakdownInsights ? { breakdownInsights: opts.breakdownInsights } : {}),
  };

  const recs = selected.map(briefToDirectionRec);
  const dirDataList: any[] = [];
  for (let i = 0; i < recs.length; i++) {
    const stage = `dir${i + 1}`;
    const d = await callFaasStage(stage, { ...dirPayload, direction: recs[i] });
    dirDataList.push(d);
    onProgress?.(stage, d);
  }
  return normalizeDirections(dirDataList, recs);
}

// ---- 结果归一化工具 ----

function clampScore(v: any, max: number): number {
  const n = Number(v);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function normConfidence(v: any): Confidence {
  return v === 'high' || v === 'mid' || v === 'low' ? v : 'mid';
}

function StringArr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => String(x || '').trim()).filter(Boolean);
}

const RED_LINE_NAMES = ['毛利不覆盖目标ROI', '合规高风险', '库存履约承接不了', '无素材供给'];

function normalizeRedLines(v: any): RedLine[] {
  const list: RedLine[] = [];
  for (let i = 0; i < RED_LINE_NAMES.length; i++) {
    const item = Array.isArray(v) ? v[i] : null;
    list.push({
      name: RED_LINE_NAMES[i],
      hit: Boolean(item?.hit),
      reason: String(item?.reason || '').trim() || (item?.hit === false ? '未触发' : 'AI 未给出判断'),
    });
  }
  return list;
}

function normalizeFormula(v: any): CustomFormulaStage[] {
  const fallbackStages = ['吸引注意', '兴趣种草', '买点转化', '转化成交', '收尾引导'];
  if (!Array.isArray(v)) return fallbackStages.map(stage => ({ stage, technique: '', detail: '', goal: '' }));
  const stages = v.slice(0, 5).map((s: any, i: number) => ({
    stage: String(s?.stage || fallbackStages[i] || `环节${i + 1}`),
    technique: String(s?.technique || ''),
    detail: String(s?.detail || ''),
    goal: String(s?.goal || ''),
  }));
  while (stages.length < 5) stages.push({ stage: fallbackStages[stages.length], technique: '', detail: '', goal: '' });
  return stages;
}

/**
 * 分段前端兜底：FaaS 已做多轮重试 + 确定性补全，正常情况下不会触发。
 * 这里是最后一道防线——任何分段缺内容都用可用的实质文案兜底，页面绝不出现「—」空占位。
 */
const SEG_FALLBACK: Record<string, { visual: string; voiceover: string }> = {
  pain: {
    visual: '达人面对镜头演绎目标人群常见困扰场景，表情真实有共鸣，穿插生活细节镜头',
    voiceover: '有没有跟我一样被这个问题反复困扰的？花过冤枉钱、踩过坑的肯定懂那种无奈，先别划走，看完你就知道该怎么选、怎么少走弯路。\n这种糟心事我经历过不止一次，钱没少花问题还在，今天把我的经验讲清楚，你们对照看看是不是也这样。',
  },
  sell: {
    visual: '产品出场：达人手持产品近景展示包装质地，配合使用演示与细节特写',
    voiceover: '我最近一直在用的就是这款，它不是那种花里胡哨的噱头，是实打实能在日常里感受到变化的，有同款需求的朋友这一段认真看。\n这款我自己回购了好几次，最打动我的就是它日常用起来很顺手，镜头拉近给你们看细节，效果拍得很清楚。',
  },
  release: {
    visual: '用法分步演示 + 质地细节特写 + 使用场景空镜，现场打消使用顾虑',
    voiceover: '用法跟平时没什么两样，具体怎么用、什么质地、上身上手什么感觉，我都拍在画面里了，照着做就行一点都不麻烦，顾虑先放一放。\n步骤就这么简单，哪个环节要注意什么都标在画面上，我用了一段时间，之前最担心的几个点都没踩雷，新手也能直接上手。',
  },
  close: {
    visual: '直播间购物车引导 + 价格/库存/赠品信息近景，达人手指小黄车收束',
    voiceover: '现在直播间正好有活动，价格机制和赠品都放在小黄车里了，想试的点下方购物车直接拍，库存按批次上、这波卖完等下批，先到先得。\n活动就这几天，券和赠品跟订单一起走，点购物车就能看到明细，觉得合适的趁现在入手，先拍先发。',
  },
};

function normalizeOneDirection(d: any, angle: string, hookType?: string): CreativeDirection {
  const seg = (name: string): ScriptSeg => {
    const fb = SEG_FALLBACK[name] || { visual: '产品使用场景演示', voiceover: '感兴趣的可以进直播间了解详情。' };
    return {
      visual: String(d?.script?.[name]?.visual || '').trim() || fb.visual,
      voiceover: String(d?.script?.[name]?.voiceover || '').trim() || fb.voiceover,
      refCaseTitle: String(d?.script?.[name]?.refCaseTitle || '无'),
    };
  };
  const hooks = Array.isArray(d?.hooks) ? d.hooks.map((h: any) => String(h || '').trim()).filter(Boolean).slice(0, 3) : [];
  return {
    angle,
    title: String(d?.title || `${angle}方向`),
    concept: String(d?.concept || ''),
    hookType: hookType ? String(hookType).slice(0, 8) : undefined,
    script: { pain: seg('pain'), sell: seg('sell'), release: seg('release'), close: seg('close') },
    hooks,
    shootingTip: String(d?.shootingTip || ''),
    materialPick: (d?.materialPick && String(d.materialPick.type || '').trim())
      ? {
          type: String(d.materialPick.type).slice(0, 12),
          reason: String(d.materialPick.reason || '').slice(0, 160),
          secondType: String(d.materialPick.secondType || '').slice(0, 12) || undefined,
          secondReason: String(d.materialPick.secondReason || '').slice(0, 160) || undefined,
        }
      : undefined,
  };
}

/**
 * 口播字段拆分为「说法①②」：FaaS 新版每段给两版口播（换行分隔、无版本前缀）。
 * 兼容旧数据（只有一版）与 AI 偶发自带的「说法一：/版本1：」前缀。
 */
export function splitVoiceovers(voiceover: string): string[] {
  return String(voiceover || '')
    .split(/\n+/)
    .map(s => s.replace(/^\s*(?:说法|版本|口播)\s*[一二两1-2①②]\s*[:：、.]?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 2);
}

/**
 * 组装 N 个创意方向（新链路 N=用户勾选的 Brief 数，1-5）。
 * dirData 为 [dir1返回, dir2返回, …]（按序对应 recs 各定制方向）；
 * recs 为方向种子（Brief 映射或 recommend_directions 的动态方向；为空时兜底固定三方向）。
 */
function normalizeDirections(v: any, recs?: DirectionRec[]): CreativeDirection[] {
  const arr = Array.isArray(v) ? v : [];
  const useRecs = recs && recs.length >= 1 ? recs : FALLBACK_DIRECTION_RECS;
  return useRecs.map((rec, i) => {
    // dir1..dirN 按序返回，优先用同位置数据；angle 以方向名为准（FaaS 也会回传同名 angle）
    const d = arr[i] || {};
    const aiAngle = String(d?.angle || '').trim();
    const angle = aiAngle && aiAngle.length >= 2 && aiAngle !== 'undefined' ? aiAngle.slice(0, 12) : rec.dirName;
    const cd = normalizeOneDirection(d, angle, rec.hookType);
    if (rec.hotOpp && rec.hotOpp.name) {
      cd.hotOpp = { grade: rec.hotOpp.grade, name: rec.hotOpp.name, hook: rec.hotOpp.hook };
    }
    return cd;
  });
}

function normalizeInfluencers(v: any): InfluencerType[] {
  if (!Array.isArray(v)) return [];
  // AI 输出截断时末尾画像可能只剩空对象：过滤掉 persona 为空的无效项，按 persona 去重，有几个有效就渲染几个
  const seen = new Set<string>();
  const out: InfluencerType[] = [];
  for (const x of v) {
    const persona = String(x?.persona || '').trim();
    if (!persona || persona === '—' || seen.has(persona)) continue;
    seen.add(persona);
    out.push({
      persona,
      contentForm: String(x?.contentForm || '—').trim() || '—',
      followerTier: String(x?.followerTier || '—').trim() || '—',
      reason: String(x?.reason || '—').trim() || '—',
    });
  }
  return out.slice(0, 3);
}

// ======================== 工作台访问授权（AuthGate）========================
export interface AccessStatusResult {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  name?: string;
  token?: string;
  exp?: number;
}
export interface AccessApplyResult {
  rid: string;
  duplicated?: boolean;
  notify?: boolean;
  notifyError?: string;
}

async function gatePost<T>(body: Record<string, unknown>, timeoutMs = 25_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const j = await resp.json().catch(() => null);
    if (!resp.ok || !j || j.ok === false) {
      throw new Error(j?.error || `请求失败（HTTP ${resp.status}）`);
    }
    return j.data as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('请求超时，请检查网络后重试');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const accessApply = (name: string, org: string) =>
  gatePost<AccessApplyResult>({ stage: 'access_apply', name, org });

export const accessStatus = (rid: string) =>
  gatePost<AccessStatusResult>({ stage: 'access_status', rid });

export const accessVerify = async (token: string) => {
  const d = await gatePost<{ rid: string; exp: number; admin: boolean }>({ stage: 'access_verify', token });
  return d;
};

export const accessAdminEnter = (pass: string) =>
  gatePost<{ token: string; exp: number }>({ stage: 'access_admin', pass, action: 'enter' });
