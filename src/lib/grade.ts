// 商品定级（商品分层规则V1）
// 定级 = 商品分数（定量）+ 服务商自身达人库与承接能力（定性）
// 因此定级不写在商品分析一页纸，而在「服务商适配分析」中输出，并同步到代理商爆品库。
import type { AgencyFitData } from './api';

export type Grade = 'P0' | 'P1' | 'P2' | 'P3';

export interface GradeResult {
  grade: Grade;
  name: string;        // 层级名：核心增产 / 供给补齐 / 能力带动 / 观察验证 / 暂缓·汰换
  badge: string;       // 徽标文案
  reason: string;      // 定级依据（引用分数与达人库情况）
  action: string;      // 建议动作（分层规则V1）
  trigger: string;     // 升级/降级触发
  serviceStrategy: ServiceStrategy;  // 分级服务策略（写入一页纸）
}

// 分级服务策略：服务商拿到定级后如何跟进该商品
export interface ServiceStrategy {
  summary: string;                 // 一句话总策略
  resource: string;                // 资源与人力配置
  budget: string;                  // 预算节奏
  creator: string;                 // 达人策略
  content: string;                 // 内容/素材策略
  review: string;                  // 复盘与止损
}

// 服务商适配判定要点（定性）：优势行业 / 达人供给深度 / 内容产能 / 同类目经验
export interface FitSignals {
  matchedCount: number;
  coverage: '强' | '中' | '弱';
  hasBenchmark: boolean;   // 是否有标杆/主力级（S3+）匹配达人
  hasTopLevel: boolean;    // 是否有 S4/S5 匹配达人
  total: number;
}

export function fitSignalsFromData(d: AgencyFitData | null | undefined): FitSignals | null {
  if (!d || d.empty) return null;
  const top = Array.isArray(d.topCreators) ? d.topCreators : [];
  return {
    matchedCount: d.matchedCount || 0,
    coverage: d.coverage,
    total: d.total || 0,
    hasBenchmark: top.some(c => /^(S3|S4|S5)$/.test(c.level) || c.tier === '标杆' || c.tier === '主力'),
    hasTopLevel: top.some(c => /^(S4|S5)$/.test(c.level) || c.tier === '标杆'),
  };
}

/**
 * 商品分层规则V1 确定性定级（FaaS 同源实现；前端仅用于即时展示）
 * @param score        商品分析总分（0-100）
 * @param hardGateFail 硬门槛是否命中（毛利/合规/库存履约/素材供给）
 * @param fit          服务商达人库适配信号；null = 达人库为空，无法定级
 */
export function gradeByFit(
  score: number | null | undefined,
  hardGateFail: boolean,
  fit: FitSignals | null,
): GradeResult | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (!fit) return null; // 没有达人库 → 不定级（爆品库显示空圆圈）
  const m = fit.matchedCount;
  const enoughSupply = fit.coverage !== '弱' && m >= 4 && fit.hasBenchmark;
  const strongSupply = fit.coverage === '强' && m >= 10 && fit.hasTopLevel;

  if (hardGateFail || score < 60) {
    return {
      grade: 'P3', name: '暂缓·汰换', badge: 'P3 · 暂缓/汰换',
      reason: hardGateFail
        ? `商品分数 ${Math.round(score)} 分，但已命中硬门槛（毛利/合规/库存履约/素材供给）；达人库行业匹配 ${m} 位（覆盖${fit.coverage}）`
        : `商品分数 ${Math.round(score)} 分（＜60），且达人库行业匹配 ${m} 位（覆盖${fit.coverage}），不具备稳定测试条件`,
      action: '暂停新增投入、释放专职人力，从在运营项目池汰换，优先替换为 P0/P1 项目；保留信息待条件改善后重评',
      trigger: '商品提升至 60 分且服务商具备基本承接能力后重新分层',
      serviceStrategy: STRAT.P3,
    };
  }
  if (score >= 75) {
    if (strongSupply) {
      return {
        grade: 'P0', name: '核心增产', badge: 'P0 · 核心增产',
        reason: `商品分数 ${Math.round(score)} 分（≥75），且达人库行业匹配 ${m} 位（覆盖强、含 S4/S5 头部达人），属优势行业、供给充足`,
        action: '提高达人招募与素材产出目标；优先配置成熟 PM/编导/达人 BD；增加预算并按周复盘；必要时从低效项目调配人力',
        trigger: '连续达到消耗及 ROI 目标则继续增产；连续未达目标降为 P1',
        serviceStrategy: STRAT.P0,
      };
    }
    return {
      grade: 'P1', name: '供给补齐', badge: 'P1 · 供给补齐',
      reason: `商品分数 ${Math.round(score)} 分（≥75），但非优势行业或达人供给暂时不足（行业匹配 ${m} 位、覆盖${fit.coverage}${fit.hasTopLevel ? '' : '、缺头部达人'}）`,
      action: '小预算测试；定向补充行业达人；PM 牵头短期攻坚；优先内部调人不直接扩编；验证通过再增产',
      trigger: '达人供给和测试结果达标升 P0；验证失败或供给补不齐降 P2',
      serviceStrategy: STRAT.P1_SUPPLY,
    };
  }
  // 60~74
  if (enoughSupply) {
    return {
      grade: 'P1', name: '能力带动', badge: 'P1 · 能力带动',
      reason: `商品分数 ${Math.round(score)} 分（60~74），达人库行业匹配 ${m} 位（覆盖${fit.coverage}、含标杆/主力达人），团队可通过内容与运营改善短板`,
      action: '设 1~2 周专项验证；配置强编导/强 BD；围绕价格、素材、ROI 短板定向优化；达标后追加达人与素材产能',
      trigger: '商品综合分提升至 75 分升 P0；一个验证周期无改善降 P2',
      serviceStrategy: STRAT.P1_ABILITY,
    };
  }
  return {
    grade: 'P2', name: '观察验证', badge: 'P2 · 观察验证',
    reason: `商品分数 ${Math.round(score)} 分（60~74），非优势行业且达人供给/同类目经验不突出（行业匹配 ${m} 位、覆盖${fit.coverage}）`,
    action: '仅小范围测试；设预算/人力/周期上限；共享 PM/编导/BD，不配专职人力；触及止损线立即暂停',
    trigger: '关键指标改善升 P1；连续两个验证周期无改善则进入项目汰换',
    serviceStrategy: STRAT.P2,
  };
}

// 分级服务策略库（对内完整；对外版由 FaaS 保留策略结构、仅隐去底表数字）
const STRAT: Record<'P0' | 'P1_SUPPLY' | 'P1_ABILITY' | 'P2' | 'P3', ServiceStrategy> = {
  P0: {
    summary: '重点投入、全力增产：按核心项目规格配置资源，以周为单位拉规模，本季度消耗增量优先由该商品承担。',
    resource: '组建专职小组（成熟 PM 1 名牵头 + 专职编导 + 达人 BD），优先排期；必要时从低效项目调配人力，不与 P2 项目共享资源。',
    budget: '预算优先保障：星川日预算对标类目 P60 以上水位配置，按周根据跑量情况上调，不设过紧的 ROI 上限，给足学习空间。',
    creator: '提高达人招募目标，S/A 级（标杆/头部）达人优先排期、锁定档期，扩大同类目匹配达人基数，保障每周上新达人数。',
    content: '提升素材产出节奏：多方向并行测试，跑量素材第一时间追投（追投比例目标 ≥50%），沉淀可复制的爆款结构并快速复刻。',
    review: '每周复盘消耗、ROI 与素材跑量率；连续达到消耗及 ROI 目标继续增产，连续未达目标降为 P1 并重配资源。',
  },
  P1_SUPPLY: {
    summary: '先补供给、控投入：商品潜力高但服务商达人/行业供给未匹配，以短期攻坚补齐供给，验证通过再增产。',
    resource: '由 PM 牵头成立短期攻坚小组，优先内部调人，不直接扩编、不配全套专职团队。',
    budget: '小预算测试：仅覆盖测试所需最小日预算，单测试周期设定预算上限，不提前放量。',
    creator: '定向补充行业达人：围绕商品行业定向招募/外采，优先补齐标杆与头部达人缺口，供给达标前不排大规模档期。',
    content: '聚焦 1~2 个最有把握的内容方向做精测试，验证达人与内容的匹配效率，不铺多方向。',
    review: '按测试周期（建议 1~2 周）复盘；达人供给与测试结果达标升 P0，验证失败或供给补不齐降 P2。',
  },
  P1_ABILITY: {
    summary: '能力带动、专项验证：商品有短板但服务商行业能力强，以强团队定向补短板，跑通后追加产能。',
    resource: '设 1~2 周专项验证，配置强编导/强 BD，PM 盯进度；团队以优势行业经验复用成熟打法。',
    budget: '预算按验证规模配置，随短板改善分阶段上调，验证达标后再正式追加。',
    creator: '优先调用库内高匹配的标杆/主力达人打头阵，用确定性强的达人先跑通模型，再扩腰部。',
    content: '围绕价格、素材、ROI 三项短板定向优化内容：针对性补卖点表达/钩子/价格机制，单变量迭代验证。',
    review: '每个验证周期评估短板改善情况；商品综合分升至 75 分升 P0，一个周期无改善降 P2。',
  },
  P2: {
    summary: '观察验证、严格控投：商品与服务商能力均无明显优势，仅小范围测试，严控人效与机会成本。',
    resource: '不配置专职人力，采用共享 PM/编导/BD 资源；不占用 P0/P1 项目排期。',
    budget: '仅小范围测试，预设预算、人力和周期三项上限，不追加预算直至指标改善。',
    creator: '仅用现有库内少量匹配达人测试，不做定向招募与外采投入。',
    content: '以最低成本验证 1 个内容方向，达到止损线立即暂停，不做持续素材投入。',
    review: '关键指标改善可升 P1；连续两个验证周期无改善则进入项目汰换流程。',
  },
  P3: {
    summary: '暂缓/汰换、及时止损：暂停一切新增投入，把人力与预算转向 P0/P1 项目。',
    resource: '释放该商品占用的专职/共享人力，不再保留排期。',
    budget: '停止新增预算，在投计划按止损原则收尾。',
    creator: '停止达人招募与档期锁定。',
    content: '停止新增素材产出，仅保留必要信息归档。',
    review: '保留商品信息与诊断结论；待商品提升至 60 分且服务商具备基本承接能力后，再重新评估分层。',
  },
};

/** 按定级取分级服务策略（一页纸展示用；P1 需指定供给补齐/能力带动，默认能力带动） */
export function serviceStrategyFor(grade: Grade, fitKind?: 'supply' | 'ability'): ServiceStrategy {
  if (grade === 'P1') return STRAT[fitKind === 'supply' ? 'P1_SUPPLY' : 'P1_ABILITY'];
  return STRAT[grade];
}

// 定级配色（与飞书单选 P0 红 / P1 橙 / P2 灰 协调；P3 深红）
export const GRADE_STYLE: Record<Grade, {
  text: string; bg: string; border: string; dot: string;
}> = {
  P0: { text: '#B42318', bg: '#FEF3F2', border: '#FDA29B', dot: '#F04438' },
  P1: { text: '#B54708', bg: '#FFFAEB', border: '#FEDF89', dot: '#F79009' },
  P2: { text: '#475467', bg: '#F9FAFB', border: '#D0D5DD', dot: '#98A2B3' },
  P3: { text: '#7A271A', bg: '#FDF1ED', border: '#D97060', dot: '#B42318' },
};

export const GRADE_ORDER: Grade[] = ['P0', 'P1', 'P2', 'P3'];
