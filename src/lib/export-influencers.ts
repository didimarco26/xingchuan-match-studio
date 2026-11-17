
// ============================================================
// 达人匹配名单 · 前端 CSV 一键导出
// 纯浏览器端生成 CSV Blob 触发下载，不依赖 FaaS / 后端
// CSV 带 UTF-8 BOM，Excel 双击可直接正确显示中文
// ============================================================

import type { InfluencerCandidate } from './influencer-match';

export type ExportScope = 'stock' | 'incr' | 'all' | 'potential_new' | 'potential';

export const SCOPE_LABEL: Record<ExportScope, string> = {
  stock: '存量星川达人',
  incr: '优质星川达人',
  potential_new: '潜力星川达人推荐',
  potential: '星图达人推荐',
  all: '全部达人',
};

/** 达人来源库中文名（与页面卡片标签统一） */
export function poolLabel(pool: string): string {
  if (pool === 'stock') return '存量星川达人';
  if (pool === 'incr') return '优质星川达人';
  if (pool === 'potential_new') return '潜力星川达人推荐';
  if (pool === 'potential') return '星图达人推荐';
  return pool || '';
}

/** CSV 单元格转义：包裹双引号，内部双引号翻倍；防 Excel 公式注入 */
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // 防止以 = + - @ 开头被 Excel 当公式执行（CSV 注入）
  if (s && /^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 文件名清洗：去掉非法字符与空白，截断过长商品名 */
function sanitizeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 40);
  return cleaned || '商品';
}

/** 时间戳 YYYYMMDD（本地时区） */
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * 抖音主页链接：
 * 优质星川达人库无主页字段时，homepage 会兜底成代表视频链接（卡片上也显示为「代表视频」），
 * 此时「抖音主页」列留空，链接归入「代表视频」列。
 */
function realHomepage(inf: InfluencerCandidate): string {
  const h = (inf.homepage || '').trim();
  const v = (inf.video || '').trim();
  if (!h) return '';
  if (v && h === v) return '';
  return h;
}

/** 组装 CSV 文本（含表头 + BOM） */
export function buildInfluencerCsv(list: InfluencerCandidate[]): string {
  const header = [
    '达人名称', '匹配分', '来源', '达人ID',
    '星图主页链接', '抖音主页链接', '代表视频链接',
    '粉丝量级', '行业标签', '达人身份', '人设标签',
    '星川等级', '电商达人等级', '星图项目数', '星图消耗(元)', '分层',
    '女粉占比(%)', '内容形式', '合作状态',
  ];
  const isTierPool = (inf: InfluencerCandidate) => inf.pool === 'potential' || inf.pool === 'potential_new';
  const rows = list.map((inf) => [
    inf.name,
    inf.aiScore == null ? '' : inf.aiScore,
    poolLabel(inf.pool),
    inf.douyinId || '',
    inf.xingtuUrl || '',
    realHomepage(inf),
    inf.video || '',
    // 星图/潜力推荐池无精确粉丝数，导出量级档位
    isTierPool(inf) ? (inf.fansTier || '') : inf.followers || 0,
    inf.tags.join(' / '),                                        // 行业/万粉标签
    inf.identity || '',                                          // 达人身份
    inf.persona.join(' / '),                                     // 人设标签
    inf.pool === 'incr' ? (inf.level || '')
      : inf.pool === 'potential_new' ? (inf.xcLevel || '') : '', // 星川等级
    inf.pool === 'potential_new' ? (inf.ecomLevel || '') : '',   // 电商达人等级
    inf.pool === 'potential_new' ? (inf.projects ?? '') : '',    // 平台审核通过星图项目数
    inf.pool === 'potential_new' ? (inf.xcSpend ?? '') : '',     // 星图消耗(元)
    inf.pool === 'potential_new' ? (inf.tier || '') : '',        // 分层：标杆/主力/潜力/储备
    inf.femalePct ? `${inf.femalePct}%` : '',                    // 女粉占比
    inf.forms.join(' / '),                                       // 内容形式/维度
    inf.pool === 'stock' ? (inf.coop || '') : '',                // 合作状态
  ]);
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 触发浏览器下载达人名单 CSV
 * @param list        要导出的达人列表
 * @param productName 商品名（用于文件名）
 * @param scope       存量星川 / 优质星川 / 潜力星川达人推荐 / 星图达人推荐 / 全部（用于文件名）
 */
export function exportInfluencersCsv(
  list: InfluencerCandidate[],
  productName: string,
  scope: ExportScope,
): void {
  if (!list.length) return;
  const csv = buildInfluencerCsv(list);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFileName(productName)}_达人匹配_${SCOPE_LABEL[scope]}_${timestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
