// ============================================================
// 内容创意扩展能力（仅对外版入口调用）：
//   ① optimize_brief       客户上传 Brief → 优化 Brief 方向（文字本地提取，文件不落任何服务端存储）
//   ② gen_material_strategy 素材策略单一页纸（真人/桌拍/混剪/图文配比由 FaaS 确定性计算）
// ============================================================
import { FAAS_URL } from './api';
import type { BriefDirection } from './api';
import { isDemoMode, demoLatency } from './demo';
import { isScentProduct } from './demo-data';
import { DEMO_STRATEGY } from './demo-showcase';

export interface MaterialMixItem {
  key: 'realPerson' | 'tableShot' | 'montage' | 'graphic';
  label: string;
  count: number;
  pct: number;
  usage: string;
}
export interface MaterialStrategyDirection {
  name: string;
  validationGoal: string;
  materialFormat: string;
  /** 该方向首选素材形式（真人出镜/桌拍特写/混剪/图文） */
  pickLabel?: string;
  /** 推荐该形式的判断逻辑 */
  pickReason?: string;
  /** 该方向次选素材形式 */
  secondLabel?: string;
  /** 次选形式的判断逻辑 */
  secondReason?: string;
}
export interface MaterialFormulaRow {
  stage: string;       // 吸引注意/兴趣种草/买点转化/转化成交/收尾引导
  technique: string;   // 手法
  detail: string;      // 具体内容
  goal: string;        // 目的
}
export interface MaterialStrategy {
  brand: string;
  productName: string;
  url: string;
  productType: string;
  audience: string;
  sellingPoints: string[];
  hooks: string[];
  shootingTips: string[];
  compliance: string[];
  generalTips: string[];
  directions: MaterialStrategyDirection[];
  formula: MaterialFormulaRow[];
  mix: MaterialMixItem[];
  mixReason: string;
  degraded?: string;
}

/** 🎬 演示模式：本地构造素材策略单（居家香氛 / DHA 两版），无 FaaS 调用 */
function demoMaterialStrategy(scent: boolean, briefs: BriefDirection[]): MaterialStrategy {
  if (scent) {
    return {
      brand: '闻香居',
      productName: '闻香居 · 梅雨季除味居家香氛喷雾',
      url: '',
      productType: '居家香氛',
      audience: DEMO_STRATEGY.audiences.map(a => `${a.name}：${a.insight}`).join('\n'),
      sellingPoints: [
        '一喷即时去味，梅雨季出租屋 / 老木柜霉味前后对比看得见',
        '干净皂香 / 木质香「闻香怀旧」，情绪共鸣强',
        '第三方检测报告支撑，实验室条件除菌 99%',
        '十几块一瓶，小空间低门槛改造',
      ],
      hooks: DEMO_STRATEGY.audiences.map(a => a.hook),
      shootingTips: ['梅雨季真实场景同机位前后对比', '前 3 秒快速给霉味痛点', '检测报告微距清晰', '情绪段留白营造怀旧'],
      compliance: [
        '除菌 99% 须表述为「实验室条件下经 XX 机构检测，对 XX 菌种除菌率达 99%」并与报告原文一致',
        '不得笼统宣称杀菌 / 消毒 / 防病 / 医用级',
      ],
      generalTips: ['自然光真实场景', '口播口语化', '字幕突出价格锚点'],
      directions: briefs.map(b => ({
        name: b.name, validationGoal: b.validationGoal, materialFormat: b.materialFormat,
        pickLabel: '真人出镜', pickReason: '去味前后对比需真人真场景',
        secondLabel: '改造对比', secondReason: '直观呈现空间焕新',
      })),
      formula: [
        { stage: '吸引注意', technique: '痛点对比', detail: '梅雨季推门霉味 / 老木柜返潮', goal: '3 秒强留存' },
        { stage: '兴趣种草', technique: '实验证明', detail: '喷前后对比 + 检测报告', goal: '建立去味信任' },
        { stage: '买点转化', technique: '情绪放大', detail: '闻香怀旧 / 出租屋焕新', goal: '强化情绪价值' },
        { stage: '转化成交', technique: '价格锚点促单', detail: '对比香薰机大牌 + 限时库存', goal: '加速下单' },
        { stage: '收尾引导', technique: '关注复购', detail: '会员 / 多瓶连带', goal: '提升复购' },
      ],
      mix: [
        { key: 'realPerson', label: '真人出镜', count: 25, pct: 50, usage: '真人 vlog / 口播，建立信任' },
        { key: 'montage', label: '混剪', count: 12, pct: 24, usage: '复用前后对比镜头快速放量' },
        { key: 'tableShot', label: '桌拍特写', count: 8, pct: 16, usage: '检测报告 / 产品微距' },
        { key: 'graphic', label: '图文', count: 5, pct: 10, usage: '小红书图文种草' },
      ],
      mixReason: '香氛去味强依赖真人真场景与前后对比，故真人占一半；图文主要承接小红书。',
    };
  }
  return {
    brand: '诺特兰德',
    productName: '诺特兰德新升级 DHA 藻油 ARA 制品 · 100mg DHA+ARA 自播专享',
    url: '',
    productType: '母婴用品 / 婴童营养品',
    audience: '科学育儿的宝妈宝爸，关注宝宝脑营养、介意鱼腥味，重视正品与口碑。',
    sellingPoints: [
      '每粒 DHA 100mg + ARA 科学同补',
      '藻油来源天然无鱼腥味，宝宝不抗拒喂得进',
      '婴童 DHA 好评榜第 8 名',
      '官方旗舰店正品 · 自播专享 139',
    ],
    hooks: ['给宝宝喂鱼油像打仗？', '宝宝 DHA 别乱买，先看这 3 点'],
    shootingTips: ['自然光真实宝宝喂养出镜', '前 3 秒快速给腥味抗拒痛点', '成分用微距特写'],
    compliance: [
      '标注「本品不能代替药物」',
      '功效声称以注册批件为准，不用绝对化 / 治疗类用语',
    ],
    generalTips: ['真实喂养场景', '合规话术与批件一致', '多瓶装提升客单'],
    directions: briefs.map(b => ({
      name: b.name, validationGoal: b.validationGoal, materialFormat: b.materialFormat,
      pickLabel: '真人喂养', pickReason: '母婴信任需真实场景',
      secondLabel: '混剪', secondReason: '复用对比镜头快速放量',
    })),
    formula: [
      { stage: '吸引注意', technique: '喂养痛点', detail: '鱼油腥味抗拒特写', goal: '3 秒强留存' },
      { stage: '兴趣种草', technique: '成分拆解', detail: 'DHA100mg + ARA 同补', goal: '建立科学认知' },
      { stage: '买点转化', technique: '喂养实测', detail: '藻油无腥味喂得进', goal: '证明使用价值' },
      { stage: '转化成交', technique: '信任收口', detail: '好评榜 + 旗舰店 + 自播价', goal: '加速下单' },
      { stage: '收尾引导', technique: '复购承接', detail: '会员 / 周期购', goal: '提升复购 LTV' },
    ],
    mix: [
      { key: 'realPerson', label: '真人出镜', count: 28, pct: 56, usage: '真人喂养实测，建立信任' },
      { key: 'montage', label: '混剪', count: 12, pct: 24, usage: '复用喂养对比快速放量' },
      { key: 'tableShot', label: '桌拍特写', count: 10, pct: 20, usage: '成分 / 批件微距' },
    ],
    mixReason: '母婴信任强依赖真人喂养实测，故真人占比最高；不单独排图文。',
  };
}

async function postStage(stage: string, body: Record<string, unknown>): Promise<any> {
  const resp = await fetch(FAAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, ...body }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data || data.ok === false) {
    throw new Error(data?.error || `服务暂时不可用（${resp.status}），请稍后重试`);
  }
  return data.data;
}

/** 优化 Brief：原始方向 + 客户 Brief 文字 → 优化方向（失败时 FaaS 已回退原始方向） */
export async function optimizeBriefs(params: {
  briefs: BriefDirection[];
  clientBrief: string;
  context: string;
  category?: string;
}): Promise<{ briefs: BriefDirection[]; notes: string; degraded?: string }> {
  if (isDemoMode()) {
    await demoLatency();
    // 演示：对齐客户 Brief 后回传一版优化方向（保留原 id 便于勾选）
    const list: BriefDirection[] = params.briefs.map(b => ({
      ...b,
      name: `${b.name}（对齐客户 Brief）`,
    }));
    return { briefs: list, notes: '已按客户 Brief 对齐目标与口径（演示预置）' };
  }
  const data = await postStage('optimize_brief', {
    briefs: params.briefs,
    clientBrief: params.clientBrief.slice(0, 4000),
    context: params.context,
    category: params.category,
  });
  const list: BriefDirection[] = Array.isArray(data?.briefs) ? data.briefs : [];
  if (!list.length) throw new Error('优化结果为空，请稍后重试');
  return {
    briefs: list.map((b, i) => ({
      id: `brief-opt-${Date.now()}-${i + 1}`,
      name: String(b.name || ''),
      coreSellingPoint: String(b.coreSellingPoint || ''),
      targetAudience: String(b.targetAudience || ''),
      materialFormat: String(b.materialFormat || ''),
      validationGoal: String(b.validationGoal || ''),
    })),
    notes: String(data?.notes || ''),
    degraded: data?.degraded,
  };
}

/** 生成素材策略单一页纸 */
export async function genMaterialStrategy(params: {
  product: {
    productName: string; brand?: string; industry?: string; category?: string;
    url?: string; sellingPoints?: string; targetAudience?: string;
  };
  briefs: BriefDirection[];
  context: string;
  category?: string;
}): Promise<MaterialStrategy> {
  if (isDemoMode()) {
    await demoLatency();
    return demoMaterialStrategy(isScentProduct(params.product), params.briefs);
  }
  const data = await postStage('gen_material_strategy', {
    product: params.product,
    briefs: params.briefs,
    context: params.context,
    category: params.category,
  });
  if (!data || !Array.isArray(data.mix)) throw new Error('策略单生成失败，请稍后重试');
  return data as MaterialStrategy;
}

/** 策略单 → Markdown 全文 */
export function strategyToMarkdown(s: MaterialStrategy): string {
  const L: string[] = [];
  L.push(`# 素材策略单 · ${s.productName || '未命名商品'}`);
  L.push('');
  L.push('## 一、基础信息');
  if (s.brand) L.push(`- 品牌名称：${s.brand}`);
  L.push(`- 商品名称：${s.productName || '—'}`);
  L.push(`- 商品链接：${s.url || '—'}`);
  L.push(`- 商品类型：${s.productType || '—'}`);
  L.push('');
  L.push('## 二、行业人群画像');
  L.push(s.audience || '—');
  L.push('');
  L.push('## 三、产品核心卖点');
  s.sellingPoints.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  L.push('');
  L.push('## 四、素材配比建议（总量 50 条）');
  s.mix.forEach(m => {
    L.push(`- **${m.label}：${m.count} 条（${m.pct}%）** —— ${m.usage}`);
  });
  L.push(`- 配比理由：${s.mixReason}`);
  L.push('');
  L.push('## 五、预计脚本方向与首选/次选素材形式');
  if (s.directions.length) {
    s.directions.forEach((d, i) => {
      L.push(`${i + 1}. **${d.name}**｜验证目标：${d.validationGoal || '—'}｜形式建议：${d.materialFormat || '—'}`);
      if (d.pickLabel) L.push(`   - 🎬 首选「${d.pickLabel}」：${d.pickReason || ''}`);
      if (d.secondLabel) L.push(`   - 🔁 次选「${d.secondLabel}」：${d.secondReason || ''}`);
    });
  } else L.push('—');
  L.push('');
  L.push('## 六、定制跑量公式（五环节）');
  if (Array.isArray(s.formula) && s.formula.length) {
    s.formula.forEach((f, i) =>
      L.push(`${i + 1}. **${f.stage}**｜手法：${f.technique}｜具体内容：${f.detail}｜目的：${f.goal}`));
  } else L.push('—');
  L.push('');
  L.push('## 七、黄金钩子推荐');
  s.hooks.forEach((h, i) => L.push(`${i + 1}. ${h}`));
  L.push('');
  L.push('## 八、拍摄建议');
  s.shootingTips.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  L.push('');
  L.push('## 九、行业合规红线');
  s.compliance.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  L.push('');
  L.push('## 十、通用拍摄建议');
  s.generalTips.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  return L.join('\n');
}

/** 策略单 → Word(.doc) 下载（Word/WPS 可直接打开编辑） */
export function downloadStrategyDoc(s: MaterialStrategy) {
  // 重要：所有 HTML 标签一律运行时拼接，不允许在源码里出现字面完整文档/闭合标签，
  // 否则会被 AIME 部署链路的 HTML 转换器误解析而截断主 bundle（历史白屏教训）。
  const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const el = (tag: string, content: string, attrs = '') =>
    '<' + tag + (attrs ? ' ' + attrs : '') + '>' + content + '<' + '/' + tag + '>';
  const li = (t: string) => el('li', esc(t));
  const H = (n: number, t: string) => el('h' + n, esc(t));
  const P = (t: string, cls = '') => el('p', esc(t), cls ? `class="${cls}"` : '');
  const rows = (cells: string[], tag = 'td') => cells.map(c => el(tag, c)).join('');
  const table = (head: string[], body: string[][]) =>
    el('table', el('tr', rows(head, 'th')) + body.map(r => el('tr', rows(r))).join(''), 'border="1" cellspacing="0" cellpadding="6"');

  const parts: string[] = [];
  parts.push(el('h1', esc(`素材策略单 · ${s.productName || '未命名商品'}`)));
  parts.push(H(2, '一、基础信息'));
  parts.push(table(['项目', '内容'], [
    ['品牌名称', esc(s.brand || '—')],
    ['商品名称', esc(s.productName || '—')],
    ['商品链接', esc(s.url || '—')],
    ['商品类型', esc(s.productType || '—')],
  ]));
  parts.push(H(2, '二、行业人群画像'));
  parts.push(P(s.audience || '—'));
  parts.push(H(2, '三、产品核心卖点'));
  parts.push(el('ol', s.sellingPoints.map(li).join('')));
  parts.push(H(2, '四、素材配比建议（总量 50 条）'));
  parts.push(table(['素材形式', '数量', '占比', '推荐用途'],
    s.mix.map(m => [esc(m.label), `${m.count} 条`, `${m.pct}%`, esc(m.usage)])));
  parts.push(P(s.mixReason, 'reason'));
  parts.push(H(2, '五、预计脚本方向与首选/次选素材形式'));
  if (s.directions.length) {
    parts.push(table(['脚本方向', '验证目标', '素材形式建议', '首选/次选形式与判断逻辑'],
      s.directions.map(d => {
        const pickCell = [
          d.pickLabel ? `首选「${d.pickLabel}」：${d.pickReason || ''}` : '',
          d.secondLabel ? `次选「${d.secondLabel}」：${d.secondReason || ''}` : '',
        ].filter(Boolean).join('\n');
        return [esc(d.name), esc(d.validationGoal || '—'), esc(d.materialFormat || '—'), esc(pickCell || '—')];
      })));
  } else parts.push(P('—'));
  parts.push(H(2, '六、定制跑量公式（五环节）'));
  if (s.formula?.length) {
    parts.push(table(['环节', '手法', '具体内容', '目的'],
      s.formula.map(f => [esc(f.stage), esc(f.technique), esc(f.detail), esc(f.goal)])));
  }
  parts.push(H(2, '七、黄金钩子推荐'));
  parts.push(el('ol', s.hooks.map(li).join('')));
  parts.push(H(2, '八、拍摄建议'));
  parts.push(el('ol', s.shootingTips.map(li).join('')));
  parts.push(H(2, '九、行业合规红线'));
  parts.push(el('ol', s.compliance.map(li).join('')));
  parts.push(H(2, '十、通用拍摄建议'));
  parts.push(el('ol', s.generalTips.map(li).join('')));

  const css =
    'body{font-family:"PingFang SC","Microsoft YaHei",SimSun,sans-serif;font-size:12pt;color:#222;}'
    + 'h1{font-size:20pt;}h2{font-size:14pt;border-left:4px solid #0ea5e9;padding-left:8px;margin-top:18pt;}'
    + 'table{border-collapse:collapse;width:100%;font-size:10.5pt;}th{background:#f1f5f9;}'
    + 'th,td{border:1px solid #94a3b8;padding:5px;vertical-align:top;}'
    + '.reason{color:#475569;font-size:10.5pt;}';
  const head = el('meta', '', 'charset="utf-8"') + el('title', esc(`素材策略单·${s.productName || ''}`)) + el('style', css);
  const openHtml = '<' + 'html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
  const doc = openHtml + el('head', head) + el('body', parts.join('')) + '<' + '/html>';
  const blob = new Blob(['﻿', doc], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `素材策略单-${s.productName || '商品'}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 触发浏览器下载文本文件 */
export function downloadTextFile(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 打开打印窗口导出 PDF（用户在打印面板选择「另存为 PDF」）
 *
 * 关键约束：绝不能在 bundle 里内联「完整 HTML 文档」字符串
 * （<!doctype>/<html>/<head>/<style></style>/<body> 等）。
 * AIME 静态托管的 HTML 转换器会把 JS 字符串里的 </style> 误当成
 * 真实 head 结束，向该位置注入平台脚本，导致主 module 被污染、
 * 浏览器报 "Unexpected token ','"、页面白屏。
 * 因此这里打开 about:blank（继承同源，可用 opener 直接操作 DOM），
 * 打印页全部通过 DOM API 构建，零 HTML 标记字符串。
 */
export function exportHtmlToPdf(title: string, bodyHtml: string) {
  const w = window.open('about:blank', '_blank');
  if (!w) {
    throw new Error('浏览器拦截了弹窗，请允许弹窗后重试');
  }
  const doc = w.document;
  doc.title = title;

  const css = `
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;max-width:800px;margin:32px auto;padding:0 24px;line-height:1.7;font-size:13px;}
  h1{font-size:22px;margin:0 0 16px;} h2{font-size:15px;margin:22px 0 8px;border-left:4px solid #0ea5e9;padding-left:8px;}
  ul,ol{margin:6px 0;padding-left:22px;} li{margin:3px 0;}
  table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0;} th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;} th{background:#f9fafb;}
  .muted{color:#6b7280;font-size:12px;} #print-bar{margin:0 0 16px;} #print-btn{padding:8px 16px;border-radius:8px;border:1px solid #0ea5e9;background:#fff;color:#0369a1;cursor:pointer;}
  @media print{#print-bar{display:none;}}
  `;
  const styleEl = doc.createElement('style');
  styleEl.textContent = css;
  doc.head.appendChild(styleEl);

  const bar = doc.createElement('div');
  bar.id = 'print-bar';
  const btn = doc.createElement('button');
  btn.id = 'print-btn';
  btn.type = 'button';
  btn.textContent = '打印 / 另存为 PDF';
  bar.appendChild(btn);
  doc.body.appendChild(bar);

  const h1 = doc.createElement('h1');
  h1.textContent = title;
  doc.body.appendChild(h1);

  const content = doc.createElement('div');
  content.innerHTML = bodyHtml;
  doc.body.appendChild(content);

  const doPrint = () => { try { w.focus(); w.print(); } catch { /* noop */ } };
  btn.addEventListener('click', doPrint);
  setTimeout(doPrint, 400);
}

// ============================================================
// 客户 Brief 文件 → 纯文字（全部在浏览器本地完成，文件内容不上传任何服务端）
//   jpg/png：Tesseract.js 中文 OCR（CDN 懒加载）
//   pdf    ：pdf.js 本地抽文字
//   docx   ：mammoth.js 本地抽文字
// ============================================================
const CDN = 'https://cdn.jsdelivr.net/npm';
const MAX_FILE_MB = 10;

function loadScript(src: string, globalName: string): Promise<any> {
  const w = window as any;
  if (w[globalName]) return Promise.resolve(w[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(w[globalName]));
      existing.addEventListener('error', () => reject(new Error('组件库加载失败，请检查网络后重试')));
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(w[globalName]);
    el.onerror = () => reject(new Error('组件库加载失败（CDN 网络异常），请检查网络后重试'));
    document.head.appendChild(el);
  });
}

async function extractPdf(file: File): Promise<string> {
  const pdfjsLib = await loadScript(`${CDN}/pdfjs-dist@3.11.174/build/pdf.min.js`, 'pdfjsLib');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  const maxPages = Math.min(pdf.numPages, 20);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(' '));
  }
  return pages.join('\n').replace(/[ \t]+/g, ' ').trim();
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await loadScript(`${CDN}/mammoth@1.6.0/mammoth.browser.min.js`, 'mammoth');
  const buf = await file.arrayBuffer();
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return String(r?.value || '').trim();
}

async function extractImageOcr(file: File, onProgress?: (p: number) => void): Promise<string> {
  const Tesseract = await loadScript(`${CDN}/tesseract.js@5.0.5/dist/tesseract.min.js`, 'Tesseract');
  // 大图先压缩到长边 2000，加速 OCR
  const bitmap = await loadImageBitmap(file);
  let dataUrl: string;
  const maxSide = 2000;
  if (Math.max(bitmap.width, bitmap.height) <= maxSide) {
    dataUrl = await fileToDataUrl(file);
  } else {
    const scale = maxSide / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('图片处理失败');
    ctx.drawImage(bitmap as any, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL('image/png');
  }
  const r = await Tesseract.recognize(dataUrl, 'chi_sim+eng', {
    workerPath: `${CDN}/tesseract.js@5.0.5/dist/worker.min.js`,
    corePath: `${CDN}/tesseract.js-core@5.0.0/tesseract-core.wasm.js`,
    langPath: `${CDN}/@tesseract.js-data/chi_sim/4.0.0_fast`,
    logger: (m: { status: string; progress: number }) => {
      if (onProgress && (m.status === 'recognizing text')) onProgress(m.progress);
    },
  });
  return String(r?.data?.text || '').replace(/[ \t]+/g, ' ').trim();
}

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = URL.createObjectURL(file);
  });
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('图片读取失败'));
    fr.readAsDataURL(file);
  });
}

export interface ClientBriefExtract {
  fileName: string;
  fileType: string;
  text: string;
}

/** 从上传文件本地提取文字（10MB 上限；图片走 OCR 较慢，onProgress 回传 0-1） */
export async function extractClientBriefFile(
  file: File,
  onProgress?: (p: number) => void,
): Promise<ClientBriefExtract> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`文件大小不能超过 ${MAX_FILE_MB}MB`);
  }
  const name = file.name.toLowerCase();
  let text = '';
  let fileType = '';
  if (/\.(jpg|jpeg|png)$/.test(name) || /^image\/(jpeg|png)$/.test(file.type)) {
    fileType = '图片';
    onProgress?.(0.02);
    text = await extractImageOcr(file, onProgress);
  } else if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
    fileType = 'PDF';
    onProgress?.(0.2);
    text = await extractPdf(file);
  } else if (/\.docx?$/.test(name) || /word/.test(file.type)) {
    fileType = '文档';
    onProgress?.(0.2);
    text = await extractDocx(file);
  } else {
    throw new Error('仅支持 JPG/PNG 图片、PDF 或 DOCX 文档');
  }
  if (!text || text.replace(/\s+/g, '').length < 4) {
    throw new Error(fileType === '图片'
      ? '未从图片中识别到文字，请更换更清晰的图片或直接粘贴 Brief 文字'
      : '未从文档中提取到文字，请确认文件内容或直接粘贴 Brief 文字');
  }
  return { fileName: file.name, fileType, text: text.slice(0, 6000) };
}
