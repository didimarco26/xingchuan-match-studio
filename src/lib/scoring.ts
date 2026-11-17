// 星川商品适配评分模型（100 分制）——严格按飞书 wiki「星川模型所需数据·封存版本」
//   sheet=4961Ze「新版打分规则」+ sheet=YGycYE「数据底表-0917」（68 个二级类目 QTD Top500 底数）实现。
//
// 5 模块合计 100 分：
//   投放预算 20 = 预算参考值（客户星川日预算直比类目单商品日耗 P60/P40/P20：≥P60=20 / P40~P60=16 / P20~P40=10 / <P20=4）
//   ROI 水平 25 = 目标ROI可下调空间 12.5 + ROI中位数(P50)匹配 8.75 + 加权ROI(P75)匹配 3.75（P75 缺失回退 P50）
//   客户配合 20 = 达人反选比例 10（0-100% 反向线性，0%=10/100%=0；反选=客户否决推荐达人占比，越低越好）
//             + 达人素材追投数量比例 10（0-50% 线性满分，≥50%=10，越高越好）
//   爆品趋势 20 = 类目规模 10（全类目 QTD 总消耗分位）+ 类目14天消耗环比 6 + 正增长店铺占比 4
//   客单价   15 = 产品客单价与类目支付单均价中位数的偏离率
// 推荐等级（商品分层规则V1，定量）：≥75=P0 核心增产；60~74=P1 能力带动；<60=P3 暂缓/汰换；
//   同分数段内 P0↔P1供给补齐、P1能力带动↔P2观察验证 由服务商定性（优势行业/达人供给/承接能力）决定；硬门槛不通过直接 P3。
// 红线 4 条由 AI 阶段评估（毛利/合规/库存履约/素材供给），命中任一即降级。
//
// 注：底表 envMedian / posShare 字段为「百分数值」（如 92.3 表示 92.3%），与 sheet 口径一致。
import type { CategoryBaseline } from '../data/scoring-categories';
import { CATEGORIES } from '../data/scoring-categories';

export interface ScoreInput {
  xcBudgetWan: number | null;   // 星川日预算（万元/天，代理商直填；参考站口径）
  dailySpend?: number | null;   // 千川近14天日均消耗（元/天，旧口径/独立页预填兜底）
  penetration?: number | null;  // 星川目标渗透率（%，旧口径兜底）
  stableRoi: number | null;     // 千川稳定 ROI
  targetRoi: number | null;     // 追投下星川目标 ROI（追投素材持续跑量后 ROI 才有下降空间）
  reverseSelectPct: number | null;  // 达人反选比例（%，服务商手填，0-100，反向线性×10分：0%=10分，反选=客户否决推荐达人，越低越好）
  materialChasePct: number | null;  // 达人素材追投数量比例（%，服务商手填，0-100，≥50%=10分封顶）
  price: number | null;         // 产品客单价（元）
  category: CategoryBaseline | null;
}

export interface SubScore {
  name: string;
  score: number;
  max: number;
  detail: string;   // 命中档位/中间量说明（内站精确版）
}

export interface DimScore {
  key: 'budget' | 'roi' | 'delivery' | 'trend' | 'price';
  name: string;
  short: string;
  score: number;
  max: number;
  ready: boolean;          // 该维度所需输入是否齐备
  band: string;            // 命中档位说明
  metrics: { label: string; value: string }[];  // 关键中间量
  subs?: SubScore[];       // 子指标拆解（ROI 3 项 / 爆品趋势 3 项 / 客单价 1 项 / 客户配合 2 项）
  dir?: 'high' | 'low';    // 客单价相对类目中位数的方向（high=偏高 / low=偏低）
}

export type Level = 'high' | 'mid' | 'low' | 'none';

export interface ScoreResult {
  dims: DimScore[];
  total: number;
  readyCount: number;      // 已齐备维度数
  level: Level;
  xingchuanBudgetWan: number | null;  // 星川日预算（万/天）
  budgetRatio: number | null;         // 星川日预算 / 类目 P60（参考量）
  budgetTier: 'P60+' | 'P40-P60' | 'P20-P40' | '<P20' | null;  // 命中日耗分位档
  tolerance: number | null;           // ROI 容忍度（小数）
  roiRatio: number | null;            // 目标ROI / 类目 ROI P50
  priceDev: number | null;            // 客单价偏离率（小数）
}

const pct = (n: number | null, digits = 1) => (n == null ? '—' : (n * 100).toFixed(digits) + '%');
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---- 模块1：投放预算（20）——星川日预算直比类目 Top500 单商品日耗 P20/P40/P60 ----
function scoreBudget(i: ScoreInput): DimScore & { ratio: number | null; budgetWan: number | null; tier: ScoreResult['budgetTier'] } {
  const { dailySpend, penetration, category } = i;
  // 优先直填星川日预算（万元/天）；缺省时回退 千川日均耗×渗透率（独立页预填旧口径）
  let budgetWan: number | null = i.xcBudgetWan;
  if (budgetWan == null && dailySpend != null && penetration != null) {
    budgetWan = (dailySpend * (penetration / 100)) / 10000; // 元 → 万
  }
  const p20 = category?.p20Wan ?? null;
  const p40 = category?.p40Wan ?? null;
  const p60 = category?.p60Wan ?? null;
  const ratio = budgetWan != null && p60 ? budgetWan / p60 : null;
  let score = 0, band = '待填写：星川日预算 / 二级类目';
  let tier: ScoreResult['budgetTier'] = null;
  const ready = budgetWan != null && (p60 != null || p40 != null || p20 != null);
  if (ready && budgetWan != null) {
    if (p60 != null && budgetWan >= p60) {
      score = 20; tier = 'P60+';
      band = `日预算 ≥ 类目日耗 P60（${p60} 万/天），预算充足，追平 Top500 中 60% 商品的投放强度`;
    } else if (p40 != null && budgetWan >= p40) {
      score = 16; tier = 'P40-P60';
      band = `日预算处于类目日耗 P40~P60（${p40}~${p60 ?? '—'} 万/天），预算中等偏上`;
    } else if (p20 != null && budgetWan >= p20) {
      score = 10; tier = 'P20-P40';
      band = `日预算处于类目日耗 P20~P40（${p20}~${p40 ?? '—'} 万/天），预算中等偏紧，需聚焦少量素材测试`;
    } else {
      score = 4; tier = '<P20';
      band = `日预算 < 类目日耗 P20（${p20 ?? '—'} 万/天）（保底4分），预算不足，冷启动样本量小、难测出素材`;
    }
  }
  return {
    key: 'budget', name: '投放预算', short: '预算', score, max: 20, ready, band,
    ratio, budgetWan, tier,
    metrics: [
      { label: '星川日预算', value: budgetWan != null ? budgetWan.toFixed(2) + ' 万/天' : '—' },
      { label: '类目日耗P60/P40/P20', value: (p60 ?? p40 ?? p20) != null ? `P60 ${p60 ?? '—'} / P40 ${p40 ?? '—'} / P20 ${p20 ?? '—'} 万/天` : '—' },
      { label: '命中分位档', value: tier ? (tier === 'P60+' ? '≥ P60' : tier === '<P20' ? '< P20' : tier.replace('-', '~')) : '—' },
    ],
  };
}

// ---- 模块2：ROI 水平（25）= 可下调空间 12.5 + P50 匹配 8.75 + P75 匹配 3.75 ----
function scoreRoi(i: ScoreInput): DimScore & { tolerance: number | null; roiRatio: number | null } {
  const { stableRoi, targetRoi, category } = i;
  const roiP50 = category && category.roiP50 != null && category.roiP50 > 0 ? category.roiP50 : null;
  const roiP75 = category && category.roiP75 != null && category.roiP75 > 0 ? category.roiP75 : null;

  const tolerance = stableRoi != null && targetRoi != null && stableRoi > 0
    ? (stableRoi - targetRoi) / stableRoi : null;
  const p50r = targetRoi != null && roiP50 ? targetRoi / roiP50 : null;
  const p75ref = roiP75 ?? roiP50;                       // P75 缺失时回退 P50
  const p75r = targetRoi != null && p75ref ? targetRoi / p75ref : null;

  // 子项1：可下调空间（容忍度）
  let tolScore = 0, tolReady = false, tolBand = '待填千川稳定/追投下星川目标 ROI';
  if (tolerance != null) {
    tolReady = true;
    if (tolerance >= 0.20) { tolScore = 12.5; tolBand = `容忍度 ${pct(tolerance)} ≥20%，愿为星川放宽 ROI`; }
    else if (tolerance >= 0.15) { tolScore = 10; tolBand = `容忍度 ${pct(tolerance)}，15~20%`; }
    else if (tolerance >= 0.10) { tolScore = 6; tolBand = `容忍度 ${pct(tolerance)}，10~15%`; }
    else if (tolerance >= 0.05) { tolScore = 3; tolBand = `容忍度 ${pct(tolerance)}，5~10%，学习空间偏窄`; }
    else { tolScore = 1; tolBand = `容忍度 ${pct(tolerance)} <5%（保底1分），几乎不留测试空间`; }
  }
  // 子项2：P50 中位数匹配
  let p50Score = 0, p50Ready = false, p50Band = '待选二级类目';
  if (p50r != null) {
    p50Ready = true;
    if (p50r <= 1.0) { p50Score = 8.75; p50Band = `目标/P50=${p50r.toFixed(2)} ≤1.0，贴合行业普遍水平`; }
    else if (p50r <= 1.1) { p50Score = 7; p50Band = `目标/P50=${p50r.toFixed(2)}，略高于行业中位数`; }
    else if (p50r <= 1.2) { p50Score = 4.5; p50Band = `目标/P50=${p50r.toFixed(2)}，高于行业 10~20%`; }
    else if (p50r <= 1.3) { p50Score = 2; p50Band = `目标/P50=${p50r.toFixed(2)}，明显高于行业`; }
    else { p50Score = 0; p50Band = `目标/P50=${p50r.toFixed(2)} >1.3，脱离行业（0分）`; }
  }
  // 子项3：P75 加权匹配
  let p75Score = 0, p75Ready = false, p75Band = '待选二级类目';
  if (p75r != null) {
    p75Ready = true;
    if (p75r <= 1.0) { p75Score = 3.75; p75Band = `目标/P75=${p75r.toFixed(2)} ≤1.0，可达消耗集中区高效水平`; }
    else if (p75r <= 1.1) { p75Score = 3; p75Band = `目标/P75=${p75r.toFixed(2)}`; }
    else if (p75r <= 1.2) { p75Score = 1.5; p75Band = `目标/P75=${p75r.toFixed(2)}`; }
    else if (p75r <= 1.3) { p75Score = 0.5; p75Band = `目标/P75=${p75r.toFixed(2)}`; }
    else { p75Score = 0; p75Band = `目标/P75=${p75r.toFixed(2)} >1.3（0分）`; }
  }

  const score = r1(tolScore + p50Score + p75Score);
  // 容忍度是商品侧必填项；类目 P50 缺失（长尾类目无近期样本）时仍视为可评，P50/P75 按 0 计并在档位中说明
  const ready = tolReady;
  const catMissing = !p50Ready;
  const band = !ready
    ? '待填写：千川稳定ROI / 追投下星川目标ROI / 二级类目'
    : `容忍度 ${pct(tolerance)}→${tolScore}分；P50 匹配 ${p50r != null ? p50r.toFixed(2) + '×' : '样本不足'}→${p50Score}分；P75 匹配 ${p75r != null ? p75r.toFixed(2) + '×' : '样本不足'}→${p75Score}分${catMissing ? '；类目近期 ROI 样本不足，P50/P75 暂按 0 计' : ''}`;
  return {
    key: 'roi', name: 'ROI水平', short: 'ROI', score, max: 25, ready, band,
    tolerance, roiRatio: p50r,
    metrics: [
      { label: 'ROI下调容忍度', value: pct(tolerance) },
      { label: '类目 ROI 中位数 P50', value: roiP50 != null ? roiP50.toFixed(2) : '样本不足' },
      { label: '追投下目标ROI / P50', value: p50r != null ? p50r.toFixed(2) + '×' : '—' },
      { label: '加权 ROI P75', value: roiP75 != null ? roiP75.toFixed(2) : '样本不足' },
    ],
    subs: [
      {
        name: '目标ROI可下调空间', score: tolScore, max: 12.5, detail: tolBand
      },
      {
        name: 'ROI中位数(P50)匹配', score: p50Score, max: 8.75,
        detail: p50Ready ? p50Band : '类目近期 ROI 样本不足，暂按 0 计'
      },
      {
        name: '加权ROI(P75)匹配', score: p75Score, max: 3.75,
        detail: p75Ready ? p75Band : (p50Ready ? '类目无 P75，已回退 P50 参考' : '类目近期 ROI 样本不足，暂按 0 计')
      },
    ],
  };
}

// ---- 模块3：客户配合（20）= 达人反选比例 10（反向线性，越低越好）+ 达人素材追投数量比例 10（≥50% 满分），服务商手填 ----
function scoreDelivery(i: ScoreInput): DimScore {
  const clampPct = (v: number | null): number | null =>
    v == null || isNaN(v) ? null : Math.min(Math.max(v, 0), 100);
  const revPct = clampPct(i.reverseSelectPct);
  const chasePct = clampPct(i.materialChasePct);
  const ready = revPct != null || chasePct != null;
  const band0 = '待填写：达人反选比例 / 达人素材追投数量比例';
  if (!ready) {
    return {
      key: 'delivery', name: '客户配合情况', short: '配合', score: 0, max: 20, ready: false, band: band0,
      metrics: [
        { label: '达人反选比例', value: '—' },
        { label: '达人素材追投数量比例', value: '—' },
      ],
      subs: [
        { name: '达人反选比例', score: 0, max: 10, detail: '待填（0-100% 反向线性，0%=10分，越低越好）' },
        { name: '达人素材追投数量比例', score: 0, max: 10, detail: '待填（≥50%=10分满分）' },
      ],
    };
  }
  const rs = revPct == null ? 0 : r1((1 - revPct / 100) * 10);
  const cs = chasePct == null ? 0 : r1(Math.min(chasePct / 50, 1) * 10);
  const score = r1(rs + cs);
  const revTxt = revPct == null ? '未填（按0计）' : `${revPct.toFixed(0)}%`;
  const chaseTxt = chasePct == null ? '未填（按0计）' : `${chasePct.toFixed(0)}%`;
  let band: string;
  if (score >= 16) band = `反选比例 ${revTxt}、素材追投数量比例 ${chaseTxt}，推荐达人采纳充分、优质素材追投及时（${score}/20）`;
  else if (score >= 10) band = `反选比例 ${revTxt}、素材追投数量比例 ${chaseTxt}，推荐采纳/素材追投中等，仍有提升空间（${score}/20）`;
  else if (score >= 5) band = `反选比例 ${revTxt}、素材追投数量比例 ${chaseTxt}，反选偏高或素材追投偏低，优质素材难持续放量（${score}/20）`;
  else band = `反选比例 ${revTxt}、素材追投数量比例 ${chaseTxt}，反选偏高且素材追投不足，好素材易断量（${score}/20）`;
  return {
    key: 'delivery', name: '客户配合情况', short: '配合', score, max: 20, ready: true, band,
    metrics: [
      { label: '达人反选比例', value: revPct == null ? '—' : revPct.toFixed(0) + '%' },
      { label: '达人素材追投数量比例', value: chasePct == null ? '—' : chasePct.toFixed(0) + '%' },
    ],
    subs: [
      { name: '达人反选比例', score: rs, max: 10, detail: `反选比例 ${revTxt}，0-100% 反向线性 → ${rs.toFixed(1)}/10分（0%=10分，越低越好）` },
      { name: '达人素材追投数量比例', score: cs, max: 10, detail: `素材追投数量比例 ${chaseTxt}，≥50% 即满分 → ${cs.toFixed(1)}/10分` },
    ],
  };
}

// ---- 模块4：爆品趋势（20）= 类目规模 10 + 类目14天消耗环比 6 + 正增长店铺占比 4 ----
function scoreTrend(i: ScoreInput): DimScore {
  const cat = i.category;
  const N = CATEGORIES.length;
  let scaleScore = 0, envScore = 0, posScore = 0;
  const ready = !!cat;
  let band = '待填写：二级类目';
  const subs: SubScore[] = [];
  if (cat) {
    // 规模分：全类目 QTD 总消耗横向分位
    const p = cat.rank / N;
    if (p <= 0.20) scaleScore = 10;
    else if (p <= 0.50) scaleScore = 7;
    else if (p <= 0.80) scaleScore = 4;
    else scaleScore = 0;
    const scaleRate = scaleScore / 10;
    const scaleBandTxt = p <= 0.2 ? '前20%' : p <= 0.5 ? '20~50%' : p <= 0.8 ? '50~80%' : '后20%';
    subs.push({
      name: '类目规模分', score: scaleScore, max: 10,
      detail: `QTD累计星川消耗 ${cat.totalWan.toLocaleString()} 万，全类目第 ${cat.rank}/${N} 名（${scaleBandTxt}）`
    });
    // 类目14天消耗环比 6（百分数值口径：30 表示 30%）
    const e = cat.envMedian;
    if (e != null) {
      if (e >= 30) envScore = 6;
      else if (e >= 10) envScore = 5;
      else if (e >= 0) envScore = 4;
      else if (e >= -20) envScore = 2;
      else envScore = 0;
      subs.push({
        name: '类目14天消耗环比', score: envScore, max: 6, detail: `近14天/前14天消耗环比 ${e}%`
      });
    } else {
      envScore = r1(6 * scaleRate);  // 长尾类目近期样本不足，按规模分率折算
      subs.push({ name: '类目14天消耗环比', score: envScore, max: 6, detail: '近期样本不足，按规模分率折算' });
    }
    // 正增长店铺占比 4（百分数值口径：70 表示 70%）
    const ps = cat.posShare;
    if (ps != null) {
      if (ps >= 70) posScore = 4;
      else if (ps >= 50) posScore = 3;
      else if (ps >= 30) posScore = 1.5;
      else posScore = 0;
      subs.push({
        name: '正增长店铺占比', score: posScore, max: 4, detail: `环比正增长店铺占比 ${ps}%`
      });
    } else {
      posScore = r1(4 * scaleRate);
      subs.push({ name: '正增长店铺占比', score: posScore, max: 4, detail: '有效店铺样本不足，按规模分率折算' });
    }
    band = `规模 第${cat.rank}/${N}名→${scaleScore}分；类目14天环比 ${e != null ? e + '%' : '样本不足'}→${envScore}分；正增长占比 ${ps != null ? ps + '%' : '样本不足'}→${posScore}分`;
  }
  const score = r1(scaleScore + envScore + posScore);
  return {
    key: 'trend', name: '爆品趋势判断', short: '趋势', score, max: 20, ready, band, subs,
    metrics: [
      { label: 'QTD累计星川消耗', value: cat ? cat.totalWan.toLocaleString() + ' 万' : '—' },
      { label: 'QTD规模排名', value: cat ? `第 ${cat.rank}/${N} 名` : '—' },
      { label: '类目14天消耗环比', value: cat && cat.envMedian != null ? cat.envMedian + '%' : '样本不足' },
      { label: '正增长店铺占比', value: cat && cat.posShare != null ? cat.posShare + '%' : '样本不足' },
    ],
  };
}

// ---- 模块5：客单价（15）——与类目支付单均价中位数的偏离率 ----
function scorePrice(i: ScoreInput): DimScore & { dev: number | null } {
  const { price, category } = i;
  const catPrice = category?.priceMed ?? null;
  const dev = price != null && catPrice ? Math.abs(price - catPrice) / catPrice : null;
  let score = 0;
  let band = '待填写：客单价 / 二级类目';
  let dir: 'high' | 'low' | undefined;
  const ready = dev != null;
  if (dev != null && price != null && catPrice != null) {
    dir = price >= catPrice ? 'high' : 'low';
    if (dev <= 0.10) { score = 15; band = `偏离 ${(dev * 100).toFixed(0)}%，贴合主流价格带`; }
    else if (dev <= 0.20) { score = 12; band = `偏离 ${(dev * 100).toFixed(0)}%，略${dir === 'high' ? '高' : '低'}于主流价格带`; }
    else if (dev <= 0.30) { score = 8; band = `偏离 ${(dev * 100).toFixed(0)}%，${dir === 'high' ? '偏高端，注意转化' : '偏低端，注意佣金/利润空间'}`; }
    else if (dev <= 0.50) { score = 4; band = `偏离 ${(dev * 100).toFixed(0)}%，明显${dir === 'high' ? '偏高端' : '偏低端'}`; }
    else { score = 1; band = `偏离 ${(dev * 100).toFixed(0)}%（保底1分），脱离主流价格带`; }
  }
  return {
    key: 'price', name: '客单价匹配', short: '客单价', score, max: 15, ready, band, dev, dir,
    metrics: [
      { label: '产品客单价', value: price != null ? price.toLocaleString('zh-CN') + ' 元' : '—' },
      { label: '类目支付单均价中位数', value: catPrice != null ? catPrice.toLocaleString('zh-CN') + ' 元' : '—' },
      { label: '偏离率', value: dev != null ? (dev * 100).toFixed(1) + '%' : '—' },
    ],
    subs: [
      { name: '客单价匹配', score, max: 15, detail: band },
    ],
  };
}

export function scoreProduct(i: ScoreInput): ScoreResult {
  const b = scoreBudget(i);
  const r = scoreRoi(i);
  const d = scoreDelivery(i);
  const t = scoreTrend(i);
  const p = scorePrice(i);
  const dims: DimScore[] = [b, r, d, t, p];
  const total = r1(dims.reduce((s, x) => s + x.score, 0));
  const readyCount = dims.filter(x => x.ready).length;
  const level: Level =
    readyCount === 0 ? 'none'
      : total >= 80 ? 'high'
        : total >= 60 ? 'mid'
          : 'low';
  return {
    dims,
    total,
    readyCount,
    level,
    xingchuanBudgetWan: b.budgetWan,
    budgetRatio: b.ratio,
    budgetTier: b.tier,
    tolerance: r.tolerance,
    roiRatio: r.roiRatio,
    priceDev: p.dev,
  };
}

/** 商品分层规则V1 的定级逻辑见 grade.ts（需结合服务商达人库适配数据，不在评分侧输出） */

export const LEVEL_META: Record<Level, { label: string; color: string; bg: string; desc: string }> = {
  high: { label: '高度适配', color: '#12B76A', bg: '#E7F8F0', desc: '五维表现均衡，建议优先推动客户立项' },
  mid: { label: '中度适配', color: '#F79009', bg: '#FEF3E7', desc: '存在明显短板维度，先补短板再放量' },
  low: { label: '低度适配', color: '#F04438', bg: '#FEECEB', desc: '短板较多，建议小预算验证或暂缓' },
  none: { label: '待评定', color: '#98A2B3', bg: '#F2F4F7', desc: '完善基础信息后输出适配分' },
};

/** 单个维度的短板解释（用于 AI 上下文与 UI 提示） */
export function dimensionAdvice(d: DimScore): string {
  const ratio2 = (s: number, m: number) => `${(s / m * 100).toFixed(0)}%`;
  switch (d.key) {
    case 'budget':
      if (!d.ready) return '缺少星川日预算或类目底数';
      if (d.score >= 16) return '预算达到类目 P40 以上水平，测试样本量有保障';
      if (d.score >= 10) return '预算处于类目 P20~P40，建议冷启动期集中预算测试少量素材';
      return '预算低于类目 P20，冷启动样本量不足，建议提高日预算或延长测试周期';
    case 'roi':
      if (!d.ready) return '缺少稳定 ROI / 目标 ROI / 类目底数';
      if (d.score >= 18) return '目标 ROI 贴合行业水平，且有充足下调空间';
      if (d.score >= 12) return '目标 ROI 或下调空间存在压力，先小流量验证素材效率';
      return '目标 ROI 明显高于行业且下调空间小，需先用低门槛素材验证跑量可能性';
    case 'delivery':
      if (!d.ready) return '缺少达人反选/素材追投数据';
      if (d.score >= 16) return '客户配合度高，推荐达人采纳充分、优质素材追投及时';
      if (d.score >= 10) return '客户配合中等，建议明确达人反馈时限与素材追投机制';
      return '反选比例高或素材追投不足，优质素材易断量，需对齐选品与追投 SOP';
    case 'trend':
      if (!d.ready) return '缺少类目趋势底数';
      if (d.score >= 15) return '类目盘子大且仍在增长，爆品环境有利';
      if (d.score >= 9) return '类目规模或增速中等，需要更强素材差异化';
      return '类目盘子小或趋势下滑，谨慎评估投入产出';
    case 'price':
      if (!d.ready) return '缺少客单价或类目底数';
      if (d.score >= 12) return '客单价贴合类目主流价格带';
      if (d.dir === 'high') return '客单价高于类目主流，需强化价值感与信任背书';
      return '客单价低于类目主流，注意佣金空间与利润安全';
  }
}

/** 总评：按短板维度组合输出 */
export function overallAdvice(s: ScoreResult): string {
  const lowDims = s.dims.filter(d => d.ready && d.score / d.max < 0.6);
  if (s.readyCount === 0) return '请先完善商品链接、客单价、预算与 ROI 信息。';
  if (s.level === 'high') return '五维整体均衡且无明显短板，建议优先推动立项，按 P0 节奏配置资源。';
  if (lowDims.length === 0) return '整体适配良好，可按标准节奏推进测试与放量。';
  const names = lowDims.map(d => d.short).join('、');
  if (s.level === 'mid') return `主要短板在「${names}」，建议先针对性补齐（${lowDims.map(dimensionAdvice).join('；')}），再进入放量。`;
  return `短板集中在「${names}」：${lowDims.map(dimensionAdvice).join('；')}。建议小预算验证或暂缓。`;
}

// ============================================================
// 类目自动归类
// ============================================================

/** 关键词命中评分：商品名中出现类目关键词即计分（关键词越长权重越高） */
export function suggestCategory(productName: string): CategoryBaseline | null {
  const name = (productName || '').toLowerCase();
  if (!name.trim()) return null;
  let best: { cat: CategoryBaseline; score: number } | null = null;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      const k = kw.toLowerCase();
      if (name.includes(k)) score += k.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score };
  }
  return best?.cat ?? null;
}

/** 与 App 主流程 detectCategory 同逻辑的独立页版本 */
export function detectCategory(level1: string, level2: string, productName: string): CategoryBaseline | null {
  const byPair = CATEGORIES.find(c => c.level1 === level1 && c.level2 === level2);
  if (byPair) return byPair;
  const byL2 = CATEGORIES.find(c => c.level2 === level2);
  if (byL2) return byL2;
  return suggestCategory(productName);
}

/** 母婴类目单独路由（0917 底表中母婴类目集合：婴童洗护/尿裤/婴童营养品/婴童零食） */
export function detectMotherBabyCategory(level2: string, productName: string): CategoryBaseline | null {
  return detectCategory('母婴用品', level2, productName)
    ?? CATEGORIES.find(c => c.level1 === '母婴用品'
      && ['婴童洗护', '尿裤', '婴童营养品', '婴童零食'].some(k => productName.includes(k.slice(0, 2))))
    ?? null;
}
