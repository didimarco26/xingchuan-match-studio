// 本地单测：update_influencer_field / my_influencer_stats 阶段逻辑
// 数据：从真实台账导出的行（/tmp/tagger_recs.json，record-list 数组口径）灌入内存假 runtime
const fs = require('fs');
const path = require('path');
const os = require('os');

const src = fs.readFileSync(path.join(__dirname, '../faas/xingchuan-internal-analyze.js'), 'utf8');
const tmp = path.join(os.tmpdir(), 'xc-faas-field-test.cjs');
fs.writeFileSync(tmp, src + '\nObject.assign(module.exports,{updateInfluencerFieldStage,myInfluencerStatsStage,ghIssueToken});\n');
const f = require(tmp);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL:', msg); } };

// ---- 从真实导出生成内存记录（只保留需要的字段，结构模拟 records.search 返回）----
const dump = JSON.parse(fs.readFileSync('/tmp/tagger_recs.json', 'utf8')).data;
const fields = dump.fields;
const rows = dump.data;
const ids = dump.record_id_list;
const idx = {}; fields.forEach((n, i) => idx[n] = i);
const items = rows.map((r, i) => {
  const o = { record_id: ids[i], fields: {} };
  ['服务商名称', '打标结果全量', '打标明细', '打标完成达人数量',
    '标杆数', '主力数', '潜力数', '储备数'].forEach(n => { o.fields[n] = r[idx[n]]; });
  return o;
});
const updates = [];
const runtime = {
  async api({ id, path_params, body }) {
    if (id === 'base_records_search') {
      return { code: 0, data: { items: JSON.parse(JSON.stringify(items)), has_more: false, page_token: '' } };
    }
    if (id === 'base_record_update') {
      const [, , recordId] = path_params;
      const rec = items.find(x => x.record_id === recordId);
      Object.assign(rec.fields, body.fields);
      updates.push({ recordId, fields: Object.keys(body.fields) });
      return { code: 0, data: { record: { record_id: recordId } } };
    }
    throw new Error('unexpected api ' + id);
  },
};

const agency = '广州斑马';
const token = f.ghIssueToken('testRid123', '测试员', Date.now() + 3600000, agency, '13800000000');

// 直接调用阶段函数时复刻 wrapStage 行为（抛错 → 200 ok:false）
const call = async (p) => { try { return await f.updateInfluencerFieldStage(runtime, p); } catch (e) { return { ok: false, error: String(e && e.message || e) }; } };

(async () => {
  // 1) stats 正常返回 + 预设标签
  const sresp = await f.myInfluencerStatsStage(runtime, { token });
  ok(sresp.ok === true, 'stats ok');
  const stats = sresp.data;
  ok(Array.isArray(stats.industryOptions) && stats.industryOptions.includes('母婴用品'), '预设行业标签存在');
  ok(stats.details.length > 0, '有达人明细: ' + stats.details.length);
  console.log('  广州斑马 去重达人总数:', stats.total, '明细:', stats.details.length);

  // 选一个真实达人（优先有 id 的）
  const target = stats.details.find(d => d.id) || stats.details[0];
  console.log('  目标达人:', JSON.stringify({ id: target.id, name: target.name, sLevel: target.sLevel, tier: target.tier, industry: target.industry }));
  const origLevel = target.sLevel;
  const origIndustry = target.industry.slice();
  const origTier = target.tier;

  // 2) 改等级
  let r = await call({ token, recordId: target.id, name: target.name, field: 'level', value: 'S3' });
  ok(r.ok && r.data.value === 'S3' && r.data.updatedPeople >= 1, 'level 更新成功: ' + JSON.stringify(r.data));

  // 3) stats 再读已生效
  const s2 = (await f.myInfluencerStatsStage(runtime, { token })).data;
  const t2 = s2.details.find(d => d.id === target.id && d.name === target.name);
  ok(t2 && t2.sLevel === 'S3', 'stats 读到新等级: ' + (t2 && t2.sLevel));
  const s3cnt = s2.sLevelDist.find(x => x.name === 'S3');
  ok(s3cnt && s3cnt.count >= 1, 'S3 分布更新: ' + JSON.stringify(s3cnt));

  // 4) 行业标签多选
  r = await call({ token, recordId: target.id, name: target.name, field: 'industryTags', value: ['母婴用品', '自定义小众', '母婴用品', ''] });
  ok(r.ok && r.data.value.join('|') === '母婴用品|自定义小众', '标签去重去空: ' + JSON.stringify(r.data.value));
  const s4 = (await f.myInfluencerStatsStage(runtime, { token })).data;
  const t4 = s4.details.find(d => d.id === target.id && d.name === target.name);
  ok(JSON.stringify(t4.industry) === JSON.stringify(['母婴用品', '自定义小众']), 'stats 读到新标签: ' + JSON.stringify(t4.industry));

  // 5) 清空标签
  r = await call({ token, recordId: target.id, name: target.name, field: 'industryTags', value: [] });
  ok(r.ok && r.data.value.length === 0, '标签可清空');

  // 6) 分层 P1（含数字字段重算）
  r = await call({ token, recordId: target.id, name: target.name, field: 'tier', value: 'P1' });
  ok(r.ok && r.data.value === 'P1', 'tier 更新: ' + JSON.stringify(r.data));
  // 恢复原 tier（数字字段回算）
  r = await call({ token, recordId: target.id, name: target.name, field: 'tier', value: '' });
  ok(r.ok, 'tier 清空');
  // 若原值是合法历史值（标杆/主力/潜力/储备），写回原值保持数据一致
  if (['标杆', '主力', '潜力', '储备'].includes(origTier)) {
    // 服务端只允许 P0/P1/P2/空，历史值无法通过接口写回（预期设计），这里仅记录
    console.log('  原 tier 为历史值，保持清空（前端展示为储备）:', origTier);
  }

  // 7) 恢复 level / industry
  r = await call({ token, recordId: target.id, name: target.name, field: 'level', value: origLevel || '' });
  ok(r.ok, 'level 恢复');
  r = await call({ token, recordId: target.id, name: target.name, field: 'industryTags', value: origIndustry });
  ok(r.ok, 'industry 恢复');

  // 8) 参数校验
  r = await call({ token, recordId: target.id, name: target.name, field: 'score', value: 1 });
  ok(!r.ok && /不支持的字段/.test(r.error), '非法字段拦截: ' + r.error);
  r = await call({ token, recordId: target.id, name: target.name, field: 'level', value: 'S9' });
  ok(!r.ok && /S0-S6/.test(r.error), '非法等级拦截: ' + r.error);
  r = await call({ token, recordId: target.id, name: target.name, field: 'tier', value: 'P9' });
  ok(!r.ok && /P0\/P1\/P2/.test(r.error), '非法分层拦截: ' + r.error);
  r = await call({ token, recordId: target.id, name: target.name, field: 'industryTags', value: '母婴' });
  ok(!r.ok && /数组/.test(r.error), '标签非数组拦截: ' + r.error);

  // 9) 无 token / 越权
  r = await call({ recordId: target.id, field: 'level', value: 'S1' });
  ok(!r.ok, '无 token 拦截');
  const otherToken = f.ghIssueToken('t2', '别人', Date.now() + 3600000, '不存在的服务商XYZ', '13900000000');
  r = await call({ token: otherToken, recordId: target.id, name: target.name, field: 'level', value: 'S1' });
  ok(!r.ok && /未找到/.test(r.error), '跨服务商越权拦截: ' + r.error);

  // 10) name-only 达人匹配（斑马数据里有空 id 的）
  const nameOnly = stats.details.find(d => !d.id);
  if (nameOnly) {
    r = await call({ token, recordId: '', name: nameOnly.name, field: 'level', value: 'S2' });
    ok(r.ok && r.data.updatedPeople >= 1, 'name-only 达人可改: ' + JSON.stringify(r.data));
    await call({ token, recordId: '', name: nameOnly.name, field: 'level', value: '' });
    console.log('  name-only 测试:', nameOnly.name);
  } else {
    console.log('  （本批数据无 name-only 达人，跳过）');
  }

  // 11) 批次级数字字段重算校验：找刚被更新过的记录，储备数=found中储备计数
  const touchedRec = items.find(x => updates.some(u => u.recordId === x.record_id));
  if (touchedRec) {
    const arr = JSON.parse(touchedRec.fields['打标结果全量']);
    const found = arr.filter(x => x.found !== false);
    const reserve = found.filter(x => (String(x.tier || '储备') === '储备')).length;
    ok(touchedRec.fields['储备数'] === reserve, `储备数重算一致: ${touchedRec.fields['储备数']} vs ${reserve}`);
    ok(touchedRec.fields['打标完成达人数量'] === found.length, '完成数重算一致');
    // 明细文本包含恢复后的等级（若非空）
    if (origLevel) ok(touchedRec.fields['打标明细'].includes(origLevel), '明细文本含等级');
  }

  console.log(`\n结果: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
