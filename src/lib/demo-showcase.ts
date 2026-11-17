// ============================================================
// 🎬 演示模式 · 规格化展示数据（demo-showcase）
// 仅在演示模式下被 ScoringPanel（商品定性诊断）与 DemoBoard（经营看板）使用，全部本地静态、无网络 / AI。
// 演示商品：诺特兰德 DHA（母婴 / 婴童营养品）
// 内容能力五场景：按要求对齐「居家香氛」语境
// ============================================================

// ------------------------------------------------------------
// 演示商品：诺特兰德 DHA
// ------------------------------------------------------------
export interface DemoProduct {
  name: string;
  brand: string;
  shop: string;
  rank: string;
  level1: string;
  level2: string;
  price: string;
  specs: string[];
  trust: string[];
  compliance: string[];
}

export const DEMO_PRODUCT: DemoProduct = {
  name: '诺特兰德新升级 DHA 藻油 ARA 制品 · 100mg DHA+ARA 自播专享',
  brand: '诺特兰德',
  shop: '诺特兰德官方旗舰店',
  rank: '婴童 DHA 藻油好评榜 第 8 名',
  level1: '母婴用品',
  level2: '婴童营养品',
  price: '139 元 / 瓶（自播专享）',
  specs: [
    '每粒含 DHA 100mg，并科学配比 ARA，DHA+ARA 同补更贴合喂养需求',
    '藻油来源（非鱼油），天然无鱼腥味，宝宝不抗拒、喂得进',
    '自播专享规格，官方旗舰店正品发货',
  ],
  trust: ['婴童 DHA 藻油好评榜第 8 名', '诺特兰德官方旗舰店', '保健食品蓝帽认证', '自播专享价 139 元'],
  compliance: [
    '保健食品广告需标注「本品不能代替药物」，不得宣称治疗、治愈或替代药品',
    '不得使用「最 / 第一 / 根治 / 100% 见效」等绝对化与保证性用语',
    '保健功能声称以注册批件为准，不得超出批准的功能范围',
    '不得利用婴幼儿形象做功效暗示，不得给「0 月龄」等误导性食用量建议',
    '涉及检测数据须与第三方报告原文一致，注明检测条件与机构',
  ],
};

// ------------------------------------------------------------
// 商品分析 · 五维定性诊断（不打分、不设总分）
// ------------------------------------------------------------
export type Verdict = '利好' | '中性' | '风险';

export interface QualDim {
  key: string;
  label: string;
  verdict: Verdict;
  conclusion: string;
  points: string[];
}

export const DEMO_DIMS: QualDim[] = [
  {
    key: 'track',
    label: '赛道机会',
    verdict: '利好',
    conclusion: '婴童 DHA 处于科学育儿升级的高景气赛道，藻油替代鱼油是明确趋势，好评榜第 8 名提供现成口碑势能。',
    points: [
      '父母对「脑营养 / 同补」认知成熟，教育成本低、搜索需求稳定',
      '「藻油无鱼腥味」切中鱼油喂哺痛点，是天然差异化卖点',
      '好评榜第 8 + 旗舰店信任状，冷启点击与转化基础好',
    ],
  },
  {
    key: 'price',
    label: '价格',
    verdict: '中性',
    conclusion: '139 元位于婴童 DHA 主流价格带，自播专享 + 旗舰店正品有效降低溢价决策阻力。',
    points: [
      '价格不极端，配合「自播专享」制造独占利益点',
      '用单粒成本 / 每日喂养成本做价格锚点，弱化总价敏感',
      '可设多瓶装与赠品，提升客单同时降低首单门槛',
    ],
  },
  {
    key: 'budget',
    label: '预算',
    verdict: '中性',
    conclusion: '建议分档投放：冷启以中小预算验证卖点与人群，跑稳后再阶梯追投，避免一次性大额试错。',
    points: [
      '冷启期建议日预算 3-5 万，集中验证「无腥味 + DHA100mg」素材',
      '单素材连续 3 天 ROI 达标再追投，预算向跑量素材集中',
      '预留 7-14 天测试期，不因首日波动频繁调价',
    ],
  },
  {
    key: 'roi',
    label: 'ROI',
    verdict: '利好',
    conclusion: '婴童营养品复购周期清晰、LTV 高，首单 ROI 可适度容忍，应以「首单拉新 + 复购回本」口径评估。',
    points: [
      '首单允许 ROI 阶段性下探，靠 2-4 瓶复购拉回整体回本',
      '建立会员 / 周期购 / 多瓶套装承接复购，提升 LTV',
      '按周复盘复购率与整体 ROI，而非只看首日即时 ROI',
    ],
  },
  {
    key: 'delivery',
    label: '执行落地',
    verdict: '风险',
    conclusion: '保健食品合规门槛高、母婴人群信任成本高，素材须法务前置过审，并依赖专业人设与宝妈真实种草。',
    points: [
      '所有口播 / 字幕先过保健食品广告合规，再投放',
      '优先营养师 / 儿科顾问人设与真实宝妈实测建立信任',
      '需稳定的自播直播间与履约，支撑放量与复购承接',
    ],
  },
];

// ------------------------------------------------------------
// 商品分析 · P0 / P1 / P2 分层行动项
// ------------------------------------------------------------
export interface ActionLevel {
  level: 'P0' | 'P1' | 'P2';
  title: string;
  timing: string;
  items: { task: string; why: string }[];
}

export const DEMO_ACTIONS: ActionLevel[] = [
  {
    level: 'P0',
    title: '立即启动 · 合规与核心卖点',
    timing: '本周内',
    items: [
      { task: '完成蓝帽批件 / 检测报告合规归档，素材先过法务', why: '保健食品合规是放量前提，避免投后下架与处罚' },
      { task: '打造「无鱼腥味 + DHA100mg + ARA 同补」黄金 3 秒', why: '直击鱼油喂哺痛点，是本品最强点击与记忆点' },
      { task: '将自播专享价 139 元与旗舰店信任状落到落地页', why: '用信任状 + 独占价降低首单决策门槛' },
    ],
  },
  {
    level: 'P1',
    title: '测试放量 · 素材与人群验证',
    timing: '第 2-3 周',
    items: [
      { task: '按「痛点→实验→价格锚点→转化」跑 3-5 条素材测 ROI', why: '用结构化成套路素材快速筛出跑量方向' },
      { task: '上线母婴达人真人实测 + 宝妈真实种草', why: '母婴人群依赖信任，真实口碑提升转化' },
      { task: '搭建复购 / 会员 / 周期购机制', why: '承接营养品高复购属性，用 LTV 拉回 ROI' },
    ],
  },
  {
    level: 'P2',
    title: '优化沉淀 · 公式与长效资产',
    timing: '第 4 周以后',
    items: [
      { task: '沉淀跑量素材公式、黄金开头与高转化人群包', why: '降低后续新素材冷启成本、提高复用率' },
      { task: '拓展 DHA+ARA 同补教育内容与跨品类联名', why: '从单品卖点走向品类教育，扩大人群与客单' },
      { task: '建立月度好评榜追榜与口碑放大机制', why: '把好评榜第 8 做成可持续信任资产' },
    ],
  },
];

// ------------------------------------------------------------
// 商品分析 · 服务商适配建议
// ------------------------------------------------------------
export interface AgencyFit {
  fit: string[];
  capabilities: string[];
  avoid: string[];
}

export const DEMO_AGENCY: AgencyFit = {
  fit: [
    '具备母婴 / 保健食品广告报备经验、有成熟法务合规流程的服务商',
    '握有营养师 / 儿科顾问 / 头部宝妈等专业人设资源的内容团队',
    '能同时操盘自播直播间、并具备私域复购承接能力的代运营',
  ],
  capabilities: ['保健食品合规与法务过审', '母婴达人库与真人实测', '自播直播间操盘', '会员 / 私域复购承接'],
  avoid: [
    '不建议纯效果投流、无保健食品报备经验的团队（合规与下架风险高）',
    '不建议只有泛娱乐达人、缺乏母婴信任型人设资源的团队',
  ],
};

// ------------------------------------------------------------
// 内容能力 · 场景一：素材策略单（居家香氛）
// ------------------------------------------------------------
export interface StrategyDoc {
  audiences: { name: string; insight: string; hook: string }[];
  emotion: string;
  sellingAngles: string[];
  formats: string[];
  channels: string[];
}

export const DEMO_STRATEGY: StrategyDoc = {
  audiences: [
    {
      name: '南方梅雨季 · 租房年轻人',
      insight: '回南天 / 梅雨季出租屋潮湿、衣物和老木柜返潮有霉味，想低成本把小出租屋住得干净有质感。',
      hook: '「梅雨季一推门那股闷霉味，喷一下，整个出租屋都活过来了」',
    },
    {
      name: '宝妈',
      insight: '家里有娃，对异味与卫生更敏感，需要安全、好闻又能帮上忙的居家香氛，兼顾情绪放松。',
      hook: '「带娃累到崩溃，闻到这个味道像回到小时候那个安稳的家」',
    },
  ],
  emotion: '闻香怀旧：用熟悉的干净皂香 / 木质香唤起童年老家、晒过的白衬衫与外婆家老木柜的记忆，把「好闻」升级成情感归属。',
  sellingAngles: ['梅雨季除味 / 去霉味的即时场景', '闻香怀旧的情绪共鸣', '小空间 / 出租屋低门槛改造', '宝妈在意的居家安心感'],
  formats: ['真人口播 vlog', '出租屋改造前后对比', '情绪向氛围短片', '场景化好物植入'],
  channels: ['抖音信息流 / 千川', '小红书图文 + 短视频', '品牌自播间'],
};

// ------------------------------------------------------------
// 内容能力 · 场景二：两条专项脚本
// ------------------------------------------------------------
export interface SpecialScript {
  kind: string;
  title: string;
  structure: string;
  beats: { stage: string; visual: string; voiceover: string }[];
}

export const DEMO_SPECIAL_SCRIPTS: SpecialScript[] = [
  {
    kind: '热点营销向',
    title: '《老国货翻红：这瓶香氛凭什么被年轻人重新抢爆》',
    structure: '热点借势 · 老国货翻红',
    beats: [
      { stage: '热点切入', visual: '手机划到「老国货翻红」热榜，镜头扫过复古包装', voiceover: '又一个老国货被年轻人买上热搜了，这次是我家用了二十多年的味道。' },
      { stage: '记忆共鸣', visual: '老木柜、叠好的白衬衫特写，阳光斜照', voiceover: '小时候外婆打开木柜就是这个味，干净、安心，一下把人拉回老家。' },
      { stage: '翻新卖点', visual: '年轻出租屋场景喷香氛，霉味散去、空间焕新', voiceover: '老配方没丢，还做成了更适合现在的香氛，梅雨季去味、出租屋改造都靠它。' },
      { stage: '转化收口', visual: '产品 + 价格 + 热榜截图', voiceover: '老国货这波真的值得冲，价格也实在，点购物车，闻一次就懂。' },
    ],
  },
  {
    kind: '千川爆款结构向',
    title: '《梅雨季屋里有霉味？这样一下搞定》',
    structure: '痛点 → 实验 → 价格锚点 → 转化',
    beats: [
      { stage: '痛点', visual: '潮湿出租屋，主角推门皱眉，凑近衣柜捂鼻', voiceover: '南方一到梅雨季，屋里、衣柜里全是闷霉味，怎么散都散不掉。' },
      { stage: '实验', visual: '现场对有味织物 / 空间喷一下，前后对比，展示检测报告', voiceover: '我直接做个实验：喷之前一股味，喷完你再闻，霉味没了，检测报告在这，除菌这块也有据可依。' },
      { stage: '价格锚点', visual: '对比香薰机 / 大牌香氛，再亮出本品', voiceover: '香薰机大几百、还得换芯，大牌香氛更贵，这一瓶十几块每天用都不心疼。' },
      { stage: '转化', visual: '手持产品强调限时与库存', voiceover: '今天下单有活动价、库存就这些，梅雨季马上到，先囤上，点购物车。' },
    ],
  },
];

// ------------------------------------------------------------
// 内容能力 · 场景三：脚本优化 · 三种结果对比
// ------------------------------------------------------------
export interface RefineCompare {
  base: string;
  variants: { type: string; goal: string; result: string }[];
}

export const DEMO_REFINE: RefineCompare = {
  base: '原句：本产品气味清新，可有效去除室内异味，欢迎消费者选购。',
  variants: [
    {
      type: '口语化改写',
      goal: '去掉书面腔，像朋友说话，提升完播与信任',
      result: '改后：「说真的，梅雨季屋里那股闷味，你就这么喷两下，哎，味道一下就舒服了，跟小时候晒过的被子一个味。」',
    },
    {
      type: '加强转化',
      goal: '强化限时 / 稀缺与行动指令，提升点击转化',
      result: '改后：「就今天这个活动价，库存真不多，梅雨季说来就来，别等有味了再找，现在点购物车先囤一瓶，手慢无。」',
    },
    {
      type: '压缩时长对比',
      goal: '压到更短、信息密度更高，适配 3 秒留存与跑量',
      result: '改后（更短）：「梅季霉味？喷一下，没了。十几块，点购物车。」（由原 8 秒压到约 3 秒，钩子前置）',
    },
  ],
};

// ------------------------------------------------------------
// 内容能力 · 场景四：Brief 拆解（声量 + 复购）
// ------------------------------------------------------------
export interface BriefBreakdown {
  goals: { goal: string; metric: string }[];
  dims: { dim: string; detail: string }[];
  compliance: { claim: string; allowed: string }[];
}

export const DEMO_BRIEF: BriefBreakdown = {
  goals: [
    { goal: '声量', metric: '话题曝光 / 播放量、互动率、UGC 跟拍数，打造「闻香怀旧」记忆点' },
    { goal: '复购', metric: '30 / 60 天复购率、会员 / 周期购占比、多件装连带率' },
  ],
  dims: [
    { dim: '目标人群', detail: '南方梅雨季租房年轻人 + 宝妈，主打去味刚需与情绪共鸣' },
    { dim: '核心卖点', detail: '即时去味 + 闻香怀旧 + 居家安心，配合梅雨季场景' },
    { dim: '内容形式', detail: '真人 vlog / 改造对比 / 情绪氛围片，节奏前 3 秒给痛点' },
    { dim: '承接路径', detail: '短视频 → 自播间 / 商品卡 → 会员复购体系，兼顾拉新与复购' },
  ],
  compliance: [
    {
      claim: '除菌 99%',
      allowed: '须以第三方检测报告为支撑，表述限定为「在实验室条件下，经 XX 机构检测，对 XX 菌种除菌率达 99%」，并与报告原文一致。',
    },
    {
      claim: '禁用泛化表述',
      allowed: '不得笼统宣称「杀菌 / 消毒 / 防病 / 医用级」，不得暗示对人体疾病有治疗或预防作用。',
    },
  ],
};

// ------------------------------------------------------------
// 内容能力 · 场景五：AI 镜头（老木柜 + 白衬衫）
// ------------------------------------------------------------
export interface AiShot {
  scene: string;
  prompt: { label: string; text: string }[];
  negative: string;
}

export const DEMO_AI_SHOT: AiShot = {
  scene: '老木柜 + 白衬衫 · 怀旧镜头',
  prompt: [
    { label: '画面主体', text: '一只上了年纪的深色实木老衣柜，柜门半开，柜门上叠着一件洗得发白、熨帖平整的白衬衫，衬衫边缘有轻微岁月泛黄。' },
    { label: '构图', text: '竖屏 9:16，中近景，白衬衫与木柜纹理位于画面黄金分割点，浅景深、背景柔和虚化。' },
    { label: '光线', text: '午后暖阳从木窗斜射进来，空气中有缓慢浮动的细小尘埃（丁达尔光），光斑落在白衬衫上。' },
    { label: '色调', text: '暖黄复古胶片色调，低饱和、柔和高光，怀旧而安静。' },
    { label: '运镜', text: '镜头极缓慢推近并轻微横移，模拟人走近衣柜的视角，结尾轻微定格。' },
    { label: '氛围', text: '干净、温柔、怀旧，仿佛外婆家，隐约有一缕干净皂香 / 木质香的通感。' },
  ],
  negative: '现代物件、塑料感、冷色调、强光直射、人物正脸、文字水印、变形的衣柜、夸张 HDR、廉价香水瓶特写。',
};

// ------------------------------------------------------------
// 达人匹配 · 筛选条件（DHA 商品）
// ------------------------------------------------------------
export interface MatchFilters {
  category: string;
  followers: string;
  style: string;
  region: string;
  femalePct: string;
  coop: string;
}

export const DEMO_MATCH_FILTERS: MatchFilters = {
  category: '母婴用品 / 婴童营养品（DHA、藻油、宝宝营养相关历史合作优先）',
  followers: '以 10-100 万腰部为主，搭配 1-2 位百万级专业人设',
  style: '专业科普 / 成分测评 / 宝妈真实种草，拒绝纯硬广',
  region: '全国可寄样，南方高线城市与育儿大省优先（梅雨 / 高线科学育儿人群集中）',
  femalePct: '女性粉丝比例 ≥ 70%（母婴决策主力）',
  coop: '优先已合作 / 已触达、可快速建联与排期者',
};

// ------------------------------------------------------------
// 达人匹配 · 两轮推荐
// ------------------------------------------------------------
export interface RoundCreator {
  name: string;
  pool: string;
  followers: string;
  persona: string;
  forms: string;
  category: string;
  price20: string;
  cpm20: string;
  female: string;
  coop: string;
  note: string;
  flag?: '高报价' | '黑马';
}

export const DEMO_ROUND_1: RoundCreator[] = [
  { name: '@营养师顾妈', pool: '存量星川', followers: '125 万', persona: '营养师·权威科普', forms: '专业口播·成分解析', category: '婴童营养品', price20: '6.8 万', cpm20: '220', female: '83%', coop: '洽谈中', note: '权威人设强力支撑 DHA+ARA 同补教育，量级大，档期需锁定。', flag: '高报价' },
  { name: '@成分控阿May', pool: '存量星川', followers: '86 万', persona: '成分测评·母婴', forms: '深度测评·真人实测', category: 'DHA 藻油', price20: '4.2 万', cpm20: '180', female: '80%', coop: '已合作', note: '做过藻油 vs 鱼油对比，无腥味测评可信，有成功合作。' },
  { name: '@熬夜宝妈小夏', pool: '存量星川', followers: '42 万', persona: '真实宝妈·种草', forms: 'vlog·场景植入', category: '婴童营养', price20: '1.8 万', cpm20: '150', female: '88%', coop: '已合作', note: '宝妈视角真实，喂养场景代入强，转化稳定。' },
  { name: '@儿科林医生', pool: '优质星川', followers: '150 万', persona: '儿科·专业背书', forms: '科普口播', category: '宝宝营养', price20: '8.5 万', cpm20: '240', female: '79%', coop: '未接触', note: '背书极强但报价高、建联周期长，性价比一般。', flag: '高报价' },
  { name: '@藻油研究所', pool: '优质星川', followers: '68 万', persona: '赛道测评', forms: '对比测评', category: 'DHA 藻油', price20: '3.1 万', cpm20: '165', female: '76%', coop: '已触达', note: '专注 DHA 赛道，对比测评与本品卖点高度契合。' },
  { name: '@白菜育儿日记', pool: '优质星川', followers: '30 万', persona: '福利种草', forms: '开箱·口播', category: '母婴好物', price20: '0.9 万', cpm20: '140', female: '85%', coop: '已触达', note: '性价比高适合腰部铺量与新客冷启。' },
  { name: '@颜值测评君', pool: '星图推荐', followers: '55 万', persona: '测评', forms: '对比测评', category: '母婴/个护', price20: '3.6 万', cpm20: '200', female: '78%', coop: '未接触', note: '女粉占比高，测评形式适配，需建联。' },
  { name: '@种草小本本', pool: '星图推荐', followers: '18 万', persona: '生活种草', forms: '人感种草', category: '母婴好物', price20: '0.9 万', cpm20: '150', female: '82%', coop: '未接触', note: '真实人感种草，适合中腰部铺量。' },
  { name: '@头部母婴颜究院', pool: '潜力星川', followers: '210 万', persona: '标杆·母婴', forms: '好物评测·种草', category: '婴童营养', price20: '12 万', cpm20: '260', female: '81%', coop: '未接触', note: '标杆量级但报价显著超本轮预算，先不采用。', flag: '高报价' },
  { name: '@紧致生活家', pool: '潜力星川', followers: '46 万', persona: '主力·生活', forms: '产品种草', category: '母婴好物', price20: '1.5 万', cpm20: '155', female: '74%', coop: '已触达', note: '主力稳定产出，性价比好，适合主力投放。' },
];

export interface Round2Change {
  cut: { name: string; reason: string }[];
  add: RoundCreator[];
  note: string;
}

export const DEMO_ROUND_2: Round2Change = {
  cut: [
    { name: '@营养师顾妈', reason: '刊例 6.8 万、CPM 220，超本轮腰部预算，先用中腰部验证，跑稳后再考虑。' },
    { name: '@儿科林医生', reason: '8.5 万 + 建联周期长，冷启阶段投产比不划算。' },
    { name: '@头部母婴颜究院', reason: '12 万报价显著超预算，本轮不采用。' },
  ],
  add: [
    { name: '@小镇育婴师阿楠', pool: '潜力星川', followers: '12 万', persona: '育婴师·垂类黑马', forms: '真人实测·喂养教学', category: 'DHA 藻油', price20: '0.5 万', cpm20: '110', female: '90%', coop: '已触达', note: '持证育婴师，粉丝精准、女粉 90%，无腥味喂哺实测很有说服力。', flag: '黑马' },
    { name: '@二胎妈妈的日常', pool: '优质星川', followers: '26 万', persona: '二胎宝妈·黑马', forms: 'vlog·好物', category: '婴童营养品', price20: '0.7 万', cpm20: '125', female: '89%', coop: '已触达', note: '两娃长期补 DHA，复购与信任背书强，契合复购目标。', flag: '黑马' },
    { name: '@藻油测评小课堂', pool: '存量星川', followers: '9 万', persona: '垂类测评·黑马', forms: '微距测评', category: 'DHA 藻油', price20: '0.35 万', cpm20: '105', female: '86%', coop: '已合作', note: '只做藻油细分，报价低、内容垂直，适合低成本试错。', flag: '黑马' },
  ],
  note: '第 2 轮砍掉 3 位高报价 / 高 CPM 达人（预算优先用于验证卖点），补充 3 位 DHA 垂类黑马：更垂直、女粉更集中、CPM 更低，冷启投产比更优，最终保留 10 位。',
};

// ------------------------------------------------------------
// 经营看板 · 三步（填报 → 补 ROI/阶段生成分层 → 调口径重算）
// ------------------------------------------------------------
export interface BoardClient {
  name: string;
  spend: number;   // 星川日消耗（万元）
  roi: number;
  stage: '冷启' | '起量' | '稳定';
}

export const DEMO_BOARD_CLIENTS: BoardClient[] = [
  { name: '诺特兰德官方旗舰店（自播）', spend: 5.0, roi: 2.6, stage: '稳定' },
  { name: '宝妈优选专营店', spend: 3.2, roi: 2.1, stage: '起量' },
  { name: '藻油营养严选', spend: 1.8, roi: 1.6, stage: '起量' },
  { name: '育儿好物集市', spend: 0.9, roi: 1.2, stage: '冷启' },
  { name: '母婴大牌小样', spend: 0.4, roi: 0.9, stage: '冷启' },
  { name: '小小母婴铺', spend: 0.2, roi: 0.8, stage: '冷启' },
];

/** 分层口径（可在第 3 步调整） */
export interface TierRule {
  tier: 'A' | 'B' | 'C' | 'D';
  name: string;
  spend: number;   // 日消耗门槛（万元，≥）
  roi: number;     // ROI 门槛（≥）
}

export const DEFAULT_TIER_RULES: TierRule[] = [
  { tier: 'A', name: '战略客户', spend: 3.0, roi: 2.0 },
  { tier: 'B', name: '重点客户', spend: 1.5, roi: 1.5 },
  { tier: 'C', name: '成长客户', spend: 0.5, roi: 1.0 },
  { tier: 'D', name: '观察客户', spend: 0, roi: 0 },
];

/** 按口径计算单个客户层级（取满足条件的最高层） */
export function tierOf(c: BoardClient, rules: TierRule[]): TierRule {
  for (const r of rules) {
    if (c.spend >= r.spend && c.roi >= r.roi) return r;
  }
  return rules[rules.length - 1];
}
