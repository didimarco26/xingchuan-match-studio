// GitHub 服务商版脱敏单测（FaaS 层）：方向性绿卡 / 子项方向文案 / AI 文本掩码 / 来源识别
// 运行：node scripts/test-gh-mask.cjs
// FaaS 源文件随仓库 package.json type=module，这里复制为 .cjs 后 require
const fs = require('fs');
const path = require('path');
const os = require('os');

const src = fs.readFileSync(path.join(__dirname, '../faas/xingchuan-internal-analyze.js'), 'utf8');
const tmp = path.join(os.tmpdir(), 'xc-faas-mask-test.cjs');
fs.writeFileSync(tmp, src);
const f = require(tmp);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL:', msg); } };
const noDigit = (s) => !/\d/.test(s);
const noDecimal = (s) => !/\d+\.\d+/.test(s);
// 去掉指标标签名（P50/P60/P75/TOP200，标签按设计保留）后，正文不应再有任何数字
const noValueDigit = (s) => noDigit(s.replace(/P\d+/g, '').replace(/TOP\d+/gi, ''));

const cat = { level1: '个护家清', level2: '洗发护发', shops: 12, totalWan: 12345, rank: 12, envMedian: 52.5, posShare: 60.4, roiP50: 1.6, roiP75: 1.85, p60Wan: 1.2, priceMed: 89 };

// ---- 1) ghCardRows：8 项指标名保留、值为无数字方向词 ----
const rows = f.ghCardRows(cat, 69.9);
ok(rows.length === 8, '绿卡 8 行');
const keys = rows.map(r => r.k).join('|');
ok(keys === '单店星川日耗P60|总消耗排名|TOP200总消耗|环比中位数|正增长店铺占比|ROI P50 / P75|支付单均价中位数|有效店铺数', '绿卡指标名固定: ' + keys);
ok(rows.every(r => noDigit(r.v)), '绿卡值无数字: ' + rows.map(r => r.v).join(','));
ok(rows[1].v === '头部类目', 'rank12 头部类目: ' + rows[1].v);
ok(rows[2].v === '亿级规模', '12345万 亿级规模: ' + rows[2].v);
ok(rows[6].v === '高于您客单价', '中位价89 vs 客单69.9 → 高于您客单价: ' + rows[6].v);
const rowsNoPrice = f.ghCardRows(cat, null);
ok(rowsNoPrice[6].v === '中高客单价类目', '无客单价时中位价方向: ' + rowsNoPrice[6].v);
const tailCat = { ...cat, rank: 100, totalWan: 200, envMedian: -30, posShare: 20, p60Wan: 0.3, shops: 2, roiP50: 0.9, priceMed: 25 };
const tailRows = f.ghCardRows(tailCat, 200);
ok(tailRows[1].v === '长尾类目', 'rank100 长尾类目');
ok(tailRows[6].v === '低于您客单价', '中位价25 vs 客单200 → 低于您客单价');

// ---- 2) ghSubsDetail：roi 3 条 / trend 3 条 / price 1 条，全无数字 ----
const subs = f.ghSubsDetail(cat, { stableRoi: 2.0, targetRoi: 1.5, chaseBudget: 100 }, 69.9);
ok(Array.isArray(subs.roi) && subs.roi.length === 3, 'roi 子项 3 条');
ok(Array.isArray(subs.trend) && subs.trend.length === 3, 'trend 子项 3 条');
ok(Array.isArray(subs.price) && subs.price.length === 1, 'price 子项 1 条');
ok([...subs.roi, ...subs.trend, ...subs.price].every(noDigit), '子项文案无数字: ' + JSON.stringify(subs));
ok(/容忍度充足/.test(subs.roi[0]), '容忍度方向: ' + subs.roi[0]);
ok(/贴合行业普遍水平/.test(subs.roi[1]), '目标ROI方向: ' + subs.roi[1]);
ok(/头部类目/.test(subs.trend[0]), '规模方向: ' + subs.trend[0]);
ok(/ROI/.test(subs.price[0]), '客单方向提ROI: ' + subs.price[0]);
const subsHigh = f.ghSubsDetail(cat, { stableRoi: 2.0, targetRoi: 1.5 }, 200);
ok(/高于类目主流/.test(subsHigh.price[0]), '高客单方向: ' + subsHigh.price[0]);
const subsNoInp = f.ghSubsDetail(cat, {}, null);
ok(subsNoInp.price.length === 0, '无客单价 price 子项空');
ok(/待填/.test(subsNoInp.roi[0]), '无ROI输入提示');

// ---- 3) fuzzyBenchText：数字→方向词，标签/得分/运营动作数字保留 ----
const F = f.fuzzyBenchText;
ok(!/0\.6/.test(F('预算倍数0.6×P60')) && /低于行业/.test(F('预算倍数0.6×P60')), '倍数→低于行业');
const roiLine = F('目标ROI 1.8高于类目P50 1.6（加权P75 1.85）');
ok(noValueDigit(roiLine) && /行业中位水平/.test(roiLine) && /行业高效水平/.test(roiLine) && /目标水平/.test(roiLine), 'ROI/P50/P75 方向化: ' + roiLine);
const chaseLine = F('追投100元/条低于300满分线');
ok(!/100/.test(chaseLine) && !/300/.test(chaseLine) && /追投预算偏少/.test(chaseLine) && /满分线水平/.test(chaseLine), '追投金额方向化: ' + chaseLine);
ok(noDigit(F('客单价69.9元低于类目中位价89元约21%')), '金额+偏离率方向化');
const envLine = F('环比中位数52.5%，正增长店铺占比60.4%');
ok(noDigit(envLine) && /增长/.test(envLine), '环比/占比方向化: ' + envLine);
const rankLine = F('总消耗排名12/124，类目第12名');
ok(noDigit(rankLine) && /头部类目/.test(rankLine), '排名方向化: ' + rankLine);
const scoreLine = F('综合评分89分、ROI阈值得分 15.5/25');
ok(/89分/.test(scoreLine) && /15\.5\/25/.test(scoreLine), '产品自身得分保留: ' + scoreLine);
const opsLine = F('连续3天达标即追投、每周上新15条素材、买2赠旅行装');
ok(/3天/.test(opsLine) && /15条/.test(opsLine) && /买2赠/.test(opsLine), '运营动作数字保留: ' + opsLine);
ok(!/2万/.test(F('日预算2万元/天，向P60靠拢')), '日预算万元方向化');
ok(!/89/.test(F('客单低于89中位数，把支付单均拉至89附近')), '裸基准价/中位数方向化: ' + F('客单低于89中位数，拉至89附近'));
ok(/追投预算/.test(F('单条追投100元')), '单条追投归类: ' + F('单条追投100元'));
const chaseBare = F('追投100低于300满分线，建议提至300/条');
ok(!/100|300/.test(chaseBare) && /追投预算偏少/.test(chaseBare) && /追投预算充足/.test(chaseBare) && /满分线水平/.test(chaseBare), '裸追投金额与/条方向化: ' + chaseBare);
const chaseSlash = F('当前追投100/条偏低，好素材易断粮');
ok(!/100/.test(chaseSlash) && /追投预算偏少/.test(chaseSlash), '追投XX/条无元字方向化: ' + chaseSlash);
const gradLine = F('首测设1.6，连续3天达标后每次+0.1梯度上调');
ok(!/\d+\.\d+/.test(gradLine) && /小幅上调/.test(gradLine) && /3天/.test(gradLine), '梯度小数方向化且天数保留: ' + gradLine);
const chaseOps = F('每3天复盘一次、当场拍板追投名单，每周追投15条素材');
ok(/3天/.test(chaseOps) && /15条/.test(chaseOps) && !/追投预算/.test(chaseOps), '追投运营节奏数字不误伤: ' + chaseOps);
const chaseNeg = F('追投预算不到300元/条，好素材易断粮');
ok(!/300/.test(chaseNeg) && /追投预算偏少/.test(chaseNeg), '「不到300」否定语义不反转: ' + chaseNeg);
const bareTizhi = F('追投预算偏少，建议提至300，优先完播率高的素材');
ok(!/300/.test(bareTizhi) && /追投预算充足/.test(bareTizhi), '「提至300」裸金额方向化: ' + bareTizhi);
const scoreNoFen = F('总分72.5，中度适配，先补预算');
ok(/72\.5/.test(scoreNoFen), '无「分」字总分保留: ' + scoreNoFen);
const priceNear = F('客单价建议提至89附近，锚定行业主流');
ok(!/89/.test(priceNear) && /行业中位水平附近/.test(priceNear) && !/追投/.test(priceNear), '提至+价格附近走中位价不误判追投: ' + priceNear);
const medAfter = F('客单69.9较中位69高约16%，价格带偏高');
ok(noDigit(medAfter) && /中位水平/.test(medAfter), '「中位69」数字在中位之后也掩码: ' + medAfter);
ok(/ROI连续3天/.test(F('ROI连续3天达标')) && !/ROI连续目标水平/.test(F('ROI连续3天达标')), 'ROI后整数运营数字保留');
const ctrLine = F('点击率45%、完播率25%、转化率2.1%');
ok(noDecimal(ctrLine) && /较高水平/.test(ctrLine), '率类阈值方向化: ' + ctrLine);
ok(F('暂无明显风险') === '暂无明显风险', '无数字文本原样');

// ---- 4) maskStringsDeep：结构保留、字符串全掩码、红线名称不动 ----
const deep = f.maskStringsDeep({
  summary: '综合评分89分，预算倍数0.6×P60',
  strategy: ['日预算向2万元靠拢', '追投提至300元连3天达标'],
  redLines: [{ name: '毛利无法覆盖目标ROI', hit: false, reason: '客单69.9元低于中位价89元约21%' }],
});
ok(deep.redLines[0].name === '毛利无法覆盖目标ROI', '红线名称保留');
ok(/89分/.test(deep.summary) && !/0\.6/.test(deep.summary), 'deep 得分保留/倍数掩码');
ok(deep.strategy.every(noDecimal) && deep.redLines.every(r => noDigit(r.reason)), 'deep 数组掩码');
ok(deep.redLines[0].hit === false, '布尔字段保留');

// ---- 5) isGhOrigin：对象/Headers 实例/大小写 ----
ok(f.isGhOrigin({ headers: { Origin: 'https://didimarco26.github.io' } }) === true, '大写 Origin 对象');
ok(f.isGhOrigin({ headers: { referer: 'https://didimarco26.github.io/xingchuan-workbench/' } }) === true, '小写 referer 对象');
ok(f.isGhOrigin({ headers: { get: (n) => n === 'origin' ? 'https://didimarco26.github.io' : '' } }) === true, 'Headers 实例');
ok(f.isGhOrigin({ headers: { origin: 'https://f66e61d782c1.aime-app.bytedance.net' } }) === false, '内站来源不脱敏');
ok(f.isGhOrigin({ headers: {} }) === false, '无 header 不脱敏');
ok(f.isGhOrigin({}) === false, '无 event.headers 不脱敏');

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
