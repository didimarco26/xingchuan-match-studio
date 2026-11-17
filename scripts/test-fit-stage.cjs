/* 本地逻辑验证：mock runtime（magic 全局），直调 handler 跑两个新 stage
 * 2026-09-15 数据源拆分：对内（无 Origin）= 只查存量库归属行；对外（github.io + 合法 token）= 只查打标台账 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cjsCopy = '/tmp/xcf-fit-test.cjs';
fs.copyFileSync(path.resolve(__dirname, '../faas/xingchuan-internal-analyze.js'), cjsCopy);
// 运行时从 FaaS 源码提取 HMAC secret，避免把密钥写进测试文件
const faasSrc = fs.readFileSync(cjsCopy, 'utf8');
const m = faasSrc.match(/secret:\s*'([0-9a-f]{16,})'/);
if(!m) throw new Error('未找到 GATE.secret，无法签发测试 token');
const GATE_SECRET = m[1];
function ghToken(p){
  const body = Buffer.from(JSON.stringify({ src:'gh', rid:'apply_test_1', exp:Date.now()+3600000, phone:'13800000000', ...p }),'utf8')
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const sig = crypto.createHmac('sha256', GATE_SECRET).update(body).digest('hex');
  return body + '.' + sig;
}

// ---- mock 数据 ----
// 存量库：2 行归属明日（1人与台账重复ID），1行正阳，1行未分配
const stockItems = [
  { record_id:'s1', fields:{ '达人名称':[{text:'库存小明'}], '达人ID':[{text:'1001'}], '粉丝量':88000,
    '行业标签':[{text:'美妆'},{text:'个人护理'}], '达人人设标签':[{text:'美妆护肤达人'}],
    '内容形式标签':[{text:'好物评测'}], '画面风格标签':[{text:'真人出镜'}], '所属代理商':[{text:'明日'}] } },
  { record_id:'s2', fields:{ '达人名称':[{text:'重复达人'}], '达人ID':[{text:'2002'}], '粉丝量':5000,
    '行业标签':[{text:'美妆'}], '所属代理商':[{text:'明日'}] } },
  { record_id:'s3', fields:{ '达人名称':[{text:'正阳达人A'}], '达人ID':[{text:'3003'}], '粉丝量':1200000,
    '行业标签':[{text:'母婴用品'}], '所属代理商':[{text:'正阳'}] } },
  { record_id:'s4', fields:{ '达人名称':[{text:'未分配达人'}], '达人ID':[{text:'4004'}], '粉丝量':20000,
    '行业标签':[{text:'美妆'}] } },
];
// 台账：明日互动 2 个批次（1完成1进行中）+ 正阳 1 个批次
const taggerItems = [
  { record_id:'t1', fields:{
    '服务商名称':'明日互动（广州）', '批次状态':'已完成',
    '打标结果全量': JSON.stringify([
      { id:'2002', name:'重复达人', found:true, score:70, tier:'主力', medal:'🥈', sLevel:'S4', fans:60000,
        industry:['美妆','个人护理'], persona:['美妆护肤达人'], forms:['产品种草','好物评测'], style:['实拍近景'] },
      { id:'5005', name:'美妆大V', found:true, score:85, tier:'标杆', medal:'🥇', sLevel:'S5', fans:520000,
        industry:['美妆'], persona:['女性种草达人','美妆护肤达人'], forms:['教程教学'], style:['产品特写','真人出镜'] },
      { id:'6006', name:'食品小哥', found:true, score:20, tier:'潜力', medal:'🥉', sLevel:'', fans:12000,
        industry:['食品饮料'], persona:['美食测评达人'], forms:['口播讲解'], style:['生活化自然光'] },
      { id:'7007', name:'未找到号', found:false, tier:'储备', sLevel:'', fans:0, industry:['美妆'] },
    ]),
    // 明细名单含 1 个全量 JSON 之外的尾部达人（模拟 90k 截断丢失，靠明细补回库规模）
    '打标明细': '🥈主力｜重复达人｜2002｜70分\n🥇标杆｜美妆大V｜5005｜85分\n🥉潜力｜食品小哥｜6006｜20分\n⚪储备｜未找到号｜7007｜0分\n🥉潜力｜尾部达人｜9999｜25分',
  } },
  { record_id:'t2', fields:{
    '服务商名称':'明日互动', '批次状态':'进行中',
    '打标结果全量': JSON.stringify([
      { id:'8008', name:'个护新人', found:true, score:45, tier:'主力', medal:'🥈', sLevel:'S3', fans:35000,
        industry:['个人护理'], persona:['素人真实分享'], forms:['开箱展示'], style:['简洁干净'] },
    ]) } },
  { record_id:'t3', fields:{
    '服务商名称':'正阳传媒', '批次状态':'已完成',
    '打标结果全量': JSON.stringify([
      { id:'9009', name:'正阳母婴王', found:true, score:60, tier:'主力', medal:'🥈', sLevel:'S2', fans:150000,
        industry:['母婴用品'], persona:['母婴亲子达人'], forms:['生活记录'], style:['生活化自然光'] },
    ]) } },
];

function mockSearch(tableId){
  const items = tableId === 'tblUXi2raUVtv3et' ? stockItems
    : tableId === 'tblwdvQPqnVeM4F4' ? taggerItems : [];
  return Promise.resolve({ code:0, data:{ items, has_more:false, page_token:'' } });
}
const magic = {
  api: async ({path_params}) => mockSearch(path_params[1]),
  ai: async ({user}) => ({ data:{ result:'【AI文案】'+user.slice(0,20) } }),
};
globalThis.magic = magic;

const mod = require(cjsCopy);

async function call(stage, extra, headers){
  const ev = { headers: headers || {}, body: JSON.stringify({ stage, ...extra }) };
  const resp = await mod.handler(ev);
  return JSON.parse(await resp.text());
}

let fail = 0;
const assert = (cond, msg) => { if(!cond){ console.log('  ❌', msg); fail++; } else console.log('  ✅', msg); };
const GH_HEADERS = { origin:'https://didimarco26.github.io' };
const tomorrowToken = ghToken({ name:'测试服务商', agency:'明日互动' });

(async()=>{
  console.log('--- 对内（无 Origin）× 明日 × 美妆/个护：只查存量库归属行 ---');
  let r = await call('stock_influencer_match_product', {
    agent:'明日互动有限公司', industry:'个护美妆', tags:['美妆','个人护理'], productName:'测试口红',
  });
  assert(r.ok && r.data.source==='stock', 'source=stock');
  assert(r.data.canonical === '明日', '归一到「明日」（实际 '+r.data.canonical+'）');
  assert(r.data.total === 2 && r.data.fromStock === 2 && r.data.fromTagger === 0,
    `仅存量库 2 行（库存小明/重复达人），台账不混入（实际 total=${r.data.total} stock=${r.data.fromStock} tagger=${r.data.fromTagger}）`);
  assert(r.data.matchedCount === 2, `美妆/个护匹配=2（实际 ${r.data.matchedCount}）`);
  assert(r.data.levelDist['未分级']===2 && r.data.mainLevel==='未分级', '存量库无S分级，主力等级回落「未分级」');
  assert(r.data.topCreators[0].name==='库存小明', 'TOP1 库存小明（按粉丝量）');

  console.log('--- 对内 × 正阳 × 母婴：存量库 1 行 ---');
  r = await call('stock_influencer_match_product', { agent:'正阳', tags:['母婴用品'] });
  assert(r.data.total === 1 && r.data.matchedCount === 1 && r.data.topCreators[0].name==='正阳达人A', '正阳母婴归属行');

  console.log('--- 对内 × 明日 × 母婴：库里有人但行业不匹配 ---');
  r = await call('stock_influencer_match_product', { agent:'明日', tags:['母婴用品'] });
  assert(r.data.total === 2 && r.data.matchedCount === 0 && /暂无/.test(r.data.conclusion), '零匹配提示补打标');

  console.log('--- 对内 × 非8家名称（广州斑马）：存量库无归属 → 空态（不再回退台账） ---');
  r = await call('stock_influencer_match_product', { agent:'广州斑马-星川-叶子东', tags:['食品饮料'] });
  assert(r.data.empty === true && r.data.total === 0 && r.data.source==='stock', '对内非8家→empty');

  console.log('--- 对内 × 未知服务商：空态 ---');
  r = await call('stock_influencer_match_product', { agent:'某不存在代理商', tags:['美妆'] });
  assert(r.ok && r.data.empty === true, 'empty=true');

  console.log('--- 对外 × 明日互动 token × 美妆：只查打标台账（库存行不混入） ---');
  r = await call('stock_influencer_match_product', { token: tomorrowToken, tags:['美妆','个人护理'] }, GH_HEADERS);
  assert(r.ok && r.data.source==='tagger', 'source=tagger');
  assert(r.data.total === 6, `台账6人（富JSON 4含未找到跳过→3 + 明细补尾部/未找到2 + 进行中批次1，实际 ${r.data.total}）`);
  assert(r.data.matchedCount === 3 && r.data.fromStock === 0, `美妆匹配3（重复达人/美妆大V/个护新人，实际 ${r.data.matchedCount}）`);
  assert(r.data.levelDist.S5===1 && r.data.levelDist.S4===1 && r.data.levelDist.S3===1, 'S5/S4/S3 各1');
  assert(r.data.mainLevel==='S5' && r.data.topCreators[0].name==='美妆大V', '主力 S5 / TOP1 美妆大V');

  console.log('--- 对外 × 非8家名称（广州斑马）截断 JSON + 明细兜底 ---');
  // 确定性截断：两个完整对象都在，但数组闭合括号丢失
  const truncated = '[' + JSON.stringify(
    { id:'b1', name:'斑马零食一', found:true, tier:'主力', sLevel:'S2', fans:60000,
      industry:['食品饮料'], persona:['美食测评达人'], forms:['好物评测'], style:['实拍近景'] }) + ',' + JSON.stringify(
    { id:'b2', name:'斑马尾货', found:true, tier:'潜力', sLevel:'', fans:8000,
      industry:['食品饮料'], persona:['生活好物推荐官'], forms:['清单合集'], style:['简洁干净'] });
  taggerItems.push({ record_id:'b0', fields:{
    '服务商名称':'广州斑马-星川', '批次状态':'已完成',
    '打标结果全量': truncated,
    '打标明细': '🥈主力｜斑马零食一｜b1｜60分\n🥉潜力｜斑马尾货｜b2｜30分\n🥉潜力｜斑马尾部｜b3｜25分',
  } });
  const banmaToken = ghToken({ name:'叶子东', agency:'广州斑马-星川-叶子东' });
  r = await call('stock_influencer_match_product', { token: banmaToken, tags:['食品饮料'] }, GH_HEADERS);
  assert(r.data.source==='tagger' && r.data.total===3, `台账3人（截断恢复2+明细补1，实际 ${r.data.total}）`);
  assert(r.data.matchedCount===2 && r.data.levelDist.S2===1, '恢复对象参与匹配，S2=1');
  taggerItems.pop();

  console.log('--- 对外 × 扬悦博众↔悦新 别名 ---');
  taggerItems.push({ record_id:'t4', fields:{ '服务商名称':'悦新科技',
    '打标结果全量': JSON.stringify([{ id:'a1', name:'悦新达人', found:true, tier:'潜力', sLevel:'S1', fans:9000, industry:['宠物生活'] }]) } });
  const yxToken = ghToken({ name:'扬悦', agency:'扬悦博众' });
  r = await call('stock_influencer_match_product', { token: yxToken, tags:['宠物生活'] }, GH_HEADERS);
  assert(r.data.matchedCount===1 && r.data.canonical==='扬悦博众(悦新)', '悦新批次归并');
  taggerItems.pop();

  console.log('--- 对外身份校验 ---');
  r = await call('stock_influencer_match_product', { agent:'明日' }, GH_HEADERS);
  assert(r.ok===false && r.error==='unauthorized', 'github.io 无 token → unauthorized');
  r = await call('stock_influencer_match_product', { token:'aaa.bbb.ccc' }, GH_HEADERS);
  assert(r.ok===false && r.error==='unauthorized', '伪造 token → unauthorized');

  console.log('--- AI 服务优势（对外台账，有 S 分级） ---');
  r = await call('gen_industry_advantage', { token: tomorrowToken, tags:['美妆'], productName:'测试口红' }, GH_HEADERS);
  assert(r.ok && /AI文案/.test(r.data.text) && r.data.matchedCount===2, 'AI 文案基于台账达人');

  console.log('--- AI 服务优势（对内存量库，全未分级也能生成） ---');
  magic.ai = async()=>{ throw new Error('ai down'); };
  r = await call('gen_industry_advantage', { agent:'明日', tags:['美妆'] });
  assert(r.ok && r.data.text.length>100 && !/AI文案/.test(r.data.text), '兜底文案>=100字：'+r.data.text.slice(0,40)+'...');
  magic.ai = async ({user}) => ({ data:{ result:'【AI文案】'+user.slice(0,20) } });

  console.log(fail===0 ? '\n全部通过 ✅' : `\n${fail} 条失败 ❌`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
