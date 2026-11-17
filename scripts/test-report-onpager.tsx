// 一页纸报告 + 商品ID识别 前端逻辑冒烟测试（esbuild 打包后 node 运行，SSR 渲染 + fetch mock）
import React from 'react';
import { renderToString } from 'react-dom/server';
import ScoringReportSection from '../src/components/ScoringReportCard';
import { reportToText, fetchScoringReport, extractFromUrl, type ScoringReport } from '../src/lib/api';

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
};

// ---- mock 评分结果（与 scoreProduct 输出同构）----
const scoreResult: any = {
  total: 78, level: 'mid',
  dims: [
    { key: 'budget', name: '投放预算', short: '预算', score: 18, max: 25, ready: true, band: '预算约为X1的75%', metrics: [] },
    { key: 'roi', name: 'ROI阈值', short: 'ROI', score: 20, max: 25, ready: true, band: '容忍度达标', metrics: [] },
    { key: 'delivery', name: '达人素材交付·卡寄样比例', short: '交付', score: 12, max: 15, ready: true, band: '具备跑量空间', metrics: [] },
    { key: 'trend', name: '爆品趋势', short: '趋势', score: 17, max: 20, ready: true, band: '赛道红利高', metrics: [] },
    { key: 'price', name: '客单价', short: '客单', score: 11, max: 15, ready: true, band: '落在价格带', metrics: [] },
  ],
};
const redLines = [
  { name: '毛利无法覆盖目标ROI', hit: false, reason: '毛利充足' },
  { name: '合规高风险', hit: true, reason: '防脱特证需核验' },
  { name: '库存或履约无法承接', hit: false, reason: '经验足' },
  { name: '无素材供给能力', hit: false, reason: '有团队' },
];
const report: ScoringReport = {
  headline: '中度适配，补预算可起量',
  narrative: '结论：中度适配，可进7天测试。红线一项需核验，赛道增长强。',
  dimReports: [
    { key: 'budget', opportunity: '预算达类目均值75%，样本基本够但冷启动偏紧', action: '先跑7天15%渗透率测试，达标补至X1' },
    { key: 'roi', opportunity: '目标ROI 1.5较千川低16.7%，学习空间达标', action: '首轮1.5放量学习，稳定后回收至1.6' },
    { key: 'delivery', opportunity: '达人反选比例80%、素材追投数量比例50%处于中档', action: '扩大达人反选面，跑量素材及时追加投放' },
    { key: 'trend', opportunity: '洗发水Q3环比+35%赛道红利明确', action: '集中上新防脱控油去屑四类素材' },
    { key: 'price', opportunity: '69.9元低于类目79元价格带顺', action: '维持69.9主推，赠品套装提客单' },
  ],
  actions: ['补足星川日预算至X1水平保证样本量', '以ROI1.5启动学习稳定后拉回', '先核验防脱特证合规边界再放量'],
};

// 1) SSR 渲染报告卡片（strip React SSR 的 <!-- --> 文本节点标记，客户端渲染不存在）
const html = renderToString(
  React.createElement(ScoringReportSection, {
    canScore: true, loading: false, error: '', report,
    onGenerate: () => {},
    productName: '韩束防脱固发修护洗发水', brand: '韩束', agent: '明日互动',
    scoreResult, redLines,
  }),
).replace(/<!--[^>]*-->/g, '');
assert(html.includes('星川 × 明日互动'), '页头含 星川 × 服务商名');
assert(html.includes('内容策略评估报告'), '含报告标题');
assert(html.includes('韩束防脱固发修护洗发水'), '含商品名');
assert(html.includes('中度适配'), '含适配等级');
assert(html.includes('78'), '含总分');
assert(html.includes('五维得分明细与机会点'), '含五维明细区');
assert(html.includes('预算达类目均值75%'), '含维度机会点');
assert(html.includes('先跑7天15%渗透率测试'), '含维度策略动作');
assert(html.includes('合规高风险') && html.includes('需核验'), '红线命中项正确展示');
assert(html.includes('整体策略建议'), '含整体策略建议区');
assert(html.includes('补足星川日预算至X1'), '含核心行动项');
assert(html.includes('下载图片') && html.includes('复制文字'), '含复制/下载按钮');
assert(html.includes('2026-') || /\d{4}-\d{2}-\d{2}/.test(html), '含报告日期');

// 2) 空 redLines（未跑 AI 诊断）不崩
const html2 = renderToString(
  React.createElement(ScoringReportSection, {
    canScore: true, loading: false, error: '', report,
    onGenerate: () => {}, productName: '测试商品', brand: '', agent: '',
    scoreResult, redLines: [],
  }),
).replace(/<!--[^>]*-->/g, '');
assert(html2.includes('星川 × 星川认证服务商'), '服务商名为空时兜底');
assert(html2.includes('未运行 AI 红线诊断'), '未跑诊断时红线区有提示');

// 3) reportToText 纯文本导出
const text = reportToText(report, {
  productName: '韩束防脱固发修护洗发水', brand: '韩束', agent: '明日互动', date: '2026-09-03',
  total: 78, levelLabel: '中度适配',
  dims: scoreResult.dims.map((d: any) => ({ name: d.name, score: d.score, max: d.max })),
  redLines,
});
assert(text.includes('星川 × 明日互动 内容策略评估报告'), '文本含页头');
assert(text.includes('综合评分：78/100'), '文本含总分');
assert(/1\. 投放预算：18\/25/.test(text), '文本含维度得分');
assert(text.includes('机会点：预算达类目均值75%'), '文本含机会点');
assert(text.includes('⚠️') && text.includes('合规高风险'), '文本含红线命中');
assert(text.includes('1. 补足星川日预算'), '文本含行动项');

// 4) fetchScoringReport 前端归一化（mock FaaS 正常返回）
const mockFaasOk = (url: string) => ({
  ok: true, json: async () => ({
    ok: true, stage: 'scoring_report',
    data: {
      headline: 'AI结论', narrative: 'AI叙事',
      dimReports: [
        { key: 'budget', opportunity: 'AI预算机会', action: 'AI预算动作' },
        { key: 'roi', opportunity: 'AI ROI机会', action: 'AI ROI动作' },
        { key: 'delivery', opportunity: 'AI交付机会', action: 'AI交付动作' },
        { key: 'trend', opportunity: 'AI趋势机会', action: 'AI趋势动作' },
        { key: 'price', opportunity: 'AI客单机会', action: 'AI客单动作' },
      ],
      actions: ['动作A', '动作B', '动作C'],
    },
  }),
});
(globalThis as any).fetch = async (url: string) => {
  if (String(url).includes('magic.solutionsuite')) return mockFaasOk(url);
  throw new Error('unexpected fetch ' + url);
};
const body: any = {
  product: { productName: 'X', brand: 'B', industry: '美妆个护', category: '洗发水', price: 69.9, sellingPoints: '' },
  inputs: { dailySpend: 20000, penetration: 15, stableRoi: 1.8, targetRoi: 1.5, reverseSelectPct: 80, materialChasePct: 50 },
  category: {}, result: { total: 78, level: 'mid', dims: scoreResult.dims.map((d: any) => ({ name: d.name, score: d.score, max: d.max, band: d.band })) },
  ai: null,
};
fetchScoringReport(body).then((r) => {
  assert(r.dimReports.length === 5, '报告归一化：5 维齐全');
  assert(r.dimReports[0].opportunity === 'AI预算机会' && r.dimReports[4].action === 'AI客单动作', '报告归一化：AI 内容按 key 正确映射');
  assert(r.actions.length === 3 && r.headline === 'AI结论', '报告归一化：headline/actions 正确');
  runIdTests();
});

// 5) FaaS 异常/截断时前端兜底（degraded payload 缺 dimReports）
async function runIdTests() {
  (globalThis as any).fetch = async (url: string, opts?: any) => {
    const u = String(url);
    if (u.includes('magic.solutionsuite')) {
      const stage = JSON.parse(opts.body).stage;
      if (stage === 'scoring_report') {
        return { ok: true, json: async () => ({ ok: true, stage, data: { degraded: true } }) };
      }
      if (stage === 'parse') {
        // 模拟 FaaS 对精选联盟长链/纯数字ID 的半成功返回
        return { ok: true, json: async () => ({ ok: true, stage: 'parse', data: { productName: '', itemId: '3739689483772231758', idOnly: true, url: 'https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3739689483772231758', brand: '', industry: '', category: '', price: 0, sellingPoints: '', usageScene: '', targetAudience: '' } }) };
      }
    }
    throw new Error('unexpected fetch ' + u);
  };
  const r2 = await fetchScoringReport(body);
  assert(r2.degraded === true, '截断兜底：degraded 标记透传');
  assert(r2.dimReports.length === 5 && r2.dimReports.every(d => d.opportunity && d.action), '截断兜底：5 维均有兜底文案不空白');
  assert(r2.actions.length >= 1, '截断兜底：至少 1 条行动项');

  // 纯数字商品ID → 半成功 source='id'
  const idRes = await extractFromUrl('3739689483772231758');
  assert(!!idRes && idRes.source === 'id', '纯数字ID：source=id 半成功');
  assert(idRes!.itemId === '3739689483772231758', '纯数字ID：itemId 正确');
  assert(idRes!.productName === '', '纯数字ID：商品名留空不编造');
  assert(idRes!.url.includes('haohuo.jinritemai.com') && idRes!.url.includes('3739689483772231758'), '纯数字ID：规范化为精选联盟链接');

  // 精选联盟长链 → 同样半成功
  const linkRes = await extractFromUrl('https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3739689483772231758&origin_type=604');
  assert(!!linkRes && linkRes.source === 'id' && linkRes.itemId === '3739689483772231758', 'haohuo 长链：source=id + itemId 正确');

  console.log('\n全部测试完成');
}
