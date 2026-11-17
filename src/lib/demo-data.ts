// ============================================================
// 🎬 演示模式 · 本地预置高质量数据（DHA 版）
// 四大模块（商品分析 / 内容能力 / 达人匹配 / 经营看板）共用。
// 全部为静态数据，无任何网络 / AI 调用；关闭演示模式后完全不参与真实链路。
// ============================================================
import type {
  AnalyzeResult, BriefDirection, CreativeDirection, MoreCaseItem,
  ScoringAi, ScoringDisplay, ScoringReport, ScoreItem,
  HotMarketingPlan, UrlExtractResult,
} from './api';
import type {
  InfluencerCandidate, MatchResult, PotentialOverview,
  PotentialMatchResult, PotentialNewResult,
} from './influencer-match';

// ------------------------------------------------------------
// 真实演示素材（TOS 永久公链，离线/无登录可访问）
//   - 案例封面：源自星川爆款案例库真实视频封面（母婴 / 婴童营养相关）
//   - AI 镜头：Seedance 真实生成的 3 秒竖屏视频，按四个脚本段分别预置
// ------------------------------------------------------------
const DEMO_TOS_BASE = 'https://magic-builder.tos-cn-beijing.volces.com';

/** 「爆款素材参考」匹配案例封面（与本品 DHA 强相关） */
export const DEMO_MATCHED_COVERS: string[] = [
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/matched1.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/matched2.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/matched3.jpg`,
];

/** 「更多爆款案例」封面（母婴各细分品类，保证与匹配案例不重复） */
export const DEMO_MORE_COVERS: string[] = [
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more1.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more2.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more3.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more4.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more5.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more6.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more7.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/more8.jpg`,
];

/** 居家香氛版「匹配爆款案例」封面（内容脚本模块 demo 使用） */
export const DEMO_SCENT_MATCHED_COVERS: string[] = [
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmatched1.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmatched2.jpg`,
];

/** 居家香氛版「更多爆款案例」封面 */
export const DEMO_SCENT_MORE_COVERS: string[] = [
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmore1.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmore2.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmore3.jpg`,
  `${DEMO_TOS_BASE}/xingchuan/demo-assets/covers/scentmore4.jpg`,
];

/** AI 镜头预置视频：按脚本段（pain/sell/release/close）各 3 条，对应 3 个脚本方向，组件按变体轮换 */
export const DEMO_CONCEPT_VIDEOS: Record<string, string[]> = {
  pain: [
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue5n3ec22d173f74582.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue68vo101f493b8b987.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_muyxupab944c68272270.mp4`,
  ],
  sell: [
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue61okn4aa9564d86b8.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue63e96452423a8d64b.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_muyxur6yc5daf9aaa862.mp4`,
  ],
  release: [
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue628qx3a37a181ba5b.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue63vlfee2e1ca2eeb8.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_muyxv18e36124eef38f6.mp4`,
  ],
  close: [
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue62udf5ed622e7bef9.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_mue64bj3f204b34abba9.mp4`,
    `${DEMO_TOS_BASE}/xingchuan/concept-video/cv_muyxvcyoa4c94b6927a1.mp4`,
  ],
};

/** 取某脚本段的预置 AI 镜头视频（variant 自动取模轮换） */
export function pickDemoConceptVideo(seg: string, variant = 0): { url: string; mediaType: 'video' } {
  const pool = DEMO_CONCEPT_VIDEOS[seg] || DEMO_CONCEPT_VIDEOS.pain;
  return { url: pool[((variant % pool.length) + pool.length) % pool.length], mediaType: 'video' };
}

// ------------------------------------------------------------
// 演示商品（表单预填；level1/level2 与封存底表一致）
// ------------------------------------------------------------
export const DEMO_FORM = {
  url: '',
  productName: '诺特兰德新升级 DHA 藻油 ARA 制品 · 100mg DHA+ARA 自播专享',
  brand: '诺特兰德',
  agent: '星川自营',
  industry: '母婴宠物',
  category: '母婴用品 / 婴童营养品',
  level1: '母婴用品',
  level2: '婴童营养品',
  price: '139',
  usageScene: '日常脑营养补充 / 宝宝喂养 / 藻油替代鱼油',
  sellingPoints: '每粒 DHA 100mg + ARA 科学同补 · 藻油来源无鱼腥味 · 好评榜第 8 名 · 官方旗舰店',
  targetAudience: '科学育儿的宝妈宝爸，关注宝宝脑营养、介意鱼腥味，重视正品与口碑',
  xcDailyBudgetWan: '5',
  qianchuanDailySpend: '20000',
  targetPenetration: '15',
  stableRoi: '2.5',
  targetRoi: '2.0',
  reverseSelectPct: '20',
  materialChasePct: '60',
  influencerTags: ['母婴', '婴童营养品'],
} as const;

// ------------------------------------------------------------
// 商品分析：AI 红线诊断（DHA 合规版）
// ------------------------------------------------------------
function sItem(score: number, rationale: string, confidence: ScoreItem['confidence'] = 'high'): ScoreItem {
  return { score, rationale, confidence };
}

export function demoScoringAi(): ScoringAi {
  return {
    summary: '婴童 DHA 属于高景气、高复购的可合作商品：DHA+ARA 同补与藻油无鱼腥味是强卖点，好评榜第 8 名与旗舰店信任状降低冷启门槛；核心是保健食品广告合规需前置过审。',
    shortBoard: '保健食品广告合规门槛高，功效声称需严格限定在批件范围，素材必须法务前置。',
    redLines: [
      { name: '蓝帽/资质红线', hit: false, reason: '保健食品蓝帽、注册批件齐全，旗舰店正品可溯源。' },
      { name: '合规夸大红线', hit: false, reason: '已规避治疗/绝对化用语，功效声称以批件为准并标注「不能代替药物」。' },
      { name: '库存履约红线', hit: false, reason: '旗舰店备货与发货时效满足放量节奏。' },
      { name: '素材供给红线', hit: false, reason: '母婴/婴童营养同类目跑量素材供给充足。' },
    ],
    strategy: [
      '以「藻油无鱼腥味 + DHA100mg·ARA 同补」为主钩子，先打透喂养痛点。',
      '冷启日预算 3-5 万小步测试，连续达标再阶梯追投。',
      '用好评榜第 8、官方旗舰店与检测报告建立信任，按复购口径评估 ROI。',
    ],
    risks: [
      '保健食品素材合规风险高，违规口播可能导致下架，需法务前置。',
      '冷启 ROI 可能短期低于目标，应靠高复购 / LTV 拉回。',
    ],
    optimize: [
      '增加宝妈真人喂养实测占比，强化「无腥味喂得进」可视化。',
      '跑量素材及时追投（追投比例可由 60% 提升至 70%）。',
      '搭建会员 / 周期购承接复购，沉淀 3 条黄金开头。',
    ],
  };
}

export function demoScoringReport(): ScoringReport {
  return {
    headline: '诺特兰德 DHA · 可合作商品：合规前置、卖点清晰，建议小步测试达标后放量',
    narrative:
      '该商品处于婴童 DHA 高景气赛道，DHA+ARA 同补与藻油无鱼腥味切中喂养痛点，好评榜第 8 名与官方旗舰店提供现成信任状。核心变量是保健食品广告合规门槛高，素材须法务前置，且应以「首单拉新 + 复购回本」口径评估 ROI。建议按下方行动项推进。',
    dimReports: [
      {
        key: 'budget',
        opportunity: '冷启日预算 3-5 万位于婴童营养品适中档位，跑稳后有向更高分位追投空间。',
        points: ['先以 3-5 万/天小步测试 7 天', '单素材连续 3 天 ROI 达标后追投', '预算向跑量素材集中，占比不低于 70%'],
      },
      {
        key: 'roi',
        opportunity: '婴童营养品复购周期清晰、LTV 高，稳定 ROI 2.5、追投目标 ROI 2.0，容忍度健康。',
        points: ['以稳定 ROI 2.5 作为测试期达标线', '追投资源允许 ROI 阶段性下探至 2.0', '按周复盘复购率与整体 ROI'],
      },
      {
        key: 'delivery',
        opportunity: '达人反选比例 20%（配合度好），旗舰店履约与客户配合维度稳定。',
        points: ['优先建联有母婴合作经验的达人', '用 brief 模板统一合规交付口径', '反选比例维持在 25% 以内'],
      },
      {
        key: 'trend',
        opportunity: '科学育儿带动婴童 DHA 高景气，藻油替代鱼油趋势明确，好评榜第 8 名有口碑势能。',
        points: ['借势 DHA+ARA 同补教育热点', '复用母婴类目跑量公式', '关注月度好评榜，快速跟进跑量素材'],
      },
      {
        key: 'price',
        opportunity: '139 元位于婴童 DHA 主流价格带，自播专享 + 旗舰店信任降低溢价阻力。',
        points: ['用每日喂养成本做价格锚点', '多瓶装 / 赠品提升客单并降低首单门槛', '突出藻油无腥味与 100mg 含量价值'],
      },
    ],
    actionItems: [
      { task: '完成蓝帽批件/检测报告合规归档并过法务', cycle: '第 1 周', signal: '素材全部通过合规并留痕' },
      { task: '启动 3-5 万/天小步测试，产出 3 条跑量素材', cycle: '第 1-2 周', signal: '连续 3 天 ROI≥2.5、消耗稳定' },
      { task: '达标后追投并搭建会员复购承接', cycle: '第 3-4 周', signal: '整体 ROI≥2.0、复购率提升' },
    ],
  };
}

// ------------------------------------------------------------
// 商品分析：scoring_display 展示包（对外方向性绿卡 + 五维子项 + 当前类目脱敏基准）
//   demo 模式下无论 github.io / 内站均返回此 mock，保证 7 卡基准与绿卡展示完整。
// ------------------------------------------------------------

/** 类目参考绿卡 8 项：key/顺序与 ScoringPanel REF_KEYS 严格对齐，值为方向性文案 */
export const DEMO_SCORING_DISPLAY_CARD: ScoringDisplay['card'] = [
  { k: '日耗P20/P40/P60', v: '行业中高/中位/偏低分位水位梯度' },
  { k: 'QTD规模排名', v: '前1/3类目' },
  { k: 'QTD累计星川消耗', v: '数千万级规模' },
  { k: '类目14天消耗环比', v: '较快增长' },
  { k: '正增长店铺占比', v: '多数店铺增长' },
  { k: 'ROI P50 / P75', v: '行业中位偏高' },
  { k: '支付单均价中位数', v: '与您客单价接近' },
  { k: '有效店铺数', v: '竞争较激烈' },
];

/** 五维子项方向文案：ROI 3 项 / 客户配合 2 项 / 趋势 3 项 / 客单价 1 项（按下标对齐 SubScore） */
export const DEMO_SCORING_DISPLAY_SUBS: ScoringDisplay['subs'] = {
  budget: [
    '日预算处于类目 P40–P60 区间，跑稳后具备追投空间',
  ],
  roi: [
    'ROI容忍度充足，愿为星川放宽ROI',
    '目标ROI贴合行业普遍水平',
    '目标ROI在高效水位之内',
  ],
  delivery: [
    '达人反选比例低，推荐达人采纳充分、客户认可度高',
    '优质素材追投及时，内容正循环顺畅（≥50%满分）',
  ],
  trend: [
    '类目规模中上，属中上部类目',
    '行业消耗增速较快',
    '多数店铺消耗正增长',
  ],
  price: [
    '客单价高于类目主流，仍贴近价格带',
  ],
};

/** 当前类目脱敏基准 7 卡：仅区间 / 分位标签，风格对标真实类目区间标签 */
export const DEMO_BENCH: NonNullable<ScoringDisplay['bench']> = [
  { k: '规模档位',           v: '中型（100-500万/月）' },
  { k: '14天增长率区间',     v: '+5% ~ +18%' },
  { k: '正增长店铺占比区间', v: '60% ~ 75%' },
  { k: '预算分位区间',       v: 'P30 ~ P60' },
  { k: '客单价基准区间',     v: '80 ~ 150 元' },
  { k: 'ROI中位基准区间',    v: '2.5 ~ 3.5' },
  { k: 'ROI高位基准区间',    v: '4.0 ~ 5.5' },
];

// ------------------------------------------------------------
// 内容能力：Brief 方向 + 四段式创意脚本（DHA 喂养语境）
// ------------------------------------------------------------
export function demoBriefs(): BriefDirection[] {
  return [
    { id: 'brief-1', name: '无腥味喂哺实测', coreSellingPoint: '藻油来源无鱼腥味，宝宝不抗拒喂得进', targetAudience: '0-3 岁宝宝宝妈', materialFormat: '真人喂养·实测', validationGoal: '验证喂养痛点共鸣与 3 秒留存' },
    { id: 'brief-2', name: 'DHA+ARA 同补科普', coreSellingPoint: '每粒 DHA100mg 科学配比 ARA，同补更贴合', targetAudience: '科学育儿人群', materialFormat: '营养师口播·成分解析', validationGoal: '验证同补卖点的信任建立' },
    { id: 'brief-3', name: '好评榜口碑种草', coreSellingPoint: '婴童 DHA 好评榜第 8 名 + 旗舰店正品', targetAudience: '看重口碑的新手妈妈', materialFormat: '真实宝妈·好物分享', validationGoal: '验证信任状对转化的拉动' },
    { id: 'brief-4', name: '宝宝脑营养 SOP', coreSellingPoint: '日常科学补充，喂养简单不麻烦', targetAudience: '育儿新手', materialFormat: '场景剧情·教程', validationGoal: '验证低门槛种草与加购' },
  ];
}

function seg(visual: string, voiceover: string, refCaseTitle: string) {
  return { visual, voiceover, refCaseTitle };
}

export function demoDirections(): CreativeDirection[] {
  return [
    {
      angle: '喂养痛点对比',
      title: '宝宝一见鱼油就躲？这瓶藻油喂得进',
      concept: '用鱼油腥味导致宝宝抗拒的真实喂养痛点制造共鸣，藻油无腥味对比直观呈现，再用 DHA100mg+ARA 同补与好评榜信任收口转化。',
      hookType: '对比',
      hooks: ['给宝宝喂鱼油像打仗？', '一喂就吐，可能是太腥了', '宝宝抗拒鱼油，问题出在味道'],
      script: {
        pain: seg('宝妈拿鱼油喂宝宝，宝宝扭头、皱眉、吐出', '之前喂鱼油，腥味重，宝宝一喂就躲，每次都像打仗。', '《喂养对比》母婴案例'),
        sell: seg('拿出诺特兰德 DHA，剪开滴入，特写琥珀色藻油', '换成诺特兰德藻油，无鱼腥味，每粒 DHA 100mg 还配了 ARA，同补更放心。', '《藻油实测》跑量素材'),
        release: seg('宝宝顺利吃下，表情放松，宝妈微笑', '换了藻油后宝宝不抗拒了，喂得进才是真的补得上。', '《喂养实测》案例'),
        close: seg('手持产品 + 好评榜与旗舰店标识，引导购物车', '好评榜第 8、官方旗舰店，自播专享 139，点购物车，给宝宝试试。', '《信任收口》素材'),
      },
      shootingTip: '喂养前后务必真实宝宝出镜、自然光，前 3 秒快速给「腥味抗拒」痛点。',
      materialPick: { type: '真人喂养', reason: '母婴信任需真实场景', secondType: '混剪', secondReason: '复用对比镜头快速放量' },
    },
    {
      angle: '反向避坑科普',
      title: '宝宝 DHA 别乱买，先看这 3 点',
      concept: '从「先别乱买」反向切入，点出选 DHA 常见坑（腥味、含量、是否同补），用营养师科普建立信任后转化。',
      hookType: '痛点',
      hooks: ['宝宝 DHA 别再交智商税', '买 DHA 前先停一下', 'DHA 选错，补了也白补？'],
      script: {
        pain: seg('桌面摆满踩雷 DHA，营养师逐一摇头', '给宝宝选 DHA 别只看包装，腥味重、含量不清、只补一样，钱花了效果打折。', '《避坑指南》案例'),
        sell: seg('特写成分表，圈出 DHA100mg 与 ARA', '一看是不是藻油、有没有腥味，二看 DHA 含量，三看有没有配 ARA，诺特兰德这三点都到位。', '《成分拆解》素材'),
        release: seg('营养师展示检测报告与蓝帽批件', '蓝帽批件、检测报告齐全，功效以批件为准，这款不能代替药物，但日常科学补充很安心。', '《合规实测》案例'),
        close: seg('对比价格与好评榜，引导下单', '好评榜第 8、旗舰店正品，139 自播专享，点购物车，选对才补得进。', '《信任收口》素材'),
      },
      shootingTip: '开头反向劝退要干脆，成分用微距，合规话术必须与批件一致。',
      materialPick: { type: '桌拍特写', reason: '成分解析适合微距口播', secondType: '真人出镜', secondReason: '营养师人设增强信任' },
    },
    {
      angle: '福利钩子',
      title: '自播专享 139 的 DHA，囤到就是赚到',
      concept: '以自播专享价和多瓶福利开场抓停留，用好评榜与旗舰店正品佐证不是廉价杂品，再用限时利益点加速转化。',
      hookType: '福利',
      hooks: ['这个价的 DHA 我先囤为敬', '139 还是好评榜第 8？', '自播专享 DHA 来了'],
      script: {
        pain: seg('宝妈拆多瓶套装，表情惊喜', '自播专享 139，还能凑多瓶装，我一开始怕便宜没好货。', '《福利开箱》案例'),
        sell: seg('特写正装与蓝帽、藻油质地', '结果是诺特兰德官方旗舰店的藻油 DHA，每粒 100mg 还配 ARA，无腥味。', '《开箱测评》素材'),
        release: seg('真实喂哺，宝宝顺利吃下', '宝宝喝了一段时间，喂得进、不抗拒，当妈的最在意这个。', '《宝妈实测》案例'),
        close: seg('强调自播专享限时与库存，引导点击', '自播专享价是限时的，库存不多，想囤的点购物车。', '《限时收口》素材'),
      },
      shootingTip: '多瓶套装摆出超值感，口播简短口语，尽快给好评榜/旗舰店信任避免廉价感。',
      materialPick: { type: '真人出镜', reason: '福利+真实感促进转化', secondType: '混剪', secondReason: '复用开箱与喂哺镜头' },
    },
  ];
}

export function demoMoreCases(): MoreCaseItem[] {
  const mk = (i: number, title: string, brand: string, hook: string, dir: string): MoreCaseItem => ({
    id: `demo-case-${i}`,
    title, brand, industry: '母婴宠物', category: '婴童营养品',
    creativeDirection: dir, coverImageUrl: DEMO_MORE_COVERS[i],
    videoLink: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
    hotAnalysis: '以真实喂养场景切入，强痛点 + 无腥味对比，跑量稳定。',
    hookDesign: hook,
    structure: '钩子→卖点→喂养对比→转化收口',
    consumption: ['50-100万', '100万+', '30-50万'][i % 3],
    aiReason: '与本品同为婴童 DHA 营养素材，喂养痛点与目标人群高度一致，开头钩子可直接复用。',
  });
  return [
    mk(0, '宝宝 DHA 喂养实测·藻油无腥味', '诺特兰德', '给宝宝喂鱼油像打仗（前3秒抗拒特写）', '对比'),
    mk(1, '婴童 DHA 红黑榜', '某进口品牌', '宝宝 DHA 别再交智商税（桌面排雷）', '痛点'),
    mk(2, 'DHA 藻油开箱', '国产品牌', '自播专享还送这么多？（拆箱惊喜）', '福利'),
    mk(3, '宝宝脑营养打卡', '母婴品牌', '坚持科学补充会怎样（记录向）', '对比'),
  ];
}

export function demoAnalyzeResult(): AnalyzeResult {
  return {
    product: {
      sellingPoints: ['每粒 DHA 100mg + ARA 科学同补', '藻油来源天然无鱼腥味', '婴童 DHA 好评榜第 8 名', '官方旗舰店正品 · 自播专享 139'],
      targetAudience: DEMO_FORM.targetAudience,
      competitors: [
        { name: '进口鱼油 DHA', priceBand: '180-300 元', contentStrategy: '进口背书 + 鱼油概念' },
        { name: '其他国产藻油 DHA', priceBand: '99-169 元', contentStrategy: '成分 + 性价比' },
      ],
      contentStyle: '真人喂养实测 · 营养师科普 · 宝妈种草',
      differentiators: ['DHA+ARA 同补、每粒 100mg', '藻油无鱼腥味喂得进', '好评榜第 8 + 旗舰店信任'],
      risks: ['保健食品合规需法务前置', '冷启靠复购拉回 ROI'],
    },
    scoring: {
      scores: {
        budget: sItem(16, '冷启日预算 3-5 万，处婴童营养适中档位'),
        roiTolerance: sItem(22, '稳定 ROI 2.5 / 目标 ROI 2.0，高复购支撑'),
        delivery: sItem(13, '达人反选 20%，旗舰店履约配合度高'),
        trend: sItem(19, '婴童 DHA 高景气、藻油替代鱼油趋势明确'),
        pricePoint: sItem(12, '139 元处主流带，自播专享降低溢价阻力'),
      },
      redLines: demoScoringAi().redLines,
      strategyAdvice: demoScoringAi().strategy,
    },
    matchedCases: [
      { caseIndex: 1, reason: '无腥味喂养痛点与本品方向一致' },
      { caseIndex: 2, reason: '成分科普型素材适配同补卖点说服' },
    ],
    briefs: demoBriefs(),
    customFormula: [
      { stage: '钩子', technique: '喂养痛点', detail: '鱼油腥味抗拒特写', goal: '3 秒强留存' },
      { stage: '卖点', technique: '成分拆解', detail: 'DHA100mg + ARA 同补', goal: '建立科学认知' },
      { stage: '功效', technique: '喂养实测', detail: '藻油无腥味喂得进', goal: '证明使用价值' },
      { stage: '转化', technique: '信任收口', detail: '好评榜+旗舰店+自播价', goal: '加速下单' },
    ],
    creativeDirections: demoDirections(),
    shootingTips: ['自然光真实宝宝喂养出镜', '前3秒快速给腥味抗拒痛点', '成分用微距特写', '合规话术与批件一致'],
    complianceNotes: ['标注「本品不能代替药物」', '功效声称以注册批件为准', '不用绝对化/治疗类用语', '不利用婴幼儿形象做功效暗示'],
    influencerFramework: [
      { persona: '营养师 / 儿科顾问', contentForm: '成分科普 + 口播', followerTier: '50-150 万', reason: '权威支撑 DHA+ARA 同补教育，建立信任' },
      { persona: '真实宝妈种草', contentForm: '喂养实测 + vlog', followerTier: '10-50 万', reason: '强场景共鸣，打透无腥味喂得进卖点' },
      { persona: '垂类育婴师黑马', contentForm: '喂养教学 + 微距测评', followerTier: '5-15 万', reason: '人群精准、CPM 低，适合低成本冷启' },
    ],
    matchedCaseDetails: [
      { caseIndex: 1, title: '宝宝 DHA 喂养实测·无腥味', brand: '诺特兰德', coverImageUrl: DEMO_MATCHED_COVERS[0], videoLink: 'https://www.douyin.com/search/藻油无腥味', reason: '喂养痛点与本品卖点高度一致，钩子可复用' },
      { caseIndex: 2, title: 'DHA+ARA 成分科普', brand: '国产品牌', coverImageUrl: DEMO_MATCHED_COVERS[1], videoLink: 'https://www.douyin.com/search/DHA成分科普', reason: '成分科普素材适配同补卖点说服逻辑' },
    ],
    moreCases: demoMoreCases(),
    industryCaseCount: 4,
    totalScore: 82,
  };
}

// ------------------------------------------------------------
// 达人匹配：四库预置达人（母婴 DHA 语境）
// ------------------------------------------------------------
function baseCandidate(p: Partial<InfluencerCandidate> & { cid: string; name: string; pool: InfluencerCandidate['pool'] }): InfluencerCandidate {
  return {
    douyinId: '', followers: 0, tags: [], persona: [], forms: [], category: '',
    seed: '', spread: '', conf: '', coop: '未接触', wechat: '', agent: '',
    homepage: '', video: '', xingtuUrl: '', highlight: '', level: '', rank: null,
    ...p,
  };
}

// ------------------------------------------------------------
// 演示数据批量生成器：四个达人库都能按用户请求的数量足量返回，
// 保证演示页卡片双列铺满，不出现「匹配不满」的情况
// ------------------------------------------------------------
const DEMO_NAME_BANK = [
  '科学喂养李妈', '奶爸育儿实验室', '辅食研究员阿哲', '宝妈囤货指南', '儿科护士小林',
  '年糕妈妈的日常', '母婴选品官CC', '睡渣宝宝拯救记', '二胎奶爸日记', '育儿师笑笑',
  '成分党妈妈', '婴童营养实验室', '奶瓶测评铺', '早教顾问周老师', '职场妈妈喂养笔记',
  '亲子营养师米雪', '宝宝餐桌研究社', '育婴师阿珍', '母婴好物种草机', '育儿避坑指南',
  '新手妈妈研究所', '辣妈种草日记', '奶爸选品清单', '母婴成分局', '宝宝成长观察员',
  '月子中心王姐', '母婴实验室小K', '科学育儿联盟', '宝妈实战派', '喂养难题解答',
  '母婴测评编辑部', '聪明宝宝养成记', '母婴严选日记', '宝宝大脑营养课', '育儿数据派',
  '母婴开箱日记', '宝妈省钱攻略', '亲子生活研究所', '母婴口碑榜', '育儿答疑室',
  '母婴趋势观察', '宝宝营养小厨房', '妈妈群群主Cici', '母婴红黑榜', '育儿装备党',
  '母婴冷知识', '高需求宝宝妈妈', '母婴好物挖掘机', '育儿节奏大师', '母婴品质生活家',
  '藻油成分研究所', '喂养记录手册', '母婴严选官阿哲', '金牌育婴师团队', '宝宝智力启蒙课',
  '母婴科学派', '孕妈成长营', '母婴好价情报站', '亲子陪伴日记', '母婴口碑研究员',
];
const DEMO_PERSONAS: string[][] = [
  ['成分测评', '母婴'], ['真实宝妈', '种草'], ['营养师', '权威科普'], ['二胎宝妈', '真人实测'],
  ['育婴师', '喂养教学'], ['奶爸视角', '日常vlog'], ['好物测评', '消费决策'], ['专业科普'],
];
const DEMO_FORMS: string[][] = [
  ['深度测评', '真人实测'], ['喂养vlog', '场景植入'], ['专业科普', '口播'], ['好物分享'],
  ['对比测评'], ['开箱实测'], ['人感种草'], ['剧情植入'],
];
const DEMO_CATEGORIES = ['DHA 藻油', '婴童营养品', '母婴好物', '宝宝营养', '科学喂养'];
const DEMO_FOLLOWERS = [52000, 88000, 150000, 260000, 480000, 960000];
const DEMO_REASONS = [
  '粉丝以 0-3 岁宝宝妈妈为主，与本品目标人群高度重合，喂养场景内容承接卖点自然。',
  '近期同品类内容互动率高，成分讲解专业，适合做 DHA+ARA 双营养教育。',
  '宝妈人设信任度高、评论区带货氛围好，转化链路顺畅。',
  '内容以真实喂养记录为主，「无腥味喂得进」卖点植入可信度强。',
  '同价位营养品带货经验丰富，福利机制讲解清楚，利于直播引流。',
  '科学育儿人设与本品高含量 100mg 卖点匹配，适合做认知种草。',
  '腰部量级、报价性价比高，适合批量铺量测试跑量素材。',
  '粉丝粘性强、复购类内容表现好，适合承接本品复购人群运营。',
];
const DEMO_LEVELS = ['S2', 'S3', 'S3', 'S4', 'S4', 'S5'];
const DEMO_COOP = ['已合作', '洽谈中', '已触达'];
function demoBase(i: number) {
  return {
    name: '@' + DEMO_NAME_BANK[i % DEMO_NAME_BANK.length],
    followers: DEMO_FOLLOWERS[i % DEMO_FOLLOWERS.length],
    tags: (i % 3 === 0 ? ['母婴', '婴童营养品'] : ['母婴']),
    persona: DEMO_PERSONAS[i % DEMO_PERSONAS.length],
    forms: DEMO_FORMS[i % DEMO_FORMS.length],
    category: DEMO_CATEGORIES[i % DEMO_CATEGORIES.length],
  };
}
function demoFillStock(n: number, start: number): InfluencerCandidate[] {
  const out: InfluencerCandidate[] = [];
  for(let i = 0; i < n; i++){
    const k = start + i; const b = demoBase(k);
    out.push(baseCandidate({
      cid: `d-stock-x${k + 1}`, pool: 'stock', douyinId: String(9050000 + k),
      ...b, seed: k % 2 ? '高' : '中', spread: k % 3 ? '高' : '中', conf: '高',
      coop: DEMO_COOP[k % 3], wechat: k % 2 ? '已添加' : '未添加', agent: '星川自营',
      homepage: `https://www.douyin.com/search/${encodeURIComponent(b.name.slice(1))}`,
      xingtuUrl: `https://www.xingtu.cn/xingtu/author/905${String(k).padStart(4, '0')}`,
      highlight: '母婴营养品带货内容稳定，近期 DHA 相关视频完播率高于账号均值',
      level: DEMO_LEVELS[k % DEMO_LEVELS.length],
      aiScore: Math.max(62, 80 - i),
      reason: DEMO_REASONS[k % DEMO_REASONS.length],
    }));
  }
  return out;
}
function demoFillIncr(n: number, start: number): InfluencerCandidate[] {
  const out: InfluencerCandidate[] = [];
  const INCR_NAME_BANK = [
    '营养选品官小禾', '母婴爆款挖掘机', '童品趋势研究所', '喂养内容工作室', '亲子好物种草局',
    '育儿好物严选', '童品跑量实验室', '母婴内容合伙人', '宝贝选品攻略', '亲子带货研究所',
    '母婴素材库主理人', '童品口碑推荐官', '喂养好物清单', '母婴中腰部联盟', '亲子爆款观察',
    '童品高转化达人', '母婴选品侦探', '育儿好物评测室', '亲子投放精选', '童品增长达人',
    '母婴性价比推荐', '喂养干货铺', '童品内容工厂', '亲子种草联盟', '母婴潜力达人榜',
    '宝宝好物严选', '童品实测报告', '母婴内容增长社', '亲子选品笔记', '童品好物种草',
    '母婴跑量选手', '喂养研究所阿May', '童品黑马推荐', '亲子好物情报局', '母婴爆款笔记',
    '童品选品日历', '母婴内容严选', '亲子消费指南', '童品带货日记', '母婴好物种草官',
  ];
  for(let i = 0; i < n; i++){
    const k = start + i;
    const b = demoBase(k + 11);
    b.name = '@' + INCR_NAME_BANK[k % INCR_NAME_BANK.length];
    out.push(baseCandidate({
      cid: `d-incr-x${k + 1}`, pool: 'incr', douyinId: String(9150000 + k),
      ...b, seed: k % 2 ? '高' : '中', spread: '中', conf: k % 3 ? '高' : '中',
      coop: DEMO_COOP[k % 3], wechat: k % 3 ? '已添加' : '未添加', agent: '优质星川池',
      homepage: `https://www.douyin.com/search/${encodeURIComponent(b.name.slice(1))}`,
      xingtuUrl: `https://www.xingtu.cn/xingtu/author/915${String(k).padStart(4, '0')}`,
      highlight: '优质库精选达人，近 90 天有同品类爆款内容，跑量能力经过验证',
      level: DEMO_LEVELS[(k + 2) % DEMO_LEVELS.length],
      aiScore: Math.max(60, 79 - Math.floor(i / 2)),
      reason: DEMO_REASONS[(k + 3) % DEMO_REASONS.length],
    }));
  }
  return out;
}
const DEMO_POT_TIERS = ['<10W', '10-30W', '30-50W', '50-100W', '100-500W'];
const DEMO_IDENTITIES = ['野生达人', 'MCN机构', 'PGC达人', 'KOC素人'];
const DEMO_POT_TAGS = [['母婴', '育儿'], ['育儿', '生活记录'], ['母婴', '亲子'], ['母婴'], ['育儿', '早教']];
// 星图候选库专用名单（与存量/优质库错开）
const DEMO_POT_NAME_BANK = [
  '妈妈圈种草机', '育儿好物情报', '亲子生活家小朵', '母婴发现官', '宝宝严选日记',
  '宝妈的购物车', '童品实验室', '喂养小黑板', '亲子探店阿九', '母婴性价比研究所',
  '育儿清单控', '宝妈实测社', '童品开箱团', '母婴新潮观察', '亲子好物雷达',
  '宝贝选品日记', '妈妈口碑墙', '童品横评组', '母婴省钱课代表', '育儿选品喵',
  '宝宝购物笔记', '亲子严选清单', '母婴黑马发现', '童品体验官CC', '宝妈真实反馈',
  '育儿好物种草', '母婴红黑榜笔记', '亲子囤货指南', '童品口碑君', '妈妈选品雷达',
  '宝宝好物合集', '母婴拔草日记', '亲子生活提案', '童品测评小站', '育儿消费洞察',
  '宝妈严选推荐', '母婴福利情报', '亲子日常种草', '童品好价播报', '新手妈妈清单',
];
function demoFillPotential(n: number, start: number): InfluencerCandidate[] {
  const out: InfluencerCandidate[] = [];
  for(let i = 0; i < n; i++){
    const k = start + i;
    const name = '@' + DEMO_POT_NAME_BANK[k % DEMO_POT_NAME_BANK.length];
    const fansTier = DEMO_POT_TIERS[k % DEMO_POT_TIERS.length];
    const price20 = [3000, 6000, 12000, 26000, 52000][k % 5];
    out.push(baseCandidate({
      cid: `d-pot-x${k + 1}`, pool: 'potential',
      name, fansTier, identity: DEMO_IDENTITIES[k % DEMO_IDENTITIES.length],
      tags: DEMO_POT_TAGS[k % DEMO_POT_TAGS.length],
      persona: DEMO_PERSONAS[(k + 1) % DEMO_PERSONAS.length],
      forms: DEMO_FORMS[(k + 2) % DEMO_FORMS.length],
      homepage: `https://www.douyin.com/search/${encodeURIComponent(name.slice(1))}`,
      xingtuUrl: `https://www.xingtu.cn/xingtu/author/925${String(k).padStart(4, '0')}`,
      price20, cpm20: Math.round(price20 / 180) + 60,
      femalePct: 72 + (k % 5) * 4, malePct: 28 - (k % 5) * 4,
      aiScore: Math.max(61, 82 - Math.floor(i / 2)),
      reason: DEMO_REASONS[(k + 5) % DEMO_REASONS.length],
    }));
  }
  return out;
}
const DEMO_PNEW_TIERS = ['标杆', '主力', '潜力', '储备'] as const;
// 分级达人池专用名单（与上面存量/优质/星图库名字错开，避免跨库撞名显得假）
const DEMO_PNEW_NAME_BANK = [
  '母婴头部颜究所', '金牌育儿说', '星妈严选', '亲子消费主张', '宝妈情报局',
  '童婴营养官', '母婴增长实验室', '育儿价值榜', '妈妈选品官', '宝贝成长计划',
  '星川母婴观察', '喂养效率派', '母婴内容工坊', '亲子商业评论', '宝妈决策参考',
  '母婴赛道报告', '育儿新势力', '童品测评联盟', '母婴黑马榜', '亲子流量研究',
  '母婴投放笔记', '达人妈妈圈', '童品严选社', '母婴增长黑客', '育儿垂类榜',
  '新锐母婴推荐', '星图妈妈团', '母婴性价比之选', '亲子内容观察', '喂养新主张',
  '童品好物挖掘机', '母婴冷启实验', '素人妈妈体验', '亲子小号养成', '母婴储备军',
  '新手达人妈妈', '童品种草日记', '低粉母婴测评', '亲子生活碎片', '宝宝日常记录',
];
const DEMO_PNEW_PROFILE: Record<string, { levels: string[]; projects: [number, number]; spend: [number, number]; ecom: string[]; fans: string[]; score: [number, number] }> = {
  标杆: { levels: ['S5', 'S4'], projects: [55, 80], spend: [600000, 1200000], ecom: ['L4', 'L3+'], fans: ['100-500W', '50-100W'], score: [90, 95] },
  主力: { levels: ['S3', 'S4'], projects: [28, 55], spend: [200000, 600000], ecom: ['L4', 'L3'], fans: ['50-100W', '100-500W', '30-50W'], score: [83, 89] },
  潜力: { levels: ['S2', 'S3'], projects: [10, 28], spend: [50000, 200000], ecom: ['L3', 'L2'], fans: ['30-50W', '50-100W', '10-30W'], score: [76, 82] },
  储备: { levels: ['S1', 'S0'], projects: [1, 10], spend: [2000, 50000], ecom: ['L2', 'L1'], fans: ['10-30W', '<10W', '30-50W'], score: [62, 74] },
};
const DEMO_PNEW_REASON: Record<string, string[]> = {
  标杆: ['星川 S 级、交付 60+ 单、星图消耗百万级，头部跑量确定性最强，适合立标杆。', '高星川等级 + 高电商等级，大场承接经验丰富，适合做品牌大促标杆。'],
  主力: ['星川 S3 且交付稳定、星图消耗 20 万+，主力盘持续产出，性价比高。', '交付项目数与消耗都在主力区间，内容复用率高，适合常态化投放。'],
  潜力: ['星川 S2 上升期、内容垂直、报价低，小成本测试放量的黑马候选。', '细分品类内容标签集中，CPM 有优势，适合素材赛马。'],
  储备: ['星川 S1/S0 新入场，低价冷启备选，适合铺量测试与长期培育。', '起步阶段达人配合度高、坑位灵活，可作为储备资源低价锁定。'],
};
function demoFillPnew(tier: string, n: number, start: number): InfluencerCandidate[] {
  const prof = DEMO_PNEW_PROFILE[tier];
  const out: InfluencerCandidate[] = [];
  for(let i = 0; i < n; i++){
    const k = start + i;
    const name = '@' + DEMO_PNEW_NAME_BANK[(k + { 标杆: 0, 主力: 10, 潜力: 20, 储备: 30 }[tier]!) % DEMO_PNEW_NAME_BANK.length];
    const projects = prof.projects[0] + (k * 7) % (prof.projects[1] - prof.projects[0]);
    const xcSpend = prof.spend[0] + (k * 13751) % (prof.spend[1] - prof.spend[0]);
    const score = prof.score[1] - (k % (prof.score[1] - prof.score[0] + 1));
    out.push(baseCandidate({
      cid: `d-pnew-x${tier}-${k + 1}`, pool: 'potential_new',
      name, fansTier: prof.fans[k % prof.fans.length], industryOp: '母婴宠物',
      xcLevel: prof.levels[k % prof.levels.length], projects, xcSpend,
      ecomLevel: prof.ecom[k % prof.ecom.length], tier, tierRank: { 标杆: 0, 主力: 1, 潜力: 2, 储备: 3 }[tier],
      tags: ['母婴', '婴童营养品'],
      persona: DEMO_PERSONAS[k % DEMO_PERSONAS.length], forms: DEMO_FORMS[k % DEMO_FORMS.length],
      homepage: `https://www.douyin.com/search/${encodeURIComponent(name.slice(1))}`,
      xingtuUrl: `https://www.xingtu.cn/xingtu/author/935${String(k).padStart(4, '0')}`,
      aiScore: score, reason: DEMO_PNEW_REASON[tier][k % 2],
    }));
  }
  return out;
}

export function demoMatchResult(stockN = 10, incrN = 20): MatchResult {
  const stockSeed: InfluencerCandidate[] = [
    baseCandidate({ cid: 'd-stock-1', pool: 'stock', name: '@成分控阿May', douyinId: '9012001', followers: 860000, tags: ['母婴', '婴童营养品'], persona: ['成分测评', '母婴'], forms: ['深度测评', '真人实测'], category: 'DHA 藻油', seed: '高', spread: '高', conf: '高', coop: '已合作', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/成分控阿May', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9012001', highlight: '藻油 vs 鱼油无腥味对比，单条跑量 200 万+', level: 'S4', aiScore: 94, reason: '粉丝以科学育儿宝妈为主，无腥味测评与本品卖点高度契合，有合作记录。' }),
    baseCandidate({ cid: 'd-stock-2', pool: 'stock', name: '@熬夜宝妈小夏', douyinId: '9022002', followers: 420000, tags: ['母婴'], persona: ['真实宝妈', '种草'], forms: ['vlog', '喂养植入'], category: '婴童营养品', seed: '高', spread: '中', conf: '高', coop: '已合作', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/熬夜宝妈小夏', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9022002', highlight: '宝妈喂养 vlog，3 秒留存优异', level: 'S3', aiScore: 90, reason: '真实喂养场景与「无腥味喂得进」强绑定，人群吻合。' }),
    baseCandidate({ cid: 'd-stock-3', pool: 'stock', name: '@营养师顾妈', douyinId: '9032003', followers: 1250000, tags: ['母婴', '婴童营养品'], persona: ['营养师', '权威科普'], forms: ['专业科普', '口播'], category: '宝宝营养', seed: '高', spread: '高', conf: '高', coop: '洽谈中', wechat: '未添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/营养师顾妈', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9032003', highlight: 'DHA+ARA 同补科普，信任度高', level: 'S5', rank: 1, aiScore: 86, reason: '权威人设强力支撑同补教育，量级大；报价偏高、档期需锁定。' }),
    baseCandidate({ cid: 'd-stock-4', pool: 'stock', name: '@露露育儿经', douyinId: '9042004', followers: 180000, tags: ['母婴'], persona: ['真实种草'], forms: ['好物分享'], category: '婴童营养品', seed: '中', spread: '中', conf: '中', coop: '已触达', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/露露育儿经', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9042004', highlight: '母婴好物合集', level: 'S2', aiScore: 78, reason: '方向与粉丝画像契合，性价比高适合腰部铺量。' }),
  ];
  const incrSeed: InfluencerCandidate[] = [
    baseCandidate({ cid: 'd-incr-1', pool: 'incr', name: '@藻油研究所', douyinId: '9112001', followers: 680000, tags: ['母婴', '婴童营养品'], persona: ['赛道测评'], forms: ['对比测评', '真人实测'], category: 'DHA 藻油', seed: '高', spread: '高', conf: '高', coop: '已合作', wechat: '已添加', agent: '优质星川池', homepage: 'https://www.douyin.com/search/藻油研究所', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9112001', level: 'S4', aiScore: 92, reason: '专注 DHA 赛道，对比测评与本品卖点一致，转化已验证。' }),
    baseCandidate({ cid: 'd-incr-2', pool: 'incr', name: '@白菜育儿日记', douyinId: '9122002', followers: 305000, tags: ['母婴'], persona: ['福利种草'], forms: ['开箱', '福利口播'], category: '母婴好物', seed: '中', spread: '中', conf: '中', coop: '已触达', wechat: '未添加', agent: '优质星川池', homepage: 'https://www.douyin.com/search/白菜育儿日记', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9122002', level: 'S3', aiScore: 84, reason: '福利形式与自播专享钩子匹配，利于泛人群放量。' }),
    baseCandidate({ cid: 'd-incr-3', pool: 'incr', name: '@二胎妈妈的日常', douyinId: '9132003', followers: 260000, tags: ['母婴'], persona: ['二胎宝妈', '真实种草'], forms: ['vlog'], category: '婴童营养品', seed: '中', spread: '中', conf: '中', coop: '洽谈中', wechat: '未添加', agent: '优质星川池', homepage: 'https://www.douyin.com/search/二胎妈妈的日常', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9132003', level: 'S2', aiScore: 80, reason: '两娃长期补 DHA，复购与信任背书强，互动质量高。' }),
  ];
  const stock = [
    ...stockSeed,
    ...demoFillStock(Math.max(0, stockN - stockSeed.length), stockSeed.length),
  ].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, Math.max(1, Math.min(50, stockN)));
  const incr = [
    ...incrSeed,
    ...demoFillIncr(Math.max(0, incrN - incrSeed.length), incrSeed.length),
  ].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, Math.max(1, Math.min(50, incrN)));
  return {
    stock, incr,
    meta: { stockTotal: 233, incrTotal: 994, stockRows: 233, incrRows: 994, stockPicked: stock.length, incrPicked: incr.length, stockCount: stock.length, incrCount: incr.length },
  };
}

export function demoPotentialOverview(): PotentialOverview {
  return {
    source: '精选联盟·Q3 精选达人刊例（演示数据）',
    baseUrl: 'https://bytedance.larkoffice.com/base/N9r9bHCFZa10YcsgGqZcBLuQni0',
    tables: ['星图达人刊例'],
    totalDeclared: 12829, sampled: 2000,
    fieldsNote: '字段口径为演示预置',
    fansTier: [
      { name: '<10W', count: 760 }, { name: '10-30W', count: 620 }, { name: '30-50W', count: 280 },
      { name: '50-100W', count: 200 }, { name: '100-500W', count: 140 },
    ],
    identity: [
      { name: '野生达人', count: 1180 }, { name: 'MCN机构', count: 620 }, { name: 'PGC达人', count: 200 },
    ],
    personas: [
      { name: '专业科普/消费决策官', count: 420 }, { name: '宝妈场景/真实种草家', count: 560 },
      { name: '剧情脑洞/角色演绎派', count: 340 }, { name: '知识观点/行业洞察者', count: 260 },
      { name: '审美视觉/氛围创意师', count: 220 }, { name: '才艺娱乐/强互动表达者', count: 200 },
    ],
    contentDims: [
      { name: '人感种草', count: 680 }, { name: '创意内容', count: 540 }, { name: '深度测评', count: 380 },
    ],
    industryTags: [
      { name: '母婴', count: 460 }, { name: '育儿', count: 420 }, { name: '生活记录', count: 360 },
      { name: '美食', count: 240 }, { name: '科技', count: 120 },
    ],
    withPrice: 1420, withHomepage: 1980, withXingtu: 1760, withSecUid: 1990,
    matchingStatus: '演示模式：已接入，全部为本地预置结果',
  };
}

export function demoPotentialMatchResult(count = 20): PotentialMatchResult {
  const seed: InfluencerCandidate[] = [
    baseCandidate({ cid: 'd-pot-1', pool: 'potential', name: '@母婴测评君', followers: 0, fansTier: '50-100W', identity: 'MCN机构', tags: ['母婴', '育儿'], persona: ['专业测评'], forms: ['对比测评'], homepage: 'https://www.douyin.com/search/母婴测评君', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9212001', price20: 38000, cpm20: 210, femalePct: 80, malePct: 20, aiScore: 88, reason: '女粉占比高、母婴测评内容与本品人群和卖点契合。' }),
    baseCandidate({ cid: 'd-pot-2', pool: 'potential', name: '@种草小本本', fansTier: '10-30W', identity: '野生达人', tags: ['育儿', '生活记录'], persona: ['宝妈种草'], forms: ['人感种草', '日常vlog'], homepage: 'https://www.douyin.com/search/种草小本本', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9222002', price20: 9000, cpm20: 180, femalePct: 85, malePct: 15, aiScore: 83, reason: '真实宝妈种草，适合腰部铺量与新客冷启。' }),
    baseCandidate({ cid: 'd-pot-3', pool: 'potential', name: '@小镇育婴师阿楠', fansTier: '10-30W', identity: 'KOC素人', tags: ['母婴'], persona: ['育婴师', '垂类黑马'], forms: ['喂养教学', '微距测评'], homepage: 'https://www.douyin.com/search/小镇育婴师阿楠', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9232003', price20: 5000, cpm20: 110, femalePct: 90, malePct: 10, aiScore: 86, reason: '持证育婴师、女粉 90%、CPM 低，垂类黑马冷启投产比优。' }),
  ];
  const want = Math.max(1, Math.min(50, count));
  const list = [
    ...seed,
    ...demoFillPotential(Math.max(0, want - seed.length), seed.length),
  ].sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, want);
  return {
    list,
    meta: {
      pulled: 12829, matched: 128 + Math.max(0, list.length - 3), picked: list.length, count: list.length, totalDeclared: 12829,
      filters: { industries: [], personas: [], tiers: [], identities: [], dims: [], femaleDir: '' },
    },
  };
}

export function demoPotentialNewResult(count = 30): PotentialNewResult {
  const mk = (cid: string, name: string, tier: string, score: number, xc: string, reason: string, extra: Partial<InfluencerCandidate> = {}): InfluencerCandidate =>
    baseCandidate({
      cid, pool: 'potential_new', name, fansTier: extra.fansTier || '10-50W', industryOp: '母婴宠物',
      xcLevel: xc, projects: extra.projects ?? 40, xcSpend: extra.xcSpend ?? 500000,
      ecomLevel: extra.ecomLevel || 'L4', tier, tierRank: { 标杆: 0, 主力: 1, 潜力: 2, 储备: 3 }[tier],
      tags: ['母婴', '婴童营养品'], persona: extra.persona || ['专业科普', '真人种草'],
      forms: extra.forms || ['好物评测', '喂养种草'], homepage: `https://www.douyin.com/search/${name.replace('@', '')}`,
      xingtuUrl: `https://www.xingtu.cn/xingtu/author/${cid}`, aiScore: score, reason,
    });
  const curated: InfluencerCandidate[] = [
    mk('d-pnew-1', '@头部母婴颜究院', '标杆', 95, 'S5', '星川 S5、交付 60+、星图消耗 80 万+，标杆跑量能力已验证。', { projects: 60, xcSpend: 800000, fansTier: '100-500W' }),
    mk('d-pnew-2', '@育儿生活家', '主力', 88, 'S3', 'S3 且交付 45 个、星图消耗 50 万，主力稳定产出。', { projects: 45 }),
    mk('d-pnew-3', '@藻油测评小课堂', '潜力', 84, 'S2', 'S2 且只做藻油细分、CPM 低，垂类黑马可放量测试。'),
    mk('d-pnew-4', '@新鲜好物酱', '储备', 70, 'S1', 'S1 星图消耗起步，低价冷启备选。', { ecomLevel: 'L3' }),
  ];
  // 按四层均衡配额生成（与 FaaS 真实逻辑一致：10 → 3/3/2/2，30 → 8/8/7/7），缺额跨层补齐
  const want = Math.max(1, Math.min(50, count));
  const baseQ = Math.floor(want / 4);
  const quota: Record<string, number> = { 标杆: baseQ, 主力: baseQ, 潜力: baseQ, 储备: baseQ };
  for(let r = 0; r < want - baseQ * 4; r++) quota[DEMO_PNEW_TIERS[r % 4]] += 1;
  const genIdx: Record<string, number> = { 标杆: 0, 主力: 0, 潜力: 0, 储备: 0 };
  for(const tier of DEMO_PNEW_TIERS){
    const have = curated.filter(x => x.tier === tier).length;
    const addN = Math.max(0, quota[tier] - have);
    curated.push(...demoFillPnew(tier, addN, genIdx[tier]));
    genIdx[tier] += addN;
  }
  const list = [...curated]
    .sort((a, b) => ((a.tierRank ?? 9) - (b.tierRank ?? 9)) || ((b.aiScore || 0) - (a.aiScore || 0)))
    .slice(0, want);
  return {
    list,
    meta: {
      pulled: 13742, matched: 1860, eligible: 1860, picked: list.length, count: list.length,
      totalDeclared: 13742,
      tierCounts: { 标杆: 120, 主力: 480, 潜力: 720, 储备: 540 },
    },
  };
}

// ------------------------------------------------------------
// 热点营销方案（演示 · 母婴 DHA）
// ------------------------------------------------------------
export function demoHotPlan(): HotMarketingPlan {
  return {
    summary: '未来 7 天：科学育儿 / DHA 同补话题热度走高，建议跟进入选素材，素材先过合规。',
    win: '7d', scenarios: ['竞价'], styles: ['干货科普', '测评对比'],
    windowText: '未来 7 天 · 千川竞价 · 短视频借势',
    fetchTime: new Date().toLocaleString('zh-CN'),
    opportunities: [
      {
        name: '科学育儿脑营养', type: '行业趋势', score: 4.4, grade: 'S', timeliness: '立即跟进',
        fitClients: '婴童 DHA / 营养品', whyNow: '科学育儿内容持续走高，DHA 同补认知成熟、决策窗口短。',
        angles: ['宝宝脑营养补充清单', 'DHA+ARA 一次讲清'], hook: '给宝宝补 DHA，这 3 点别踩坑（成分特写）',
        scenario: '竞价', style: '干货科普',
      },
      {
        name: '藻油替代鱼油', type: '平台信号', score: 4.0, grade: 'A', timeliness: '24小时内',
        fitClients: '藻油 DHA 商品', whyNow: '「无鱼腥味喂得进」场景共鸣强、互动高。',
        angles: ['鱼油 vs 藻油对比', '宝宝不抗拒的 DHA'], hook: '一喂鱼油就躲？试试藻油（喂养场景切入）',
        scenario: '竞价', style: '测评对比',
      },
      {
        name: '好评榜口碑', type: '可预期节点', score: 3.6, grade: 'B', timeliness: '3-7天准备',
        fitClients: '好评榜上榜母婴商品', whyNow: '宝妈依赖口碑决策，榜单内容跑量稳定。',
        angles: ['婴童 DHA 好评榜盘点', '第 8 名凭什么'], hook: '婴童 DHA 好评榜，这瓶我回购了（榜单切入）',
        scenario: '竞价', style: '测评对比',
      },
    ],
    hotItems: [
      { title: '科学育儿脑营养攻略', heat: '热度 980 万', source: '抖音热榜' },
      { title: '藻油无腥味喂养实测', heat: '热度 740 万', source: '抖音热榜' },
      { title: '婴童 DHA 好评榜盘点', heat: '热度 520 万', source: '母婴榜' },
    ],
  };
}

// ------------------------------------------------------------
// 链接识别（演示）
// ------------------------------------------------------------
export function demoUrlExtract(): UrlExtractResult {
  return {
    url: '', productName: DEMO_FORM.productName, brand: DEMO_FORM.brand,
    industry: '母婴宠物', category: '母婴用品 / 婴童营养品', source: 'llm',
    price: 139,
    sellingPoints: DEMO_FORM.sellingPoints,
    usageScene: DEMO_FORM.usageScene,
    targetAudience: DEMO_FORM.targetAudience,
  };
}

// ============================================================
// 🎬 内容能力演示 · 居家香氛（与商品分析 DHA 相互独立的演示语境）
// 仅在「内容能力（script）」模式被真实流程的 API 短路调用。
// ============================================================
export const DEMO_SCENT_FORM = {
  url: '',
  productName: '闻香居 · 梅雨季除味居家香氛喷雾',
  brand: '闻香居',
  agent: '星川自营',
  industry: '家居家清',
  category: '居家香氛',
  level1: '家居日用',
  level2: '香氛 / 空气清新',
  price: '39',
  usageScene: '南方梅雨季出租屋除霉味 / 老木柜返潮去味 / 居家情绪放松',
  sellingPoints: '一喷即时去味 · 干净皂香 / 木质香「闻香怀旧」 · 第三方检测除菌 99% · 小空间低门槛',
  targetAudience: '南方梅雨季租房年轻人 + 宝妈',
  xcDailyBudgetWan: '2',
  qianchuanDailySpend: '8000',
  targetPenetration: '12',
  stableRoi: '2.2',
  targetRoi: '1.8',
  reverseSelectPct: '15',
  materialChasePct: '55',
  influencerTags: ['家居', '香氛'],
} as const;

/** 判断当前演示商品是否为「居家香氛」语境（决定内容短路返回香氛还是 DHA 预置） */
export function isScentProduct(p: {
  productName?: string; brand?: string; category?: string; industry?: string;
} | null | undefined): boolean {
  if (!p) return false;
  const blob = `${p.productName || ''}${p.brand || ''}${p.category || ''}${p.industry || ''}`;
  return /香氛|闻香居|香薰|空气清新/.test(blob) && !/DHA|藻油/.test(blob);
}

export function demoScentBriefs(): BriefDirection[] {
  return [
    { id: 'sbrief-1', name: '梅雨季除味实测', coreSellingPoint: '一喷即时去味，出租屋霉味前后对比看得见', targetAudience: '南方梅雨季租房年轻人', materialFormat: '真人 vlog · 前后对比', validationGoal: '验证去味痛点与 3 秒留存' },
    { id: 'sbrief-2', name: '闻香怀旧情绪', coreSellingPoint: '干净皂香 / 木质香唤起老家白衬衫与老木柜记忆', targetAudience: '需要情绪共鸣的年轻人 / 宝妈', materialFormat: '情绪氛围短片', validationGoal: '验证情感共鸣与互动率' },
    { id: 'sbrief-3', name: '老国货翻红', coreSellingPoint: '老配方没丢还更适配现在，热榜借势', targetAudience: '关注热点 / 国货的年轻用户', materialFormat: '热点口播 · 复古记忆', validationGoal: '验证热点借势的拉新与点击' },
    { id: 'sbrief-4', name: '小空间低门槛改造', coreSellingPoint: '十几块一瓶，低成本把出租屋住得有质感', targetAudience: '租房 / 学生 / 新手宝妈', materialFormat: '场景好物植入 · 教程', validationGoal: '验证低门槛种草与加购' },
  ];
}

function scentMoreCase(i: number, title: string, brand: string, hook: string, dir: string): MoreCaseItem {
  return {
    id: `demo-scase-${i}`,
    title, brand, industry: '家居生活', category: '居家香氛',
    creativeDirection: dir, coverImageUrl: DEMO_SCENT_MORE_COVERS[i],
    videoLink: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
    hotAnalysis: '以梅雨季真实场景切入，强痛点 + 前后对比，跑量稳定。',
    hookDesign: hook,
    structure: '痛点钩子 → 实验对比 → 价格锚点 → 转化收口',
    consumption: ['30-50万', '50-100万', '10-30万'][i % 3],
    aiReason: '与本品同为居家香氛场景，梅雨季去味痛点与目标人群高度一致，开头钩子可直接复用。',
  };
}

export function demoScentMoreCases(): MoreCaseItem[] {
  return [
    scentMoreCase(0, '梅雨季出租屋除味实测·一喷见效', '闻香居', '一推门那股闷霉味，喷一下（前后对比）', '对比'),
    scentMoreCase(1, '老国货翻红·闻香怀旧', '某国货香氛', '又一个老国货被年轻人买上热搜（复古包装）', '热点'),
    scentMoreCase(2, '出租屋低成本改造·香氛篇', '家居品牌', '十几块把小出租屋住得有质感（改造对比）', '教程'),
    scentMoreCase(3, '宝妈居家安心香氛', '母婴家居', '带娃累崩，闻到这个像回到安稳的家（情绪向）', '情绪'),
  ];
}

/** 两条专项脚本（老国货翻红 / 痛点→实验→价格锚点→转化），映射为四段式 CreativeDirection */
export function demoScentDirections(): CreativeDirection[] {
  return [
    {
      angle: '热点借势 · 老国货翻红',
      title: '《老国货翻红：这瓶香氛凭什么被年轻人重新抢爆》',
      concept: '借「老国货翻红」热榜切入，用老木柜与白衬衫的闻香怀旧记忆引发共鸣，再落到「老配方没丢、更适配现在」的翻新卖点与转化收口。',
      hookType: '热点',
      hooks: ['又一个老国货被年轻人买上热搜', '这是我家用了二十多年的味道', '小时候外婆打开木柜就是这个味'],
      script: {
        pain: seg('手机划到「老国货翻红」热榜，镜头扫过复古包装', '又一个老国货被年轻人买上热搜了，这次是我家用了二十多年的味道。', '《老国货翻红》热点案例'),
        sell: seg('年轻出租屋场景喷香氛，霉味散去、空间焕新', '老配方没丢，还做成了更适合现在的香氛，梅雨季去味、出租屋改造都靠它。', '《翻新卖点》素材'),
        release: seg('老木柜、叠好的白衬衫特写，阳光斜照', '小时候外婆打开木柜就是这个味，干净、安心，一下把人拉回老家。', '《闻香怀旧》情绪片'),
        close: seg('产品 + 价格 + 热榜截图，引导购物车', '老国货这波真的值得冲，价格也实在，点购物车，闻一次就懂。', '《转化收口》素材'),
      },
      shootingTip: '复古包装与老木柜/白衬衫要真实有年代感，热榜切入要快，情绪段留白稍长。',
      materialPick: { type: '真人出镜', reason: '热点口播需真人带情绪', secondType: '混剪', secondReason: '复用热榜与老木柜镜头' },
    },
    {
      angle: '千川爆款结构',
      title: '《梅雨季屋里有霉味？这样一下搞定》',
      concept: '按「痛点→实验→价格锚点→转化」的确定性跑量结构：先放大梅雨季霉味痛点，用现场实验与检测报告建立去味/除菌信任，再对比香薰机/大牌做价格锚点，最后限时促单。',
      hookType: '痛点',
      hooks: ['南方一到梅雨季，屋里全是闷霉味', '霉味怎么散都散不掉？', '我直接做个实验给你看'],
      script: {
        pain: seg('潮湿出租屋，主角推门皱眉，凑近衣柜捂鼻', '南方一到梅雨季，屋里、衣柜里全是闷霉味，怎么散都散不掉。', '《梅雨季痛点》案例'),
        sell: seg('现场对有味织物 / 空间喷一下，前后对比，展示检测报告', '喷之前一股味，喷完你再闻，霉味没了，检测报告在这，除菌这块也有据可依。', '《实验对比》素材'),
        release: seg('对比香薰机 / 大牌香氛，再亮出本品', '香薰机大几百还得换芯，大牌香氛更贵，这一瓶十几块每天用都不心疼。', '《价格锚点》素材'),
        close: seg('手持产品强调限时活动与库存', '今天下单有活动价、库存就这些，梅雨季马上到，先囤上，点购物车。', '《限时促单》素材'),
      },
      shootingTip: '实验段务必同机位前后对比、检测报告清晰特写；价格锚点用字幕对比，转化段给库存紧迫感。',
      materialPick: { type: '桌拍特写', reason: '实验与报告适合微距', secondType: '真人出镜', secondReason: '真人增强实验可信度' },
    },
  ];
}

export function demoScentAnalyzeResult(): AnalyzeResult {
  return {
    product: {
      sellingPoints: [
        '一喷即时去味，梅雨季出租屋 / 老木柜霉味前后对比看得见',
        '干净皂香 / 木质香「闻香怀旧」，情绪共鸣强',
        '第三方检测报告支撑，实验室条件除菌 99%',
        '十几块一瓶，小空间低门槛改造',
      ],
      targetAudience: DEMO_SCENT_FORM.targetAudience,
      competitors: [
        { name: '大牌香氛 / 香薰机', priceBand: '200-800 元', contentStrategy: '高端氛围 + 设备耗材' },
        { name: '普通空气清新剂', priceBand: '9.9-29 元', contentStrategy: '低价掩盖气味，化学感' },
      ],
      contentStyle: '真人 vlog · 改造前后对比 · 情绪氛围短片',
      differentiators: ['即时去味而非掩盖', '闻香怀旧情绪价值', '检测报告支撑除菌 99%', '低门槛价格'],
      risks: ['除菌 99% 表述须与第三方报告原文一致', '不得泛化宣称杀菌 / 消毒 / 防病'],
    },
    scoring: {
      scores: {
        budget: sItem(15, '冷启日预算 1-2 万，家居香氛中小预算即可验证'),
        roiTolerance: sItem(20, '稳定 ROI 2.2 / 目标 1.8，复购与多件连带支撑'),
        delivery: sItem(14, '达人反选 15%，轻小件履约成本低、配合度高'),
        trend: sItem(18, '梅雨季临近 + 闻香怀旧 / 老国货翻红热点可借势'),
        pricePoint: sItem(13, '39 元低门槛，价格锚点对比大牌 / 香薰机'),
      },
      redLines: [
        { name: '除菌表述红线', hit: false, reason: '除菌 99% 以第三方报告为支撑，限定实验室条件并与报告原文一致。' },
        { name: '泛化功效红线', hit: false, reason: '不笼统宣称杀菌 / 消毒 / 防病 / 医用级。' },
        { name: '库存履约红线', hit: false, reason: '轻小件备货与发货时效满足放量节奏。' },
        { name: '素材供给红线', hit: false, reason: '家居香氛真人 / 改造类素材供给充足。' },
      ],
      strategyAdvice: [
        '以「梅雨季霉味 + 一喷去味」前后对比为主钩子，前 3 秒给痛点。',
        '用闻香怀旧 / 老国货翻红做情绪与热点双入口。',
        '冷启日预算 1-2 万小步测试，达标后再阶梯追投。',
      ],
    },
    matchedCases: [
      { caseIndex: 1, reason: '梅雨季去味前后对比与本品方向一致' },
      { caseIndex: 2, reason: '老国货翻红 + 闻香怀旧适配情绪卖点' },
    ],
    briefs: demoScentBriefs(),
    customFormula: [
      { stage: '钩子', technique: '痛点对比', detail: '梅雨季推门霉味 / 老木柜返潮', goal: '3 秒强留存' },
      { stage: '卖点', technique: '实验证明', detail: '喷前后对比 + 检测报告', goal: '建立去味 / 除菌信任' },
      { stage: '功效', technique: '情绪放大', detail: '闻香怀旧 / 出租屋焕新', goal: '强化情绪价值' },
      { stage: '转化', technique: '价格锚点促单', detail: '对比香薰机大牌 + 限时库存', goal: '加速下单' },
    ],
    creativeDirections: [], // 两条专项脚本在第二阶段点击「生成脚本」后才出现
    shootingTips: ['梅雨季真实场景同机位前后对比', '前 3 秒快速给霉味痛点', '检测报告微距清晰', '情绪段留白营造怀旧'],
    complianceNotes: [
      '除菌 99% 须表述为「实验室条件下经 XX 机构检测，对 XX 菌种除菌率达 99%」并与报告原文一致',
      '不得笼统宣称杀菌 / 消毒 / 防病 / 医用级',
      '不暗示对人体疾病有治疗或预防作用',
      '检测数据须注明检测条件与机构',
    ],
    influencerFramework: [
      { persona: '家居改造 / 租房生活博主', contentForm: '改造 vlog + 前后对比', followerTier: '10-50 万', reason: '强场景展示梅雨季去味与出租屋改造。' },
      { persona: '情绪向 / 生活方式达人', contentForm: '氛围短片 + 口播', followerTier: '5-30 万', reason: '承接闻香怀旧情绪共鸣。' },
      { persona: '国货 / 好物测评黑马', contentForm: '测评 + 开箱', followerTier: '1-15 万', reason: '低 CPM 冷启，强化检测报告与价格锚点。' },
    ],
    matchedCaseDetails: [
      { caseIndex: 1, title: '梅雨季出租屋除味实测', brand: '闻香居', coverImageUrl: DEMO_SCENT_MATCHED_COVERS[0], videoLink: 'https://www.douyin.com/search/梅雨季除味', reason: '去味前后对比与本品卖点一致，钩子可复用' },
      { caseIndex: 2, title: '老国货翻红·闻香怀旧', brand: '某国货香氛', coverImageUrl: DEMO_SCENT_MATCHED_COVERS[1], videoLink: 'https://www.douyin.com/search/老国货翻红', reason: '热点借势 + 情绪共鸣适配本品' },
    ],
    moreCases: demoScentMoreCases(),
    industryCaseCount: 4,
    totalScore: 80,
  };
}

// ============================================================
// 🎬 达人匹配 · 第 2 轮（砍 3 位高报价 / 补 3 位 DHA 垂类黑马，最终 10 位）
// 仅当 matchInfluencers 收到 product.refineNote（用户点「调整 / 重新匹配」）时返回。
// ============================================================
function r2c(p: Partial<InfluencerCandidate> & { cid: string; name: string }): InfluencerCandidate {
  return baseCandidate({
    pool: 'incr', douyinId: '', followers: 0, tags: ['母婴'], persona: [], forms: [],
    category: '', coop: '未接触', wechat: '', agent: '', homepage: '', video: '', xingtuUrl: '',
    highlight: '', level: '', ...p,
  });
}

export function demoMatchRound2(stockN = 10, incrN = 20): MatchResult {
  const stock: InfluencerCandidate[] = [
    r2c({ cid: 'r2-stock-1', pool: 'stock', name: '@成分控阿May', douyinId: '9012001', followers: 860000, tags: ['母婴', '婴童营养品'], persona: ['成分测评', '母婴'], forms: ['深度测评', '真人实测'], category: 'DHA 藻油', coop: '已合作', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/成分控阿May', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9012001', level: 'S4', aiScore: 94, reason: '无腥味测评与本品高度契合，保留为头部，第 2 轮继续合作。' }),
    r2c({ cid: 'r2-stock-2', pool: 'stock', name: '@熬夜宝妈小夏', douyinId: '9022002', followers: 420000, tags: ['母婴'], persona: ['真实宝妈', '种草'], forms: ['vlog', '喂养植入'], category: '婴童营养品', coop: '已合作', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/熬夜宝妈小夏', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9022002', level: 'S3', aiScore: 90, reason: '真实喂养场景强绑定，转化稳定，保留。' }),
    r2c({ cid: 'r2-stock-3', pool: 'stock', name: '@藻油测评小课堂', douyinId: '9332003', followers: 90000, tags: ['母婴', '婴童营养品'], persona: ['垂类测评', '黑马'], forms: ['微距测评'], category: 'DHA 藻油', coop: '已合作', wechat: '已添加', agent: '星川自营', homepage: 'https://www.douyin.com/search/藻油测评小课堂', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9332003', level: 'S2', aiScore: 89, reason: '🆕 黑马：只做藻油细分、报价 0.35 万 / CPM 105，内容垂直，低成本试错。' }),
  ];
  const incr: InfluencerCandidate[] = [
    r2c({ cid: 'r2-incr-1', pool: 'incr', name: '@藻油研究所', douyinId: '9112001', followers: 680000, tags: ['母婴', '婴童营养品'], persona: ['赛道测评'], forms: ['对比测评', '真人实测'], category: 'DHA 藻油', coop: '已合作', wechat: '已添加', agent: '优质星川池', homepage: 'https://www.douyin.com/search/藻油研究所', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9112001', level: 'S4', aiScore: 92, reason: '专注 DHA 赛道，转化已验证，保留。' }),
    r2c({ cid: 'r2-incr-2', pool: 'incr', name: '@小镇育婴师阿楠', douyinId: '9232003', followers: 120000, tags: ['母婴'], persona: ['育婴师', '垂类黑马'], forms: ['喂养教学', '微距测评'], category: 'DHA 藻油', coop: '已触达', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/小镇育婴师阿楠', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9232003', level: 'S2', aiScore: 91, reason: '🆕 黑马：持证育婴师、女粉 90%、报价 0.5 万 / CPM 110，无腥味喂哺实测有说服力。' }),
    r2c({ cid: 'r2-incr-3', pool: 'incr', name: '@二胎妈妈的日常', douyinId: '9132003', followers: 260000, tags: ['母婴'], persona: ['二胎宝妈', '黑马'], forms: ['vlog', '好物'], category: '婴童营养品', coop: '已触达', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/二胎妈妈的日常', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9132003', level: 'S2', aiScore: 88, reason: '🆕 黑马：两娃长期补 DHA、报价 0.7 万 / CPM 125，复购与信任背书强，契合复购目标。' }),
    r2c({ cid: 'r2-incr-4', pool: 'incr', name: '@白菜育儿日记', douyinId: '9122002', followers: 305000, tags: ['母婴'], persona: ['福利种草'], forms: ['开箱', '福利口播'], category: '母婴好物', coop: '已触达', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/白菜育儿日记', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9122002', level: 'S3', aiScore: 84, reason: '性价比高，适合腰部铺量与新客冷启，保留。' }),
    r2c({ cid: 'r2-incr-5', pool: 'incr', name: '@紧致生活家', douyinId: '9302005', followers: 460000, tags: ['母婴'], persona: ['主力', '生活'], forms: ['产品种草'], category: '母婴好物', coop: '已触达', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/紧致生活家', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9302005', level: 'S3', aiScore: 83, reason: '主力稳定产出、性价比好，适合主力投放，保留。' }),
    r2c({ cid: 'r2-incr-6', pool: 'incr', name: '@颜值测评君', douyinId: '9072007', followers: 550000, tags: ['母婴', '个护'], persona: ['测评'], forms: ['对比测评'], category: '母婴/个护', coop: '未接触', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/颜值测评君', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9072007', level: 'S3', aiScore: 80, reason: '女粉占比高、测评形式适配，保留观察，需建联。' }),
    r2c({ cid: 'r2-incr-7', pool: 'incr', name: '@种草小本本', douyinId: '9082008', followers: 180000, tags: ['母婴'], persona: ['生活种草'], forms: ['人感种草'], category: '母婴好物', coop: '未接触', wechat: '', agent: '优质星川池', homepage: 'https://www.douyin.com/search/种草小本本', xingtuUrl: 'https://www.xingtu.cn/xingtu/author/9082008', level: 'S2', aiScore: 79, reason: '真实人感种草，适合中腰部铺量，保留。' }),
  ];
  const stockWant = Math.max(1, Math.min(50, stockN));
  const incrWant = Math.max(1, Math.min(50, incrN));
  if(stock.length < stockWant) stock.push(...demoFillStock(stockWant - stock.length, stock.length + 30));
  if(incr.length < incrWant) incr.push(...demoFillIncr(incrWant - incr.length, incr.length + 30));
  return {
    stock: stock.slice(0, stockWant), incr: incr.slice(0, incrWant),
    meta: { stockTotal: 233, incrTotal: 994, stockRows: 233, incrRows: 994, stockPicked: Math.min(stock.length, stockWant), incrPicked: Math.min(incr.length, incrWant), stockCount: stockWant, incrCount: incrWant },
  };
}
