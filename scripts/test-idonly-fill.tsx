// idOnly 补填表单 SSR 冒烟：传 idOnlyItemId 时渲染补填卡片，不传时不渲染
import React from 'react';
import { renderToString } from 'react-dom/server';
import ScoringPanel from '../src/components/ScoringPanel';
import { scoreProduct } from '../src/lib/scoring';

const assert = (c: boolean, m: string) => { if (!c) { console.error('❌', m); process.exitCode = 1; } else console.log('✅', m); };
const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '');
const noop = () => {};

const form: any = {
  url: '', productName: '', brand: '', agent: '', industry: '', category: '', level2: '',
  price: '', usageScene: '', sellingPoints: '', targetAudience: '',
  qianchuanDailySpend: '', targetPenetration: '', stableRoi: '', targetRoi: '', noSampleBlockPct: '', influencerTags: [],
};
const scoreResult = scoreProduct({ dailySpend: null, penetration: null, stableRoi: null, targetRoi: null, noSampleBlockPct: null, price: null, category: null });

const baseProps: any = {
  form, set: noop, onIndustryChange: noop, onLevel2Change: noop, onToggleTag: noop,
  recognizing: false, recognizeMsg: '', onRecognize: noop, onPasteLink: noop,
  baseline: null, scoreResult, canScore: false, scoreAi: null, scoreAiLoading: false, scoreAiError: '',
  onRunAi: noop, variant: 'full', showInfluencerTags: false,
};

// 1) idOnly 状态：渲染补填卡片
const htmlId = strip(renderToString(React.createElement(ScoringPanel, { ...baseProps, idOnlyItemId: '3739689483772231758' })));
assert(htmlId.includes('已提取商品ID'), 'idOnly：显示已提取商品ID');
assert(htmlId.includes('3739689483772231758'), 'idOnly：展示商品ID');
assert(htmlId.includes('商品名称'), 'idOnly：有商品名称字段');
assert(htmlId.includes('核心卖点'), 'idOnly：有核心卖点字段');
assert(htmlId.includes('确认，开始分析'), 'idOnly：有确认按钮');
assert(htmlId.includes('取消（重新粘贴链接）'), 'idOnly：有取消按钮');
assert(htmlId.includes('v.douyin.com 短链'), 'idOnly：引导短链全自动识别');
assert(htmlId.includes('品牌（选填）') && htmlId.includes('客单价（选填）'), 'idOnly：品牌/客单价为选填');

// 2) 非 idOnly：不渲染补填卡片
const htmlNormal = strip(renderToString(React.createElement(ScoringPanel, { ...baseProps })));
assert(!htmlNormal.includes('确认，开始分析'), '非idOnly：不渲染补填卡片');
assert(!htmlNormal.includes('已提取商品ID'), '非idOnly：不显示商品ID提示块');

console.log('\n补填表单测试完成');
