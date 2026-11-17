// 爆款案例品牌推断：brand 字段为空时，从 hashtag / 标题提取品牌名（精度优先，宁留空不填错）。
// 规则：①独立短标签作为「品牌+品类」长标签前缀 ②剥离品类/话题后缀后的残余品牌
// （拉丁前缀 / 独立标签 / 多标签公共前缀 / 单标签剥离）③独立品牌词标签 ④标题中紧贴品类词前的品牌词。

const PROD: string[] = ["二硫化硒去屑洗发水", "发育期少女内裤", "内衣裤洗衣液", "奥尔良鸡腿排", "奥拉儿童牙膏", "无涂层不粘锅", "洗衣机消毒液", "洗衣机清洁剂", "洗衣机清洗液", "男士冰丝内裤", "番茄肉酱意面", "莫代尔棉内裤", "钙铁锌直饮包", "0染棉内裤", "儿童DHA", "内衣洗衣液", "内衣裤清洗", "去屑洗发水", "小灯泡鱼油", "抗菌防臭袜", "护肤三件套", "椰油洗衣皂", "浴室清洁剂", "砂锅土豆粉", "速食土豆粉", "青少女内裤", "马桶清洁剂", "黑胡椒意面", "亚朵枕头", "儿童牙膏", "儿童鱼油", "内裤男款", "冰丝内裤", "冰皮月饼", "冰箱收纳", "凉感内裤", "即食红参", "去闭口水", "口腔护理", "含氟牙膏", "坚果零食", "备考鱼油", "大码内裤", "女士内裤", "女生内裤", "定妆喷雾", "宝宝辅食", "宝宝馒头", "少女内裤", "平角内裤", "微压炖锅", "意大利面", "手指馒头", "护发精油", "无痕内裤", "果味牙膏", "氨基丁酸", "洁面泡泡", "液态蚝油", "男士内裤", "男士面霜", "男性护肤", "白桦树汁", "睡眠枕头", "私护洗液", "章丘铁锅", "蚝汁蚝油", "赖氨酸钙", "速食意面", "防臭袜子", "黄油吐司", "DHA", "三明治", "不粘锅", "儿童钙", "养生壶", "内衣净", "卫生巾", "卸妆油", "土豆粉", "坚果酥", "安全裤", "定妆法", "尿不湿", "微压锅", "恒温壶", "拉拉裤", "松花粉", "极铁锅", "桦树汁", "椰油皂", "止汗石", "止汗露", "油污净", "洁面乳", "洗发水", "洗发皂", "洗衣机", "洗衣液", "洗衣皂", "洗面奶", "消毒液", "液体钙", "深睡枕", "清洁剂", "清洗液", "火箭钙", "爽肤水", "爽身粉", "痱子粉", "硫磺皂", "粉底液", "精华水", "红参片", "纸尿裤", "营养品", "维生素", "蛋黄油", "赖氨酸", "钙铁锌", "钙镁锌", "闭口水", "防晒霜", "防臭袜", "除菌液", "鸡胸排", "鸡腿排", "内衣", "内裤", "口喷", "吐司", "坚果", "意面", "护发", "护肤", "收纳", "月饼", "枕头", "水乳", "洁面", "洗发", "洗液", "清洗", "炒锅", "炖锅", "牙膏", "砂锅", "硫磺", "精华", "精油", "红参", "蚝汁", "蚝油", "蛋糕", "袜子", "辅食", "铁锅", "锅具", "零食", "面包", "面霜", "馒头", "香氛", "香薰", "鱼油", "鸡排", "鸡胸", "鸡腿"];

const NOISE: string[] = ["自用受益好物分享", "爱老公的一百种方式", "男人要对自己好一点", "精致女孩日常必备", "自用受益好物分享", "学生党好物推荐", "老人小孩都爱吃", "七夕护肤礼盒", "七夕礼物推荐", "冰丝内裤推荐", "凉感内裤推荐", "厨房好物分享", "坚果零食推荐", "女生好物种草", "女生洗护好物", "好舒服的枕头", "宝妈日常记录", "宝宝安全护肤", "居家好物分享", "平角内裤推荐", "懒人美食推荐", "护肤好物分享", "日常分享好物", "日常消耗囤货", "日常饮品分享", "母婴好物分享", "母婴好物推荐", "洗护好物分享", "清洁好物分享", "睡眠枕头推荐", "自用好物安利", "自用好物推荐", "舒适内衣分享", "速食意面推荐", "青少年洗面奶", "不粘锅推荐", "养生壶推荐", "卫生巾推荐", "又薄又透气", "好用到空瓶", "好穿又好搭", "宝妈囤货记", "宝宝营养品", "恒温壶婴儿", "恒温壶推荐", "无钢圈内衣", "早餐吃什么", "油痘肌护肤", "油皮洗面奶", "清洁小妙招", "配料表干净", "青少年祛痘", "鸡胸排推荐", "一夜一片", "专场活动", "亲测好物", "仙女必备", "保湿喷雾", "保湿滋润", "值得入手", "儿童早餐", "养娃必备", "内衣分享", "内衣推荐", "内裤推荐", "内裤种草", "凉感内衣", "厨房好物", "口气清新", "夏季穿搭", "夏日必备", "大口嗦粉", "大胸内衣", "女生必备", "女生礼物", "好喝不贵", "好物分享", "好物推荐", "好物种草", "宝妈推荐", "宝宝刷牙", "宝宝早餐", "宝宝爱吃", "家居好物", "居家好物", "懒人意面", "懒人美食", "我家冰箱", "抚平毛躁", "护肤礼盒", "持久留香", "控油祛痘", "提拉显小", "提神醒脑", "收腹提臀", "改善睡眠", "无痕内衣", "日常洗护", "早餐搭配", "显瘦穿搭", "母婴好物", "氮化防锈", "水蜜桃味", "活动机制", "烫染修护", "牙膏推荐", "猫人内衣", "玻璃壶体", "男士护肤", "番茄肉酱", "睡眠障碍", "精致女孩", "美食分享", "聚拢内衣", "衣领发黄", "袜子分享", "解馋美食", "贴身衣物", "透气舒适", "速食美食", "馋宝厨房", "0涂层", "三位数", "三合一", "上热门", "不踩雷", "仪式感", "会回购", "冰沙霜", "多喝水", "大羊毛", "天山白", "太鲜了", "家庭版", "小蓝瓶", "幸福感", "拼手速", "水果味", "珍白因", "直播间", "莫代尔", "送女友", "送男友", "送老公", "送老婆", "闭眼入", "闭眼冲", "闭眼囤", "香喷喷", "高硼硅", "七夕", "个护", "五箱", "入手", "养卸", "冰感", "冰沙", "凉感", "分享", "到手", "刷到", "即食", "厚切", "去屑", "去污", "去渍", "合集", "嗦粉", "囤货", "壶体", "奶渍", "奶香", "好物", "姐妹", "安利", "安排", "宝妈", "宝藏", "家用", "小众", "干货", "平价", "底妆", "必买", "必备", "惊喜", "打卡", "抗菌", "控油", "推荐", "提拉", "攻略", "救星", "教程", "日常", "显小", "止痒", "汗渍", "油渍", "泡泡", "测评", "清凉", "清单", "爱用", "玻璃", "男士", "男生", "留香", "盘点", "礼物", "种草", "秘密", "穿搭", "纯棉", "细节", "羊毛", "聚拢", "蓬松", "薄款", "记录", "送礼", "透气", "防臭", "除臭", "除菌", "除螨", "面料", "香香", "黑茶"];

const SOFT: string[] = ["二硫化硒", "以油养肤", "元气觉醒", "0染棉", "一次性", "三件套", "冲刺期", "减脂期", "天山白", "好舒服", "姨妈期", "学生党", "小蓝瓶", "打工人", "护手霜", "无涂层", "无钢圈", "水蜜桃", "油痘肌", "深睡枕", "百分百", "管理期", "蔓越莓", "软糯糯", "青少年", "青春期", "黑胡椒", "亲测", "亲肤", "仙女", "健康", "儿童", "养卸", "养发", "养娃", "冰丝", "冰感", "冰箱", "凉感", "刷牙", "加油", "化妆", "卡粉", "即食", "厨房", "去屑", "去污", "去油", "去渍", "双萃", "发质", "吃货", "含氟", "吸水", "回购", "夏天", "夏季", "夏日", "多样", "大胸", "头发", "头皮", "女士", "女孩", "女生", "奶香", "好吃", "妆容", "学生", "安全", "宝宝", "家居", "少女", "居家", "干净", "干爽", "平角", "底妆", "待产", "微压", "懒人", "打底", "控油", "无痕", "显瘦", "果味", "柔软", "椰油", "榴莲", "止痒", "正宗", "母婴", "毛孔", "油痘", "油皮", "洗护", "润微", "液态", "清洁", "清爽", "男士", "男孩", "男生", "百搭", "空瓶", "章丘", "纯棉", "经期", "美味", "美食", "自用", "舒服", "舒适", "营养", "蓝莓", "蓬松", "薄款", "贴身", "软糯", "透气", "速食", "酸奶", "面霜", "马桶", "囤"];

const HARD_DESC = ['清洁', '好物', '分享', '推荐', '穿搭', '舒适', '透气', '无痕', '冰丝', '凉感', '蓬松', '控油', '去屑', '防脱', '祛痘', '修护', '顺滑', '服帖', '留香', '玻璃', '壶体', '宝藏', '我家', '提拉', '显小', '高硼硅', '面料', '柔软', '亲肤', '吸水', '干爽', '贴身', '值得', '必冲', '必买', '必入', '绝绝子', '太好吃', '太好喝', '自用受益', '自用好物', '榴莲控'];
const STRUCT_RE = /[的感条款件裤衣拉满]/;
const LONG_RE = /[太真很就都好点这样个啊呢呀吗是我你他她它也还快给把让能会喜欢快乐穿来冲选认准]/;
const DUP_RE = /又.又/;   // 「又薄又透气」「又顺又香」类并列描述残留
const CJK = /[一-龥]/;
const LATIN_ALL = /^[A-Za-z0-9]{2,14}$/;
const RUN_RE = /[一-龥A-Za-z0-9]{2,8}/g;

function clean(t: string): string { return (t || '').replace(/^#/, '').trim(); }
function stripWords(raw: string): string {
  let cand = raw;
  const words = PROD.concat(NOISE);
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const w of words) {
      if (w.length >= 2 && cand.endsWith(w) && cand.length - w.length >= 2) {
        cand = cand.slice(0, cand.length - w.length);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return cand;
}
function kwProd(t: string): boolean { return PROD.some(p => t.includes(p)); }
function kwAny(t: string): boolean { return kwProd(t) || NOISE.some(n => t.includes(n)); }
function isGeneric(t: string): boolean {
  if (!t) return true;
  if (SOFT.includes(t)) return true;
  if (HARD_DESC.some(h => t.includes(h))) return true;
  if (STRUCT_RE.test(t)) return true;
  if (DUP_RE.test(t)) return true;
  if (/^[\d.\-]+$/.test(t)) return true;
  if (t.length >= 6 && LONG_RE.test(t)) return true;
  return false;
}
function latinLead(t: string): string | null {
  const m = t.match(/^([A-Za-z0-9]{2,14})/);
  return m && CJK.test(t) ? m[1] : null;
}

export function inferCaseBrand(title: string | null | undefined, hashtags: string[] | null | undefined): string {
  const tags = (hashtags || []).map(clean).filter(Boolean);
  const cand = new Map<string, number>();
  const add = (bRaw: string, sc: number) => {
    const b = (bRaw || '').trim();
    if (b.length < 2 || b.length > 14 || isGeneric(b)) return;
    if (!cand.has(b) || sc > (cand.get(b) || 0)) cand.set(b, sc);
  };
  // 1) 独立短标签 = 「品牌+品类」长标签前缀
  for (const t of tags) {
    if (t.length < 2 || t.length > 8 || kwAny(t)) continue;
    for (const u of tags) {
      if (u !== t && u.startsWith(t) && u.length - t.length >= 2) {
        const suf = u.slice(t.length);
        if (PROD.some(p => suf.startsWith(p))) { add(t, 100); break; }
      }
    }
  }
  // 2) 剥离品类/话题后缀
  for (const t of tags) {
    const lr = latinLead(t);
    if (lr && !isGeneric(lr)) add(lr, 85);
    const r = stripWords(t);
    if (r.length < 2 || r.length > 10 || r === t || kwAny(r) || isGeneric(r)) continue;
    if (tags.includes(r)) add(r, 90);
    else {
      const npref = tags.filter(u => u.startsWith(r)).length;
      if (npref >= 2) add(r, 78);
      else add(r, 70);
    }
  }
  // 2b) 多个「品牌+品类」标签的最长公共前缀
  const prodTags = tags.filter(kwProd);
  if (prodTags.length >= 2) {
    const rs = prodTags.map(stripWords).filter(r => r.length >= 2 && r.length <= 6 && !kwAny(r) && !isGeneric(r));
    if (rs.length) {
      let cp = rs[0];
      for (const r of rs.slice(1)) {
        let k = 0; while (k < Math.min(cp.length, r.length) && cp[k] === r[k]) k++;
        cp = cp.slice(0, k);
      }
      cp = stripWords(cp);
      if (cp.length >= 2 && cp.length <= 6 && !kwAny(cp) && !isGeneric(cp)) add(cp, 75);
    }
  }
  // 3) 独立品牌词标签
  const tt = (title || '').replace(/#[^#\s]+/g, '');
  const prodCtx = tags.some(kwProd) || kwProd(tt);
  const brandlike = tags.filter(t => t.length >= 2 && t.length <= 8 && !kwAny(t) && !isGeneric(t));
  for (const t of brandlike) {
    if (LATIN_ALL.test(t) || prodCtx || brandlike.length <= 2) add(t, 55);
  }
  if (cand.size) {
    let best = '', bestSc = -1;
    for (const [b, sc] of cand) if (sc > bestSc || (sc === bestSc && b.length < best.length)) { best = b; bestSc = sc; }
    return best;
  }
  // 4) 标题锚定：紧贴品类词前的连续品牌词
  for (const p of PROD) {
    const i = tt.indexOf(p);
    if (i >= 2) {
      const runs = tt.slice(0, i).match(RUN_RE);
      if (!runs) continue;
      let r = stripWords(runs[runs.length - 1]);
      r = r.replace(/(同款|七夕|礼盒|活动|专场|大促|羊毛)$/, '');
      r = r.replace(/^(就这个|就这款|这个|这款|这款真的|真的|姐妹们刷到|姐妹们|刷到赶紧冲|赶紧冲|快看|认准|快来试试|试试|别再送鲜花|终于找到|正宗|多样|好用|好用的|快来)+/, '');
      if (/收到|用起来|安心|化学|涂层|简单|起来|看看|试试|真的|好用|便宜|划算|放心|必冲|必买|控|太好吃|绝了|爱了/.test(r)) continue;
      if (r.length >= 2 && r.length <= 5 && !kwAny(r) && !isGeneric(r)) return r;
    }
  }
  return '';
}
