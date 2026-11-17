import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, ExternalLink, Users, Sparkles, Target, Package, TrendingUp,
  BadgeCheck, Search, RefreshCw, AlertTriangle, Handshake, Sprout, Video, Star,
  Download, ListOrdered, Gem, HelpCircle, Filter, RotateCcw, Heart,
  ChevronDown, CheckCircle2, ArrowRight, Tag, Database,
} from 'lucide-react';
import { LARK_BASE_URL, type InfluencerType } from '../lib/api';
import {
  matchInfluencers, formatFollowers, fetchPotentialOverview, matchPotentialInfluencers,
  matchPotentialNewInfluencers, prefillXingtuTags, EMPTY_POTENTIAL_FILTERS,
  POTENTIAL_TIER_OPTIONS, POTENTIAL_IDENTITY_OPTIONS, POTENTIAL_DIM_OPTIONS, POTENTIAL_FEMALE_OPTIONS,
  POTENTIAL_PERSONA_OPTIONS, POTENTIAL_NEW_TIERS, POTENTIAL_EXTRA_INDUSTRIES,
  EMPTY_PNEW_FILTERS, PNEW_FANS_BUCKET_OPTIONS, PNEW_PERSONA_OPTIONS, PNEW_FORM_OPTIONS,
  getLocalStockCount,
  type MatchProduct, type MatchResult, type MatchProgress, type InfluencerCandidate,
  type PotentialOverview, type PotentialFilters, type PotentialMatchResult, type PotentialNewResult,
  type PnewFilters,
} from '../lib/influencer-match';
import { isGhPages } from '../lib/gh';
import { isDemoMode } from '../lib/demo';
import { MATCH_ONLY } from '../match-only';
import { trackUsage } from '../lib/user';
import { exportInfluencersCsv, poolLabel, SCOPE_LABEL, type ExportScope } from '../lib/export-influencers';
import ConfirmDialog from './ConfirmDialog';
import MatchHistoryModal from './MatchHistoryModal';
import {
  addInfluencerHistory, currentProviderName,
} from '../lib/local-history-db';

/** 「?」hover 说明气泡（三类达人数量输入框标签旁） */
function InfoTip({ text, width = 'w-56' }: { text: string; width?: string }) {
  return (
    <span className="relative group inline-flex items-center align-middle ml-1">
      <HelpCircle className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-500 transition-colors cursor-help" />
      <span className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 ${width} rounded-lg bg-gray-900/95 text-white text-[10.5px] leading-relaxed px-3 py-2 shadow-xl font-normal whitespace-normal`}>
        {text}
      </span>
    </span>
  );
}

// ============================================================
// 第三部分：达人匹配推荐
// 沿用第二部分产品分析结果 → 拉取存量星川/优质星川达人库 → AI 评分排序 → 卡片展示
// （星图达人推荐库＝精选联盟激励候选底表，字段已接通，筛选条件 + AI 评分）
// ============================================================

function clampNum(v: number, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v));
  if (isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/** 每类达人卡片首屏展示数量（点「点开展现剩余」后一次展开全部，可再收起） */
const PAGE_SIZE = 10;
/** 主池（存量星川、优质星川）单类达人匹配数量上限 */
const MAX_PER_POOL_MAIN = 200;
/** 大池（潜力星川达人推荐、星图达人推荐）单类达人匹配数量上限 */
const MAX_PER_POOL_LARGE = 1000;

// ============================================================
// AI 匹配分可视化：分段配色 + 分数环 + 命中/预警维度标签
// 把"为什么是这个分、为什么排这个名次"显性化
// ============================================================

/** 匹配分分段：≥80 绿（高度匹配）/ 60-79 橙（可谈）/ <60 红（弱相关），与打分页评分环一致 */
function scoreTone(score: number): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}
function scoreColor(score: number): string {
  const t = scoreTone(score);
  return t === 'high' ? '#12B76A' : t === 'mid' ? '#F79009' : '#F04438';
}

/** 小弧形分数环：中央大字匹配分，弧长=分值，颜色随分段；neutral=未详评（灰） */
function ScoreRing({ score, size = 56, neutral = false }: { score: number; size?: number; neutral?: boolean }) {
  const s = Math.max(0, Math.min(100, Math.round(score) || 0));
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - s / 100);
  const color = neutral ? '#9AA1B1' : scoreColor(s);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`AI 综合匹配分 ${s} / 100`}>
      <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#EEF0F5" strokeWidth="12" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .6s ease, stroke .3s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-bold tabnum" style={{ color, fontSize: Math.round(size * 0.3) }}>{s}</span>
      </div>
    </div>
  );
}

/** 各组匹配分前三的奖牌 */
const MEDALS = ['🥇', '🥈', '🥉'];

interface MatchTag { text: string; tone: 'ok' | 'warn'; }

/**
 * 从 AI 推荐理由（reason）中提取 2-3 个核心命中/预警维度标签：
 * ✅ = 加分命中项，⚠️ = 失分项；让评分逻辑可被一眼看懂。
 */
function extractMatchTags(inf: InfluencerCandidate): MatchTag[] {
  const r = inf.reason || '';
  const has = (re: RegExp) => re.test(r);
  const warns: MatchTag[] = [];
  const hits: MatchTag[] = [];

  // —— 预警（失分项）——
  if (has(/(粉丝量?|粉丝规模|量级)[^。，；、]{0,8}(偏小|偏低|较小|较少|不足|不高|有限)/)) {
    warns.push({ text: '粉丝量偏低', tone: 'warn' });
  }
  if (has(/(粉丝画像|目标人群|受众|人群|粉丝群体)[^。，；、]{0,10}(偏差|不符|不契合|错位|错配|偏离|不匹配|欠契合|略有?(偏差|出入)|不够?契合)/)) {
    warns.push({ text: '人群略有偏差', tone: 'warn' });
  }
  if (has(/(类目|品类|垂类|带货)[^。，；、]{0,10}(不相关|弱相关|无相关|不匹配|不符|缺乏|欠缺|经验不足)|无.{0,5}(同类目|同品类|相关品类).{0,6}经验/)) {
    warns.push({ text: '品类经验不足', tone: 'warn' });
  }

  // —— 正向命中（加分项）——
  if (has(/(内容形式|内容方向|创意方向|内容调性|短视频内容|内容创作|人设|风格|真人|实测|测评|剧情|口播|种草|脚本)/)) {
    hits.push({ text: '内容方向契合', tone: 'ok' });
  }
  if (has(/(粉丝画像|目标人群|受众|人群(高度)?契合|画像吻合|粉丝以|女性为主|男性为主|人群匹配|粉丝群体|用户画像|粉丝结构)/)) {
    hits.push({ text: '粉丝画像吻合', tone: 'ok' });
  }
  if (has(/(同类目|同品类|带货类目|带货品类|类目(高度)?(相关|匹配|契合|含|为|是)|品类(相关|匹配|契合|经验|含|为|是)|垂类|相关品类|类目经验)/)) {
    hits.push({ text: '品类经验匹配', tone: 'ok' });
  }
  if (has(/(偏好|选人(要求|方向))/)) {
    hits.push({ text: '契合选人偏好', tone: 'ok' });
  }

  // 同一维度若已判预警，则不再给正向命中（互斥）
  const warnTexts = new Set(warns.map(w => w.text));
  const hitsClean = hits.filter(h =>
    !(h.text === '粉丝画像吻合' && warnTexts.has('人群略有偏差')) &&
    !(h.text === '品类经验匹配' && warnTexts.has('品类经验不足')));

  // 组合：最多 3 个；有预警时保证预警露出（2✅+1⚠️ 或 1✅+2⚠️）
  let tags: MatchTag[];
  if (hitsClean.length >= 2 && warns.length >= 1) tags = [...hitsClean.slice(0, 2), ...warns.slice(0, 1)];
  else if (hitsClean.length >= 1 && warns.length >= 2) tags = [...hitsClean.slice(0, 1), ...warns.slice(0, 2)];
  else tags = [...hitsClean, ...warns].slice(0, 3);

  // 兜底：理由为空或未命中任何维度关键词时给出结论标签
  if (tags.length === 0) {
    if (/详评暂缺|未评分|暂缺/.test(r)) {
      tags = [{ text: 'AI 详评暂缺·待复核', tone: 'warn' }];
    } else {
      const tone = scoreTone(inf.aiScore ?? 50);
      tags = tone === 'high' ? [{ text: '综合匹配度高', tone: 'ok' }]
        : tone === 'mid' ? [{ text: '基础条件匹配', tone: 'ok' }]
        : [{ text: '匹配度偏低·建议复核', tone: 'warn' }];
    }
  }
  return tags;
}

function coopPill(coop: string, wechat: string): { text: string; cls: string } | null {
  const s = `${coop}${wechat}`;
  if (/已合作/.test(s)) return { text: '已合作', cls: 'bg-ok-bg text-ok-ink border-ok-line' };
  if (/洽谈/.test(s)) return { text: '洽谈中', cls: 'bg-warn-bg text-warn-ink border-warn-line' };
  if (/触达|已沟通/.test(s)) return { text: '已触达', cls: 'bg-brand-50 text-brand-700 border-brand-200' };
  if (coop && coop !== '未接触') return { text: coop, cls: 'bg-gray-50 text-gray-600 border-gray-200' };
  return null;
}

/** 达人卡片（rank = 在本组内按匹配分降序的名次，0 起） */
function InfluencerCard({ inf, rank }: { inf: InfluencerCandidate; rank: number }) {
  const isStock = inf.pool === 'stock';
  const isPotential = inf.pool === 'potential';      // 星图达人推荐（琥珀）
  const isPotNew = inf.pool === 'potential_new';     // 潜力星川达人推荐（紫色，规则评分）
  const pill = coopPill(inf.coop, inf.wechat);
  const score = inf.aiScore ?? 50;
  // 潜力星川达人为确定性规则评分，不跑 AI 标签提取；其余库用 AI 理由提取 ✅/⚠️ 标签
  const matchTags = isPotNew ? [] : extractMatchTags(inf);
  const medal = rank >= 0 && rank < MEDALS.length ? MEDALS[rank] : '';
  // AI 详评缺失（单批评分失败兜底 50 分）：分数环用中性灰，不误导为低分
  const unscored = !isPotNew && /详评暂缺|未评分|暂缺/.test(inf.reason || '');

  // 链接优先级：星图商单主页（投放主入口）→ 抖音主页 → 代表视频 → 抖音搜索
  const links: { url: string; label: string; icon: typeof ExternalLink; primary?: boolean }[] = [];
  if (inf.xingtuUrl) {
    links.push({ url: inf.xingtuUrl, label: '星图主页', icon: Star, primary: true });
  }
  if (inf.homepage) {
    links.push({
      url: inf.homepage,
      label: isStock ? '抖音主页' : (inf.homepage === inf.video ? '代表视频' : '抖音主页'),
      icon: isStock ? ExternalLink : (inf.homepage === inf.video ? Video : ExternalLink),
    });
  }
  if (inf.video && inf.video !== inf.homepage) {
    links.push({ url: inf.video, label: '代表视频', icon: Video });
  }
  if (!links.length) {
    links.push({
      url: `https://www.douyin.com/search/${encodeURIComponent(inf.name.replace(/^@/, ''))}`,
      label: '抖音搜索', icon: Search,
    });
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="p-4 flex-1 space-y-3">
        {/* 头部：奖牌+名称+粉丝（左） · 匹配分分数环（右） */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1" title={inf.name}>
              {medal && (
                <span className="shrink-0 text-[15px] leading-none" title={`本组匹配分第 ${rank + 1} 名`}>{medal}</span>
              )}
              <span className="truncate">{inf.name}</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {isPotential || isPotNew ? (
                <>粉丝量级 <span className={isPotNew ? 'text-violet-700 font-semibold' : 'text-amber-700 font-semibold'}>{inf.fansTier || '未知'}</span></>
              ) : (
                <>粉丝 {formatFollowers(inf.followers)}</>
              )}
              {isStock && inf.agent && <span className="ml-1">· {inf.agent}</span>}
              {!isStock && !isPotential && !isPotNew && inf.level && <span className="ml-1 text-warn-ink font-medium">· {inf.level}</span>}
              {isPotential && inf.identity && <span className="ml-1 text-amber-700/80">· {inf.identity}</span>}
              {isPotNew && inf.xcLevel && <span className="ml-1 text-violet-700/90 font-medium">· 星川{inf.xcLevel}</span>}
            </p>
          </div>
          <ScoreRing score={score} neutral={unscored} />
        </div>

        {/* 潜力星川达人：分层徽章（🥇标杆/🥈主力/🥉潜力/⚪储备） */}
        {isPotNew && inf.tier && (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
              {POTENTIAL_NEW_TIERS.find(t => t.key === inf.tier)?.medal || ''} {inf.tier}达人
            </span>
            {inf.ecomLevel && (
              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border bg-violet-50/60 text-violet-600 border-violet-100">
                电商 {inf.ecomLevel}
              </span>
            )}
            {inf.industryOp && (
              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">
                {inf.industryOp}
              </span>
            )}
          </div>
        )}

        {/* 匹配维度标签：✅ 命中加分项 / ⚠️ 失分项（把打分逻辑显性化，潜力星川为规则评分不展示） */}
        {!isPotNew && (
          <div className="flex flex-wrap gap-1.5">
            {matchTags.map(t => (
              <span key={t.text}
                className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                  t.tone === 'ok' ? 'bg-ok-bg text-ok-ink border-ok-line' : 'bg-warn-bg text-warn-ink border-warn-line'
                }`}>
                {t.tone === 'ok' ? '✅' : '⚠️'} {t.text}
              </span>
            ))}
          </div>
        )}

        {/* 库徽章 + 行业标签 + 合作状态 pill */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isStock ? 'bg-brand-50 text-brand-700 border-brand-200'
            : isPotNew ? 'bg-violet-50 text-violet-700 border-violet-200'
            : isPotential ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-ok-bg text-ok-ink border-ok-line'
          }`}>
            {isStock ? '存量星川达人' : isPotNew ? '潜力星川达人推荐' : isPotential ? '星图达人推荐' : '优质星川达人'}
          </span>
          {inf.tags.map(t => (
            <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${
              isPotNew ? 'bg-violet-50/50 text-violet-700 border-violet-100'
              : isPotential ? 'bg-amber-50/60 text-amber-800 border-amber-100'
              : 'bg-brand-50 text-brand-700 border-brand-100'
            }`}>{t}</span>
          ))}
          {pill && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${pill.cls}`}>{pill.text}</span>
          )}
        </div>

        {/* 人设标签 */}
        {inf.persona.length > 0 && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            <span className="text-gray-400">人设：</span>{inf.persona.join(' · ')}
          </p>
        )}

        {/* 内容形式标签 */}
        {inf.forms.length > 0 && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            <span className="text-gray-400">{isPotential ? '内容维度：' : '内容形式：'}</span>{inf.forms.join(' · ')}
          </p>
        )}

        {/* 星图达人推荐：女粉占比（冷启评估口径；报价/CPM 字段填充率极低已下线） */}
        {isPotential && (
          <p className="text-[11px] text-amber-800/90 leading-relaxed flex flex-wrap gap-x-3 gap-y-0.5">
            {(inf.femalePct ?? 0) > 0 && <span>女粉 <b className="font-semibold">{inf.femalePct}%</b></span>}
            {(inf.malePct ?? 0) > 0 && <span>男粉 <b className="font-semibold">{inf.malePct}%</b></span>}
            {!inf.femalePct && !inf.malePct && <span className="text-gray-400">粉丝画像数据待补</span>}
          </p>
        )}

        {/* 潜力星川达人推荐：规则评分依据（确定性，非 AI） */}
        {isPotNew && (
          <div className="rounded-xl bg-violet-50/70 border border-violet-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-violet-600 flex items-center gap-1 mb-1">
              <Gem className="w-3 h-3" /> 规则测算依据（星川等级·交付·消耗·电商等级）
            </p>
            <p className="text-[11px] text-violet-900/80 leading-relaxed">{inf.reason || '—'}</p>
          </div>
        )}

        {/* 历史合作类目 */}
        {inf.category && (
          <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-1.5">
            <Package className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span><span className="text-gray-400">带货类目：</span>{inf.category}</span>
          </p>
        )}

        {/* 存量：近期爆款方向 */}
        {isStock && inf.highlight && (
          <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
            <span className="line-clamp-2"><span className="text-gray-400">近期爆款：</span>{inf.highlight}</span>
          </p>
        )}

        {/* AI 推荐理由（高亮；潜力星川达人推荐已用紫色规则评分依据块替代） */}
        {!isPotNew && (
          <div className="rounded-xl bg-brand-50/80 border border-brand-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-brand-600 flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3" /> AI 推荐理由
            </p>
            <p className="text-[11px] text-brand-900/80 leading-relaxed">{inf.reason || '—'}</p>
          </div>
        )}
      </div>

      {/* 底部链接 */}
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2 flex-wrap">
        {links.map(l => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
             className={l.primary
               ? 'inline-flex items-center gap-1 text-[11px] font-bold text-white bg-gradient-to-r from-brand-600 to-brand-600 hover:from-brand-700 hover:to-brand-700 rounded-lg px-2.5 py-1 shadow-sm transition-all'
               : 'inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-900 hover:bg-brand-100/60 rounded-lg px-2 py-1 transition-colors'}>
            <l.icon className="w-3 h-3" /> {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/** 板块标题栏「优化筛选」小按钮（Filter 图标，按板块主题色描边；点击不触发父级折叠）
 *  注意：bg-white 必须放在各状态分支里，不能放 base——否则 active 态的 bg-brand-500 会被
 *  Tailwind 同特异性的 bg-white 覆盖（样式表顺序决定），出现「白底白字空白框」。 */
function RefineActionBtn({ theme, active, onClick, children, disabled }: {
  theme: 'brand' | 'violet' | 'amber';
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const cls = theme === 'violet'
    ? (active ? 'border-violet-500 bg-violet-500 text-white shadow-sm' : 'border-violet-300 bg-white text-violet-700 hover:bg-violet-50')
    : theme === 'amber'
    ? (active ? 'border-amber-500 bg-amber-500 text-white shadow-sm' : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50')
    : (active ? 'border-brand-500 bg-brand-500 text-white shadow-sm' : 'border-brand-300 bg-white text-brand-700 hover:bg-brand-50');
  return (
    <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${cls}`}>
      <Filter className="w-3 h-3" />{children}
    </button>
  );
}

/**
 * 「优化筛选」就地内联折叠面板：渲染在所属板块标题正下方，展开/收起只做高度动画，
 * 不触发任何 scrollIntoView / 锚点跳转——页面滚动位置完全不动；收起后零占位。
 */
function InlineRefinePanel({ open, theme, children }: {
  open: boolean;
  theme: 'brand' | 'violet' | 'amber';
  children: ReactNode;
}) {
  const box = theme === 'violet'
    ? 'border-violet-200 bg-violet-50/70'
    : theme === 'amber'
    ? 'border-amber-200 bg-amber-50/70'
    : 'border-brand-200 bg-brand-50/60';
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className={`mt-3 mb-4 rounded-2xl border p-3.5 ${box}`}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 板块标题栏「一键导出」小按钮（Download 图标，中性灰底，比「优化筛选」低调；点击不触发父级折叠） */
function ExportActionBtn({ onClick, children, disabled }: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-[11px] font-bold hover:bg-gray-50 hover:text-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
      <Download className="w-3 h-3" />{children}
    </button>
  );
}

/** 分组标题（存量星川蓝 / 优质星川绿 / 潜力星川达人推荐紫 / 星图达人推荐琥珀），右侧可挂「优化筛选」「一键导出」 */
/** 四库匹配逻辑说明：匹配逻辑 / 核心指标 / 核心亮点 / 一句话为什么适合星川 */
const POOL_LOGIC_COPY: Record<'stock' | 'incr' | 'pnew' | 'potential', { logic: string; metrics: string; highlight: string; why: string }> = {
  stock: {
    logic: '服务商自有已合作达人，按五维标签（品类 / 人群 / 内容风格 / 粉丝量级 / 星川等级）硬匹配，AI 再按商品卖点、目标人群、内容承接能力综合打分，取 Top N。',
    metrics: '五维标签相似度、AI 综合评分',
    highlight: '已建联、画像完整、触达即用，起量确定性最高。',
    why: '合作过、画像又对得上的人，拿来做星川起量确定性最高。',
  },
  incr: {
    logic: '平台精选有真实星川交付记录的达人，按品类 / 人群 / 内容风格五维匹配 + AI 多维打分，优先同品类有爆款经验的达人。',
    metrics: '星川等级、星图历史消耗、同品类交付数',
    highlight: '已证明「内容能跑、货能带」，最易复制爆款素材。',
    why: '交付记录可查、爆款经验可复制，是最稳的标杆素材来源。',
  },
  pnew: {
    logic: '行业门槛筛选后，按四维量化评分：星川等级（30 分）+ 交付项目数（20 分）+ 星图消耗（20 分）+ 电商等级（10 分）+ 粉丝画像（20 分），标杆 / 主力 / 潜力 / 储备四分层均衡取数（纯规则、不调 AI）。',
    metrics: '星川等级、交付项目数、星图消耗、电商等级',
    highlight: '官方数据背书、分层清晰，是星川任务主力供给盘。',
    why: '官方四维数据可量化、分层供给稳定，按分选人确定性高。',
  },
  potential: {
    logic: '按刊例价 / 粉丝量级 / 行业画像 / CPM / GMV 门槛六维硬筛选 + AI 打分排序取 Top N；命中不足时自动逐级放宽，保证凑满数量。',
    metrics: '刊例价、粉丝画像匹配度、CPM、GMV 门槛',
    highlight: '池子最大、新面孔多、报价弹性大，持续补充增量。',
    why: '量大面广能挑出性价比最高的新达人，为星川持续拓圈补增量。',
  },
};

function PoolLogicNote({ kind, theme }: { kind: 'stock' | 'incr' | 'pnew' | 'potential'; theme: 'brand' | 'violet' | 'amber' }) {
  const c = POOL_LOGIC_COPY[kind];
  const themeCls = {
    brand: 'border-brand-100 bg-brand-50/60',
    violet: 'border-violet-200 bg-violet-50/70',
    amber: 'border-amber-200 bg-amber-50/70',
  }[theme];
  const labelCls = {
    brand: 'text-brand-700',
    violet: 'text-violet-700',
    amber: 'text-amber-700',
  }[theme];
  return (
    <div className={`rounded-xl border px-3.5 py-3 mb-3 ${themeCls}`}>
      <p className="text-[11px] text-gray-700 leading-relaxed">
        <span className={`font-bold ${labelCls}`}>匹配逻辑：</span>{c.logic}
      </p>
      <p className="text-[11px] text-gray-700 leading-relaxed mt-1">
        <span className={`font-bold ${labelCls}`}>核心指标：</span>{c.metrics}
      </p>
      <p className="text-[11px] text-gray-700 leading-relaxed mt-1">
        <span className={`font-bold ${labelCls}`}>核心亮点：</span>{c.highlight}
      </p>
      <p className="text-[11px] text-gray-700 leading-relaxed mt-1">
        <span className={`font-bold ${labelCls}`}>一句话为什么适合做星川：</span>{c.why}
      </p>
    </div>
  );
}

/** 达人流动机制：②③④ 增量库建联成功 → xc-tagger 打标 → 沉淀进 ① 存量库（发现→建联→打标→沉淀 闭环） */
function TalentFlowBlock() {
  const sources = [
    { no: '②', name: '优质星川达人库', meta: '994 人 · 有迹可循', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { no: '③', name: '潜力星川达人推荐', meta: '1.28 万人 · 系统挖掘', cls: 'border-violet-200 bg-violet-50 text-violet-800' },
    { no: '④', name: '星图达人推荐', meta: '1.37 万人 · 全新拓圈', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  ];
  const Arrow = () => <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />;
  return (
    <div className="mb-4 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/80 via-white to-violet-50/60 px-4 py-3.5">
      <p className="text-[12.5px] font-extrabold text-gray-900 flex items-center gap-1.5">
        <RefreshCw className="w-4 h-4 text-brand-600" />
        达人流动机制：增量库建联后打标沉淀，存量库越用越厚
      </p>
      <div className="mt-3 flex flex-wrap items-stretch gap-x-2 gap-y-2.5">
        {/* 增量三库 */}
        <div className="flex flex-col gap-1.5">
          {sources.map(s => (
            <span key={s.no} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10.5px] font-bold ${s.cls}`}>
              <span>{s.no}</span><span>{s.name}</span>
              <span className="font-normal opacity-75">{s.meta}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center px-0.5 text-[10.5px] font-bold text-gray-500">匹配 / 建联成功</div>
        <Arrow />
        {/* xc-tagger 打标 */}
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1.5 text-[10.5px] font-bold text-fuchsia-800 self-center">
          <Tag className="w-3.5 h-3.5" />
          xc-tagger 打标
          <span className="font-normal text-fuchsia-600/90">星川等级 · 交付项目数 · 星图消耗 · 电商等级</span>
        </span>
        <Arrow />
        {/* 沉淀存量库 */}
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-600 px-2.5 py-1.5 text-[10.5px] font-bold text-white self-center">
          <Database className="w-3.5 h-3.5" />
          沉淀进入 ① 存量达人库
          <span className="font-normal text-white/80">233 人 · 五维画像完整</span>
        </span>
      </div>
      <p className="mt-2.5 text-[10.5px] text-gray-500 leading-relaxed">
        闭环：<b className="text-gray-700">发现（②③④ 匹配）→ 建联（合作跑量）→ 打标（xc-tagger 补齐五维画像）→ 沉淀（进入 ① 存量库）</b>；
        下一轮商品匹配时，这些达人即以「已建联、画像完整」身份从存量库精准激活，起量确定性最高。
      </p>
    </div>
  );
}

function GroupHeader({ pool, count, note, onRefine, onExport, refineLabel, refineActive }: {
  pool: 'stock' | 'incr' | 'potential_new' | 'potential';
  count: number;
  note?: string;
  onRefine?: () => void;
  onExport?: () => void;
  refineLabel?: string;
  refineActive?: boolean;
}) {
  const isStock = pool === 'stock';
  const isPotential = pool === 'potential';
  const isPotNew = pool === 'potential_new';
  const Icon = isStock ? Handshake : isPotNew ? Gem : isPotential ? Star : Sprout;
  const theme: 'brand' | 'violet' | 'amber' = isPotNew ? 'violet' : isPotential ? 'amber' : 'brand';
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-3">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        isStock ? 'bg-brand-100 text-brand-600'
        : isPotNew ? 'bg-violet-100 text-violet-600'
        : isPotential ? 'bg-amber-100 text-amber-600'
        : 'bg-ok-bg text-ok-ink'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">
          {isStock ? '存量达人库 · 已建联合作库（233 人）'
          : isPotNew ? '潜力星川达人推荐 · 星川分级达人池（1.28 万人）'
          : isPotential ? '星图达人推荐 · 全新拓圈池（1.37 万人）'
          : '优质星川达人库 · 有迹可循（994 人）'}
        </p>
        <p className="text-[11px] text-gray-400">
          {note || (isStock
            ? `服务商自有已合作达人，五维标签硬匹配 + AI 按卖点 / 人群 / 承接力打分排序 Top ${count}，前三名带排名徽章`
            : isPotNew
            ? `1.28 万官方分级池，按 星川等级·交付项目·星图消耗·电商等级·粉丝画像 规则测算并四分层，Top ${count}`
            : isPotential
            ? `1.37 万星图达人池，刊例价 / 粉丝画像 / CPM / GMV 门槛六维硬筛选后 AI 排序 Top ${count}，前三名带排名徽章`
            : `994 位有真实星川交付记录的精选达人，五维匹配 + AI 多维打分排序 Top ${count}，前三名带排名徽章`)}
        </p>
      </div>
      {(onRefine || onExport) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {onRefine && <RefineActionBtn theme={theme} active={refineActive} onClick={onRefine}>{refineLabel || '优化筛选'}</RefineActionBtn>}
          {onExport && <ExportActionBtn onClick={onExport} disabled={count === 0}>一键导出</ExportActionBtn>}
        </div>
      )}
    </div>
  );
}

/**
 * 折叠长条 section（潜力星川达人推荐 / 星图达人推荐结果用）：
 * 整行可点击的条状标题栏，默认收起；左侧图标+标题+数量徽标，右侧展开箭头，
 * 展开后在下方渲染卡片列表。loading 时标题栏显示转圈，error 时提示点击查看。
 */
function CollapsibleSection({
  open, onToggle, icon, title, count, loading, error, theme, children, rightSlot,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  count?: number;
  loading?: boolean;
  error?: boolean;
  theme: 'violet' | 'amber';
  children: ReactNode;
  /** 标题栏右侧自定义内容（如「优化筛选」「一键导出」按钮）；点击已隔离，不会触发折叠 */
  rightSlot?: ReactNode;
}) {
  const tone = theme === 'violet'
    ? {
        bar: 'bg-violet-50 border-violet-200 hover:bg-violet-100/70 text-violet-900',
        iconBox: 'bg-violet-100 text-violet-600',
        badge: 'bg-violet-600 text-white',
      }
    : {
        bar: 'bg-amber-50 border-amber-200 hover:bg-amber-100/70 text-amber-900',
        iconBox: 'bg-amber-100 text-amber-600',
        badge: 'bg-amber-600 text-white',
      };
  return (
    <div className="mt-5">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        aria-expanded={open}
        className={`w-full flex items-center gap-2.5 rounded-2xl border px-4 py-3 transition-colors text-left cursor-pointer ${tone.bar}`}
      >
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tone.iconBox}`}>
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-bold flex items-center gap-2 flex-wrap">
            <span className="truncate">{title}</span>
            {loading
              ? <span className="text-[11px] font-medium opacity-80 inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 匹配中…
                </span>
              : typeof count === 'number' && count > 0
              ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tone.badge}`}>{count} 位</span>
              : null}
          </span>
          <span className={`block text-[11px] mt-0.5 ${error ? 'text-red-500 font-medium' : 'opacity-60'}`}>
            {error ? '⚠️ 本次未匹配到达人或查询失败，点击展开查看'
              : loading ? '正在拉取候选并评估，请稍候…'
              : open ? '点击收起达人列表' : '点击展开查看达人列表'}
          </span>
        </span>
        {rightSlot && (
          <span className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {rightSlot}
          </span>
        )}
        {!loading && (
          <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 列表展开/收起控件：首屏展示 PAGE_SIZE 张；点「点开展现剩余 X 位达人」一次展开全部；
 * 全部展开后显示「收起列表」可收回 PAGE_SIZE。不足一屏不渲染。
 */
/** 潜力星川「优化筛选」内联面板内容：分层开关（前端即时）+ 行业/粉丝量级/人设/内容形式四维（服务端硬筛） */
function PnewRefinePanel({ filters, tiers, facets, tierCounts, matching, matched, onToggleFilter, onToggleTier, onReset, onClose }: {
  filters: PnewFilters;
  tiers: string[];
  facets?: { industries: Record<string, number>; fansBuckets: Record<string, number>; personas: Record<string, number>; forms: Record<string, number> };
  tierCounts: Record<string, number>;
  matching: boolean;
  matched: number;
  onToggleFilter: (key: keyof PnewFilters, value: string) => void;
  onToggleTier: (tier: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const activeCls = 'bg-violet-500 border-violet-500 text-white';
  const idleCls = 'bg-white border-violet-200 text-violet-700 hover:bg-violet-50';
  const zeroCls = 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed';
  const chip = (active: boolean, zero: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${active ? activeCls : zero ? zeroCls : idleCls}`;
  const facetCount = (m: Record<string, number> | undefined, k: string) => (m && m[k] != null ? m[k] : null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="mb-3">
      <p className="text-[11px] font-bold text-gray-500 mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  const industryEntries = Object.entries(facets?.industries || {}).sort((a, b) => b[1] - a[1]);
  const filterCount = filters.industries.length + filters.fansBuckets.length + filters.personas.length + filters.forms.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-violet-500" /> 筛选条件（不选即不限，可多项组合；四维条件变更后自动重新查询）
          {matching && <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" />}
        </p>
        <button type="button" onClick={onReset}
          className="text-[10.5px] text-violet-500 hover:text-violet-800 flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> 重置全部
        </button>
      </div>

      <Section title="达人分层（多选，仅控制当前名单显隐）">
        {POTENTIAL_NEW_TIERS.map(t => {
          const c = tierCounts?.[t.key] ?? 0;
          const active = tiers.includes(t.key);
          return (
            <button key={t.key} type="button"
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${active ? activeCls : idleCls}`}
              onClick={() => onToggleTier(t.key)}>
              {t.medal} {t.label} <span className={active ? 'text-violet-100' : 'text-gray-400'}>{c}</span>
            </button>
          );
        })}
      </Section>

      <Section title="行业标签（多选为「或」，跨维度为「且」）">
        {industryEntries.length === 0 && <span className="text-[11px] text-gray-400">暂无数据</span>}
        {industryEntries.map(([name, c]) => {
          const active = filters.industries.includes(name);
          return (
            <button key={name} type="button"
              className={chip(active, false)}
              onClick={() => onToggleFilter('industries', name)}>
              {name} <span className={active ? 'text-violet-100' : 'text-gray-400'}>{c}</span>
            </button>
          );
        })}
      </Section>

      <Section title="粉丝量级">
        {PNEW_FANS_BUCKET_OPTIONS.map(o => {
          const c = facetCount(facets?.fansBuckets, o.key);
          const active = filters.fansBuckets.includes(o.key);
          return (
            <button key={o.key} type="button"
              disabled={c === 0}
              className={chip(active, c === 0)}
              onClick={() => onToggleFilter('fansBuckets', o.key)}>
              {o.label} {c != null && <span className={active ? 'text-violet-100' : 'text-gray-400'}>{c}</span>}
            </button>
          );
        })}
      </Section>

      <Section title="人设标签">
        {PNEW_PERSONA_OPTIONS.map(o => {
          const c = facetCount(facets?.personas, o.key);
          const active = filters.personas.includes(o.key);
          return (
            <button key={o.key} type="button"
              disabled={c === 0}
              className={chip(active, c === 0)}
              onClick={() => onToggleFilter('personas', o.key)}>
              {o.label.replace('达人', '')} {c != null && <span className={active ? 'text-violet-100' : 'text-gray-400'}>{c}</span>}
            </button>
          );
        })}
      </Section>

      <Section title="内容形式标签">
        {PNEW_FORM_OPTIONS.map(o => {
          const c = facetCount(facets?.forms, o.key);
          const active = filters.forms.includes(o.key);
          return (
            <button key={o.key} type="button"
              disabled={c === 0}
              className={chip(active, c === 0)}
              onClick={() => onToggleFilter('forms', o.key)}>
              {o.label} {c != null && <span className={active ? 'text-violet-100' : 'text-gray-400'}>{c}</span>}
            </button>
          );
        })}
      </Section>

      <p className="text-[10.5px] text-violet-700/80 pt-2 border-t border-violet-200/70 flex items-start gap-1 mb-2.5">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
        本池按星川等级 / 星图消耗 / 交付项目 / 电商等级做<b className="text-violet-900">规则测算（不调 AI）</b>；行业/量级/人设/内容形式在服务端全量池中硬筛选后重新取 Top，分层开关仅控制当前名单显隐。
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-violet-600/80">
          {filterCount || tiers.length ? `已选 ${filterCount + tiers.length} 项 · ` : ''}合格池 {matched} 位
        </span>
        <button type="button" onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-violet-500 text-white text-[11px] font-bold hover:bg-violet-600 transition">
          收起筛选
        </button>
      </div>
    </div>
  );
}

function ListPagerControls({ total, visible, onExpandAll, onCollapse, theme }: {
  total: number;
  visible: number;
  onExpandAll: () => void;
  onCollapse: () => void;
  theme: 'brand' | 'violet' | 'amber';
}) {
  if (total <= PAGE_SIZE) return null;
  const cls = theme === 'violet'
    ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
    : theme === 'amber'
    ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
    : 'border-brand-200 text-brand-700 hover:bg-brand-50';
  const expanded = visible >= total;
  return (
    <div className="mt-3 text-center">
      {!expanded ? (
        <button
          type="button"
          onClick={onExpandAll}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border bg-white text-xs font-bold transition-colors ${cls}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          点开展现剩余 {total - visible} 位达人
        </button>
      ) : (
        <button
          type="button"
          onClick={onCollapse}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border bg-white text-xs font-bold transition-colors ${cls}`}
        >
          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          收起列表
        </button>
      )}
    </div>
  );
}

/**
 * 星图达人推荐库卡片（精选联盟·筛选结果-激励达人候选（初版），独立 Base 12,829 人）
 * 概况展示 + 独立查询入口（按钮展开筛选面板，服务商确认后才触发匹配）。
 * 读取失败不渲染、不打扰主流程。
 */

/** 筛选 chip（多选/单选用，琥珀主题） */
function PotChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded-lg border transition-all whitespace-nowrap ${active
        ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-sm'
        : 'bg-white text-gray-600 border-amber-200 hover:border-amber-400 hover:text-amber-700'}`}>
      {children}
    </button>
  );
}

/** 筛选面板：万粉标签/粉丝量级/达人人设/达人身份/内容维度/女粉方向（报价·CPM·MCN·GMV 已下线） */
function PotentialQueryPanel({
  data, filters, onToggleTag, onSetFemaleDir,
  prefilled, onReset,
}: {
  data: PotentialOverview;
  filters: PotentialFilters;
  onToggleTag: (key: 'industries' | 'tiers' | 'personas' | 'identities' | 'dims', v: string) => void;
  onSetFemaleDir: (v: PotentialFilters['femaleDir']) => void;
  prefilled: boolean;
  onReset: () => void;
}) {
  const industryOptions = [...data.industryTags.map(t => t.name).filter(n => !/未分类/.test(n)), ...POTENTIAL_EXTRA_INDUSTRIES];
  const row = 'flex items-start gap-2';
  const label = 'text-[10.5px] font-bold text-amber-800/80 w-[76px] shrink-0 pt-1.5 leading-tight';
  const chips = 'flex flex-wrap gap-1.5 flex-1';
  return (
    <div className="mt-3 rounded-xl bg-white/90 border border-amber-200 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> 筛选条件（不选即不限，可多项组合）
        </p>
        <button type="button" onClick={onReset}
          className="text-[10.5px] text-gray-400 hover:text-amber-700 flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> 重置
        </button>
      </div>

      {prefilled && filters.industries.length > 0 && (
        <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 shrink-0" />
          已根据分析结果预填行业标签，请确认或调整后再查询
        </p>
      )}

      <div className={row}>
        <span className={label}>行业标签<br /><span className="font-normal text-amber-600/70">多选</span></span>
        <div className={chips}>
          {industryOptions.map(t => (
            <PotChip key={t} active={filters.industries.includes(t)} onClick={() => onToggleTag('industries', t)}>{t}</PotChip>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>粉丝量级<br /><span className="font-normal text-amber-600/70">多选</span></span>
        <div className={chips}>
          {POTENTIAL_TIER_OPTIONS.map(t => (
            <PotChip key={t} active={filters.tiers.includes(t)} onClick={() => onToggleTag('tiers', t)}>{t}</PotChip>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>达人人设<br /><span className="font-normal text-amber-600/70">多选</span></span>
        <div className={chips}>
          {POTENTIAL_PERSONA_OPTIONS.map(t => (
            <PotChip key={t} active={filters.personas.includes(t)} onClick={() => onToggleTag('personas', t)}>{t}</PotChip>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>达人身份<br /><span className="font-normal text-amber-600/70">多选</span></span>
        <div className={chips}>
          {POTENTIAL_IDENTITY_OPTIONS.map(t => (
            <PotChip key={t} active={filters.identities.includes(t)} onClick={() => onToggleTag('identities', t)}>{t}</PotChip>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>内容维度<br /><span className="font-normal text-amber-600/70">多选</span></span>
        <div className={chips}>
          {POTENTIAL_DIM_OPTIONS.map(t => (
            <PotChip key={t} active={filters.dims.includes(t)} onClick={() => onToggleTag('dims', t)}>{t}</PotChip>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>女粉占比<br /><span className="font-normal text-amber-600/70">单选</span></span>
        <div className={chips}>
          {POTENTIAL_FEMALE_OPTIONS.map(t => (
            <PotChip key={t} active={filters.femaleDir === t} onClick={() => onSetFemaleDir(filters.femaleDir === t ? '' : t)}>
              {t === '偏女' ? '偏女（≥60%）' : t === '偏男' ? '偏男（女粉<40%）' : '均衡（40-60%）'}
            </PotChip>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-amber-100 flex items-center gap-2.5 flex-wrap">
        <p className="text-[10.5px] text-amber-700/90 flex items-center gap-1.5 flex-1 min-w-[200px]">
          <Sparkles className="w-3 h-3 shrink-0" />
          设置筛选条件后点下方 <b className="text-amber-900">「按此条件匹配达人」</b>即可发起查询；达人数量取上方配置区「星图达人推荐数量」，结果在本板块内展开。
        </p>
      </div>
    </div>
  );
}

function PotentialPoolCard({ data, loading }: {
  data: PotentialOverview | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3">
        <p className="text-xs text-amber-700 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          正在读取星图达人推荐库（精选联盟激励候选）…
        </p>
      </div>
    );
  }
  if (!data) return null;
  const pct = (c: number) => (data.sampled > 0 ? Math.round((c / data.sampled) * 100) : 0);
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/70 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-amber-600" />
          </span>
          <div>
            <p className="text-sm font-bold text-amber-900">星图达人推荐库 · 精选联盟激励候选</p>
            <p className="text-[11px] text-amber-700/80">
              {data.source} · 底表 {data.tables.length} 张 · 抽样读取 {data.sampled.toLocaleString('zh-CN')} 位
            </p>
          </div>
        </div>
        <span className="text-[10.5px] text-amber-700/90 flex items-center gap-1 whitespace-nowrap">
          <Filter className="w-3 h-3" />
          筛选条件已移至下方「星图达人推荐」板块
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-md bg-white/90 border border-amber-200 text-amber-900 font-mono font-bold">
          {data.totalDeclared.toLocaleString('zh-CN')} 位达人
        </span>
        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-amber-200 text-amber-800">
          {data.industryTags.length} 类万粉行业标签
        </span>
        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-amber-200 text-amber-800">
          {data.personas.length} 大人设 · {data.contentDims.length} 类内容维度
        </span>
        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-amber-200 text-amber-800">
          身份：{data.identity.map(i => i.name).join(' / ')}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-amber-200 text-amber-800">粉丝画像（8人群·6年龄·性别·Top5城市）</span>
      </div>

      <div className="mt-2.5">
        <p className="text-[10px] font-bold text-amber-700/80 mb-1">粉丝量级分布</p>
        <div className="flex flex-wrap gap-1.5">
          {data.fansTier.map(t => (
            <span key={t.name} className="text-[10.5px] px-1.5 py-0.5 rounded bg-white/70 border border-amber-100 text-gray-600">
              {t.name} <b className="text-amber-700 font-mono">{pct(t.count)}%</b>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2">
        <p className="text-[10px] font-bold text-amber-700/80 mb-1">热门万粉行业标签 Top10</p>
        <div className="flex flex-wrap gap-1.5">
          {data.industryTags.slice(0, 10).map(t => (
            <span key={t.name} className="text-[10.5px] px-1.5 py-0.5 rounded bg-white/70 border border-amber-100 text-gray-600">
              {t.name} <b className="text-amber-700 font-mono">{pct(t.count)}%</b>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-amber-200/70">
        <p className="text-[10.5px] text-amber-800/90 flex items-center gap-1">
          <Sparkles className="w-3 h-3 shrink-0" />
          按万粉标签/人设/内容维度/身份/量级/女粉方向筛选命中后，AI 再按与本品匹配度评估排序，用于新客开拓与冷启测试。
        </p>
        <a
          href={data.baseUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10.5px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 whitespace-nowrap"
        >
          查看底表 <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export default function InfluencerMatch({ product, framework, onGoKocFit }: {
  product: MatchProduct;
  framework: InfluencerType[];
  onGoKocFit?: () => void;
}) {
  const publicMode = isGhPages();
  const localStockCount = getLocalStockCount();
  const hasLocalStock = !publicMode || (localStockCount ?? 0) > 0;
  const [stockCount, setStockCount] = useState(10);
  const [incrCount, setIncrCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<MatchProgress | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState('');

  // —— 潜力星川达人库（精选联盟 Q3 刊例）：挂载即拉取概况，失败静默隐藏 ——
  const [potData, setPotData] = useState<PotentialOverview | null>(null);
  const [potLoading, setPotLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchPotentialOverview()
      .then(d => { if (alive) { setPotData(d); setPotLoading(false); } })
      .catch(() => { if (alive) setPotLoading(false); });
    return () => { alive = false; };
  }, []);

  // —— 星图达人推荐：独立筛选面板 + 独立查询（与存量/优质主匹配互不阻塞）——
  const [potPanelOpen, setPotPanelOpen] = useState(false);
  const [potFilters, setPotFilters] = useState<PotentialFilters>({ ...EMPTY_POTENTIAL_FILTERS });
  const [potPrefilled, setPotPrefilled] = useState(false);
  const [potCount, setPotCount] = useState(20);
  const [potMatching, setPotMatching] = useState(false);
  const [potProgress, setPotProgress] = useState<MatchProgress | null>(null);
  const [potResult, setPotResult] = useState<PotentialMatchResult | null>(null);
  const [potError, setPotError] = useState('');

  // —— 潜力星川达人推荐（星川分级达人池，规则评分+分层，不调 AI，与主匹配互不阻塞）——
  const [pnewCount, setPnewCount] = useState(30);
  const [pnewMatching, setPnewMatching] = useState(false);
  const [pnewResult, setPnewResult] = useState<PotentialNewResult | null>(null);
  const [pnewError, setPnewError] = useState('');

  // 概况加载后即按产品行业标签映射星图万粉标签预填（仅填入，不自动提交；面板内有「请确认或调整」提示）
  useEffect(() => {
    if (potData && !potPrefilled && product.tags.length > 0) {
      const allowed = [...potData.industryTags.map(t => t.name), ...POTENTIAL_EXTRA_INDUSTRIES];
      const pre = prefillXingtuTags(product.tags, allowed);
      if (pre.length) setPotFilters(f => ({ ...f, industries: pre }));
      setPotPrefilled(true);
    }
  }, [potData, potPrefilled, product.tags]);

  const togglePotFilter = (key: 'industries' | 'tiers' | 'personas' | 'identities' | 'dims', v: string) => {
    setPotFilters(f => ({
      ...f,
      [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v],
    }));
  };
  const setPotFemaleDir = (v: PotentialFilters['femaleDir']) => {
    setPotFilters(f => ({ ...f, femaleDir: v }));
  };
  const resetPotFilters = () => {
    setPotFilters({ ...EMPTY_POTENTIAL_FILTERS });
  };

  const runPotentialMatch = async () => {
    const cnt = clampNum(potCount, 1, MAX_PER_POOL_LARGE, 20);
    setPotCount(cnt);
    setPotMatching(true);
    setPotError('');
    setPotResult(null);
    setVisiblePot(PAGE_SIZE);
    setPotProgress({ phase: 'fetch', done: 0, total: 1, label: '星图达人库筛选中…' });
    try {
      const r = await matchPotentialInfluencers(product, potFilters, cnt, setPotProgress);
      setPotResult(r);
      if (!r.list.length) {
        setPotError('当前筛选条件下未找到星图达人，请放宽条件（减少勾选项/取消人设等条件）后重试。');
      } else {
        // GitHub 版埋点：星图达人推荐（完整名单 + 全部筛选条件）
        const fParts = [
          `请求人数:${cnt}`,
          potFilters.industries?.length ? `行业:${potFilters.industries.join('/')}` : '',
          potFilters.tiers?.length ? `量级:${potFilters.tiers.join('/')}` : '',
          potFilters.personas?.length ? `人设:${potFilters.personas.join('/')}` : '',
          potFilters.identities?.length ? `身份:${potFilters.identities.join('/')}` : '',
          potFilters.dims?.length ? `内容维度:${potFilters.dims.join('/')}` : '',
          potFilters.femaleDir ? `粉丝性别:${potFilters.femaleDir}` : '',
        ].filter(Boolean);
        trackUsage('达人匹配', product.productName, fParts.join('；'),
          `星图推荐匹配${r.list.length}位`,
          {
            matchType: '星图达人推荐',
            matchRound: 0,
            creatorCount: r.list.length,
            creators: formatCreatorList(r.list),
            fullInput: JSON.stringify({ 模式: '星图达人推荐匹配', 商品: product, 请求人数: cnt, 筛选条件: potFilters }),
          });
      }
    } catch (e: any) {
      setPotError(`星图达人查询失败：${String(e?.message || e)}，请重试。`);
    } finally {
      setPotMatching(false);
      setPotProgress(null);
    }
  };

  const runPotentialNewMatch = async (filters?: PnewFilters) => {
    const cnt = clampNum(pnewCount, 1, MAX_PER_POOL_LARGE, 30);
    setPnewCount(cnt);
    setPnewMatching(true);
    setPnewError('');
    setPnewResult(null);
    setVisiblePnew(PAGE_SIZE);
    try {
      const r = await matchPotentialNewInfluencers(product, cnt, filters);
      setPnewResult(r);
      if (!r.list.length) {
        const fetchErrs = (r.meta?.errors || []).filter(Boolean);
        if (fetchErrs.length) {
          // 底表拉取超时/限流导致的降级空结果（已自动补拉一次），不能误报成「行业无匹配」
          setPnewError(`潜力星川达人池数据查询失败（底表拉取超时或限流，已自动重试一次）：${String(fetchErrs[0]).slice(0, 110)}。请点「重新查询」再试。`);
        } else {
          setPnewError(`行业「${product.industry || '未指定'}」在潜力星川达人池中暂无匹配达人，可放宽筛选条件或检查商品行业是否填写正确。`);
        }
      } else {
        // GitHub 版埋点：潜力星川达人推荐（完整名单 + 四维筛选条件）
        const effFilters = filters ?? pnewFilters;
        const tierCounts = r.meta?.tierCounts || {};
        const fParts = [
          `请求人数:${cnt}`,
          effFilters.industries?.length ? `行业:${effFilters.industries.join('/')}` : '',
          effFilters.fansBuckets?.length ? `量级:${effFilters.fansBuckets.join('/')}` : '',
          effFilters.personas?.length ? `人设:${effFilters.personas.join('/')}` : '',
          effFilters.forms?.length ? `形式:${effFilters.forms.join('/')}` : '',
        ].filter(Boolean);
        trackUsage('达人匹配', product.productName, fParts.join('；'),
          `潜力星川匹配${r.list.length}位（标杆${tierCounts['标杆'] || 0}/主力${tierCounts['主力'] || 0}/潜力${tierCounts['潜力'] || 0}/储备${tierCounts['储备'] || 0}）`,
          {
            matchType: '潜力星川推荐',
            matchRound: 0,
            creatorCount: r.list.length,
            creators: formatCreatorList(r.list),
            fullInput: JSON.stringify({
              模式: '潜力星川达人推荐匹配', 商品: product, 请求人数: cnt,
              四维筛选: effFilters, 分层显隐: pnewTiers,
            }),
          });
      }
    } catch (e: any) {
      setPnewError(`潜力星川达人推荐失败：${String(e?.message || e)}，请重试。`);
    } finally {
      setPnewMatching(false);
    }
  };

  // 四维硬筛选变化的防抖自动重查 effect 定义在 pnewFilters 声明之后（见下方 state 区）

  // —— 「优化匹配方向」：结果页补充偏好后重新匹配（state 声明见下方 pnew 筛选区旁）——

  // —— 四类结果的分页展示（每类首屏 10 张卡片，点「加载更多」再展开 10 张）——
  const [visibleStock, setVisibleStock] = useState(PAGE_SIZE);
  const [visibleIncr, setVisibleIncr] = useState(PAGE_SIZE);
  const [visiblePnew, setVisiblePnew] = useState(PAGE_SIZE);
  const [visiblePot, setVisiblePot] = useState(PAGE_SIZE);
  // —— 潜力/星图两类推荐默认折叠，点击长条展开 ——
  const [pnewOpen, setPnewOpen] = useState(false);
  const [potOpen, setPotOpen] = useState(false);
  // —— 潜力星川「优化筛选」浮层 + 四维硬筛选（服务端执行）+ 分层开关（前端即时）——
  const [pnewRefineOpen, setPnewRefineOpen] = useState(false);
  const [pnewFilters, setPnewFilters] = useState<PnewFilters>({ ...EMPTY_PNEW_FILTERS });
  const [pnewTiers, setPnewTiers] = useState<string[]>([]);
  const togglePnewTier = (k: string) =>
    setPnewTiers(list => (list.includes(k) ? list.filter(x => x !== k) : [...list, k]));
  const togglePnewFilter = (key: keyof PnewFilters, v: string) =>
    setPnewFilters(f => ({
      ...f,
      [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v],
    }));
  const resetPnewFilters = () => {
    setPnewFilters({ ...EMPTY_PNEW_FILTERS });
    setPnewTiers([]);
  };
  const pnewFilterCount = pnewFilters.industries.length + pnewFilters.fansBuckets.length
    + pnewFilters.personas.length + pnewFilters.forms.length;
  /** 四维筛选摘要（结果区展示） */
  const pnewFilterSummary = (() => {
    const parts: string[] = [];
    if (pnewFilters.industries.length) parts.push(`行业 ${pnewFilters.industries.join('/')}`);
    if (pnewFilters.fansBuckets.length) parts.push(`量级 ${pnewFilters.fansBuckets.map(k => PNEW_FANS_BUCKET_OPTIONS.find(o => o.key === k)?.label || k).join('/')}`);
    if (pnewFilters.personas.length) parts.push(`人设 ${pnewFilters.personas.map(k => PNEW_PERSONA_OPTIONS.find(o => o.key === k)?.label || k).join('/')}`);
    if (pnewFilters.forms.length) parts.push(`内容形式 ${pnewFilters.forms.map(k => PNEW_FORM_OPTIONS.find(o => o.key === k)?.label || k).join('/')}`);
    return parts.join(' · ');
  })();

  // 四维硬筛选变化 → 防抖 450ms 自动重查（已有结果后才触发；分层开关不走服务端，不重查）
  const pnewFilterKey = JSON.stringify(pnewFilters);
  useEffect(() => {
    if (!pnewResult) return;
    const t = setTimeout(() => { void runPotentialNewMatch(pnewFilters); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pnewFilterKey]);

  // —— 「优化匹配方向」（存量/优质）：两个板块各自独立的就地内联面板，展开/收起不做任何滚动 ——
  const [stockRefineOpen, setStockRefineOpen] = useState(false);
  const [incrRefineOpen, setIncrRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [appliedNote, setAppliedNote] = useState('');   // 最近一次已生效的偏好（结果页展示）
  const REFINE_CHIPS = ['偏生活类达人', '偏专业测评', '侧重女性粉丝', '侧重男性粉丝', '侧重性价比内容', '需有同品类合作经验'];

  // —— 本地历史（IndexedDB，对外版）——
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);
  const [matchSavedTip, setMatchSavedTip] = useState(false);

  // 台账埋点：达人完整名单（每行一位，库别/粉丝/匹配分/分层等级/抖音ID），全量不截断
  const formatCreatorLine = (c: InfluencerCandidate): string => {
    const parts = [poolLabel(c.pool), c.name, `粉丝${formatFollowers(c.followers)}`];
    if (c.aiScore != null) parts.push(`匹配分${c.aiScore}`);
    if (c.tier) parts.push(c.tier);
    else if (c.level) parts.push(c.level);
    if (c.fansTier) parts.push(c.fansTier);
    if (c.identity) parts.push(c.identity);
    if (c.douyinId) parts.push(`ID:${c.douyinId}`);
    return `- ${parts.filter(Boolean).join('｜')}`;
  };
  const formatCreatorList = (list: InfluencerCandidate[]): string =>
    list.map(formatCreatorLine).join('\n');

  // 达人匹配迭代链：匹配轮次 + 上一条台账记录ID（每次优化重匹配都完整写一条新记录）
  const matchRoundRef = useRef(0);
  const lastMatchLogIdRef = useRef<string | undefined>(undefined);

  // —— 储存本次达人匹配结果到本地（IndexedDB，对外版）——
  const handleSaveMatch = async () => {
    const stock = result?.stock || [];
    const incr = result?.incr || [];
    const pnew = pnewResult?.list || [];
    const pot = potResult?.list || [];
    if (!stock.length && !incr.length && !pnew.length && !pot.length) return;
    setSavingMatch(true);
    try {
      await addInfluencerHistory({
        providerName: currentProviderName(),
        productName: product.productName,
        createdAt: Date.now(),
        conditions: {
          industry: product.industry, category: product.category,
          stockCount, incrCount, pnewCount, potCount,
          tags: product.tags || [],
          pnewFilters: { ...pnewFilters },
          potFilters: { ...potFilters },
        },
        pools: { stock, incr, pnew, pot },
        counts: {
          stock: stock.length, incr: incr.length,
          pnew: pnew.length, pot: pot.length,
          total: stock.length + incr.length + pnew.length + pot.length,
        },
        matchRound: matchRoundRef.current || (appliedNote ? 2 : 1),
        adjustNote: appliedNote,
      });
      setSaveConfirmOpen(false);
      setMatchSavedTip(true);
      window.setTimeout(() => setMatchSavedTip(false), 2800);
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setSavingMatch(false);
    }
  };

  const runMatch = async (note?: string) => {
    const sN = clampNum(stockCount, 1, MAX_PER_POOL_MAIN, 10);
    const iN = clampNum(incrCount, 1, MAX_PER_POOL_MAIN, 20);
    setStockCount(sN); setIncrCount(iN);
    setVisibleStock(PAGE_SIZE); setVisibleIncr(PAGE_SIZE);
    setLoading(true);
    setError('');
    setResult(null);
    // note === undefined：初始匹配（不带偏好）；传字符串：按优化方向重新匹配
    const isRefine = note !== undefined;
    const noteTrim = (isRefine ? note : '').trim();
    setAppliedNote(noteTrim);
    if (!isRefine) setRefineText('');
    setProgress({ phase: 'fetch', done: 0, total: 1,
      label: noteTrim ? '正在按优化方向重新匹配达人…'
        : MATCH_ONLY ? '正在拉取优质星川达人库…'
        : publicMode
          ? (hasLocalStock ? `正在读取本机存量达人库（${localStockCount} 位）并拉取优质星川达人库…` : '本机暂无存量达人库，跳过存量分析并拉取优质星川达人库…')
          : '正在拉取存量星川 / 优质星川达人库…' });
    try {
      const effProduct: MatchProduct = noteTrim ? { ...product, refineNote: noteTrim } : product;
      const r = await matchInfluencers(effProduct, sN, iN, setProgress);
      setResult(r);
      // GitHub 版埋点：达人匹配（初始匹配 + 优化方向重匹配均记录）；每次迭代完整写一条，不覆盖历史
      const inParts = [
        product.brand ? `品牌:${product.brand}` : '',
        product.industry ? `行业:${product.industry}` : '',
        product.category ? `品类:${product.category}` : '',
        product.tags && product.tags.length ? `标签:${product.tags.join('/')}` : '',
        noteTrim ? `偏好:${noteTrim}` : '',
      ].filter(Boolean);
      const round = isRefine ? matchRoundRef.current + 1 : 0;
      matchRoundRef.current = round;
      const parentId = isRefine ? lastMatchLogIdRef.current : undefined;
      const idPromise = trackUsage('达人匹配', product.productName, inParts.join('；'),
        `匹配${r.stock.length + r.incr.length}位，存量${r.stock.length}位/增量${r.incr.length}位`,
        {
          matchType: isRefine ? '优化重匹配' : '达人匹配',
          matchRound: round,
          adjustNote: isRefine ? noteTrim : '',
          parentId,
          creatorCount: r.stock.length + r.incr.length,
          creators: formatCreatorList([...r.stock, ...r.incr]),
          fullInput: JSON.stringify({
            模式: isRefine ? '达人匹配-优化方向重匹配' : '达人匹配',
            匹配轮次: round,
            商品: product,
            请求存量达人数: sN,
            请求优质达人数: iN,
            优化偏好: noteTrim,
            公开版本机存量库人数: publicMode ? getLocalStockCount() : undefined,
          }),
        });
      void idPromise.then(id => { if (id) lastMatchLogIdRef.current = id; });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // 🎬 演示模式：面板挂载后自动执行与「匹配达人」按钮完全相同的三路查询
  // （存量/优质核心匹配 + 潜力星川 + 星图推荐），四个达人池一次性展示，
  // 并展开两个默认折叠的潜力/星图区块。ref 幂等，仅执行一次；非 demo 模式不进入。
  const demoAutoRanRef = useRef(false);
  useEffect(() => {
    if (!isDemoMode() || demoAutoRanRef.current) return;
    demoAutoRanRef.current = true;
    setPnewOpen(true);
    setPotOpen(true);
    void runMatch();
    void runPotentialNewMatch();
    void runPotentialMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 达人导出埋点：记录导出范围（四库/分库）、达人数量与名单样例
  const handleExportCsv = (scope: ExportScope, list: InfluencerCandidate[]) => {
    exportInfluencersCsv(list, product.productName, scope);
    if (!list.length) return;
    const inParts = [
      product.brand ? `品牌:${product.brand}` : '',
      product.industry ? `行业:${product.industry}` : '',
      product.category ? `品类:${product.category}` : '',
      product.tags && product.tags.length ? `标签:${product.tags.join('/')}` : '',
    ].filter(Boolean);
    trackUsage('达人导出', product.productName, inParts.join('；'),
      `导出${list.length}位（${SCOPE_LABEL[scope]}）`,
      {
        creatorCount: list.length,
        creators: formatCreatorList(list),
        fullInput: JSON.stringify({ 模式: '达人导出', 导出范围: SCOPE_LABEL[scope], 商品: product }),
      });
  };

  const addChip = (chip: string) => {
    setRefineText(t => {
      const cur = t.trim();
      if (cur.includes(chip)) return cur;
      return cur ? `${cur}；${chip}` : chip;
    });
  };

  const handleRefine = async () => {
    const note = refineText.trim();
    if (!note || loading) return;
    setAppliedNote(note);
    setStockRefineOpen(false);
    setIncrRefineOpen(false);
    await runMatch(note);
  };

  /** 标题栏「优化筛选」：就地展开/收起本板块内联面板（纯 state 切换，无任何滚动/锚点逻辑） */
  const toggleStockRefine = () => {
    setStockRefineOpen(o => {
      if (!o) setRefineText(prev => (prev.trim() ? prev : (appliedNote || '')));
      return !o;
    });
  };
  const toggleIncrRefine = () => {
    setIncrRefineOpen(o => {
      if (!o) setRefineText(prev => (prev.trim() ? prev : (appliedNote || '')));
      return !o;
    });
  };

  const totalBatches = progress?.phase === 'score' ? progress.total : 0;
  const doneBatches = progress?.phase === 'score' ? progress.done : 0;
  const pct = totalBatches > 0 ? Math.round((doneBatches / totalBatches) * 100) : (progress?.phase === 'fetch' ? 8 : 0);

  // 「优化匹配方向」内联面板内容（存量/优质共用；作用于全部四类达人重新匹配）
  const renderRefineDirPanel = (onClose: () => void) => (
    <div>
      <p className="text-xs font-bold text-brand-800 flex items-center gap-1.5 mb-1">
        <RefreshCw className="w-3.5 h-3.5 text-brand-600" /> 优化匹配方向（整体筛选 · 作用于全部四类达人）
      </p>
      <p className="text-[11px] text-gray-500 leading-relaxed mb-2.5">
        对推荐结果不满意？补充偏好（如偏生活类、侧重男性粉丝、需有同品类合作经验），点「重新匹配」后 AI 将对全部四类达人重新筛选评估。
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {REFINE_CHIPS.map(c => (
          <button key={c} type="button" onClick={() => addChip(c)}
            className="px-2.5 py-1 rounded-full bg-white border border-brand-200 text-[11px] font-medium text-brand-700 hover:bg-brand-100 transition">
            + {c}
          </button>
        ))}
      </div>
      <textarea
        value={refineText}
        onChange={e => setRefineText(e.target.value)}
        rows={2}
        placeholder="例：更偏重生活类达人、内容偏男性用户视角、最好有母婴品类合作经验…"
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={() => void handleRefine()} disabled={!refineText.trim() || loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md shadow-brand-200">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 重新匹配
        </button>
        <button type="button" onClick={onClose}
          className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
          收起
        </button>
      </div>
    </div>
  );

  // 已生效优化方向的常驻提示卡（内联在存量标题下方；「调整」就地展开存量面板，不滚动）
  const refineAppliedNode = appliedNote ? (
    <div className="mt-3 mb-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 flex items-start gap-2.5">
      <BadgeCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-brand-800">已按优化方向重新推荐</p>
        <p className="text-xs text-brand-700/80 mt-0.5 break-words">{appliedNote}</p>
      </div>
      <button type="button" onClick={() => { setRefineText(appliedNote); setStockRefineOpen(true); }}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-[11px] font-bold text-brand-700 hover:bg-brand-100 transition">
        <RefreshCw className="w-3 h-3" /> 调整
      </button>
    </div>
  ) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md shadow-brand-200 shrink-0">
          <Target className="w-[18px] h-[18px] text-white" />
        </div>
        <div>
          <h2 className="text-[24px] leading-tight font-extrabold tracking-tight text-gray-900 flex items-center gap-2">
            达人匹配推荐
            <span className="text-[10px] font-bold text-brand-600 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded-md self-center mt-1">达人匹配</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{MATCH_ONLY
            ? '基于产品分析结果 · 优质星川 AI 匹配 · 潜力星川达人推荐（规则测算分层）· 星图达人推荐独立筛选查询'
            : '基于产品分析结果 · 存量星川 + 优质星川 AI 匹配 · 潜力星川达人推荐（规则测算分层）· 星图达人推荐独立筛选查询'}</p>
        </div>
        {publicMode && (
          <button
            type="button" onClick={() => setHistoryOpen(true)}
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ListOrdered className="w-3.5 h-3.5" /> 历史记录
          </button>
        )}
      </div>

      {/* 达人板块协同入口：四库批量匹配 → 单 KOC 深度契合度论证（美妆/个护）；独立匹配站锁定单模块，隐藏跨模块入口 */}
      {onGoKocFit && !MATCH_ONLY && (
        <button
          type="button" onClick={onGoKocFit}
          className="mb-5 w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50/90 to-pink-50/60 px-4 py-3 text-left hover:border-rose-300 hover:shadow-sm transition"
        >
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0 shadow-md shadow-rose-200">
            <Heart className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold text-rose-700">KOC 契合度论证 <span className="ml-1 text-[10.5px] font-medium text-rose-500 border border-rose-200 bg-white/70 px-1.5 py-0.5 rounded-md">美妆/个护 · 前置费论证</span></span>
            <span className="block text-[11.5px] text-rose-600/70 mt-0.5">名单锁定单个 KOC 后：1 商品 × 1 达人，凭视频截图/公开信息/评论证据输出五轴契合度、八维制作能力与前置费建议，附对外版报告</span>
          </span>
          <ExternalLink className="w-4 h-4 text-rose-400 shrink-0" />
        </button>
      )}

      {/* AI 达人画像方向（来自第二部分 wrap 阶段；FaaS 已保证尽量补齐3个，标题/列数按实际数量渲染） */}
      {framework.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-700 mb-2.5">AI 建议达人画像方向（{framework.length} 类）</p>
          <div className={`grid grid-cols-1 gap-3 ${framework.length >= 3 ? 'sm:grid-cols-3' : framework.length === 2 ? 'sm:grid-cols-2' : ''}`}>
            {framework.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gradient-to-b from-brand-50/50 to-white p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                  <p className="text-xs font-bold text-gray-800 leading-snug">{p.persona}</p>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{p.reason}</p>
                <p className="text-[10px] text-gray-400 mt-1.5">建议量级：{p.followerTier}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 顶部「星图达人推荐库·概况大卡」已移除：与底部「星图达人推荐 · 精选联盟激励候选」结果板块重复；
          概况数据 potData 仍用于底部板块内的筛选面板，挂载即拉取的逻辑保持不变。 */}

      {/* 配置区：四库数量输入与匹配按钮（demo 与正式版完全一致，demo 仅预填数量并自动开跑） */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
        <p className="text-[11px] text-gray-500 mb-3 flex items-start gap-1.5">
          <BadgeCheck className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
          <span>
            已自动带入第二部分结果：
            <span className="font-bold text-gray-700">{product.productName || '—'}</span>
            {product.industry && <span className="text-gray-600">（{product.industry}）</span>}
            {product.tags.length > 0 && <span className="text-brand-600"> · 标签 {product.tags.join('/')}</span>}
            {product.creativeSummary && (
              <span className="block mt-1 text-brand-600/90">↳ 3 条内容创意方向与上方 AI 达人画像已一并传入匹配评估，无需重填</span>
            )}
          </span>
        </p>
        {publicMode && !MATCH_ONLY && (
          <div className={`mb-3 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${hasLocalStock ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {hasLocalStock
              ? `已读取本机「我的达人库」${localStockCount} 位；存量匹配只使用该库，不再使用平台历史存量库。`
              : '本机尚未上传存量达人库：本次将跳过存量达人分析，优质星川、潜力星川、星图推荐三个达人池仍正常匹配。可先前往「达人自助打标」上传 CSV。'}
          </div>
        )}
        <div className="flex items-end gap-3 flex-wrap">
          {!MATCH_ONLY && (
          <label className="block">
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 mb-1">
              {publicMode ? '我的存量达人数量' : '存量星川达人数量'}
              <span className="text-[9px] font-bold text-white bg-blue-600 px-1 py-px rounded leading-tight">核心</span>
              <InfoTip text={publicMode
                ? '仅使用你在「达人自助打标」中上传并保存在本机浏览器的达人库；未上传时自动跳过存量分析。'
                : '你与代理已建联/有合作记录的达人，优先维系复购关系。'} width="w-60" />
            </span>
            <input
              type="number" min={1} max={publicMode ? Math.max(1, Math.min(MAX_PER_POOL_MAIN, localStockCount ?? 0)) : MAX_PER_POOL_MAIN} value={stockCount}
              disabled={loading || !hasLocalStock}
              onChange={e => setStockCount(clampNum(Number(e.target.value), 1, publicMode ? Math.max(1, Math.min(MAX_PER_POOL_MAIN, localStockCount ?? 0)) : MAX_PER_POOL_MAIN, 10))}
              className="w-28 px-3 py-2.5 rounded-xl border-2 border-blue-600 bg-blue-50/70 text-sm font-bold text-blue-900 shadow-sm shadow-blue-200/60 focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-50"
            />
          </label>
          )}
          <label className="block">
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 mb-1">
              优质星川达人数量
              <span className="text-[9px] font-bold text-white bg-blue-600 px-1 py-px rounded leading-tight">核心</span>
              <InfoTip text="经平台筛选、有良好星川合作记录的精选推荐库达人。" width="w-52" />
            </span>
            <input
              type="number" min={1} max={MAX_PER_POOL_MAIN} value={incrCount}
              disabled={loading}
              onChange={e => setIncrCount(clampNum(Number(e.target.value), 1, MAX_PER_POOL_MAIN, 20))}
              className="w-28 px-3 py-2.5 rounded-xl border-2 border-blue-600 bg-blue-50/70 text-sm font-bold text-blue-900 shadow-sm shadow-blue-200/60 focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-violet-700 mb-1">
              潜力星川达人推荐数量
              <InfoTip text="星川分级达人池（已有星川等级 S0-S5、星图消耗与交付记录）：行业硬门槛 + 星川等级/交付项目/消耗/电商等级规则测算，按标杆/主力/潜力/储备四层分层展示。" width="w-60" />
            </span>
            <input
              type="number" min={1} max={MAX_PER_POOL_LARGE} value={pnewCount}
              disabled={pnewMatching || loading}
              onChange={e => setPnewCount(clampNum(Number(e.target.value), 1, MAX_PER_POOL_LARGE, 30))}
              className="w-28 px-3 py-2.5 rounded-xl border border-violet-300 bg-violet-50/60 text-sm text-violet-900 font-semibold focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 transition-all disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-amber-700 mb-1">
              星图达人推荐数量
              <InfoTip text="星图达人推荐（1.37 万人，与前三类库完全独立）：按刊例价 / 粉丝量级 / 行业画像 / CPM / GMV 门槛六维硬筛选 + AI 打分，命中不足自动逐级放宽；池子最大、新面孔多，适合拓圈补增量。" width="w-60" />
            </span>
            <input
              type="number" min={1} max={MAX_PER_POOL_LARGE} value={potCount}
              disabled={potMatching || loading}
              onChange={e => setPotCount(clampNum(Number(e.target.value), 1, MAX_PER_POOL_LARGE, 20))}
              className="w-28 px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50/60 text-sm text-amber-900 font-semibold focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition-all disabled:opacity-50"
            />
          </label>
          <button
            onClick={() => { void runMatch(); void runPotentialNewMatch(); void runPotentialMatch(); }}
            disabled={loading || potMatching || pnewMatching}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-600 text-white text-sm font-bold shadow-lg shadow-brand-200 hover:shadow-xl hover:from-brand-700 hover:to-brand-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            {loading ? '存量/优质匹配中…' : '匹配达人'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">{publicMode
          ? `我的存量达人仅取本机上传库（当前 ${localStockCount ?? 0} 位，未上传则跳过）；优质星川单类最多 ${MAX_PER_POOL_MAIN} 位，潜力星川 / 星图推荐单类最多 ${MAX_PER_POOL_LARGE} 位；每类默认先展示 ${PAGE_SIZE} 位，点「点开展现剩余」一次展开全部、可再收起；四类达人沿用相同分析与匹配评估逻辑。`
          : `存量星川 / 优质星川单类最多 ${MAX_PER_POOL_MAIN} 位，潜力星川 / 星图推荐单类最多 ${MAX_PER_POOL_LARGE} 位；每类默认先展示 ${PAGE_SIZE} 位，点「点开展现剩余」一次展开全部、可再收起；潜力星川与星图推荐结果默认折叠，点标题长条展开；每个板块标题栏可「优化筛选」「一键导出」；存量/优质先出结果，两类推荐异步追加（约 30-120 秒）`}</p>
      </div>

      {/* Loading */}
      <AnimatePresence>
        {loading && progress && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/50 p-4 flex items-center gap-4"
          >
            <Loader2 className="w-5 h-5 text-brand-600 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-800">正在为产品匹配达人…</p>
              <p className="text-xs text-gray-500 mt-0.5">{progress.label}</p>
              <div className="mt-2 h-1.5 rounded-full bg-brand-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-brand-500 transition-all duration-500"
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex gap-3 text-[10px] text-gray-400">
                <span className={progress.phase === 'fetch' ? 'text-brand-600 font-bold' : ''}>
                  {progress.phase !== 'fetch' ? '✓' : '…'} 拉取达人库
                </span>
                <span className={progress.phase === 'score' ? 'text-brand-600 font-bold' : ''}>
                  {progress.phase === 'score' ? '…' : '·'} AI 相关性评估
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-2xl bg-danger-bg border border-danger-line px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-ink shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-danger-ink">达人匹配失败</p>
            <p className="text-xs text-danger-ink mt-0.5">{error}</p>
          </div>
          <button onClick={() => runMatch(appliedNote || undefined)}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-danger-line text-xs font-bold text-danger-ink hover:bg-danger-bg transition-all">
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}

      {/* 结果 */}
      {result && !loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div id="im-anchor-result" className="scroll-mt-20" />
          {/* 达人流动机制：②③④ 建联成功后经 xc-tagger 打标沉淀进 ① 存量库；独立匹配站不含存量库与打标，隐藏 */}
          {!MATCH_ONLY && <TalentFlowBlock />}
          {/* 「优化匹配方向」面板已改为各板块标题下方的就地内联折叠面板（InlineRefinePanel），不再顶在结果列表最上方、不触发滚动 */}

          {/* 排序说明（左）+ 导出全部达人（右）：各板块标题栏另有单独「一键导出」 */}
          <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <ListOrdered className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>
                {MATCH_ONLY ? (
                  <>按 AI 综合匹配分<strong className="text-gray-600 font-bold">由高到低</strong>排列，共
                  <strong className="text-gray-600 font-bold tabnum"> {result.incr.length} </strong>位（优质星川）</>
                ) : (
                  <>按 AI 综合匹配分<strong className="text-gray-600 font-bold">由高到低</strong>排列，共
                  <strong className="text-gray-600 font-bold tabnum"> {result.stock.length + result.incr.length} </strong>位
                  （存量星川 {result.stock.length} · 优质星川 {result.incr.length}）</>
                )}
              </span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-0.5">金/银/铜徽章标记各组前三</span>
            </div>
            <ExportActionBtn
              onClick={() => handleExportCsv('all', [...result.stock, ...result.incr, ...(pnewResult?.list ?? []), ...(potResult?.list ?? [])])}
              disabled={result.stock.length + result.incr.length + (pnewResult?.list.length ?? 0) + (potResult?.list.length ?? 0) === 0}
            >
              导出全部达人（{result.stock.length + result.incr.length + (pnewResult?.list.length ?? 0) + (potResult?.list.length ?? 0)}）
            </ExportActionBtn>
          </div>

          {publicMode && !hasLocalStock && !MATCH_ONLY && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong>存量达人分析已跳过：</strong>本机尚未上传「我的达人库」。其余三个达人池的匹配结果不受影响。
            </div>
          )}

          <div id="im-anchor-list" className="scroll-mt-20" />
          {!MATCH_ONLY && result.stock.length > 0 && (
            <>
              <GroupHeader pool="stock" count={result.stock.length}
                note={publicMode ? `服务商本机上传的存量达人，沿用原匹配逻辑按与本品匹配度排序 Top ${result.stock.length}` : undefined}
                onRefine={toggleStockRefine} refineActive={stockRefineOpen}
                onExport={() => handleExportCsv('stock', result.stock)} />
              {/* 「优化匹配方向」就地内联折叠面板：展开/收起只做高度动画，页面不滚动 */}
              <InlineRefinePanel open={stockRefineOpen} theme="brand">
                {renderRefineDirPanel(() => setStockRefineOpen(false))}
              </InlineRefinePanel>
              {/* 已生效的优化方向常驻提示卡 */}
              {refineAppliedNode}
              <PoolLogicNote kind="stock" theme="brand" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.stock.slice(0, visibleStock).map((inf, i) => <InfluencerCard key={inf.cid} inf={inf} rank={i} />)}
              </div>
              <ListPagerControls total={result.stock.length} visible={Math.min(visibleStock, result.stock.length)}
                onExpandAll={() => setVisibleStock(result.stock.length)} onCollapse={() => setVisibleStock(PAGE_SIZE)} theme="brand" />
            </>
          )}
          {result.incr.length > 0 && (
            <>
              {/* 优质星川板块：独立的就地内联面板（不再共享/跳转存量板块，点击不滚动） */}
              <GroupHeader pool="incr" count={result.incr.length}
                onRefine={toggleIncrRefine} refineActive={incrRefineOpen}
                onExport={() => handleExportCsv('incr', result.incr)} />
              <InlineRefinePanel open={incrRefineOpen} theme="brand">
                {renderRefineDirPanel(() => setIncrRefineOpen(false))}
              </InlineRefinePanel>
              {/* 存量为空时，已生效优化方向提示卡兜底挂在优质星川面板下方 */}
              {result.stock.length === 0 && refineAppliedNode}
              <PoolLogicNote kind="incr" theme="brand" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.incr.slice(0, visibleIncr).map((inf, i) => <InfluencerCard key={inf.cid} inf={inf} rank={i} />)}
              </div>
              <ListPagerControls total={result.incr.length} visible={Math.min(visibleIncr, result.incr.length)}
                onExpandAll={() => setVisibleIncr(result.incr.length)} onCollapse={() => setVisibleIncr(PAGE_SIZE)} theme="brand" />
            </>
          )}
        </motion.div>
      )}

      {/* —— 潜力星川达人推荐 · 折叠长条（默认收起；星川分级池规则评分+分层，不调 AI；挂载即自动跑）—— */}
      <CollapsibleSection
        open={pnewOpen}
        onToggle={() => setPnewOpen(o => !o)}
        icon={<Gem className="w-4 h-4" />}
        title="潜力星川达人推荐 · 星川分级达人池"
        count={pnewResult?.list.length ?? 0}
        loading={pnewMatching}
        error={!pnewMatching && !!pnewError}
        theme="violet"
        rightSlot={
          <>
            <RefineActionBtn theme="violet" active={pnewRefineOpen}
              onClick={() => { setPnewRefineOpen(o => !o); setPnewOpen(true); }}>
              {pnewFilterCount ? `优化筛选 · ${pnewFilterCount}` : '优化筛选'}
            </RefineActionBtn>
            <ExportActionBtn
              onClick={() => handleExportCsv('potential_new', pnewResult?.list ?? [])}
              disabled={!pnewResult || pnewResult.list.length === 0}>
              一键导出
            </ExportActionBtn>
          </>
        }
      >
          {/* 「优化筛选」就地内联折叠面板（四维硬筛选+分层开关）：展开/收起只做高度动画，页面不滚动 */}
          <InlineRefinePanel open={pnewRefineOpen} theme="violet">
            <PnewRefinePanel
              filters={pnewFilters}
              tiers={pnewTiers}
              facets={pnewResult?.meta?.facets}
              tierCounts={pnewResult?.meta?.tierCounts || {}}
              matching={pnewMatching}
              matched={pnewResult?.meta?.eligible || pnewResult?.meta?.matched || 0}
              onToggleFilter={togglePnewFilter}
              onToggleTier={togglePnewTier}
              onReset={resetPnewFilters}
              onClose={() => setPnewRefineOpen(false)}
            />
          </InlineRefinePanel>

          {!pnewMatching && !pnewError && pnewResult && (
            <PoolLogicNote kind="pnew" theme="violet" />
          )}

          {!pnewMatching && pnewError && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-violet-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-violet-600 shrink-0" /> {pnewError}
              </p>
              <button type="button" onClick={() => void runPotentialNewMatch(pnewFilters)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> 重新查询
              </button>
            </div>
          )}
          {!pnewMatching && pnewResult && pnewResult.list.length > 0 && (() => {
            // 四维硬筛选在服务端完成（pnewResult 已是筛选+配额取样后的名单）；分层开关仅前端即时显隐
            const filtered = pnewResult.list.filter(inf => !pnewTiers.length || pnewTiers.includes(inf.tier || ''));
            const shown = filtered.slice(0, visiblePnew);
            const activeFilterText = [
              pnewFilterSummary,
              ...(pnewTiers.length ? [pnewTiers.map(k => POTENTIAL_NEW_TIERS.find(t => t.key === k)?.label || k).join('/') + '层'] : []),
            ].filter(Boolean);
            return (
            <div>
              <p className="text-[11px] text-violet-700/80 mb-1">
                行业命中 {(pnewResult.meta.eligible || pnewResult.meta.matched).toLocaleString('zh-CN')} / {pnewResult.meta.pulled.toLocaleString('zh-CN')} 位 ·
                {' '}🥇标杆 {pnewResult.meta.tierCounts['标杆'] || 0} · 🥈主力 {pnewResult.meta.tierCounts['主力'] || 0} ·
                {' '}🥉潜力 {pnewResult.meta.tierCounts['潜力'] || 0} · ⚪储备 {pnewResult.meta.tierCounts['储备'] || 0} ·
                规则测算取 Top {pnewResult.list.length}
                {activeFilterText.length > 0 && (
                  <span className="text-violet-600 font-bold"> · 筛选：{activeFilterText.join(' · ')}（当前展示 {filtered.length} 位）</span>
                )}
              </p>
              {filtered.length === 0 && (
                <p className="text-[11px] text-violet-500 py-3 text-center">当前分层选择下暂无达人，可点标题栏「优化筛选」在浮层中调整或重置。</p>
              )}
              {pnewResult.meta.relaxedNote && (
                <p className="text-[10.5px] text-violet-600 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" /> {pnewResult.meta.relaxedNote}
                </p>
              )}
              {/* 跨分层统一双列网格：名单已按 标杆→主力→潜力→储备 + 层内分数排序，卡片自带分层徽章，保证铺满不留空列 */}
              {shown.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                  {shown.map(inf => (
                    <InfluencerCard key={inf.cid} inf={inf} rank={-1} />
                  ))}
                </div>
              )}
              <ListPagerControls total={filtered.length} visible={Math.min(visiblePnew, filtered.length)}
                onExpandAll={() => setVisiblePnew(filtered.length)} onCollapse={() => setVisiblePnew(PAGE_SIZE)} theme="violet" />
            </div>
            );
          })()}
        </CollapsibleSection>

      {/* —— 星图达人推荐 · 折叠长条（默认收起；内嵌筛选面板，未查询也可展开设置条件后发起；独立查询，与主匹配互不阻塞）—— */}
      <CollapsibleSection
        open={potOpen}
        onToggle={() => setPotOpen(o => !o)}
        icon={<Search className="w-4 h-4" />}
        title="星图达人推荐 · 精选联盟激励候选"
        count={potResult?.list.length ?? 0}
        loading={potMatching}
        error={!potMatching && !!potError}
        theme="amber"
        rightSlot={
          <>
            <RefineActionBtn theme="amber" active={potPanelOpen}
              onClick={() => { setPotPanelOpen(o => !o); setPotOpen(true); }}>
              优化筛选
            </RefineActionBtn>
            <ExportActionBtn
              onClick={() => handleExportCsv('potential', potResult?.list ?? [])}
              disabled={!potResult || potResult.list.length === 0}>
              一键导出
            </ExportActionBtn>
          </>
        }
      >
          {!potMatching && !potError && potResult && (
            <PoolLogicNote kind="potential" theme="amber" />
          )}
          {/* 板块内嵌筛选面板（原概况卡内的 PotentialQueryPanel 移至此处） */}
          {potPanelOpen && potData && (
            <div className="mb-3">
              <PotentialQueryPanel
                data={potData}
                filters={potFilters}
                onToggleTag={togglePotFilter}
                onSetFemaleDir={setPotFemaleDir}
                prefilled={potPrefilled}
                onReset={resetPotFilters}
              />
              <div className="mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => void runPotentialMatch()} disabled={potMatching}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-sm hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {potMatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {potMatching ? '筛选评估中…' : (potResult ? '按此条件重新匹配' : '按此条件匹配达人')}
                </button>
                <span className="text-[10.5px] text-amber-700/70">数量取上方配置区「星图达人推荐数量」</span>
              </div>
            </div>
          )}

          {potMatching && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-amber-900">{potProgress?.label || '星图达人筛选与 AI 评估中…'}</p>
              <p className="text-[11px] text-amber-700/70 mt-1">激励候选库万人规模筛选 + AI 评估，约需 30-60 秒</p>
            </div>
          )}
          {!potMatching && potError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> {potError}
              </p>
              <button type="button" onClick={() => void runPotentialMatch()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold shadow-sm hover:from-amber-600 hover:to-orange-600 transition">
                <RefreshCw className="w-3 h-3" /> 重试查询
              </button>
            </div>
          )}
          {!potMatching && !potError && (!potResult || potResult.list.length === 0) && (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-6 text-center">
              <p className="text-xs font-bold text-amber-900">尚未查询星图达人</p>
              <p className="text-[11px] text-amber-700/80 mt-1">点右上角「优化筛选」设置行业 / 量级 / 人设等条件，再点「按此条件匹配达人」发起查询。</p>
              <button type="button" onClick={() => { setPotPanelOpen(true); setPotOpen(true); }}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-amber-300 text-amber-700 text-xs font-bold hover:bg-amber-100 transition">
                <Filter className="w-3.5 h-3.5" /> 设置筛选条件
              </button>
            </div>
          )}
          {!potMatching && potResult && potResult.list.length > 0 && (
            <div>
              <p className="text-[11px] text-amber-700/80 mb-1">
                底表抽样 {potResult.meta.pulled.toLocaleString('zh-CN')} 位 · 命中筛选 {potResult.meta.matched.toLocaleString('zh-CN')} 位 ·
                {' '}AI 评估 Top {potResult.list.length}，前三名带排名徽章
              </p>
              <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-amber-400 shrink-0" />
                  {describePotFilters(potResult.meta.filters)}
                </p>
              </div>
              {potResult.meta.relaxedNote && (
                <p className="text-[10.5px] text-amber-700 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" /> {potResult.meta.relaxedNote}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {potResult.list.slice(0, visiblePot).map((inf, i) => <InfluencerCard key={inf.cid} inf={inf} rank={i} />)}
              </div>
              <ListPagerControls total={potResult.list.length} visible={Math.min(visiblePot, potResult.list.length)}
                onExpandAll={() => setVisiblePot(potResult.list.length)} onCollapse={() => setVisiblePot(PAGE_SIZE)} theme="amber" />
            </div>
          )}
        </CollapsibleSection>

      {/* —— 候选池汇总页脚：存量/优质/潜力三组，置于页面最底部 —— */}
      {(result || potResult || pnewResult) && (
        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-gray-500">
            候选池：存量星川 <b className="text-gray-700 tabnum">{result?.stock.length ?? 0}</b> 位 / 优质星川 <b className="text-gray-700 tabnum">{result?.incr.length ?? 0}</b> 位 / 潜力星川推荐 <b className="text-violet-700 tabnum">{pnewMatching ? '…' : (pnewResult?.list.length ?? 0)}</b> 位 / 星图达人推荐 <b className="text-amber-700 tabnum">{potMatching ? '…' : (potResult?.list.length ?? 0)}</b> 位 经 AI 评估排序；完整名单可前往多维表格查看。
          </p>
          <a href={LARK_BASE_URL} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-900">
            打开星川AI工作台 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* —— 储存到达人匹配记录（对外版本地历史 influencer-history）—— */}
      {publicMode && (result || potResult || pnewResult) && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button" onClick={() => setSaveConfirmOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border-2 border-emerald-300 text-[13px] font-bold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-colors shadow-sm"
          >
            💾 储存到达人匹配记录
          </button>
          {matchSavedTip && (
            <p className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已保存到达人匹配记录（本机），可在「历史记录」查看
            </p>
          )}
        </div>
      )}

      {/* 储存确认 / 匹配历史 弹窗 */}
      <ConfirmDialog
        open={saveConfirmOpen}
        title="是否储存本次达人匹配结果？"
        confirmText="确认储存"
        confirmTone="emerald"
        confirming={savingMatch}
        onConfirm={() => void handleSaveMatch()}
        onClose={() => setSaveConfirmOpen(false)}
      >
        将保存匹配条件、四库完整达人名单（含 ID/标签/分数等全字段）、各库数量、匹配轮次与调整说明，仅存储在本机浏览器。
      </ConfirmDialog>
      <MatchHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}

/** 筛选条件摘要（星图达人结果区展示） */
function describePotFilters(f: PotentialFilters): string {
  const parts: string[] = [];
  if (f.industries.length) parts.push(`行业 ${f.industries.join('/')}`);
  if (f.tiers.length) parts.push(`量级 ${f.tiers.join('/')}`);
  if (f.personas.length) parts.push(`人设 ${f.personas.join('/')}`);
  if (f.identities.length) parts.push(f.identities.join('/'));
  if (f.dims.length) parts.push(`内容 ${f.dims.join('/')}`);
  if (f.femaleDir) parts.push(`女粉${f.femaleDir}`);
  return parts.length ? parts.join(' · ') : '不限条件（全量底表按与本品匹配度排序）';
}
