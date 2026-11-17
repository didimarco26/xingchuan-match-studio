#!/usr/bin/env node
/**
 * 星图达人批量抓取脚本（服务商控制台 API 版）
 * ------------------------------------------------------------------
 * 账号背景：登录账号是巨量星图「服务商」身份（深圳市正阳网络科技有限公司），
 * 客户侧 /ad/creator/detail 无资质不可见；本脚本改走服务商控制台
 * 「达人广场」背后的 gw/api 接口，在已登录的页面上下文里发 fetch：
 *
 *   Phase 1  批量基础信息：POST /gw/api/aggregator/multi_get_author_info
 *            每批 50 个星图ID → 粉丝量 / 标签行业 / 报价 / 地域 / 预期播放
 *   Phase 2  逐个达人精查：POST /gw/api/gsearch/search_for_author_square
 *            keyword=星图ID 精确搜索 → 达人广场完整字段（内容主题/互动率/报价等）
 *   Phase 3  详情抽屉校准：前 3 个达人走真实 UI 流程（搜索→点开详情），
 *            捕获「代表视频」相关接口的原始响应，存 raw-samples/ 供核对
 *
 * 工程特性：
 *  - Playwright 持久化浏览器配置（.xingtu-chrome-profile），首次扫码登录后长期免登录
 *  - 并发 3 路（3 个 tab），每人间随机 2-5s 延迟防频控
 *  - 实时进度打印；失败记录原因并跳过；断点续跑（scrape-results.json）
 *  - 结果默认留在共享目录由 Aime 回写飞书多维表格（只补空白字段）；
 *    也可用自建应用 FEISHU_APP_ID/SECRET 直接回写
 *
 * 用法见同目录 README-scrape.md
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- 常量配置 ----------------

const SCRIPT_DIR = __dirname;

const FEISHU = {
  baseToken: process.env.FEISHU_BASE_TOKEN || 'Ph1QbuxpmapknksJdoqcQschnZe',
  tableId: process.env.FEISHU_TABLE_ID || 'tblUXi2raUVtv3et',
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  domain: process.env.FEISHU_DOMAIN || 'https://open.feishu.cn',
};

// 抓取字段 -> 多维表格字段名（粉丝量为已存在 number 字段，其余为 text，缺失会自动创建）
const FIELD_MAP = {
  fans: '粉丝量',
  contentForm: '内容形式',
  industry: '擅长行业',
  videos: '代表视频',
  price: '合作报价',
};

const ORIGIN = 'https://www.xingtu.cn';
const API = {
  multiAuthor: '/gw/api/aggregator/multi_get_author_info',
  search: '/gw/api/gsearch/search_for_author_square',
};
const PROVIDER_HOME = `${ORIGIN}/provider/index`;
const PROVIDER_MARKET = `${ORIGIN}/provider/pages/market`;
const BATCH_SIZE = 50;

// 搜索请求模板（从真实页面请求归纳）
const SEARCH_BODY_TPL = {
  scene_param: { platform_source: 1, search_scene: 1, display_scene: 1, marketing_target: 1, task_category: 1, first_industry_id: 0, task_status: 3 },
  search_param: { seach_type: 2, is_new_nickname_query: true },
  sort_param: { sort_type: 2, sort_field: { field_name: 'score' } },
  page_param: { page: 1, limit: 20 },
  attribute_filter: [{ field: { field_name: 'price_by_video_type__ge', rel_id: '2' }, field_value: '0' }],
};

// ---------------- 参数解析 ----------------

function parseArgs(argv) {
  const opts = {
    input: path.join(SCRIPT_DIR, 'influencers-input.json'),
    output: path.join(SCRIPT_DIR, 'scrape-results.json'),
    rawDir: path.join(SCRIPT_DIR, 'raw-samples'),
    limit: 0,
    concurrency: 3,
    headless: false,
    force: false,
    delayMin: 2000,
    delayMax: 5000,
    feishu: !!(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    calibrate: 3,   // 前 N 个达人走 UI 详情校准，抓代表视频接口
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--input': opts.input = path.resolve(next()); break;
      case '--output': opts.output = path.resolve(next()); break;
      case '--limit': opts.limit = parseInt(next(), 10) || 0; break;
      case '--concurrency': opts.concurrency = Math.max(1, parseInt(next(), 10) || 3); break;
      case '--headless': opts.headless = true; break;
      case '--force': opts.force = true; break;
      case '--calibrate': opts.calibrate = parseInt(next(), 10) || 0; break;
      case '--feishu': opts.feishu = true; break;
      case '--no-feishu': opts.feishu = false; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default:
        if (a.startsWith('--')) console.warn(`⚠️  未知参数 ${a}，忽略`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
星图达人批量抓取（服务商控制台 API 版）
用法: node scrape-influencers.js [选项]

  --input <file>       达人输入 JSON（默认 ./influencers-input.json）
  --output <file>      结果输出 JSON（默认 ./scrape-results.json，断点续跑）
  --limit <n>          只处理前 n 个（测试用）
  --concurrency <n>    并发 tab 数（默认 3）
  --headless           无头模式（默认有头，便于首次登录）
  --calibrate <n>      前 n 个达人走 UI 详情校准抓代表视频接口（默认 3，0 关闭）
  --force              已成功的也重新抓取
  --feishu/--no-feishu 是否回写飞书（默认有 FEISHU_APP_ID/SECRET 才回写）
  -h, --help           查看帮助
`);
}

// ---------------- 工具 ----------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randDelay = (min, max) => min + Math.random() * (max - min);

function log(...args) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${ts}]`, ...args);
}

function parseChineseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, '').match(/([\d.]+)\s*(万|w|W|亿|k|K)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (unit === '万' || unit === 'w' || unit === 'W') n *= 1e4;
  else if (unit === '亿') n *= 1e8;
  else if (unit === 'k' || unit === 'K') n *= 1e3;
  return Math.round(n);
}

function formatFans(n) {
  if (n == null) return '';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
}

function formatPrice(n) {
  if (n == null) return '';
  if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万元';
  return n + '元';
}

function isEmptyVal(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// ---------------- 输入 / 断点 ----------------

function loadInput(file) {
  if (!fs.existsSync(file)) throw new Error(`找不到输入文件 ${file}`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(data) ? data : data.influencers;
  return list
    .filter((x) => x && x.id)
    .map((x) => ({ record_id: x.record_id || '', id: String(x.id).trim(), name: x.name || '', existing: x.existing || {} }));
}

function loadCheckpoint(file) {
  if (!fs.existsSync(file)) return new Map();
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(arr) ? arr : arr.results || [];
    return new Map(list.filter((r) => r && r.id).map((r) => [String(r.id), r]));
  } catch { return new Map(); }
}

function saveCheckpoint(file, map) {
  const results = [...map.values()].sort((a, b) => (a._seq || 0) - (b._seq || 0));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(results, null, 2));
  fs.renameSync(tmp, file);
}

// ---------------- JSON 深度遍历（用于自适应提取搜索接口字段） ----------------

function walkLeaves(obj, path = '', out = [], depth = 0) {
  if (depth > 8 || obj == null) return out;
  if (Array.isArray(obj)) {
    const parentKey = path.split('.').pop().replace(/\[.*$/, '');
    obj.slice(0, 60).forEach((v, i) => {
      const p = `${path}[${i}]`;
      if (v && typeof v === 'object') walkLeaves(v, p, out, depth + 1);
      else out.push({ path: p, key: parentKey, value: v });
    });
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (v && typeof v === 'object') walkLeaves(v, p, out, depth + 1);
      else out.push({ path: p, key: k, value: v });
    }
  }
  return out;
}

function walkArrays(obj, path = '', out = [], depth = 0) {
  if (depth > 8 || obj == null || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    if (obj.length && obj[0] && typeof obj[0] === 'object') out.push({ path, arr: obj });
    obj.slice(0, 30).forEach((v, i) => walkArrays(v, `${path}[${i}]`, out, depth + 1));
  } else {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') walkArrays(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
  return out;
}

function pickString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(pickString).filter(Boolean).join('/');
  if (typeof v === 'object') return v.name || v.text || v.title || v.value || v.label || '';
  return '';
}

/** 从任意接口 JSON 里自适应提取代表视频标题 */
function extractVideosFromJson(json) {
  const videos = [];
  try {
    const arrays = walkArrays(json);
    let best = null;
    for (const { path: ap, arr } of arrays) {
      let score = 0;
      const titles = [];
      for (const item of arr.slice(0, 10)) {
        const keys = Object.keys(item);
        const titleKey = keys.find((k) => /(^|_)(title|desc|caption|aweme_title|item_title|work_name)(_|$)/i.test(k));
        if (!titleKey) continue;
        const t = pickString(item[titleKey]);
        if (t && t.length >= 4 && t.length <= 80 && !/^https?:/.test(t) && !/^\d+$/.test(t)) {
          titles.push(t.replace(/\s+/g, ' ').trim());
          if (keys.some((k) => /cover|video|play|digg|aweme|item|stat/i.test(k))) score += 2;
          score += 1;
        }
      }
      if (/video|aweme|work|item|作品|视频|represent/i.test(ap)) score += 3;
      if (titles.length >= 2) score += 2;
      if (score > 0 && (!best || score > best.score)) best = { score, titles };
    }
    if (best) best.titles.forEach((t) => { if (!videos.includes(t)) videos.push(t); });
  } catch { /* ignore */ }
  return videos.slice(0, 3);
}

// ---------------- 浏览器 / 登录 ----------------

class NotLoggedIn extends Error {
  constructor(msg) { super(msg || '星图登录态失效'); this.notLoggedIn = true; }
}

async function launchBrowser(opts) {
  const profileDir = path.join(SCRIPT_DIR, '.xingtu-chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  const baseOpts = {
    headless: opts.headless,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  };
  try {
    return await chromium.launchPersistentContext(profileDir, { ...baseOpts, channel: 'chrome' });
  } catch (e) {
    log('⚠️  未找到本机 Google Chrome，改用 Playwright 内置 Chromium（需先 npx playwright install chromium）');
    return chromium.launchPersistentContext(profileDir, baseOpts);
  }
}

async function isLoggedOut(page) {
  try {
    const u = page.url();
    if (/redirect_uri=|\/passport\//.test(u)) return true;
    if (u.includes('/provider/')) {
      // 在服务商控制台里：检测是否被弹回首页（出现独立「登录」按钮）
      const t = await page.evaluate(() => document.body?.innerText.slice(0, 500) || '');
      return /\n登录\n/.test('\n' + t + '\n') && !/达人广场|达人库|服务商/.test(t);
    }
    return true;
  } catch { return false; }
}

async function ensureLogin(context) {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(PROVIDER_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(7000);
  if (!(await isLoggedOut(page))) {
    log('✅ 已检测到星图服务商登录态');
    return page;
  }
  log('');
  log('⚠️  未检测到星图登录态！请在弹出的 Chrome 窗口完成登录：');
  log('   点右上角「登录」→ 选择「服务商/客户」身份 → 抖音扫码（账号：深圳市正阳网络科技有限公司服务商主体）');
  log('   登录成功后脚本自动继续…');
  try {
    const cp = await import('node:child_process');
    cp.execSync('osascript -e \'tell application "Google Chrome" to activate\'');
  } catch { /* ignore */ }

  const waitMinutes = parseInt(process.env.LOGIN_WAIT_MINUTES || '10', 10) || 10;
  log(`   （最长等待 ${waitMinutes} 分钟）`);
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    if (await isLoggedOut(page)) continue;
    await sleep(4000);
    if (!(await isLoggedOut(page))) {
      log('✅ 登录成功，进入服务商控制台');
      return page;
    }
  }
  throw new NotLoggedIn(`等待登录超时（${waitMinutes} 分钟），请重新运行脚本`);
}

/** 进入达人广场（UI 点击，确保 SPA 上下文完整），返回该页面 */
async function openMarketPage(context) {
  let page = context.pages().find((p) => p.url().includes('/provider/')) || context.pages()[0];
  if (!page) page = await context.newPage();
  if (!page.url().includes('/pages/market')) {
    await page.goto(PROVIDER_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(5000);
    try {
      await page.getByText('达人广场', { exact: true }).first().click({ timeout: 12000 });
      await sleep(6000);
    } catch (e) {
      log('⚠️  点击「达人广场」失败，尝试直接跳转：', e.message);
      await page.goto(PROVIDER_MARKET, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(6000);
    }
  }
  if (await isLoggedOut(page)) throw new NotLoggedIn();
  return page;
}

// ---------------- 页面内 API 调用 ----------------

async function apiPost(page, apiPath, body) {
  return await page.evaluate(async ({ origin, apiPath, body }) => {
    const r = await fetch(origin + apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await r.json(); } catch { /* ignore */ }
    return { status: r.status, json };
  }, { origin: ORIGIN, apiPath, body });
}

async function apiGet(page, apiPathWithQuery) {
  return await page.evaluate(async ({ origin, url }) => {
    const r = await fetch(origin + url, { credentials: 'include' });
    let json = null;
    try { json = await r.json(); } catch { /* ignore */ }
    return { status: r.status, json };
  }, { origin: ORIGIN, url: apiPathWithQuery });
}

function checkLogin(resp) {
  const code = resp?.json?.base_resp?.status_code;
  if (code === 11001 || code === 100 || /未登录|请登录/.test(resp?.json?.base_resp?.status_message || '')) {
    throw new NotLoggedIn(`接口返回未登录（code=${code}）`);
  }
}

// ---------------- Phase 1：批量基础信息 ----------------

function parseMultiAuthor(json) {
  const map = new Map();
  const authors = json?.authors || json?.data?.authors || [];
  for (const a of authors) {
    const d = a.attribute_datas || a;
    const id = String(d.author_id || a.star_id || '');
    if (!id) continue;
    let tags = {};
    try { tags = typeof d.tags_relation === 'string' ? JSON.parse(d.tags_relation) : (d.tags_relation || {}); } catch { tags = {}; }
    const industries = Object.keys(tags || {});
    const themes = Object.values(tags || {}).flat().filter(Boolean);
    const priceLong = parseChineseNum(d.price_60);
    const priceShort = parseChineseNum(d.price_20_60);
    const prices = [];
    if (priceShort) prices.push(`短视频20-60s ${formatPrice(priceShort)}`);
    if (priceLong) prices.push(`短视频60s+ ${formatPrice(priceLong)}`);
    map.set(id, {
      fansNum: parseChineseNum(d.follower),
      fansText: d.follower ? formatFans(parseChineseNum(d.follower)) : '',
      nickName: d.nick_name || '',
      city: [d.province, d.city].filter(Boolean).join(''),
      gender: d.gender === '1' ? '女' : d.gender === '2' ? '男' : '',
      industries,
      themes,
      price: prices.join('；'),
      priceShort, priceLong,
      expectedPlay: parseChineseNum(d.expected_play_num),
      grade: d.grade || '',
    });
  }
  return map;
}

async function phaseBatchBase(marketPage, ids) {
  const result = new Map();
  const chunks = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE));
  log(`📦 Phase 1：批量拉取基础信息，共 ${chunks.length} 批（每批 ${BATCH_SIZE}）`);
  for (let i = 0; i < chunks.length; i++) {
    let resp;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resp = await apiPost(marketPage, API.multiAuthor, { author_ids: chunks[i] });
        checkLogin(resp);
        if (resp.json?.authors?.length) break;
        await sleep(randDelay(2000, 4000));
      } catch (e) {
        if (e.notLoggedIn) throw e;
        await sleep(randDelay(2000, 4000));
      }
    }
    const m = parseMultiAuthor(resp?.json);
    for (const [k, v] of m) result.set(k, v);
    log(`   批次 ${i + 1}/${chunks.length} 完成，累计 ${result.size} 个达人基础信息`);
    await sleep(randDelay(1500, 3000));
  }
  return result;
}

// ---------------- Phase 2：逐个达人精查（搜索接口） ----------------

function buildSearchBody(keyword) {
  return {
    ...SEARCH_BODY_TPL,
    search_param: { ...SEARCH_BODY_TPL.search_param, keyword },
    page_param: { page: 1, limit: 20 },
  };
}

/** 在搜索响应中找到精确匹配的达人 */
function pickExactAuthor(json, id) {
  const authors = json?.authors || json?.data?.authors || json?.author_list || [];
  let hit = authors.find((a) => {
    const d = a.attribute_datas || a;
    return String(d.author_id || d.star_id || a.star_id || '') === String(id);
  });
  if (!hit && authors.length === 1) hit = authors[0];
  return hit ? (hit.attribute_datas || hit) : null;
}

/** 从搜索达人字段自适应补充：内容形式 / 行业 / 报价 / 视频 */
function enrichFromSearch(d, base) {
  const out = { contentForm: base.contentForm || '', industry: base.industry || '', price: base.price || '', videos: base.videos || [] };

  // tags_relation 兜底
  if (!out.industry) {
    let tags = {};
    try { tags = typeof d.tags_relation === 'string' ? JSON.parse(d.tags_relation) : (d.tags_relation || {}); } catch { tags = {}; }
    const inds = Object.keys(tags || {});
    const themes = Object.values(tags || {}).flat().filter(Boolean);
    if (inds.length) out.industry = inds.join('、');
    if (themes.length && !out.contentForm) out.contentForm = themes.slice(0, 4).join('、');
  }

  // 内容形式：直播/短视频信号
  const forms = new Set();
  if (out.contentForm) out.contentForm.split(/[、,，/]/).map((s) => s.trim()).filter(Boolean).forEach((s) => forms.add(s));
  const leaves = walkLeaves(d);
  for (const { key, value } of leaves) {
    if (/live|直播/.test(key) && value && value !== '0' && value !== 0) forms.add('直播');
  }
  if (base.priceShort || base.priceLong || /price|报价/.test(JSON.stringify(d).slice(0, 5000))) forms.add('短视频');
  out.contentForm = [...forms].join('、');

  // 报价：搜索字段里的各种 price
  if (!out.price) {
    const prices = [];
    for (const { key, path: p, value } of leaves) {
      if (!/price|fee|quote|报价/.test(key)) continue;
      const n = parseChineseNum(value);
      if (n == null || n < 100 || n >= 1e8) continue;
      let label = '报价';
      if (/live|直播/i.test(p)) label = '直播报价';
      else if (/60/.test(key)) label = '短视频60s+报价';
      else if (/20_60|short/i.test(p)) label = '短视频20-60s报价';
      else if (/video|视频|植入/i.test(p)) label = '植入视频报价';
      const text = `${label} ${formatPrice(n)}`;
      if (!prices.some((x) => x.startsWith(label))) prices.push(text);
    }
    if (prices.length) out.price = prices.slice(0, 4).join('；');
  }

  // 行业：搜索字段里的行业/类目/标签
  if (!out.industry) {
    const inds = new Set();
    for (const { key, value } of leaves) {
      if (!/(industry|categor|class|tag|label|行业|类目|领域)/i.test(key)) continue;
      const s = pickString(value);
      if (s && s.length >= 2 && s.length <= 20 && !/^\d+$/ && !/全部|更多|暂无|不限|其他$/.test(s)) {
        s.split(/[\/、,，]/).map((x) => x.trim()).forEach((x) => x && inds.add(x));
      }
    }
    out.industry = [...inds].slice(0, 6).join('、');
  }

  // 代表视频
  const vids = extractVideosFromJson(d);
  if (vids.length) out.videos = [...new Set([...out.videos, ...vids])].slice(0, 3);

  return out;
}

// ---------------- Phase 3：UI 详情校准（代表视频接口） ----------------

async function phaseCalibrate(context, inf, rawDir, seq) {
  const page = await context.newPage();
  const captured = [];
  const onResp = async (resp) => {
    try {
      const u = resp.url();
      if (!u.includes('/gw/api/')) return;
      const ct = resp.headers()['content-type'] || '';
      if (!/json/i.test(ct)) return;
      const text = await resp.text();
      if (text.length < 200) return;
      // 只存跟达人/视频/作品相关、且包含本达人ID或视频结构的
      if (!/author|item|video|work|creator|detail|example/i.test(u)) return;
      captured.push({ url: u.slice(0, 600), size: text.length, body: text.slice(0, 200000) });
    } catch { /* ignore */ }
  };
  page.on('response', onResp);
  try {
    await page.goto(PROVIDER_MARKET, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(7000);
    if (await isLoggedOut(page)) throw new NotLoggedIn();

    // 搜索星图ID
    try {
      const input = page.locator('input').first();
      await input.click({ timeout: 10000 });
      await input.fill(inf.id, { timeout: 10000 });
      await sleep(3000);
      await page.keyboard.press('Enter');
      await sleep(7000);
    } catch (e) { log('   校准搜索失败：', e.message); }

    // 点开第一行达人（详情抽屉）
    try {
      await page.evaluate((name) => {
        const els = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.innerText || '').trim() === name);
        if (els[0]) { els[0].click(); return; }
        const any = [...document.querySelectorAll('[class*="author"],[class*="card"],tr')];
        if (any[0]) any[0].click();
      }, inf.name || '');
      await sleep(8000);
      // 尝试点「作品/视频」tab
      for (const tab of ['代表作品', '作品', '视频', '内容数据']) {
        try {
          const t = page.getByText(tab, { exact: true }).first();
          if (await t.count()) { await t.click({ timeout: 3000 }); await sleep(5000); break; }
        } catch { /* next */ }
      }
    } catch (e) { log('   校准详情点击失败：', e.message); }

    // 保存原始响应
    fs.mkdirSync(rawDir, { recursive: true });
    for (let i = 0; i < captured.length; i++) {
      const c = captured[i];
      const safe = c.url.split('?')[0].split('/').slice(-2).join('_');
      const file = path.join(rawDir, `${seq}_${inf.id}_${i}_${safe}.json`);
      fs.writeFileSync(file, JSON.stringify({ url: c.url, size: c.size, json: (() => { try { return JSON.parse(c.body); } catch { return c.body; } })() }, null, 2));
    }
    const videos = [];
    for (const c of captured) {
      try { extractVideosFromJson(JSON.parse(c.body)).forEach((v) => videos.push(v)); } catch { /* ignore */ }
    }
    return { videos: [...new Set(videos)].slice(0, 3), apiCount: captured.length };
  } finally {
    page.removeListener('response', onResp);
    await page.close().catch(() => {});
  }
}

// ---------------- 主流程 ----------------

async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  log('🚀 星图达人批量抓取启动（服务商控制台 API 版）');

  const all = loadInput(opts.input);
  const list = opts.limit > 0 ? all.slice(0, opts.limit) : all;
  log(`📋 输入达人 ${all.length} 个，本次处理 ${list.length} 个，并发 ${opts.concurrency}`);

  const checkpoint = loadCheckpoint(opts.output);
  const queue = list.filter((inf) => {
    const done = checkpoint.get(inf.id);
    return !(done && done.ok && !opts.force);
  });
  if (list.length - queue.length) log(`⏭️  断点续跑：跳过已成功 ${list.length - queue.length} 个（--force 可重抓）`);

  if (!queue.length) { log('🎉 没有待处理的达人'); }

  let context;
  let baseInfo = new Map();
  if (queue.length) {
    context = await launchBrowser(opts);
    const homePage = await ensureLogin(context);
    const marketPage = await openMarketPage(context);

    // Phase 1：批量基础信息（覆盖全部本次达人）
    try {
      baseInfo = await phaseBatchBase(marketPage, list.map((x) => x.id));
    } catch (e) {
      if (e.notLoggedIn) throw e;
      log('⚠️  Phase 1 批量接口异常，改用逐个搜索：', e.message);
    }

    // Phase 3 校准：前 N 个达人 UI 详情抓代表视频接口
    const calibrateTargets = queue.slice(0, Math.min(opts.calibrate, queue.length));
    for (let i = 0; i < calibrateTargets.length; i++) {
      const inf = calibrateTargets[i];
      try {
        log(`🔍 Phase 3 校准 ${i + 1}/${calibrateTargets.length}：${inf.name || inf.id}（UI 详情采集中…）`);
        const cal = await phaseCalibrate(context, inf, opts.rawDir, i + 1);
        log(`   校准完成：捕获 ${cal.apiCount} 个相关接口，提取视频 ${cal.videos.length} 条（原始响应存 raw-samples/）`);
        const prev = checkpoint.get(inf.id) || { id: inf.id };
        prev.calVideos = cal.videos;
        checkpoint.set(inf.id, { ...prev, _seq: (prev._seq || checkpoint.size + 1) });
        saveCheckpoint(opts.output, checkpoint);
      } catch (e) {
        if (e.notLoggedIn) throw e;
        log('   校准失败（跳过，不影响主流程）：', e.message);
      }
    }

    // Phase 2：并发逐个精查
    const workerPages = [];
    for (let i = 0; i < Math.min(opts.concurrency, queue.length); i++) {
      const p = await context.newPage();
      await p.goto(PROVIDER_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(3000);
      workerPages.push(p);
    }

    let done = 0;
    let seq = checkpoint.size;
    const total = queue.length;

    async function worker(workerId, page) {
      while (true) {
        const inf = queue.shift();
        if (!inf) break;
        await sleep(randDelay(opts.delayMin, opts.delayMax));
        const idx = ++done;
        process.stdout.write(`[w${workerId}] 第 ${idx}/${total} 个 ${inf.id}（${inf.name || '未知'}）… `);

        let result = null;
        for (let attempt = 1; attempt <= 2 && !result; attempt++) {
          try {
            const resp = await apiPost(page, API.search, buildSearchBody(inf.id));
            checkLogin(resp);
            const d = pickExactAuthor(resp.json, inf.id);
            const base = baseInfo.get(inf.id) || {};
            const enriched = d
              ? enrichFromSearch(d, {
                  contentForm: '', industry: base.industries?.join('、') || '',
                  price: base.price || '', videos: [],
                  priceShort: base.priceShort, priceLong: base.priceLong,
                })
              : { contentForm: '', industry: base.industries?.join('、') || '', price: base.price || '', videos: [] };

            // 校准得到的代表视频
            const calVids = checkpoint.get(inf.id)?.calVideos || [];
            const videos = [...new Set([...calVids, ...enriched.videos])].slice(0, 3);

            result = {
              id: inf.id,
              name: base.nickName || d?.nick_name || inf.name || '',
              fansNum: base.fansNum || parseChineseNum(d?.follower) || null,
              fansText: base.fansText || (d?.follower ? formatFans(parseChineseNum(d.follower)) : ''),
              contentForm: enriched.contentForm,
              industry: enriched.industry,
              videos,
              price: enriched.price,
              city: base.city || '',
              ok: !!(base.fansNum || d || videos.length),
              scrapedAt: new Date().toISOString(),
            };
            if (d && idx <= 3) {
              fs.mkdirSync(opts.rawDir, { recursive: true });
              fs.writeFileSync(path.join(opts.rawDir, `search_${inf.id}.json`), JSON.stringify(resp.json, null, 2));
            }
          } catch (e) {
            if (e.notLoggedIn) throw e;
            if (attempt === 2) {
              result = { id: inf.id, name: inf.name || '', ok: false, error: e.message || String(e), scrapedAt: new Date().toISOString() };
            } else {
              await sleep(randDelay(3000, 6000));
            }
          }
        }

        result._seq = ++seq;
        checkpoint.set(inf.id, result);
        saveCheckpoint(opts.output, checkpoint);

        if (result.ok) {
          const parts = [];
          if (result.fansText) parts.push(`粉丝${result.fansText}`);
          if (result.contentForm) parts.push(result.contentForm.slice(0, 18));
          if (result.industry) parts.push(result.industry.slice(0, 18));
          if (result.videos.length) parts.push(`视频${result.videos.length}条`);
          if (result.price) parts.push(`💰${result.price.slice(0, 30)}`);
          console.log(`✅ ${parts.join('｜') || '已抓取'}`);
        } else {
          console.log(`❌ ${result.error}`);
        }
      }
    }

    await Promise.all(workerPages.map((p, i) => worker(i + 1, p)));
    await context.close().catch(() => {});
  }

  // 汇总
  const results = [...checkpoint.values()].filter((r) => list.some((x) => x.id === r.id));
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  log('');
  log('──────── 抓取汇总 ────────');
  log(`成功 ${ok} ｜ 失败 ${fail} ｜ 结果：${opts.output}`);
  if (opts.calibrate > 0) log(`代表视频接口原始响应存于：${opts.rawDir}（请把该目录反馈给 Aime 核对字段映射）`);

  if (opts.feishu && FEISHU.appId && FEISHU.appSecret) {
    try {
      const token = await feishuToken();
      await feishuWriteback(token, all, results);
    } catch (e) {
      log(`⚠️  飞书回写失败：${e.message}（结果已保存在 JSON，可稍后回写）`);
    }
  } else {
    log('ℹ️  未配置 FEISHU_APP_ID/SECRET，结果留在共享目录，由 Aime 回写多维表格（只补空白字段）。');
  }
}

// ---------------- 飞书回写（可选，自建应用） ----------------

async function feishuToken() {
  const r = await fetch(`${FEISHU.domain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU.appId, app_secret: FEISHU.appSecret }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`获取飞书 token 失败：${JSON.stringify(j)}`);
  return j.tenant_access_token;
}

async function feishuEnsureFields(token) {
  const r = await fetch(`${FEISHU.domain}/open-apis/bitable/v1/apps/${FEISHU.baseToken}/tables/${FEISHU.tableId}/fields?page_size=100`,
    { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`读取字段失败：${JSON.stringify(j)}`);
  const existing = new Set((j.data.items || []).map((f) => f.field_name));
  for (const name of [FIELD_MAP.contentForm, FIELD_MAP.industry, FIELD_MAP.videos, FIELD_MAP.price]) {
    if (existing.has(name)) continue;
    const cr = await fetch(`${FEISHU.domain}/open-apis/bitable/v1/apps/${FEISHU.baseToken}/tables/${FEISHU.tableId}/fields`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: name, type: 1 }),
    });
    const cj = await cr.json();
    if (cj.code !== 0) log(`⚠️  创建字段「${name}」失败：${cj.msg}`);
    else log(`📝 已创建字段「${name}」`);
  }
}

async function feishuWriteback(token, influencers, results) {
  await feishuEnsureFields(token);
  const byId = new Map(influencers.map((x) => [x.id, x]));
  const records = [];
  for (const r of results) {
    if (!r.ok) continue;
    const inf = byId.get(r.id);
    if (!inf?.record_id) continue;
    const fields = {};
    const has = (k) => !isEmptyVal(inf.existing && inf.existing[k]);
    if (!has('fans') && r.fansNum) fields[FIELD_MAP.fans] = r.fansNum;
    if (!has('contentForm') && r.contentForm) fields[FIELD_MAP.contentForm] = r.contentForm;
    if (!has('industry') && r.industry) fields[FIELD_MAP.industry] = r.industry;
    if (!has('videos') && r.videos?.length) fields[FIELD_MAP.videos] = r.videos.map((t, i) => `${i + 1}. ${t}`).join('\n');
    if (!has('price') && r.price) fields[FIELD_MAP.price] = r.price;
    if (Object.keys(fields).length) records.push({ record_id: inf.record_id, fields });
  }
  log(`🔄 待回写 ${records.length} 条（只补空白字段）…`);
  let okCount = 0;
  for (let i = 0; i < records.length; i += 200) {
    const batch = records.slice(i, i + 200);
    const r = await fetch(`${FEISHU.domain}/open-apis/bitable/v1/apps/${FEISHU.baseToken}/tables/${FEISHU.tableId}/records/batch_update`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch }),
    });
    const j = await r.json();
    if (j.code !== 0) log(`⚠️  批次 ${i / 200 + 1} 回写失败：${j.msg}`);
    else okCount += batch.length;
    await sleep(500);
  }
  log(`✅ 飞书回写完成：${okCount}/${records.length} 条`);
}

// ---------------- 入口 ----------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error('\n❌ 运行失败：', e.message);
    if (e.notLoggedIn) console.error('登录态失效：请重新运行脚本，在弹出的 Chrome 中完成登录。');
    process.exit(1);
  });
}

export { main, parseArgs, parseChineseNum, formatFans, parseMultiAuthor, pickExactAuthor, enrichFromSearch, extractVideosFromJson };
