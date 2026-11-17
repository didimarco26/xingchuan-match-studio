// ============================================================
// 🎬 演示模式 · 服务商适配分析（本地确定性计算，不走 FaaS）
// 口径与 FaaS stock_influencer_match_product / gen_industry_advantage 完全一致，
// 达人库为预置的深圳正阳 233 人（src/data/demo-agency-library.ts）。
// ============================================================
import type {
  AgencyFitData, AgencyFitRequestBody, AgencyFitCreator,
} from './api';
import {
  DEMO_LIB, DEMO_AGENCY, DEMO_AGENCY_CANONICAL,
} from '../data/demo-agency-library';

const FIT_INDUSTRY_TAGS = ['美妆','个人护理','家清纸品','服装','母婴用品','食品饮料','水饮冲调','家居家装','3C数码家电','运动户外','宠物生活','生鲜食品','图书教育','珠宝配饰','本地生活','健康滋补','其他'];
const FIT_LEVEL1_TAGS: Record<string, string[]> = {
  '彩妆香水': ['美妆'], '个人护理': ['个人护理'], '家清纸品': ['家清纸品'],
  '服装': ['服装'], '鞋靴': ['服装'], '箱包': ['服装'],
  '母婴用品': ['母婴用品'], '宠物生活': ['宠物生活'],
  '休闲食品': ['食品饮料'], '粮油干货/方便速食': ['食品饮料'],
  '肉禽蛋品': ['生鲜食品'], '水果蔬菜': ['生鲜食品'], '海鲜水产': ['生鲜食品'], '冷冻/冷藏制品': ['生鲜食品'],
  '酒类': ['水饮冲调'], '水饮冲调': ['水饮冲调'],
  '家具': ['家居家装'], '居家日用': ['家居家装'], '餐饮厨具': ['家居家装'],
  '3C数码及配件': ['3C数码家电'], '电器': ['3C数码家电'],
  '运动休闲用品': ['运动户外'],
  '书籍/杂志/报纸': ['图书教育'], '文教文化用品': ['图书教育'],
  '传统滋补': ['健康滋补'], '营养保健/特医食品': ['健康滋补'], '医疗器械及保健用品': ['健康滋补'],
  '整车及配件': ['其他'], '汽车用品': ['其他'],
};
const FIT_INDUSTRY7_TAGS: Record<string, string[]> = {
  '个护美妆': ['美妆', '个人护理'],
  '食品饮料': ['食品饮料', '水饮冲调', '生鲜食品'],
  '保健食品': ['健康滋补', '食品饮料'],
  '母婴宠物': ['母婴用品', '宠物生活'],
  '服饰鞋包': ['服装', '珠宝配饰'],
  '家居家清': ['家清纸品', '家居家装'],
  '其他': ['其他'],
};
const FIT_LEVEL_ORDER = ['S5','S4','S3','S2','S1','S0','未分级'];
const FIT_TIER_ORDER = ['标杆','主力','潜力','储备'];

interface FitCreator {
  name: string; cid: string; fans: number;
  industry: string[]; persona: string[]; forms: string[]; style: string[];
  level: string; tier: string; source: 'stock' | 'tagger';
}

function fitResolveTags(p: AgencyFitRequestBody): string[] {
  const out: string[] = [];
  const add = (xs?: string[]) => (Array.isArray(xs) ? xs : []).forEach(x => {
    const v = String(x == null ? '' : x).trim();
    if (FIT_INDUSTRY_TAGS.includes(v) && !out.includes(v)) out.push(v);
  });
  add(p.tags);
  if (!out.length && p.level1) add(FIT_LEVEL1_TAGS[String(p.level1).trim()] || []);
  if (!out.length && p.industry) add(FIT_INDUSTRY7_TAGS[String(p.industry).trim()] || []);
  return out;
}

function fitFansTier(n: number): string {
  n = Number(n) || 0;
  if (n >= 1_000_000) return '百万级';
  if (n >= 100_000) return '十万级';
  if (n >= 10_000) return '万级';
  return '万级以下';
}

function fitTally(creators: FitCreator[], key: 'persona' | 'forms' | 'style'): Array<{ name: string; n: number }> {
  const m: Record<string, number> = {};
  for (const c of creators) for (const v of (c[key] || [])) m[v] = (m[v] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, n }));
}

/** demo 达人库 → fit creators（存量库无星川等级，全部记为未分级） */
function demoCreators(): FitCreator[] {
  return DEMO_LIB.map(p => ({
    name: p.n, cid: p.i, fans: p.f,
    industry: p.t, persona: p.p, forms: p.m, style: p.s,
    level: '未分级', tier: '', source: 'stock' as const,
  }));
}

/** 服务商适配分析：返回完整 AgencyFitData（与 FaaS fitAnalyze 同口径） */
export function demoAgencyFit(p: AgencyFitRequestBody): AgencyFitData {
  const creators = demoCreators();
  const tags = fitResolveTags(p);
  const matched = tags.length
    ? creators.filter(c => c.industry.some(t => tags.includes(t)))
    : creators.slice();

  const levelDist: Record<string, number> = {};
  FIT_LEVEL_ORDER.forEach(k => (levelDist[k] = 0));
  const tierDist: Record<string, number> = {};
  FIT_TIER_ORDER.forEach(k => (tierDist[k] = 0));
  const fansDist: Record<string, number> = { '万级以下': 0, '万级': 0, '十万级': 0, '百万级': 0 };
  for (const c of matched) {
    levelDist[c.level] = (levelDist[c.level] || 0) + 1;
    if (c.tier) tierDist[c.tier] = (tierDist[c.tier] || 0) + 1;
    fansDist[fitFansTier(c.fans)]++;
  }

  // 主力星川等级：S5-S0 中人数最多者；无任何分级时，若也无分层则回落「未分级」
  let mainLevel = '';
  let mainLevelN = 0;
  for (const lv of FIT_LEVEL_ORDER.slice(0, 6)) {
    if ((levelDist[lv] || 0) > mainLevelN) { mainLevelN = levelDist[lv]; mainLevel = lv; }
  }
  let mainTier = '';
  let mainTierN = 0;
  for (const t of FIT_TIER_ORDER) {
    if ((tierDist[t] || 0) > mainTierN) { mainTierN = tierDist[t]; mainTier = t; }
  }
  if (!mainLevel && !mainTier && (levelDist['未分级'] || 0) > 0) {
    mainLevel = '未分级';
    mainLevelN = levelDist['未分级'];
  }

  // 主力粉丝档：人数最多的粉丝桶
  const topFansEntry = Object.entries(fansDist).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
  const topFans = topFansEntry ? topFansEntry[0] : '';

  const coverage: '强' | '中' | '弱' = matched.length >= 10 ? '强' : matched.length >= 4 ? '中' : '弱';

  const lvRank = (v: string) => { const i = FIT_LEVEL_ORDER.indexOf(v); return i < 0 ? 99 : i; };
  const tierRank = (v: string) => { const i = FIT_TIER_ORDER.indexOf(v); return i < 0 ? 99 : i; };
  const topCreators: AgencyFitCreator[] = matched.slice().sort((a, b) => {
    if (lvRank(a.level) !== lvRank(b.level)) return lvRank(a.level) - lvRank(b.level);
    if (tierRank(a.tier) !== tierRank(b.tier)) return tierRank(a.tier) - tierRank(b.tier);
    return (Number(b.fans) || 0) - (Number(a.fans) || 0);
  }).slice(0, 12).map(c => ({
    name: c.name, level: c.level, tier: c.tier,
    fans: Number(c.fans) || 0, fansTier: fitFansTier(c.fans),
    industry: (c.industry || []).slice(0, 4), persona: (c.persona || []).slice(0, 2),
  }));

  const personaTop = fitTally(matched, 'persona');
  const formsTop = fitTally(matched, 'forms');
  const styleTop = fitTally(matched, 'style');

  let conclusion = '';
  if (matched.length) {
    const mainDesc = mainLevel
      ? `以 ${mainLevel} 星川等级为主（${mainLevelN} 位）`
      : (mainTier ? `以${mainTier}达人为主（${mainTierN} 位）` : '达人结构待完善');
    conclusion = `该服务商在${tags.join('、') || '相关'}类目共有 ${matched.length} 位打标达人，${mainDesc}${topFans ? `，粉丝量级以${topFans}为主` : ''}，行业覆盖能力${coverage}。`;
  } else if (creators.length) {
    conclusion = `该服务商共有 ${creators.length} 位打标达人，但暂无${tags.join('、')}类目标签达人，行业适配覆盖能力弱，建议先补充该类目达人打标。`;
  }

  return {
    agency: DEMO_AGENCY,
    canonical: DEMO_AGENCY_CANONICAL,
    source: 'stock',
    tags,
    total: creators.length,
    matchedCount: matched.length,
    fromStock: creators.length,
    fromTagger: 0,
    batches: 0,
    levelDist, tierDist, fansDist,
    mainLevel, mainLevelN, mainTier, mainTierN,
    topFans, coverage, topCreators,
    conclusion,
    personaTop, formsTop, styleTop,
    empty: false,
  };
}

/** 一页纸行业优势：基于真实匹配统计生成约 200 字确定性文案 */
export function demoIndustryAdvantage(p: AgencyFitRequestBody): { text: string; matchedCount: number } {
  const a = demoAgencyFit(p);
  const persona = a.personaTop.slice(0, 3).map(x => x.name).join('、') || '多元人设';
  const forms = a.formsTop.slice(0, 3).map(x => x.name).join('、') || '多种形式';
  const tagText = a.tags.join('、') || '相关';
  const topNames = a.topCreators.slice(0, 3).map(c => c.name).join('、');
  const text = `该服务商在${tagText}类目拥有 ${a.matchedCount} 位合作达人（达人库共 ${a.total} 人），行业覆盖能力${a.coverage}，粉丝量级以${a.topFans}为主。达人储备人设以「${persona}」为主，内容形式集中在「${forms}」，代表达人包括${topNames}等，可覆盖从种草触达到效果转化的完整内容链路，与商品卖点匹配度高。团队在该类目有持续的达人选品与投放协作经验，能快速匹配合适达人、缩短内容冷启周期，交付确定性强。`;
  return { text, matchedCount: a.matchedCount };
}
