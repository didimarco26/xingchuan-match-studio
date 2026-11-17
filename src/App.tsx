import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Loader2, Link2, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  ExternalLink, Users, Gauge, FileText, Clapperboard, ShieldAlert, Lightbulb,
  Target, Package, RefreshCw, TriangleAlert, ChevronDown, ChevronUp, X, Film,
  Pencil, History, Send, ArrowRight, ArrowUp, Workflow, Calculator, Flame, User, Tag, ClipboardList,
  Box, LayoutGrid, Search, Bell, Store, Sparkle, Diamond, MessageSquareCode, SquareTerminal,
  Save, Download, ScanSearch, Heart,
} from 'lucide-react';
import {
  INTERNAL_INDUSTRIES, INFLUENCER_TAGS, DEFAULT_TAGS_BY_INDUSTRY, SCORE_MAX,
  LARK_BASE_URL, extractFromUrl, extractFirstUrl, analyzeBriefPhase, generateScriptsPhase, computeGrade,
  fetchCaseReasons, exportScript, exportScriptDoc, refineScript, scriptToText, fetchScoringAi, fetchScoringReport, FAAS_STAGE_ORDER,
  fetchHotMarketingPlan,
  type ProductInput, type AnalyzeResult, type InternalIndustry,
  type ScoreItem, type CreativeDirection, type FaasStage, type BriefDirection,
  type MoreCaseItem, type ScriptExport, type ScoringAi, type ScoringContext, type ScoringReport,
  type HotMarketingPlan, type MktWindow, type MktScenario, type MktStyle,
  type ScriptDocResult,
  splitVoiceovers,
} from './lib/api';
import { CATEGORIES, type CategoryBaseline } from './data/scoring-categories';
import { scoreProduct, suggestCategory, LEVEL_META, type ScoreResult } from './lib/scoring';
import type { MatchProduct } from './lib/influencer-match';
import InfluencerMatch from './components/InfluencerMatch';
import { MATCH_ONLY } from './match-only';
import DemoBoard from './components/DemoBoard';
import DemoControls from './components/DemoControls';
import ScoringPanel from './components/ScoringPanel';
import RefineHotNews from './components/RefineHotNews';
import HotMarketingDockBody from './components/HotMarketingDock';
import RefineBreakdown from './components/RefineBreakdown';
import ScoringReportSection from './components/ScoringReportCard';
import GhHistory from './components/GhHistory';
import GhGate from './components/GhGate';
import NameLogin from './components/NameLogin';
import SelfTagPanel from './components/SelfTagPanel';
import IdLookupPanel from './components/IdLookupPanel';
import KocFitPanel from './components/KocFitPanel';
import ConceptVideoButton from './components/ConceptVideoButton';
import TaggerRecordsPanel from './components/TaggerRecordsPanel';
import BaopinLibrary from './components/BaopinLibrary';
import MyWorkbench from './components/MyWorkbench';
import BaopinPicker from './components/BaopinPicker';
import ConfirmDialog from './components/ConfirmDialog';
import ContentHistoryModal from './components/ContentHistoryModal';
import { MaterialStrategyCard } from './components/ContentExtras';
import {
  downloadTextFile,
} from './lib/content-extra';
import {
  addContentHistory, currentProviderName,
  type ContentDirectionSnapshot, type ContentIteration,
} from './lib/local-history-db';
import type { BaopinItem } from './lib/baopin';
import { isGhPages, isPublicHost, ghAppTitle, ghAppSubtitle } from './lib/gh';
import { useDemoMode, isDemoMode, demoLatency } from './lib/demo';
import {
  DEMO_FORM, DEMO_SCENT_FORM,
} from './lib/demo-data';
import { getUserName, trackUsage, displayIdentity } from './lib/user';
import { upsertBaopin } from './lib/baopin';

// ============================================================
// 右侧辅助面板（热点营销参考 / 千川爆款素材灵感）外壳类：
// 窄屏 fixed 右侧抽屉（z-40 浮于遮罩 z-30 之上）；宽屏 xl 改为 sticky 内嵌画布右侧空白区。
// 元素常驻挂载（hidden 折叠），已上传视频/勾选/榜单状态不随开关丢失。
// ============================================================
const SIDE_REF_PANEL_CLS =
  'fixed inset-y-0 right-0 z-40 w-[360px] max-w-[88vw] bg-white shadow-2xl flex flex-col '
  + 'xl:sticky xl:top-[76px] xl:bottom-auto xl:right-auto xl:z-auto xl:w-[380px] xl:max-w-none xl:shrink-0 '
  + 'xl:h-[calc(100vh-92px)] xl:rounded-2xl xl:border xl:border-line-soft xl:shadow-sm xl:overflow-hidden';

// ============================================================
// 表单状态
// ============================================================

interface FormState {
  url: string;
  productName: string;
  brand: string;
  agent: string;
  industry: InternalIndustry | '';
  category: string;
  level1: string;
  level2: string;
  price: string;
  usageScene: string;
  sellingPoints: string;
  targetAudience: string;
  xcDailyBudgetWan: string;
  qianchuanDailySpend: string;
  targetPenetration: string;
  stableRoi: string;
  targetRoi: string;
  reverseSelectPct: string;
  materialChasePct: string;
  influencerTags: string[];
}

const INITIAL_FORM: FormState = {
  url: '',
  productName: '',
  brand: '',
  agent: '',
  industry: '',
  category: '',
  level1: '',
  level2: '',
  price: '',
  usageScene: '',
  sellingPoints: '',
  targetAudience: '',
  xcDailyBudgetWan: '',
  qianchuanDailySpend: '',
  targetPenetration: '15',
  stableRoi: '',
  targetRoi: '',
  reverseSelectPct: '',
  materialChasePct: '',
  influencerTags: [],
};

// 第一阶段（商品洞察→爆款素材参考→Brief 拆解）加载步骤由 loadSteps 动态驱动（见 phase1StepsFor）

// 数字解析：空串/非法 → null
function toNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

// 二级类目一级类目 → 对内行业（用于选类目后联动行业标签）
const LEVEL1_TO_INDUSTRY: Record<string, InternalIndustry> = {
  // 母婴宠物
  母婴用品: '母婴宠物',
  宠物生活: '母婴宠物',
  // 个护美妆
  个人护理: '个护美妆',
  彩妆香水: '个护美妆',
  医疗器械及保健用品: '个护美妆',
  // 食品饮料
  水饮冲调: '食品饮料',
  '粮油干货/方便速食': '食品饮料',
  肉禽蛋品: '食品饮料',
  休闲食品: '食品饮料',
  // 保健食品（营养保健/特医食品 + 传统滋补均归保健食品行业）
  '营养保健/特医食品': '保健食品',
  传统滋补: '保健食品',
  海鲜水产: '食品饮料',
  '冷冻/冷藏制品': '食品饮料',
  酒类: '食品饮料',
  水果蔬菜: '食品饮料',
  食品饮料: '食品饮料',
  // 服饰鞋包
  服装: '服饰鞋包',
  箱包: '服饰鞋包',
  鞋靴: '服饰鞋包',
  服饰鞋包: '服饰鞋包',
  // 家居家清
  家清纸品: '家居家清',
  居家日用: '家居家清',
  餐饮厨具: '家居家清',
  家具: '家居家清',
  电器: '家居家清',
  家居家清: '家居家清',
  家居电器: '家居家清',
  // 其他（3C/汽车/运动/文教/书籍等）
  '3C数码及配件': '其他',
  汽车用品: '其他',
  整车及配件: '其他',
  运动休闲用品: '其他',
  文教文化用品: '其他',
  '书籍/杂志/报纸': '其他',
};

// 一级类目 → 对内行业（手选/识别到二级类目后联动行业与达人标签）
function industryFromLevel1(level1: string): InternalIndustry | '' {
  return (LEVEL1_TO_INDUSTRY as Record<string, InternalIndustry>)[level1] || '';
}

// ============================================================
// 小组件
// ============================================================

function SectionTitle({ icon: Icon, title, desc, badge }: { icon: typeof Gauge; title: string; desc?: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-9 h-9 rounded-[10px] bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-brand-600" />
      </div>
      <div className="min-w-0">
        <h2 className="text-[24px] leading-tight font-extrabold tracking-tight text-ink-900 flex items-center gap-2">
          {title}
          {badge && <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded self-center mt-1">{badge}</span>}
        </h2>
        {desc && <p className="text-[12px] text-ink-500 mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-danger-ink ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 transition-all';

/** 案例封面图：加载失败自动隐藏，referrerPolicy 规避防盗链 */
function CoverImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!url || failed) return null;
  return (
    <div className="relative w-full aspect-[4/3] bg-gray-100 overflow-hidden rounded-t-xl">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-100" />}
      <img
        src={url}
        referrerPolicy="no-referrer"
        alt="案例封面"
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

// ============================================================
// 主应用
// ============================================================

// ============================================================
// 星川服务商经营看板 · 网页计算器（独立部署应用，站内 iframe 内嵌 + 新窗口打开兜底）
// ============================================================
const BOARD_CALC_URL = 'https://6f3b4b5e4597.aime-site.bytedance.net/';

// ============================================================
// 首页模式选择页（SaaS 风格大卡片）
// ============================================================
type PickMode = 'full' | 'score' | 'script' | 'match' | 'kocfit' | 'calculator' | 'tagger' | 'idlookup' | 'records' | 'baopin' | 'mywb' | 'delwb';

function ModeSelect({ onPick }: { onPick: (m: PickMode) => void }) {
  const publicHost = isPublicHost();
  const gh = isGhPages();

  // 轻量化名字登录 + 按名字归档的使用历史（对内对外通用）
  const [loginOpen, setLoginOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userName, setUserName] = useState(() => getUserName());
  const refreshUser = () => setUserName(getUserName());

  // 数据更新时间（页面打开时刻，纯前端展示）
  const dataUpdate = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);

  // 顶部板块导航（点击即进入对应模式，与下方卡片入口行为一致）
  const NAV: Array<{ key: PickMode; label: string; icon: typeof Box }> = [
    { key: 'score', label: '商品分析', icon: Box },
    { key: 'baopin', label: '代理商爆品库', icon: Package },
    { key: 'script', label: '内容分析与脚本生成', icon: MessageSquareCode },
    { key: 'match', label: '达人匹配', icon: Users },
    { key: 'calculator', label: '经营分析看板', icon: LayoutGrid },
    // 对外版专属：个人工作台（登录后可见）
    ...(gh ? [{ key: 'mywb' as PickMode, label: '我的工作台', icon: User }] : []),
  ];

  // 四功能入口卡（key 与原模式完全一致：score / script / match / calculator）
  const CARDS: Array<{
    key: PickMode; title: string; en: string; desc: string; tags: string[];
    icon: typeof Box; tile: string;
  }> = [
    {
      key: 'score', title: '商品分析', en: 'PRODUCT SCORING', icon: Box,
      tile: 'from-brand-500 to-brand-700',
      desc: '100 分制五维计分模型，对标 68 个二级类目 QTD Top500 商品实测基准（0917 底表），输出商品分数、AI 红线检测与可落地优化建议',
      tags: ['计分模型', '类目基准', '红线建议'],
    },
    {
      key: 'baopin', title: '代理商爆品库', en: 'HIT PRODUCTS', icon: Package,
      tile: 'from-amber-500 to-orange-600',
      desc: '商品分析跑过的商品自动汇聚，保留商品五维分数；服务商适配分析（达人库 × 分层规则V1）给出 P0/P1/P2/P3 定级，服务商可自行修改',
      tags: ['自动汇聚', 'P0/P1/P2', '运力建议'],
    },
    {
      key: 'delwb', title: '达人交付管理工作台', en: 'DELIVERY WORKBENCH', icon: ClipboardList,
      tile: 'from-fuchsia-500 to-purple-600',
      desc: '商品任务 × 达人交付 × BD 跟进唯一操作入口：新建任务与交付单、BD 标记建联/寄样/初稿/上传/验收节点，系统自动映射 S0-S6 状态、识别 SLA 与风险，全部真实落表',
      tags: ['任务×达人', 'S0-S6', '真实落表'],
    },
    {
      key: 'script', title: '内容分析与脚本生成', en: 'CONTENT & SCRIPT', icon: SquareTerminal,
      tile: 'from-indigo-500 to-blue-600',
      desc: '逐镜头拆解爆款跑量素材，AI 一键生成痛点 / 避坑 / 福利三方向四段式内容脚本（痛点分析·卖点分析·放大功效·加速转化）与拍摄 SOP',
      tags: ['爆款拆解', 'AI 脚本', '镜头 SOP'],
    },
    {
      key: 'match', title: '达人匹配', en: 'CREATOR MATCHING', icon: Users,
      tile: 'from-brand-500 to-brand-700',
      desc: '存量 / 增量 / 潜力 / 星图四库联动，按类目、CPM、GMV 门槛与五维标签精准推荐达人',
      tags: ['四库联动', '五维标签', '名单导出'],
    },
    {
      key: 'kocfit', title: 'KOC 契合度论证', en: 'KOC FIT ARGUMENT', icon: Heart,
      tile: 'from-rose-500 to-pink-600',
      desc: '美妆/个护商品 × 单达人深度论证：凭代表视频截图、公开信息与评论证据，输出五轴契合度、八维制作能力、KOC 优质四要素与前置费建议，附可直接发品牌方的对外版报告',
      tags: ['美妆个护', '前置费论证', '对外版报告'],
    },
    {
      key: 'calculator', title: '经营分析看板', en: 'BUSINESS DASHBOARD', icon: LayoutGrid,
      tile: 'from-blue-500 to-indigo-600',
      desc: '星川自营测算 + 千川联动进阶测算，输出客户 A/B/C/D 分层与激励政策测算',
      tags: ['客户分层', '激励测算', '千川联动'],
    },
    // 我的工作台：对外版按登录身份过滤；对内版全服务商全量记录中心
    ...(gh ? [{
      key: 'mywb' as PickMode, title: '我的工作台', en: 'MY WORKBENCH', icon: User,
      tile: 'from-slate-700 to-slate-900',
      desc: '我的商品分析历史、爆品库、内容脚本、达人库情况与达人匹配记录，全部按登录身份自动过滤',
      tags: ['我的记录', '五模块', '登录态过滤'],
    }] : [{
      key: 'mywb' as PickMode, title: '我的工作台', en: 'MY WORKBENCH', icon: User,
      tile: 'from-slate-700 to-slate-900',
      desc: '全服务商记录中心：商品分析历史、爆品库、达人交付、内容脚本、达人库情况、达人匹配记录六个 Tab，展示所有服务商全量数据，支持按服务商核对',
      tags: ['全服务商', '六模块', '全量数据'],
    }]),
    // 服务商星川资产：对外版=服务商达人自助打标（本机 xc-tagger）；对内版=服务商达人上传记录（渠道查看）
    ...(gh ? [{
      key: 'tagger' as PickMode, title: '服务商达人自助打标', en: 'SELF TAGGING', icon: Tag,
      tile: 'from-rose-500 to-orange-500',
      desc: '上传达人名单（Excel/CSV），用本机小工具 + 已登录星图账号自动抓取星川等级 / 交付项目 / 星图消耗 / 电商等级，按标杆·主力·潜力·储备一键评级分层并导出 CSV',
      tags: ['本机工具', '80 分制', '断点续跑'],
    }, {
      key: 'idlookup' as PickMode, title: '星图达人本地化查询/匹配', en: 'ID LOOKUP', icon: ScanSearch,
      tile: 'from-cyan-500 to-blue-600',
      desc: '名单只有抖音号 / 星图ID / 达人名称中的部分信息？粘贴多维表格链接即可读取、互查后一键写回，或上传 Excel；本机小工具按「星图ID ＞ 抖音号精确 ＞ 名称兜底」逐行补全三元组，断点续跑只跑剩余行，只查身份、不评级',
      tags: ['本机工具', '多维表格直连', '断点续跑'],
    }] : [{
      key: 'records' as PickMode, title: '服务商达人上传记录', en: 'TAGGER RECORDS', icon: ClipboardList,
      tile: 'from-sky-500 to-indigo-500',
      desc: '查看服务商在公开版「达人自助打标」回传的历史记录：服务商名称、上传时间、达人明细与分层结果，实时同步飞书多维表格，可展开核对每位达人得分',
      tags: ['对内查看', '实时同步', '分层核对'],
    }]),
  ];

  // ① 星川服务商执行全链路：商品分析 / 内容脚本 / 达人匹配（3 张）
  // ② 星川服务商经营分析：经营分析看板 / 达人交付管理 / 我的工作台（3 张）
  // ③ 服务商本地化部署（仅对外版）：服务商达人自助打标（本机 xc-tagger）/
  //    星图达人本地化查询匹配（本机 xc-id-lookup）；对内版为服务商达人上传记录
  // 爆品库入口已从首页移除（在「我的工作台 → 爆品库」内）
  const CARD_GROUPS: Array<{ title: string; keys: PickMode[] }> = gh ? [
    { title: '星川服务商执行全链路', keys: ['score', 'script', 'match', 'calculator'] },
    { title: '星川服务商经营分析', keys: ['kocfit', 'delwb', 'mywb'] },
    { title: '服务商本地化部署', keys: ['tagger', 'idlookup'] },
  ] : [
    { title: '星川服务商执行全链路', keys: ['score', 'script', 'match', 'kocfit'] },
    { title: '星川服务商经营分析', keys: ['calculator', 'delwb', 'mywb', 'records'] },
  ];

  return (
    <div className="xc-home min-h-screen text-ink-900">
      {/* ===== 顶部导航 ===== */}
      <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-xl border-b border-[#EFEEF7]">
        <div className="max-w-[1440px] mx-auto h-[68px] px-5 lg:px-10 flex items-center gap-4 lg:gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-btn">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-[19px] font-extrabold tracking-tight whitespace-nowrap bg-gradient-to-r from-brand-600 to-[#8B6FFF] bg-clip-text text-transparent">
              {MATCH_ONLY ? '星川达人匹配工作台' : '星川决策工作台'}
            </h1>
          </div>

          <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto xc-no-scrollbar">
            {NAV.map((n) => {
              const active = n.key === 'score';
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => onPick(n.key)}
                  className={`shrink-0 inline-flex items-center gap-2 px-3.5 lg:px-4 py-2 rounded-xl text-[13px] lg:text-[13.5px] font-semibold transition-all border ${
                    active
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'text-ink-500 border-transparent hover:bg-[#F5F4FB] hover:text-ink-900'
                  }`}
                >
                  <n.icon className="w-[17px] h-[17px]" />
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
            {!publicHost && (
              <span className="hidden xl:inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-[#EAEAF2] text-[12px] font-medium text-ink-700 shadow-[0_2px_10px_-4px_rgba(76,68,160,0.25)]">
                <span className="w-2 h-2 rounded-full bg-ok-DEFAULT" />
                对内工作台 · 数据正常
              </span>
            )}
            {/* 历史记录：按当前名字归档（对内对外通用）；未填名字先引导登录 */}
            <button
              type="button"
              onClick={() => (userName ? setHistoryOpen(true) : setLoginOpen(true))}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3.5 rounded-full bg-white border border-[#E4E2F2] text-[12.5px] sm:text-[13px] font-semibold text-ink-700 shadow-[0_2px_10px_-6px_rgba(76,68,160,0.35)] hover:border-brand-300 hover:text-brand-700 transition-colors"
            >
              <History className="w-[16px] h-[16px] text-brand-500" />
              <span className="hidden sm:inline">历史记录</span>
            </button>
            {/* 名字登录：有名字显示名字胶囊（可切换/退出），无名字显示登录按钮 */}
            {userName ? (
              <button
                type="button"
                title="切换或退出使用者名称"
                onClick={() => setLoginOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 pl-2 pr-2.5 sm:pr-3.5 rounded-full bg-brand-50 border border-brand-100 text-[12.5px] sm:text-[13px] font-semibold text-brand-700 hover:border-brand-300 transition-colors max-w-[150px]"
              >
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[11px] font-bold flex items-center justify-center shadow-btn shrink-0">
                  {displayIdentity(userName).slice(0, 1)}
                </span>
                <span className="truncate">{displayIdentity(userName)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[12.5px] sm:text-[13px] font-bold shadow-btn hover:brightness-105 transition-all"
              >
                <User className="w-[15px] h-[15px]" /> 登录
              </button>
            )}
            {!publicHost && (
              <span className="hidden md:flex relative w-9 h-9 rounded-full bg-white border border-[#EAEAF2] items-center justify-center text-ink-500 shadow-[0_2px_10px_-4px_rgba(76,68,160,0.25)]">
                <Bell className="w-[17px] h-[17px]" />
                <span className="absolute top-[7px] right-[7px] w-1.5 h-1.5 rounded-full bg-danger-DEFAULT ring-2 ring-white" />
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 轻量化名字登录弹窗 + 我的使用记录弹窗（对内对外通用） */}
      <NameLogin open={loginOpen} onClose={() => { setLoginOpen(false); refreshUser(); }} />
      <GhHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* ===== 主区域 ===== */}
      <main className="xc-home-hero">
        <div className="relative max-w-[1440px] mx-auto px-5 lg:px-10 pt-12 lg:pt-14 pb-16">
          {/* Hero：零输入，一键进入全链路 */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 border border-brand-100 text-[12.5px] font-semibold text-brand-700 shadow-[0_4px_16px_-8px_rgba(124,92,255,0.4)]">
              <Sparkle className="w-3.5 h-3.5 text-brand-500" />
              星川决策工作台
              <Sparkle className="w-3.5 h-3.5 text-brand-500" />
            </span>
            <h2 className="mt-6 text-[40px] lg:text-[56px] leading-[1.14] font-extrabold tracking-tight bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#8B5CF6] bg-clip-text text-transparent">
              开启星川全链路决策
            </h2>
            <p className="mt-4 text-[14px] lg:text-[16px] text-ink-500">商品分析・内容创意・达人匹配・经营看板，一站式完成</p>
          </motion.div>

          {/* 大 CTA：全链路分析（打分 → 内容脚本 → 达人匹配一条龙） */}
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="mt-10 lg:mt-12 flex justify-center"
          >
            <button
              type="button"
              onClick={() => onPick('full')}
              className="group relative overflow-hidden inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[420px] h-[72px] sm:h-[88px] px-10 sm:px-16 rounded-[22px] sm:rounded-[26px]
                text-white text-[18.5px] sm:text-[24px] font-extrabold tracking-wide whitespace-nowrap
                bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#8B5CF6]
                shadow-[0_28px_70px_-18px_rgba(124,58,237,0.65)]
                hover:-translate-y-1 hover:shadow-[0_38px_96px_-18px_rgba(124,58,237,0.8)]
                active:translate-y-0 transition-all duration-300"
            >
              <span className="pointer-events-none absolute -top-1/2 -left-1/3 w-1/3 h-[200%] rotate-[18deg] bg-gradient-to-r from-transparent via-white/35 to-transparent blur-md transition-all duration-1000 group-hover:left-[130%]" />
              <span className="relative flex items-center gap-3">
                <span className="text-[1.05em] leading-none">✦</span>
                开始全链路分析
                <span aria-hidden="true" className="text-[1.05em] leading-none">→</span>
              </span>
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
            className="mt-5 text-center text-[12.5px] lg:text-[13px] font-medium text-ink-400"
          >
            商品分析 → 内容创意 → 达人匹配，结论自动串联、一条龙完成
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }}
            className="mt-4 flex items-center justify-center gap-2 sm:gap-3 flex-wrap text-[12px] sm:text-[13px] font-semibold text-brand-700"
          >
            {['① 商品分析', '② 内容创意', '③ 达人匹配'].map((s, i) => (
              <span key={s} className="flex items-center gap-2 sm:gap-3">
                <span className="px-3.5 py-1.5 rounded-full bg-white border border-brand-200 shadow-sm">{s}</span>
                {i < 2 && <ArrowRight className="w-3.5 h-3.5 text-brand-300" />}
              </span>
            ))}
          </motion.div>

          {/* 功能入口卡：两行分组（执行全链路 4 张 / 服务商星川资产 3 或 2 张），卡片样式统一 */}
          {CARD_GROUPS.map((group, gi) => (
            <div key={group.title} className={gi === 0 ? 'mt-10' : 'mt-9'}>
              {/* 小号灰色分组标题 */}
              <p className="text-[12.5px] font-semibold tracking-[0.04em] text-ink-400">{group.title}</p>
              <div className={`mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 ${group.keys.length >= 4 ? 'xl:grid-cols-4' : group.keys.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
                {group.keys.map((key, ci) => {
                  const c = CARDS.find((x) => x.key === key);
                  if (!c) return null;
                  return (
              <motion.button
                key={c.key}
                type="button"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + gi * 0.04 + ci * 0.06 }}
                onClick={() => onPick(c.key)}
                className="group relative text-left p-6 rounded-[22px] border bg-white border-[#EBECF4] shadow-[0_14px_44px_-22px_rgba(60,64,110,0.28)] hover:shadow-[0_22px_60px_-22px_rgba(124,92,255,0.35)] hover:border-brand-200 hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-[50px] h-[50px] rounded-[15px] bg-gradient-to-br ${c.tile} flex items-center justify-center shadow-btn`}>
                  <c.icon className="w-[24px] h-[24px] text-white" />
                </div>
                <h3 className="mt-4 text-[18px] font-extrabold text-ink-900">{c.title}</h3>
                <p className="mt-0.5 text-[10.5px] font-bold tracking-[0.12em] text-ink-400">{c.en}</p>
                <p className="mt-3.5 text-[12.5px] leading-[1.75] text-ink-500 min-h-[66px]">{c.desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.tags.map((t) => (
                    <span key={t} className="px-2.5 py-1 rounded-lg bg-brand-50/70 border border-brand-100 text-[11px] font-medium text-brand-700">{t}</span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-600 group-hover:gap-2 transition-all">
                  立即进入 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </motion.button>
                  );
                })}
              </div>
            </div>
          ))}

        {/* 底部数据条 */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[12.5px] text-ink-500">
          <span className="inline-flex items-center gap-2">
            <Diamond className="w-3.5 h-3.5 text-brand-500 fill-brand-500" />四库达人 <b className="text-ink-900 tabnum">2.6 万+</b>
          </span>
          <span className="inline-flex items-center gap-2">
            <Diamond className="w-3.5 h-3.5 text-brand-500 fill-brand-500" />产品适配模型 <b className="text-ink-900 tabnum">100 分制</b> · 封存口径
          </span>
          <span className="inline-flex items-center gap-2">
            <Diamond className="w-3.5 h-3.5 text-brand-500 fill-brand-500" />数据更新 <b className="text-ink-900 tabnum">{dataUpdate}</b>
          </span>
        </div>

        <p className="mt-6 text-center text-[11.5px] text-ink-400 flex items-center justify-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> 支持抖音商品链接 / v.douyin.com 短链 / 整段分享文案，也可直接手动录入产品名
        </p>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// 🎬 演示模式 · 本地预置经营看板（静态，无外链 iframe）
// ============================================================
// ============================================================
// 星川服务商经营看板 · 网页计算器（iframe 内嵌独立应用）
// ============================================================
function BoardSection({ onBack }: { onBack: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* 顶部 */}
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 py-3 shrink-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-btn shrink-0">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-ink-900 flex items-center gap-2">
              星川服务商经营看板
              <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded">网页计算器</span>
            </h1>
            <p className="text-[11px] text-ink-400">服务商经营数据在线测算 · 输入参数即时出结果</p>
          </div>
          <a
            href={BOARD_CALC_URL}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium transition-colors shadow-btn"
          >
            <ExternalLink className="w-3.5 h-3.5" /> 新窗口打开
          </a>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-white border border-line text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 切换模式
          </button>
        </div>
      </header>

      {/* 计算器内嵌区：看板是 100vh 全屏应用（内部 overflow-auto 自管理滚动），
          iframe 高度必须精确铺满视口剩余空间，否则看板 100vh 会被压矮、下半屏留白截断。
          外层不裁剪 overflow，内容可随视口撑满。 */}
      <div
        className="relative w-full"
        style={{ height: 'calc(100vh - 4rem)', minHeight: 760 }}
      >
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-ink-400 bg-canvas">
            <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
            <p className="text-xs">正在加载经营看板计算器…</p>
          </div>
        )}
        <iframe
          src={BOARD_CALC_URL}
          title="星川服务商经营看板 · 网页计算器"
          onLoad={() => setLoaded(true)}
          className="block w-full border-0"
          style={{ height: 'calc(100vh - 4rem)', minHeight: 760 }}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}

// ============================================================
// 🎬 演示落地页 = 主站首页（ModeSelect 同一组件）：
//   Hero / 大标题 / 副标题 / 紫色大 CTA / 三步胶囊 / 功能卡片完全一致；
//   demo 模式下 onPick 走 demoEnterModule —— 用内置演示数据自动开跑对应模块。
// ============================================================

export default function App() {
  // 首页模式选择：select=模式选择页；full=全链路；score=仅打分；script=仅内容脚本；match=仅达人匹配；calculator=经营看板计算器
  type Mode = 'select' | 'full' | 'score' | 'script' | 'match' | 'kocfit' | 'calculator' | 'tagger' | 'idlookup' | 'records' | 'baopin' | 'mywb' | 'delwb';
  const [mode, setMode] = useState<Mode>(() => {
    // 独立达人匹配站：直接进入「达人匹配」，跳过首页模式选择与所有深链
    if (MATCH_ONLY) return 'match';
    try {
      // 从独立打分页 CTA 跳入（?from=scoring）时直接进全链路，跳过模式选择
      if (new URLSearchParams(window.location.search).get('from') === 'scoring') return 'full';
      // 达人库适配空库时「前往达人打标」深链（仅对外版有打标 tab）
      if (new URLSearchParams(window.location.search).get('from') === 'tagger' && isGhPages()) return 'tagger';
      // 商品分析「已加入爆品库，点击查看」新标签页深链（?from=baopin 直达爆品库）
      if (new URLSearchParams(window.location.search).get('from') === 'baopin') return 'baopin';
      // 🎬 演示模式深链：?demo=1&module=board 直达本地预置经营看板
      if (new URLSearchParams(window.location.search).get('module') === 'board') return 'calculator';
    } catch { /* ignore */ }
    return 'select';
  });
  // 🎬 演示模式（响应式）
  const [demo] = useDemoMode();
  // 工作类模式（共享同一个工作台大树）：切到非工作模式时工作台保持挂载、仅隐藏，会话内状态不丢
  const WORK_MODES: Mode[] = ['full', 'score', 'script', 'match'];
  // keptWorkMode：离开工作台时记住的来源工作模式，隐藏期间工作台按此模式保持挂载
  const [keptWorkMode, setKeptWorkMode] = useState<Mode | null>(null);
  const [matchStarted, setMatchStarted] = useState(false);

  // —— 引用爆品库 / 内容本地历史 ——
  const [baopinOpen, setBaopinOpen] = useState(false);
  const [contentHistoryOpen, setContentHistoryOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [contentSavedTip, setContentSavedTip] = useState(false);
  // 三个方向卡的快照获取器（DirectionCard 注册，保存内容时收集当前版+完整迭代链）
  const dirGettersRef = useRef<Map<number, () => ContentDirectionSnapshot>>(new Map());
  const registerDirSnapshot = useCallback(
    (index: number, getter: (() => ContentDirectionSnapshot) | null) => {
      if (getter) dirGettersRef.current.set(index, getter);
      else dirGettersRef.current.delete(index);
    }, []);
  // 热点/千川参考面板最近注入的文本（保存内容时作为参考营销热点/千川拆解）
  const lastHotTextRef = useRef('');
  const lastMatTextRef = useRef('');
  // 各方向卡「优化输入框追加函数」注册表（热点营销进阶面板跨组件引用内容到指定方向）
  const dirIntroducersRef = useRef<Map<number, (text: string, sep: string, source?: 'hot' | 'mat') => void>>(new Map());
  const registerDirIntroducer = useCallback(
    (index: number, fn: ((text: string, sep: string, source?: 'hot' | 'mat') => void) | null) => {
      if (fn) dirIntroducersRef.current.set(index, fn);
      else dirIntroducersRef.current.delete(index);
    }, []);
  // 热点营销进阶「引用到脚本」：把内容注入指定方向卡的优化输入框，关闭面板并滚动定位
  const handleHotDockQuote = useCallback((text: string, targetIdx: number): boolean => {
    const keys = [...dirIntroducersRef.current.keys()].sort((a, b) => a - b);
    if (!keys.length) return false;
    const idx = keys.includes(targetIdx) ? targetIdx : keys[0];
    const fn = dirIntroducersRef.current.get(idx);
    if (!fn) return false;
    lastHotTextRef.current = text;
    fn(text, '\n', 'hot');
    setHotDockOpen(false);
    setTimeout(() => document.getElementById(`sec-dir-anchor-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    return true;
  }, []);
  // 第一阶段（商品洞察+爆款参考+Brief）加载步骤指示
  const [loadSteps, setLoadSteps] = useState<{ key: string; label: string }[]>([]);
  const [loadStepKey, setLoadStepKey] = useState('');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [prefill, setPrefill] = useState<{ total: string; level: string } | null>(null);
  const [recognizing, setRecognizing] = useState(false);

  // 从「星川产品适配评分」打分页跳转带入：读取 URL query 预填商品信息与投放参数（字段与打分页 CTA 一一对齐）
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('from') !== 'scoring') return;
      const get = (k: string) => (sp.get(k) || '').trim();
      const indRaw = get('industry');
      const ind = (INTERNAL_INDUSTRIES as readonly string[]).includes(indRaw) ? (indRaw as InternalIndustry) : '';
      const nameForCat = get('productName') || get('category');
      const sugCat = nameForCat ? suggestCategory(nameForCat) : null;
      const level2Raw = get('level2');
      const matchedCat = CATEGORIES.find(c => c.level2 === level2Raw) || sugCat;
      const level2 = matchedCat ? matchedCat.level2 : '';
      // 旧独立页传 千川日均耗×渗透率 → 换算为直填星川日预算（万元/天）
      const ds = Number(get('dailySpend'));
      const pen = Number(get('penetration'));
      const xcBudgetWan = (ds > 0 && pen > 0) ? String(Math.round((ds * (pen / 100)) / 10000 * 100) / 100) : '';
      setForm((f) => ({
        ...f,
        productName: get('productName') || f.productName,
        brand: get('brand') || f.brand,
        agent: get('agent') || f.agent,
        category: get('category') || f.category,
        level1: matchedCat ? matchedCat.level1 : f.level1,
        level2: level2 || f.level2,
        price: get('price') || f.price,
        sellingPoints: get('sellingPoints') || f.sellingPoints,
        usageScene: get('usageScene') || f.usageScene,
        targetAudience: get('targetAudience') || f.targetAudience,
        xcDailyBudgetWan: xcBudgetWan || f.xcDailyBudgetWan,
        qianchuanDailySpend: get('dailySpend') || f.qianchuanDailySpend,
        targetPenetration: get('penetration') || f.targetPenetration,
        stableRoi: get('stableRoi') || f.stableRoi,
        targetRoi: get('targetRoi') || f.targetRoi,
        reverseSelectPct: get('reverseSelectPct') || f.reverseSelectPct,
        materialChasePct: get('materialChasePct') || f.materialChasePct,
        ...(ind ? { industry: ind, influencerTags: [...DEFAULT_TAGS_BY_INDUSTRY[ind]] } : {}),
      }));
      if (get('productName') || get('category') || get('targetAudience')) {
        setPrefill({ total: get('total'), level: get('level') });
      }
    } catch { /* 预填失败不阻塞正常使用 */ }
  }, []);

  const [recognizeMsg, setRecognizeMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // —— Brief 拆解层（爆款素材参考 → Brief → 生成脚本）——
  const [briefs, setBriefs] = useState<BriefDirection[]>([]);              // 可编辑的 Brief 方向（当前版本）
  const [selectedBriefIds, setSelectedBriefIds] = useState<Set<string>>(new Set()); // 勾选用于生成脚本的 Brief id
  // 对外版：客户 Brief 上传优化后的版本切换
  const briefsOriginRef = useRef<BriefDirection[]>([]);                    // gen_brief 原始版本
  const [briefsOptimized, setBriefsOptimized] = useState<BriefDirection[] | null>(null); // 客户 Brief 优化版
  const [briefsVersion, setBriefsVersion] = useState<'original' | 'optimized'>('original');
  const [exportTip, setExportTip] = useState('');                          // 一键导出反馈文案
  const [scriptLoading, setScriptLoading] = useState(false);               // 第二阶段四段脚本生成中
  const [scriptProgress, setScriptProgress] = useState<{ done: number; total: number; name: string }>({ done: 0, total: 0, name: '' });
  const [scriptError, setScriptError] = useState('');
  const scoringCtxRef = useRef<ScoringContext | null>(null);               // 第一阶段打分上下文（第二阶段拼 dir payload 复用）

  // —— 热点营销进阶·右侧侧边面板（画布右侧空白区）——
  const [hotDockOpen, setHotDockOpen] = useState(false);
  const [hotDockPlan, setHotDockPlan] = useState<HotMarketingPlan | null>(null);
  const [hotDockLoading, setHotDockLoading] = useState(false);
  const [hotDockError, setHotDockError] = useState(false);
  const hotDockSeq = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);   // 我的使用记录弹窗（对内对外通用）
  const [loginOpen, setLoginOpen] = useState(false);       // 轻量化名字登录弹窗
  const [wbUserName, setWbUserName] = useState(() => getUserName()); // 工作台当前使用者名字

  // —— 方向卡右侧辅助面板：🔥 热点营销参考 / 🎬 千川爆款素材灵感（宽屏 sticky 内嵌、窄屏右侧抽屉，与热点营销进阶互斥）——
  const [refHotOpen, setRefHotOpen] = useState(false);
  const [refMatOpen, setRefMatOpen] = useState(false);
  // 当前触发面板的方向卡「引入」回调（把钩子/素材结论追加进该卡的优化迭代输入框，并标记引入来源）
  const sideIntroduceRef = useRef<(text: string, sep: string, source?: 'hot' | 'mat') => void>(() => {});

  const closeRefPanels = () => { setRefHotOpen(false); setRefMatOpen(false); };

  // 方向卡按钮：打开/切换右侧辅助面板（再点一次收起）；introduce 由触发卡片注册
  const openSideRefPanel = (kind: 'hot' | 'mat', introduce: (text: string, sep: string, source?: 'hot' | 'mat') => void) => {
    sideIntroduceRef.current = introduce;
    setHotDockOpen(false);
    if (kind === 'hot') {
      setRefMatOpen(false);
      setRefHotOpen(v => !v);
    } else {
      setRefHotOpen(false);
      setRefMatOpen(v => !v);
    }
  };

  // 素材拆解面板所需商品上下文（由表单实时派生）
  const sideBreakdownProduct = {
    productName: form.productName.trim(),
    brand: form.brand.trim(),
    industry: form.industry || '其他',
    category: form.category.trim(),
    sellingPoints: form.sellingPoints.trim(),
    targetAudience: form.targetAudience.trim(),
  };

  const hotDockContextLabel = () =>
    [form.brand.trim() || form.productName.trim(), form.industry, form.category.trim() || form.level2].filter(Boolean).join(' · ');

  // ---- 使用埋点：关键输入摘要 + 打分去重（统一 trackUsage：本地按名字归档，对外版另同步 FaaS 台账）----
  const ghScoreLogged = useRef<Set<string>>(new Set());
  // 内容脚本初次生成的台账记录ID（Promise）：作为各方向卡后续优化迭代「关联上一条记录ID」的链根
  const scriptInitialLogId$ = useRef<Promise<string | undefined>>(Promise.resolve(undefined));
  // 台账埋点公共扩展：链接/分享文案原文全量上报 + 表单全部输入项原样 JSON 落库（FaaS 负责从原文抽取可点击链接）
  const ghBaseExtra = useCallback((modeLabel: string) => ({
    productUrl: form.url,
    rawInput: form.url,
    fullInput: JSON.stringify({ 模式: modeLabel, ...form }),
    brand: form.brand.trim(),
    sellingPoints: form.sellingPoints.trim(),
    audience: form.targetAudience.trim(),
  }), [form]);
  // 三方向创意脚本全文（标题/概念/钩子/四段式分镜口播：痛点分析·卖点分析·放大功效·加速转化/拍摄建议），完整落「脚本全文」字段
  const ghScriptsFullText = useCallback((dirs: CreativeDirection[]) => {
    const segNames: Record<'pain' | 'sell' | 'release' | 'close', string> = { pain: '痛点分析', sell: '卖点分析', release: '放大功效', close: '加速转化' };
    return (dirs || []).map((d, i) => {
      const L: string[] = [];
      L.push(`========== 脚本${['①', '②', '③'][i] || i + 1}｜${d.angle || d.title || ''} ==========`);
      if (d.title) L.push(`标题：${d.title}`);
      if (d.concept) L.push(`核心概念：${d.concept}`);
      if (d.hookType) L.push(`钩子类型：${d.hookType}`);
      if (d.hotOpp?.name) L.push(`借势热点：${[d.hotOpp.grade, d.hotOpp.name].filter(Boolean).join(' · ')}${d.hotOpp.hook ? `（钩子：${d.hotOpp.hook}）` : ''}`);
      if (d.hooks?.length) {
        L.push('【备选开场钩子】');
        d.hooks.forEach((h, j) => L.push(`${j + 1}. ${h}`));
      }
      (['pain', 'sell', 'release', 'close'] as const).forEach(k => {
        const s = d.script?.[k];
        if (!s) return;
        L.push(`■ ${segNames[k]}`);
        if (s.visual) L.push(`画面/分镜：${s.visual}`);
        if (s.voiceover) L.push(`口播台词：${s.voiceover}`);
        if (s.refCaseTitle) L.push(`参考案例：${s.refCaseTitle}`);
      });
      if (d.shootingTip) L.push(`拍摄建议：${d.shootingTip}`);
      return L.join('\n');
    }).join('\n\n');
  }, []);
  // gen_brief 产出的 3-5 条拍摄 Brief 方向全量留痕（含用户编辑后的版本），落「Brief方向全量」字段
  const ghBriefsFullText = useCallback((list: BriefDirection[]) => {
    return (list || []).map((b, i) => {
      const L: string[] = [];
      L.push(`【Brief ${i + 1}】${b.name || ''}`);
      if (b.coreSellingPoint) L.push(`核心卖点：${b.coreSellingPoint}`);
      if (b.targetAudience) L.push(`目标人群：${b.targetAudience}`);
      if (b.materialFormat) L.push(`素材形式：${b.materialFormat}`);
      if (b.validationGoal) L.push(`验证目标：${b.validationGoal}`);
      return L.join('\n');
    }).join('\n\n');
  }, []);
  const ghInputSummary = useCallback(() => {
    const parts: string[] = [];
    if (form.brand.trim()) parts.push(`品牌:${form.brand.trim()}`);
    if (form.industry) parts.push(`行业:${form.industry}`);
    const cat = form.category.trim() || form.level2.trim();
    if (cat) parts.push(`品类:${cat}`);
    if (form.price.trim()) parts.push(`客单价:${form.price.trim()}元`);
    if (form.xcDailyBudgetWan.trim()) parts.push(`星川日预算:${form.xcDailyBudgetWan.trim()}万`);
    if (form.targetRoi.trim()) parts.push(`追投下星川目标ROI:${form.targetRoi.trim()}`);
    if (form.reverseSelectPct.trim()) parts.push(`达人反选比例:${form.reverseSelectPct.trim()}%`);
    if (form.materialChasePct.trim()) parts.push(`素材追投数量比例:${form.materialChasePct.trim()}%`);
    if (form.sellingPoints.trim()) parts.push(`卖点:${form.sellingPoints.trim()}`);
    if (form.targetAudience.trim()) parts.push(`人群:${form.targetAudience.trim()}`);
    return parts.join('；');
  }, [form]);

  const runHotDock = async (params?: { win?: MktWindow; scenarios?: MktScenario[]; styles?: MktStyle[] }) => {
    const seq = ++hotDockSeq.current;
    const win: MktWindow = params?.win || '7d';
    const scenarios: MktScenario[] = params?.scenarios && params.scenarios.length ? params.scenarios : ['竞价'];
    const styles: MktStyle[] = params?.styles || [];
    setHotDockLoading(true);
    setHotDockError(false);
    try {
      const plan = await fetchHotMarketingPlan({
        industry: (form.industry || '其他'),
        category: form.category.trim() || form.level2 || '',
        brand: form.brand.trim(),
        product: form.productName.trim(),
        audience: form.targetAudience.trim(),
        sellingPoints: form.sellingPoints.trim(),
        win,
        scenarios,
        styles,
      });
      if (seq !== hotDockSeq.current) return;
      setHotDockPlan(plan);
      // 机会卡与行业热榜都空才算失败（AI 波动但热榜在时不算 error）
      setHotDockError(!plan || (!plan.opportunities.length && !(plan.hotItems?.length)));
      // GitHub 版埋点：热点营销（仅在生成机会卡时记录）
      if (plan && plan.opportunities.length > 0) {
        trackUsage('热点营销', form.productName.trim(), ghInputSummary(),
          `匹配 ${plan.opportunities.length} 个营销机会（窗口${win}/${scenarios.join('+')}）`,
          ghBaseExtra('热点营销'));
      }
    } catch {
      if (seq === hotDockSeq.current) setHotDockError(true);
    } finally {
      if (seq === hotDockSeq.current) setHotDockLoading(false);
    }
  };

  // 打开右侧面板：热点营销方案独立生成，不干预主流程；已有结果直接展示，否则立即拉取（fetchHotMarketingPlan 自带 25min 缓存）
  const openHotMarketingAdvance = () => {
    closeRefPanels();
    setHotDockOpen(true);
    if (hotDockPlan || hotDockLoading) return;
    void runHotDock();
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const onIndustryChange = (ind: InternalIndustry) => {
    setForm(f => ({ ...f, industry: ind, influencerTags: [...DEFAULT_TAGS_BY_INDUSTRY[ind]] }));
  };

  const toggleTag = (tag: string) =>
    setForm(f => ({
      ...f,
      influencerTags: f.influencerTags.includes(tag)
        ? f.influencerTags.filter(t => t !== tag)
        : [...f.influencerTags, tag],
    }));

  // ---- 第一部分：100 分制打分（二级类目底表 + 评分模型v1，确定性在前端计算）----
  const baseline: CategoryBaseline | null = useMemo(
    () => CATEGORIES.find(c => c.level2 === form.level2) ?? null,
    [form.level2],
  );

  const scoreResult: ScoreResult = useMemo(
    () => scoreProduct({
      xcBudgetWan: toNum(form.xcDailyBudgetWan),
      dailySpend: toNum(form.qianchuanDailySpend),
      penetration: toNum(form.targetPenetration),
      stableRoi: toNum(form.stableRoi),
      targetRoi: toNum(form.targetRoi),
      reverseSelectPct: toNum(form.reverseSelectPct),
      materialChasePct: toNum(form.materialChasePct),
      price: toNum(form.price),
      category: baseline,
    }),
    [form.xcDailyBudgetWan, form.qianchuanDailySpend, form.targetPenetration, form.stableRoi,
      form.targetRoi, form.reverseSelectPct, form.materialChasePct, form.price, baseline],
  );

  const canScore = !!baseline && scoreResult.level !== 'none';

  const [scoreAi, setScoreAi] = useState<ScoringAi | null>(null);
  const [scoreAiLoading, setScoreAiLoading] = useState(false);
  const [scoreAiError, setScoreAiError] = useState('');

  // 一页纸报告（scoring_report）
  const [scoreReport, setScoreReport] = useState<ScoringReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // idOnly 半成功：仅识别到商品ID（精选联盟长链/纯数字ID）时的就近补填状态
  const [idOnlyItem, setIdOnlyItem] = useState<{ itemId: string } | null>(null);

  // 打分输入变化 → 旧 AI 诊断/报告失效（演示模式下不清除预置结果）
  useEffect(() => {
    if (isDemoMode()) return;
    setScoreAi(null);
    setScoreAiError('');
    setScoreReport(null);
    setReportError('');
  }, [form.level1, form.level2, form.price, form.xcDailyBudgetWan, form.qianchuanDailySpend,
      form.targetPenetration, form.stableRoi,
      form.targetRoi, form.reverseSelectPct, form.materialChasePct, form.productName, form.brand, form.category,
      form.sellingPoints, form.agent, form.industry]);

  // ============================================================
  // 🎬 演示模式：进入工作模块即用内置 DEMO_FORM 预填（等同粘贴链接识别完成），
  // 并按模块自动开跑，分析结果完整展示、不留白等用户点击：
  //   full   商品分析 → Brief → 四段脚本 → 达人匹配（一条龙）
  //   score  五维适配分（实时计算）→ AI 红线/策略 → 一页纸报告
  //   script 商品洞察 Brief → 四段脚本（香氛演示数据）
  //   match  四库达人自动开跑（InfluencerMatch 挂载即跑）
  // ============================================================
  const demoPrefilledFor = useRef<Mode | null>(null);
  // 本次进入工作模块的自动开跑意图；loading 状态防重复触发
  const demoAutoIntentRef = useRef<Mode | null>(null);

  const demoResetGenerated = () => {
    setResult(null);
    setBriefs([]);
    briefsOriginRef.current = [];
    setBriefsOptimized(null);
    setBriefsVersion('original');
    setSelectedBriefIds(new Set());
    setScoreAi(null);
    setScoreAiError('');
    setScoreReport(null);
    setReportError('');
    setMatchStarted(false);
    setLoading(false);
    setScriptLoading(false);
    setError('');
    setScriptError('');
  };

  useEffect(() => {
    if (!demo) { demoPrefilledFor.current = null; return; }
    if (!WORK_MODES.includes(mode)) return;
    if (demoPrefilledFor.current === mode) return;
    demoPrefilledFor.current = mode;
    demoResetGenerated();
    const src = mode === 'script' ? DEMO_SCENT_FORM : DEMO_FORM;
    setForm({ ...INITIAL_FORM, ...src, influencerTags: [...src.influencerTags] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, mode]);

  // demo 下从首页进入工作模块：记录自动开跑意图并切模块（预填 effect 自动写入表单）
  const demoEnterModule = (m: Mode) => {
    demoAutoIntentRef.current = m;
    demoPrefilledFor.current = null;   // 允许预填 effect 再次执行
    demoResetGenerated();
    switchMode(m);
  };
  // demo 首页功能卡片 / 顶部导航点击：四个工作模块自动开跑，其余模块正常进入
  const handleDemoPick = (m: PickMode) => {
    if ((WORK_MODES as readonly Mode[]).includes(m)) demoEnterModule(m);
    else switchMode(m);
  };

  // 预填表单落定后，按意图自动串行推进
  useEffect(() => {
    if (!demo) return;
    const intent = demoAutoIntentRef.current;
    if (!intent || intent !== mode) return;
    if (loading || scriptLoading || scoreAiLoading || reportLoading) return;
    // 等预填 effect 把 DEMO_FORM 写入后再启动，避免必填校验拦截
    if (!form.productName.trim() || !form.brand.trim() || !form.industry) return;

    if (mode === 'full') {
      if (!form.level2) return;
      if (!result) {
        void handleAnalyze();
        return;
      }
      // 商品分析完成（含 Brief）→ 自动生成全部创意方向脚本
      if (!result.creativeDirections?.length) {
        void handleGenerateScripts();
      }
      // 达人匹配无需此处触发：ResultView 一挂载 InfluencerMatch 就会在演示模式下自动开跑
    } else if (mode === 'score') {
      if (!form.level2) return;
      if (!scoreAi) {
        void runScoringAi();
        return;
      }
      if (!scoreReport) {
        void handleGenerateReport();
      }
    } else if (mode === 'script') {
      if (!result) {
        void handleAnalyze();
        return;
      }
      if (!result.creativeDirections?.length) {
        void handleGenerateScripts();
      }
    } else if (mode === 'match') {
      if (!matchStarted) handleMatchStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    demo, mode,
    form.productName, form.brand, form.industry, form.level2,
    result, scoreAi, scoreReport, matchStarted,
    loading, scriptLoading, scoreAiLoading, reportLoading,
  ]);

  const runScoringAi = async (): Promise<ScoringAi | null> => {
    if (!baseline || scoreResult.level === 'none') return null;
    setScoreAiLoading(true);
    setScoreAiError('');
    try {
      const ai = await fetchScoringAi({
        product: {
          productName: form.productName.trim(), brand: form.brand.trim(),
          industry: form.industry || '其他', category: form.category.trim() || form.level2,
          price: toNum(form.price), sellingPoints: form.sellingPoints.trim(), agent: form.agent.trim(),
        },
        inputs: {
          xcBudgetWan: toNum(form.xcDailyBudgetWan),
          dailySpend: toNum(form.qianchuanDailySpend), penetration: toNum(form.targetPenetration),
          stableRoi: toNum(form.stableRoi), targetRoi: toNum(form.targetRoi),
          reverseSelectPct: toNum(form.reverseSelectPct), materialChasePct: toNum(form.materialChasePct),
        },
        category: {
          level1: baseline.level1, level2: baseline.level2, shops: baseline.shops,
          totalWan: baseline.totalWan, rank: baseline.rank,
          p20Wan: baseline.p20Wan, p40Wan: baseline.p40Wan, p60Wan: baseline.p60Wan,
          envMedian: baseline.envMedian, posShare: baseline.posShare,
          roiP50: baseline.roiP50, roiP75: baseline.roiP75, priceMed: baseline.priceMed,
        },
        result: {
          total: scoreResult.total, level: scoreResult.level,
          budgetTier: scoreResult.budgetTier,
          dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max, band: d.band })),
        },
      });
      setScoreAi(ai);
      // GitHub 版埋点：商品打分（同商品/同类目/同得分会话内只记一次）——全量输入+总分/各维度分/适配层级/AI结论全文
      const scoreKey = `score|${form.productName.trim()}|${baseline.level2}|${scoreResult.total}`;
      if (!ghScoreLogged.current.has(scoreKey)) {
        ghScoreLogged.current.add(scoreKey);
        const dimsText = scoreResult.dims.map(d => `${d.name} ${d.score}/${d.max}`).join('；');
        const aiConclusion = [
          ai.summary ? `【总评】${ai.summary}` : '',
          ai.redLines?.length ? `【红线检测】\n${ai.redLines.map(x => `${x.hit ? '⚠️命中' : '✅通过'} ${x.name}：${x.reason}`).join('\n')}` : '',
          ai.strategy?.length ? `【投放策略】\n${ai.strategy.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
          ai.risks?.length ? `【风险提示】\n${ai.risks.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
          ai.optimize?.length ? `【优化建议】\n${ai.optimize.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
          ai.shortBoard ? `【核心短板】${ai.shortBoard}` : '',
        ].filter(Boolean).join('\n\n');
        trackUsage('商品分析', form.productName.trim(), ghInputSummary(),
          `${scoreResult.total}分 / ${LEVEL_META[scoreResult.level].label}`,
          {
            ...ghBaseExtra('商品分析'),
            scoreTotal: scoreResult.total,
            scoreDims: dimsText,
            scoreLevel: LEVEL_META[scoreResult.level].label,
            scoreConclusion: aiConclusion,
            outputJson: JSON.stringify({ total: scoreResult.total, level: scoreResult.level, dims: scoreResult.dims, ai }),
          });
        // 商品分析完成 → 自动汇聚到代理商爆品库（静默，失败不影响主流程；同商品同得分只写一次）
        upsertBaopin({
          product: { productName: form.productName.trim(), level1: baseline.level1, url: form.url.trim() },
          scoreResult: {
            total: scoreResult.total,
            dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max })),
          },
          category: { envMedian: baseline.envMedian, posShare: baseline.posShare, rank: baseline.rank },
          history: { dailySpend: toNum(form.qianchuanDailySpend) ?? undefined, stableRoi: toNum(form.stableRoi) ?? undefined },
        }).catch(() => { /* 爆品库汇聚失败静默处理 */ });
      }
      return ai;
    } catch (e) {
      setScoreAiError(e instanceof Error ? e.message : 'AI 诊断生成失败，请重试');
      return null;
    } finally {
      setScoreAiLoading(false);
    }
  };

  // 生成一页纸报告（scoring_report）：未跑 AI 诊断时先自动跑，把红线/策略带进报告
  const handleGenerateReport = async () => {
    if (!baseline || scoreResult.level === 'none') return;
    setReportLoading(true);
    setReportError('');
    try {
      let ai = scoreAi;
      if (!ai) ai = await runScoringAi();
      const report = await fetchScoringReport({
        product: {
          productName: form.productName.trim(), brand: form.brand.trim(),
          industry: form.industry || '其他', category: form.category.trim() || form.level2,
          price: toNum(form.price), sellingPoints: form.sellingPoints.trim(), agent: form.agent.trim(),
          usageScene: form.usageScene.trim(), targetAudience: form.targetAudience.trim(),
        },
        inputs: {
          xcBudgetWan: toNum(form.xcDailyBudgetWan),
          dailySpend: toNum(form.qianchuanDailySpend), penetration: toNum(form.targetPenetration),
          stableRoi: toNum(form.stableRoi), targetRoi: toNum(form.targetRoi),
          reverseSelectPct: toNum(form.reverseSelectPct), materialChasePct: toNum(form.materialChasePct),
        },
        category: {
          level1: baseline.level1, level2: baseline.level2, shops: baseline.shops,
          totalWan: baseline.totalWan, rank: baseline.rank,
          p20Wan: baseline.p20Wan, p40Wan: baseline.p40Wan, p60Wan: baseline.p60Wan,
          envMedian: baseline.envMedian, posShare: baseline.posShare,
          roiP50: baseline.roiP50, roiP75: baseline.roiP75, priceMed: baseline.priceMed,
        },
        result: {
          total: scoreResult.total, level: scoreResult.level,
          budgetRatio: scoreResult.budgetRatio, budgetTier: scoreResult.budgetTier,
          tolerance: scoreResult.tolerance,
          roiRatio: scoreResult.roiRatio, priceDev: scoreResult.priceDev,
          dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max, band: d.band })),
        },
        ai,
      });
      setScoreReport(report);
      setTimeout(() => document.getElementById('scoring-report-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : '一页纸报告生成失败，请重试');
    } finally {
      setReportLoading(false);
    }
  };

  // 选二级类目后，行业未手动设置则按一级类目联动
  const onLevel2Change = (b: CategoryBaseline | null) => {
    if (b && !form.industry) {
      const ind = LEVEL1_TO_INDUSTRY[b.level1];
      if (ind) onIndustryChange(ind);
    }
  };

  // 一级类目手选：联动对内行业、清空已选二级类目
  const handlePickLevel1 = (l1: string) => {
    setForm(f => ({ ...f, level1: l1, level2: '' }));
    const ind = l1 ? LEVEL1_TO_INDUSTRY[l1] : undefined;
    if (ind && !form.industry) onIndustryChange(ind);
  };

  // 二级类目手选/识别：回填一级类目 + 联动行业（baseline 由 form.level2 的 memo 自动推导）
  const handlePickLevel2 = (cat: CategoryBaseline | null) => {
    setForm(f => ({ ...f, level2: cat ? cat.level2 : '', level1: cat ? cat.level1 : f.level1 }));
    onLevel2Change(cat);
  };

  // 清空打分区全部输入
  const handleClearScoring = () => {
    setForm({ ...INITIAL_FORM });
    setIdOnlyItem(null);
    setRecognizeMsg('');
    setScoreAi(null); setScoreAiError('');
    setScoreReport(null); setReportError('');
  };

  // ---- 链接识别（支持商品链接 / v.douyin.com 短链 / 整段抖音分享口令）----
  const handleRecognize = async () => {
    const raw = form.url.trim();
    if (!raw || recognizing) return;
    setRecognizing(true);
    setRecognizeMsg('正在识别链接/分享文本（抓取商品页并调用 AI 提取商品名，约 10-30 秒）...');
    try {
      const r = await extractFromUrl(raw);
      if (!r) {
        setRecognizeMsg('未能识别：请粘贴商品链接、v.douyin.com 短链、整段抖音分享文本或纯数字商品ID，也可手动补录下方产品信息（不影响分析）');
        return;
      }
      // 半成功：仅提取到商品ID（精选联盟长链 JS 空壳 / 纯数字ID），展开就近补填表单
      if (r.source === 'id') {
        setForm(f => ({ ...f, url: r.url || f.url }));
        setIdOnlyItem({ itemId: r.itemId || '' });
        setRecognizeMsg(`已提取商品ID ${r.itemId || ''}（该内部页抖音未开放详情），请在下方补填商品名称`);
        return;
      }
      const recognizedName = r.productName || '';
      setIdOnlyItem(null);
      // 类目始终以「本次识别的新商品」为准：先按商品名关键词匹配，再按 AI 识别出的品类文本/类目名兜底；
      // 均未命中则清空旧商品遗留的一二级类目（避免用错类目底表打分），由用户手动选择
      const newCat = suggestCategory(recognizedName)
        || (r.category
          ? (suggestCategory(r.category)
             || CATEGORIES.find(c => c.level2 === r.category || c.level1 === r.category) || null)
          : null);
      // 类目的行业优先（婴童营养品→母婴宠物 等），与手选类目行为一致；缺失才回退 AI 行业
      const sugIndustry = newCat ? industryFromLevel1(newCat.level1) : '';
      const finalIndustry = (sugIndustry || r.industry || '') as InternalIndustry | '';
      setForm(f => ({
        ...f,
        url: r.url || f.url,
        productName: recognizedName || f.productName,
        brand: r.brand || f.brand,
        industry: finalIndustry,
        category: r.category || f.category,
        level1: newCat ? newCat.level1 : '',
        level2: newCat ? newCat.level2 : '',
        // AI 推断的客单价/卖点/场景/人群：识别到才回填，否则保留用户已填
        price: r.price != null ? String(r.price) : f.price,
        sellingPoints: r.sellingPoints || f.sellingPoints,
        usageScene: r.usageScene || f.usageScene,
        targetAudience: r.targetAudience || f.targetAudience,
        influencerTags: finalIndustry ? [...DEFAULT_TAGS_BY_INDUSTRY[finalIndustry]] : f.influencerTags,
      }));
      const filledExtra = [
        r.price != null ? '客单价' : '',
        r.sellingPoints ? '卖点' : '',
        r.usageScene ? '场景' : '',
        r.targetAudience ? '人群' : '',
      ].filter(Boolean).join('、');
      const catNote = newCat
        ? `（已联动类目：${newCat.level1}/${newCat.level2}，请核对）`
        : '（未能自动识别类目，已清空旧类目，请手动选择一/二级类目）';
      setRecognizeMsg(
        r.source === 'llm'
          ? `识别成功，已预填产品信息${filledExtra ? `（含 AI 推断：${filledExtra}）` : ''}${catNote}，请核对修正`
        : r.source === 'title' ? `已根据商品页标题预填产品名${catNote}，请核对补全品牌/行业`
        : `链接已记录但未能抓到商品名（页面需登录），已生成占位名称${catNote}，请手动补全产品名`,
      );
    } catch {
      setRecognizeMsg('识别失败，请手动补录产品信息（不影响分析）');
    } finally {
      setRecognizing(false);
    }
  };

  // idOnly 补填确认：把商品名（必填）/品牌/客单价/卖点合并进表单，商品名联想二级类目
  const handleIdOnlyConfirm = (f: { productName: string; brand: string; price: string; sellingPoints: string }) => {
    const name = f.productName.trim();
    if (name.length < 2) return;
    const sug = suggestCategory(name);
    const sugIndustry = sug ? industryFromLevel1(sug.level1) : '';
    setForm(prev => ({
      ...prev,
      productName: name,
      brand: f.brand || prev.brand,
      price: f.price || prev.price,
      sellingPoints: f.sellingPoints || prev.sellingPoints,
      // 以本次新商品名联想结果为准：命中则联动，未命中则清空旧类目，避免沿用上一个商品的类目
      level1: sug ? sug.level1 : '',
      level2: sug ? sug.level2 : '',
      industry: sugIndustry || prev.industry,
      influencerTags: sugIndustry ? [...DEFAULT_TAGS_BY_INDUSTRY[sugIndustry]] : prev.influencerTags,
      category: prev.category || sug?.level2 || prev.category,
    }));
    setIdOnlyItem(null);
    setRecognizeMsg(`已补全商品「${name}」，可直接开始分析${sug ? `（已按商品名联动类目：${sug.level1}/${sug.level2}，请核对）` : '（未识别到类目，已清空旧类目，请手动选择）'}`);
  };
  const handleIdOnlyCancel = () => { setIdOnlyItem(null); };

  // ---- 必填校验（模式感知）----
  // 基础商品信息：所有模式都需要
  const baseMissing = useMemo(() => {
    const m: string[] = [];
    if (!form.productName.trim()) m.push('产品名');
    if (!form.brand.trim()) m.push('品牌');
    if (!form.industry) m.push('行业');
    return m;
  }, [form]);
  // 打分/全链路：还需二级类目 + 客单价 + 核心卖点 + 服务商 5 项
  const scoreMissing = useMemo(() => {
    const m: string[] = [];
    if (!form.level2) m.push('二级类目');
    if (toNum(form.price) == null) m.push('客单价');
    if (!form.sellingPoints.trim()) m.push('核心卖点');
    if (toNum(form.xcDailyBudgetWan) == null) m.push('星川日预算');
    if (toNum(form.stableRoi) == null) m.push('千川稳定ROI');
    if (toNum(form.targetRoi) == null) m.push('追投下星川目标ROI');
    if (toNum(form.reverseSelectPct) == null) m.push('达人反选比例');
    if (toNum(form.materialChasePct) == null) m.push('达人素材追投数量比例');
    return m;
  }, [form]);
  // 当前模式下的缺失项（决定 CTA 可用性与提示）
  const missing = useMemo(
    () => (mode === 'full' || mode === 'score') ? [...baseMissing, ...scoreMissing] : [...baseMissing],
    [baseMissing, scoreMissing, mode],
  );

  // 组装 FaaS 商品输入（两个阶段共用）
  const buildProductInput = useCallback((): ProductInput => ({
    url: form.url.trim(),
    productName: form.productName.trim(),
    brand: form.brand.trim(),
    industry: (form.industry || '其他') as InternalIndustry,
    category: form.category.trim() || form.level2,
    price: toNum(form.price) ?? 0,   // 单独脚本模式客单价可缺省（AI 未推断时按 0）
    usageScene: form.usageScene.trim(),
    sellingPoints: form.sellingPoints.trim(),
    targetAudience: form.targetAudience.trim(),
    qianchuanDailySpend: toNum(form.qianchuanDailySpend),
    targetPenetration: toNum(form.targetPenetration) ?? 15,
    stableRoi: toNum(form.stableRoi) ?? 0,
    targetRoi: toNum(form.targetRoi) ?? 0,
    reverseSelectPct: toNum(form.reverseSelectPct) ?? 0,
    materialChasePct: toNum(form.materialChasePct) ?? 0,
    influencerTags: form.influencerTags,
  }), [form]);

  // 第一阶段步骤定义（script 模式无打分步骤）
  const phase1StepsFor = (m: string) => m === 'script'
    ? [
        { key: 'wrap', label: '爆款案例匹配 · 跑量公式 · 合规' },
        { key: 'gen_brief', label: 'Brief 方向拆解（3-5 条）' },
      ]
    : [
        { key: 'score', label: '商品分析（五维适配 + AI 红线）' },
        { key: 'wrap', label: '爆款案例匹配 · 跑量公式 · 合规' },
        { key: 'gen_brief', label: 'Brief 方向拆解（3-5 条）' },
      ];

  // ---- 第一阶段：商品洞察 → 星川爆款素材参考 → Brief 拆解 ----
  const handleAnalyze = async () => {
    if (missing.length > 0 || loading) return;
    setError('');
    setResult(null);
    setBriefs([]);
    briefsOriginRef.current = [];
    setBriefsOptimized(null);
    setBriefsVersion('original');
    setExportTip('');
    setSelectedBriefIds(new Set());
    setScriptError('');
    setLoading(true);
    setLoadSteps(phase1StepsFor(mode));
    setLoadStepKey('');
    // 新商品分析：热点面板若开着，清旧结果并独立重新拉取（不阻塞、不干预主流程）
    setHotDockPlan(null);
    setHotDockError(false);
    if (hotDockOpen) void runHotDock();
    try {
      const input = buildProductInput();

      let r: AnalyzeResult;
      if (mode === 'script') {
        // 单独「内容脚本」模式：跳过打分，直接 wrap（爆款参考）+ gen_brief
        r = await analyzeBriefPhase(input, (s: string) => setLoadStepKey(s), undefined, { skipScore: true });
      } else {
        // 三段衔接①：确保第一部分 AI 红线/策略已生成（未生成则先补跑），再带入 Brief 拆解
        setLoadStepKey('score');
        let ai = scoreAi;
        if (!ai) ai = await runScoringAi();
        const redLineHit = ai?.redLines.some(x => x.hit) ?? false;
        const scoringCtx: ScoringContext = {
          total: scoreResult.total,
          level: scoreResult.level,
          levelLabel: LEVEL_META[scoreResult.level].label,
          redLineHit,
          level2: form.level2,
          dims: scoreResult.dims.map(d => ({ name: d.name, score: d.score, max: d.max, band: d.band })),
          redLines: ai?.redLines ?? [],
          strategy: ai?.strategy ?? [],
          risks: ai?.risks ?? [],
          optimize: ai?.optimize ?? [],
          summary: ai?.summary ?? '',
        };
        scoringCtxRef.current = scoringCtx;
        r = await analyzeBriefPhase(input, (s2: string) => setLoadStepKey(s2), scoringCtx, undefined);
      }
      setLoadStepKey('done');
      setResult(r);
      setBriefs(r.briefs);
      briefsOriginRef.current = r.briefs;
      setBriefsOptimized(null);
      setBriefsVersion('original');
      setSelectedBriefIds(new Set(r.briefs.map(b => b.id)));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // ---- Brief 勾选/编辑（Brief 方向卡交互）----
  const toggleBrief = useCallback((id: string) => {
    setSelectedBriefIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const patchBrief = useCallback((id: string, patch: Partial<BriefDirection>) => {
    setBriefs(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }, []);
  const setAllBriefsSelected = useCallback((on: boolean) => {
    setSelectedBriefIds(on ? new Set(briefs.map(b => b.id)) : new Set());
  }, [briefs]);

  // ---- 第二阶段：按用户选定/编辑的 Brief 生成四段式脚本（痛点分析·卖点分析·放大功效·加速转化）----
  const handleGenerateScripts = async () => {
    if (scriptLoading || !result) return;
    const selected = briefs.filter(b => selectedBriefIds.has(b.id));
    if (!selected.length) { setScriptError('请至少勾选 1 个 Brief 方向'); return; }
    setScriptError('');
    setScriptLoading(true);
    setScriptProgress({ done: 0, total: selected.length, name: '' });
    const input = buildProductInput();
    try {
      const dirs = await generateScriptsPhase(
        input, selected,
        (s: string) => {
          const m = /^dir(\d+)$/.exec(s);
          if (m) {
            const done = Number(m[1]);
            setScriptProgress({ done, total: selected.length, name: selected[done - 1]?.name || '' });
          }
        },
        { scoringCtx: scoringCtxRef.current || undefined },
      );
      const next: AnalyzeResult = { ...result, creativeDirections: dirs };
      setResult(next);

      // 台账埋点：四段脚本初次生成（随第二阶段完成触发；返回记录ID作为后续优化迭代链的根）
      const dirNameList = dirs.map(d => (d.angle || d.title || '').trim()).filter(Boolean).slice(0, 5);
      const casePool = [...next.matchedCaseDetails, ...next.moreCases];
      const refBrands = [...new Set(casePool.map(c => (c.brand || '').trim()).filter(Boolean))].join('、');
      const refHooks = next.moreCases
        .map(c => [c.brand && c.brand.trim(), c.hookDesign && c.hookDesign.trim()].filter(Boolean).join('｜'))
        .filter(Boolean).join('\n');
      scriptInitialLogId$.current = trackUsage('内容脚本', form.productName.trim(), ghInputSummary(),
        `脚本方向（${dirNameList.length} 个）：${dirNameList.join(' / ')}`,
        {
          ...ghBaseExtra(mode === 'script' ? '内容脚本' : '全链路分析'),
          scripts: ghScriptsFullText(dirs),
          iterType: '初次生成', iterRound: 0, refBrands, refHooks,
          briefs: ghBriefsFullText(briefs),
          selectedBriefs: selected.map(b => (b.name || '').trim()).filter(Boolean).slice(0, 5).join(' / '),
        });

      setTimeout(() => document.getElementById('sec-scripts-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e) {
      setScriptError(e instanceof Error ? e.message : '脚本生成失败，请重试');
    } finally {
      setScriptLoading(false);
    }
  };

  // ---- 单独「达人匹配」模式：识别商品后直接进入匹配（无需打分/脚本）----
  const handleMatchStart = () => {
    if (baseMissing.length > 0) return;
    setError('');
    setMatchStarted(true);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  // ---- 引用爆品库：选中商品后带入当前板块（填充名称/链接/服务商/行业）----
  const handlePickBaopin = (item: BaopinItem) => {
    setForm((f) => {
      const nf = { ...f };
      if (item.url) nf.url = item.url;
      if (item.name) nf.productName = item.name;
      if (!nf.agent && item.agency) nf.agent = item.agency;
      if (mode === 'full' || mode === 'score') {
        if (item.industry) nf.level1 = item.industry;
      } else {
        const mapped = (LEVEL1_TO_INDUSTRY as Record<string, InternalIndustry>)[item.industry];
        if (mapped) nf.industry = mapped;
      }
      return nf;
    });
    setBaopinOpen(false);
  };

  // ---- 储存内容分析结果到本地（IndexedDB，对外版）----
  const handleSaveContent = async () => {
    if (!result) return;
    setSavingContent(true);
    try {
      const dirs: ContentDirectionSnapshot[] = [];
      (result.creativeDirections || []).forEach((d, i) => {
        const getter = dirGettersRef.current.get(i);
        dirs.push(getter ? getter() : {
          index: i, angle: d.angle, original: d, current: d, version: 0, iterations: [],
        });
      });
      const refHooks = [
        ...(result.creativeDirections || []).flatMap((d) => d.hooks || []),
        ...(result.moreCases || []).map((c) => c.hookDesign).filter(Boolean),
      ].filter(Boolean).join('\n');
      await addContentHistory({
        providerName: currentProviderName(),
        productName: form.productName.trim(),
        brand: form.brand,
        industry: form.industry,
        category: form.category || form.level2,
        createdAt: Date.now(),
        url: form.url,
        briefs,
        matchedCases: result.matchedCases || [],
        moreCases: result.moreCases || [],
        refHooks,
        directions: dirs,
        conceptVideoUrl: '',
        hotMarketingRef: lastHotTextRef.current || '',
        qianchuanBreakdown: lastMatTextRef.current || '',
      });
      setSaveConfirmOpen(false);
      setContentSavedTip(true);
      window.setTimeout(() => setContentSavedTip(false), 2800);
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setSavingContent(false);
    }
  };

  // ---- 对外版：客户 Brief 优化版本应用 / 原始⇄优化切换 ----
  const handleOptimizedBriefs = (list: BriefDirection[]) => {
    if (!briefsOriginRef.current.length) briefsOriginRef.current = briefs;
    setBriefsOptimized(list);
    setBriefs(list);
    setBriefsVersion('optimized');
    setSelectedBriefIds(new Set(list.map(b => b.id)));
  };
  const handleSwitchBriefVersion = (v: 'original' | 'optimized') => {
    const list = v === 'optimized' ? briefsOptimized : briefsOriginRef.current;
    if (!list) return;
    setBriefsVersion(v);
    setBriefs(list);
    setSelectedBriefIds(new Set(list.map(b => b.id)));
  };

  // ---- 对外版：脚本一键导出（商品信息 + 全部脚本方向四段全文）----
  const buildScriptsExport = useCallback((): string => {
    if (!result) return '';
    const SEG_LABEL: Array<[keyof NonNullable<CreativeDirection['script']>, string]> = [
      ['pain', '痛点分析'], ['sell', '卖点分析'], ['release', '放大功效'], ['close', '加速转化'],
    ];
    const L: string[] = [];
    L.push(`# 内容脚本 · ${form.productName.trim() || '未命名商品'}`);
    L.push('');
    L.push('## 商品信息');
    if (form.brand) L.push(`- 品牌：${form.brand}`);
    if (form.industry) L.push(`- 行业：${form.industry}`);
    if (form.category || form.level2) L.push(`- 类目：${form.category || form.level2}`);
    if (form.price) L.push(`- 客单价：${form.price}`);
    if (form.url) L.push(`- 商品链接：${form.url}`);
    if (form.sellingPoints) L.push(`- 核心卖点：${form.sellingPoints}`);
    if (briefs.length) {
      L.push('');
      L.push('## 已确认 Brief 方向');
      briefs.forEach((b, i) => L.push(`${i + 1}. ${b.name}｜核心卖点：${b.coreSellingPoint}｜目标人群：${b.targetAudience}｜验证目标：${b.validationGoal}`));
    }
    result.creativeDirections.forEach((d, i) => {
      L.push('');
      L.push(`## 脚本方向 ${i + 1}：${d.angle}｜${d.title}`);
      if (d.concept) L.push(`\n方向逻辑：${d.concept}`);
      if (d.hookType) L.push(`钩子类型：${d.hookType}`);
      if (d.hooks?.length) L.push(`黄金钩子：${d.hooks.join(' / ')}`);
      SEG_LABEL.forEach(([key, label]) => {
        const seg = d.script?.[key];
        if (!seg) return;
        L.push(`\n### ${label}`);
        if (seg.visual) L.push(`- 画面：${seg.visual}`);
        if (seg.voiceover) L.push(`- 口播：${seg.voiceover}`);
      });
      if (d.shootingTip) L.push(`\n拍摄建议：${d.shootingTip}`);
    });
    return L.join('\n');
  }, [result, form, briefs]);

  const copyExportText = async () => {
    const text = buildScriptsExport();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setExportTip('已复制全文（Markdown），可直接粘贴到文档/飞书');
    window.setTimeout(() => setExportTip(''), 2600);
  };
  const downloadExportTxt = () => {
    const text = buildScriptsExport();
    if (!text) return;
    downloadTextFile(`内容脚本-${form.productName.trim() || '商品'}.txt`, text, 'text/plain');
    setExportTip('已下载 TXT 文件');
    window.setTimeout(() => setExportTip(''), 2600);
  };

  // ---- 切换模式 ----
  // 状态保留：不再清空任何已生成内容。工作模式 ↔ 非工作模式（首页/爆品库/打标等）切换时，
  // 工作台大树保持挂载仅隐藏，表单输入、打分、脚本（含迭代）、达人匹配结果全部在会话内保留。
  const switchMode = (m: Mode) => {
    // 独立达人匹配站：锁定 match，忽略任何切往其它模式/首页的尝试
    if (MATCH_ONLY && m !== 'match') return;
    // 离开时若是工作模式，记下来源模式，供隐藏挂载使用（目标也是工作模式时以目标为准，见 wm）
    if (WORK_MODES.includes(mode)) setKeptWorkMode(mode);
    setWbUserName(getUserName()); // 进入/切换模式时同步当前使用者名字（首页可能刚完成名字登录）
    setMode(m);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 前往服务商达人打标：对外版直接切打标 tab；对内打开公开版打标页（服务商三元组登录）
  const goTagger = () => {
    if (isGhPages()) switchMode('tagger');
    else window.open('https://didimarco26.github.io/xingchuan-workbench/?from=tagger', '_blank');
  };

  // 「已加入爆品库，点击查看」：新标签页打开爆品库，不打断当前页分析状态
  const goBaopinNewTab = () => {
    window.open(`${window.location.origin}${window.location.pathname}?from=baopin`, '_blank', 'noopener');
  };

  const handleCopyAll = () => {
    if (!result) return;
    const r = result;
    const lines: string[] = [];
    lines.push(`${ghAppTitle()} · 分析报告（${form.productName}）`);
    lines.push(`总分：${r.totalScore}/100`);
    lines.push('');
    lines.push('【五维分析】');
    (['budget', 'roiTolerance', 'delivery', 'trend', 'pricePoint'] as const).forEach(k => {
      const s = r.scoring.scores[k];
      lines.push(`· ${DIM_META[k].name}：${s.score}/${DIM_META[k].max} ${s.rationale}`);
    });
    lines.push('');
    lines.push('【红线】');
    r.scoring.redLines.forEach(rl => lines.push(`· ${rl.hit ? '✗命中' : '✓未命中'} ${rl.name}：${rl.reason}`));
    lines.push('');
    lines.push('【策略建议】');
    r.scoring.strategyAdvice.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
    r.creativeDirections.forEach(d => {
      lines.push(`【方向 · ${d.angle}】${d.title}`);
      lines.push(`逻辑：${d.concept}`);
      (['pain', 'sell', 'release', 'close'] as const).forEach(seg => {
        const x = d.script[seg];
        lines.push(`[${SEG_META[seg].label}] 画面：${x.visual}｜口播：${x.voiceover}｜参考：${x.refCaseTitle}`);
      });
      lines.push(`备选钩子：${d.hooks.join(' / ')}`);
      lines.push('');
    });
    lines.push('【达人框架】');
    r.influencerFramework.forEach((p, i) => lines.push(`${i + 1}. ${p.persona}｜${p.contentForm}｜${p.followerTier}｜${p.reason}`));
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 非工作模式视图（首页 / 经营看板 / 打标 / 记录 / 爆品库 / 我的工作台）
  let nonWorkView: ReactNode = null;
  if (mode === 'select') nonWorkView = demo
    ? <ModeSelect onPick={handleDemoPick} />
    : <ModeSelect onPick={switchMode} />;
  // 经营看板计算器：iframe 内嵌独立应用，与商品链路完全隔离；演示模式用本地预置看板
  else if (mode === 'calculator') nonWorkView = demo
    ? <DemoBoard onBack={() => switchMode('select')} />
    : <BoardSection onBack={() => switchMode('select')} />;
  // 服务商达人自助打标：仅 GitHub Pages 公开版可达（配合本机 xc-tagger 工具）
  else if (mode === 'tagger') {
    nonWorkView = isGhPages()
      ? <SelfTagPanel onBack={() => switchMode('select')} onSwitchIdLookup={() => switchMode('idlookup')} />
      : <ModeSelect onPick={switchMode} />;
  }
  // 达人信息互查：GitHub Pages 公开版（配合本机 xc-id-lookup 工具，只补全身份不打分）
  else if (mode === 'idlookup') {
    nonWorkView = isGhPages()
      ? <IdLookupPanel onBack={() => switchMode('select')} />
      : <ModeSelect onPick={switchMode} />;
  }
  // KOC 契合度论证（美妆/个护商品 × 单达人深度论证）：对内对外均可直达，无门禁
  else if (mode === 'kocfit') {
    nonWorkView = <KocFitPanel onBack={() => switchMode('select')} onSwitchTool={(m) => switchMode(m as Mode)} />;
  }
  // 服务商达人上传记录：对内专属（读取 GitHub 版服务商回传的打标记录）；真实公开域名下不可达
  else if (mode === 'records') {
    nonWorkView = isPublicHost()
      ? <ModeSelect onPick={switchMode} />
      : <TaggerRecordsPanel onBack={() => switchMode('select')} />;
  }
  // 代理商爆品库：对内对外均可
  else if (mode === 'baopin') nonWorkView = <BaopinLibrary onBack={() => switchMode('select')} />;
  // 个人工作台：对外版未登录时 GhGate 自动展示登记页；对内版直接渲染全服务商全量工作台
  else if (mode === 'mywb') {
    nonWorkView = isGhPages()
      ? <GhGate><MyWorkbench onBack={() => switchMode('select')} /></GhGate>
      : <MyWorkbench onBack={() => switchMode('select')} />;
  }
  // 达人交付管理工作台：融入「我的工作台」并直达「达人交付管理」Tab
  // 对外版走 GhGate 登录门禁；对内版直接渲染（渠道经理内部使用）
  else if (mode === 'delwb') {
    nonWorkView = isGhPages()
      ? <GhGate><MyWorkbench onBack={() => switchMode('select')} initialTab="delivery" /></GhGate>
      : <MyWorkbench onBack={() => switchMode('select')} initialTab="delivery" />;
  }

  // wm：工作台大树当前采用的模式——工作模式期间=mode；离开后=最近记住的工作模式（保活挂载）
  const wm: Mode | null = WORK_MODES.includes(mode) ? mode : keptWorkMode;
  // 从未进入过工作台时，直接渲染非工作视图（无需隐藏挂载）
  if (nonWorkView && !wm) return (
    <>
      {nonWorkView}
      {/* 演示落地页保持「只有一个按钮」的纯净形态，不显示悬浮开关 */}
      {!(demo && mode === 'select') && <DemoControls />}
    </>
  );

  const isFull = wm === 'full';
  const isScore = wm === 'score';
  const isScript = wm === 'script';
  const isMatch = wm === 'match';
  const panelVariant: 'full' | 'product' = (isFull || isScore) ? 'full' : 'product';
  const sectionTitle =
    isFull || isScore ? '商品分析'
    : isScript ? '商品信息（用于内容创意）'
    : '商品信息（用于达人匹配）';
  const sectionDesc =
    isFull ? '链接识别 → 商品信息（含二级类目底表）→ 服务商参数 → 100 分制适配分析 + AI 红线/策略'
    : isScore ? '链接识别 → 二级类目底表 → 服务商参数 → 实时 100 分制适配分析 + AI 红线/策略'
    : isScript ? '粘贴商品链接自动识别商品名/品牌/行业/客单价/卖点，先拆解 3-5 个拍摄 Brief，确认后生成四段式脚本'
    : '粘贴商品链接自动识别商品信息，结合内容偏好标签，直接匹配存量星川/优质星川达人';

  // 左侧导览锚点（三段统一命名：商品分析 / 内容创意 / 达人匹配；子项按当前模式/状态动态展开）
  const hasMatchedCases = !!result && (
    (result.matchedCaseDetails && result.matchedCaseDetails.length > 0) || result.moreCases.length > 0
  );
  const part1Children: NavNode[] = (isFull || isScore) ? [
    { id: 'pa-info-anchor', label: '商品信息录入' },
    { id: 'pa-score-anchor', label: '五维适配结论' },
    { id: 'pa-ai-anchor', label: 'AI 红线与投放策略' },
    ...(scoreReport ? [{ id: 'scoring-report-anchor', label: '一页纸报告' }] : []),
  ] : [];
  const creativeChildren: NavNode[] = result ? [
    ...(hasMatchedCases ? [{ id: 'sec-cases-anchor', label: '该商品相关的星川爆款素材参考' }] : []),
    ...(isGhPages() ? [{ id: 'sec-strategy-anchor', label: '素材策略一页纸', highlight: true }] : []),
    ...(briefs.length ? [{ id: 'sec-brief-anchor', label: '拍摄 Brief 拆解' }] : []),
    ...result.creativeDirections.map((d, i) => ({
      id: `sec-dir-anchor-${i}`,
      label: `脚本方向 ${i + 1}${d.angle ? ` · ${d.angle}` : ''}`.slice(0, 18),
    })),
  ] : [];
  const navItems: NavNode[] = [
    { id: 'sec-scoring', label: isFull || isScore ? '商品分析' : '商品信息', children: part1Children },
    ...(result && (isFull || isScript) ? [{
      id: 'sec-creative',
      label: '内容创意',
      children: creativeChildren,
    }] : []),
    ...(((isFull && result) || (isMatch && matchStarted)) ? [{
      id: 'sec-influencer',
      label: '达人匹配',
      children: [
        { id: 'im-anchor-result', label: '匹配结果' },
        { id: 'im-anchor-list', label: '推荐达人列表' },
      ],
    }] : []),
  ];

  return (
    <>
      {/* 非工作模式视图（首页/看板/爆品库等）；工作台同时隐藏挂载在下方，切回时保留全部会话状态 */}
      {nonWorkView}
      <div className={nonWorkView ? 'hidden' : undefined} aria-hidden={!!nonWorkView}>
    <div className="min-h-screen bg-canvas">
      {/* 顶部 */}
      <header className="bg-white border-b border-line-soft px-4 sm:px-6 sticky top-0 z-20">
        <div className="max-w-[1720px] mx-auto h-[60px] flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-btn shrink-0">
            <Sparkles className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-ink-900 whitespace-nowrap">{ghAppTitle()}</h1>
            <p className="text-[11px] text-ink-400 whitespace-nowrap truncate">{ghAppSubtitle()}</p>
          </div>
          {/* 历史记录 + 名字登录：对内对外通用，历史按名字归档 */}
          <button
            type="button"
            onClick={() => (wbUserName ? setHistoryOpen(true) : setLoginOpen(true))}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-brand-50 border border-brand-100 text-[13px] font-semibold text-brand-700 hover:border-brand-300 transition-colors"
          >
            <History className="w-3.5 h-3.5" /> 历史记录
          </button>
          {wbUserName ? (
            <button
              type="button"
              title="切换或退出使用者名称"
              onClick={() => setLoginOpen(true)}
              className="shrink-0 hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-white border border-line text-[13px] font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700 transition-colors max-w-[170px]"
            >
              <User className="w-3.5 h-3.5 text-brand-500 shrink-0" />
              <span className="truncate">{displayIdentity(wbUserName)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[13px] font-bold shadow-btn hover:brightness-105 transition-all"
            >
              <User className="w-3.5 h-3.5" /> 登录
            </button>
          )}
          {!MATCH_ONLY && (
          <button
            type="button"
            onClick={() => switchMode('select')}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-white border border-line text-[13px] font-medium text-ink-700 hover:border-ink-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 切换模式
          </button>
          )}
        </div>
      </header>

      {/* 我的使用记录弹窗（本地按名字归档；对外版另合并 FaaS 跨设备历史） */}
      <GhHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />
      {/* 轻量化名字登录弹窗（对内对外通用，仅填名字、无密码） */}
      <NameLogin open={loginOpen} onClose={() => { setLoginOpen(false); setWbUserName(getUserName()); }} />

      {/* 主容器加宽至 1720：宽屏下画布整体左移、右侧留白给侧边面板 */}
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 flex items-start gap-5">
        {/* 左侧固定导览（宽屏显示，sticky 吸附视口，滚动高亮当前板块） */}
        <aside className="hidden lg:block w-44 shrink-0 side-nav-sticky">
          <SideNav items={navItems} />
        </aside>

      <main className="flex-1 min-w-0 py-6 space-y-6 pb-20">
        {/* 全链路模式：细步骤条（替代紫色大横幅） */}
        {isFull && (
          <div className="flex items-center gap-3 px-1">
            {[
              { n: 1, t: '商品分析' },
              { n: 2, t: '内容创意' },
              { n: 3, t: '达人匹配' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="w-[22px] h-[22px] rounded-full bg-brand-600 text-white text-[12px] font-bold grid place-items-center">{s.n}</span>
                  <span className="text-[12.5px] font-semibold text-brand-700">{s.t}</span>
                </div>
                {i < 2 && <div className="flex-1 h-0.5 bg-line rounded-full" />}
              </div>
            ))}
          </div>
        )}

        {/* ============ 商品信息 / 打分面板 ============ */}
        <div id="sec-scoring" className="bg-white rounded-2xl shadow-card border border-line p-5 sm:p-6 space-y-6 scroll-mt-20">
          <SectionTitle icon={isFull || isScore ? Gauge : isScript ? FileText : Users}
            title={sectionTitle} desc={sectionDesc}
            badge={isFull || isScore ? '商品分析' : isScript ? '内容创意' : '达人匹配'} />

          {/* 板块顶部操作条：引用爆品库（对外三板块 / 对内商品分析） + 内容历史（对外脚本） */}
          {/* 顶栏操作：对外版/全链路/打分支持引用爆品库（demo 与正式版一致） */}
          {(isGhPages() || isFull || isScore) && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button" onClick={() => setBaopinOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-200 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50 hover:border-brand-300 transition-colors shadow-sm"
              >
                <Package className="w-3.5 h-3.5" /> 引用爆品库商品
              </button>
              {isGhPages() && isScript && (
                <button
                  type="button" onClick={() => setContentHistoryOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <History className="w-3.5 h-3.5" /> 历史记录
                </button>
              )}
              <span className="text-[11px] text-gray-400 hidden sm:inline">从本服务商爆品库带入商品，免重复填写</span>
            </div>
          )}
          {/* 达人匹配 → KOC 单达人深度论证入口（仅独立 match 模式展示，协调达人板块结构）；独立匹配站锁定单模块，隐藏跨模块入口 */}
          {isMatch && !MATCH_ONLY && (
            <button
              type="button" onClick={() => switchMode('kocfit')}
              className="w-full flex items-center gap-3 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50/90 to-pink-50/60 px-4 py-3 text-left hover:border-rose-300 hover:shadow-sm transition"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0 shadow-btn">
                <Heart className="w-[18px] h-[18px] text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-rose-700">KOC 契合度论证 <span className="ml-1 text-[10.5px] font-medium text-rose-500 border border-rose-200 bg-white/70 px-1.5 py-0.5 rounded-md">美妆/个护专用</span></span>
                <span className="block text-[11.5px] text-rose-600/70 mt-0.5">四库匹配负责批量找名单；敲定单个 KOC 前，用视频截图+评论证据做五轴契合度论证与前置费建议，含可发品牌方的对外版报告</span>
              </span>
              <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />
            </button>
          )}
          {/* 从打分页带入提示 */}
          {prefill && (
            <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[12px] text-ink-700">
              <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-bold text-ink-900">已从「商品分析」页带入产品信息与投放参数</span>（产品名 / 品牌 / 品类 / 客单价 / 核心卖点 / 使用场景 / 目标人群 / 千川消耗 / 渗透率 / ROI / 达人反选比例 / 素材追投数量比例），请核对后点击「开始分析」。
                {prefill.total && (
                  <span className="ml-1">商品分析综合分：<b className="text-ink-900">{prefill.total}</b>/100
                    {prefill.level === 'high' ? '（高度适配）' : prefill.level === 'mid' ? '（中度适配）' : prefill.level === 'low' ? '（低度适配）' : ''}
                  </span>
                )}
              </div>
              <button onClick={() => setPrefill(null)} className="text-brand-400 hover:text-brand-700 shrink-0 text-sm leading-none" aria-label="关闭提示">✕</button>
            </div>
          )}

          <ScoringPanel
            form={form}
            set={(k, v) => set(k as keyof FormState, v as FormState[keyof FormState])}
            onIndustryChange={onIndustryChange}
            onLevel2Change={onLevel2Change}
            onToggleTag={toggleTag}
            recognizing={recognizing}
            recognizeMsg={recognizeMsg}
            onRecognize={handleRecognize}
            onPasteLink={(v: string) => { set('url', v); setRecognizeMsg(''); setIdOnlyItem(null); }}
            baseline={baseline}
            scoreResult={scoreResult}
            canScore={canScore}
            scoreAi={scoreAi}
            scoreAiLoading={scoreAiLoading}
            scoreAiError={scoreAiError}
            onRunAi={runScoringAi}
            onPickLevel1={handlePickLevel1}
            onPickLevel2={handlePickLevel2}
            onClear={handleClearScoring}
            variant={panelVariant}
            showInfluencerTags={isMatch}
            idOnlyItemId={idOnlyItem?.itemId}
            onConfirmIdOnly={handleIdOnlyConfirm}
            onCancelIdOnly={handleIdOnlyCancel}
          />

          {/* 一页纸评估报告（全链路第一部分 + 单独打分模式，评分完成后生成发品牌方） */}
          {(isFull || isScore) && (
            <div id="scoring-report-anchor" className="scroll-mt-20">
              <ScoringReportSection
                canScore={canScore}
                loading={reportLoading}
                error={reportError}
                report={scoreReport}
                onGenerate={handleGenerateReport}
                productName={form.productName}
                brand={form.brand}
                agent={form.agent}
                scoreResult={scoreResult}
                redLines={scoreAi?.redLines || []}
                industry={form.industry}
                level1={form.level1}
                influencerTags={form.influencerTags}
                onGoTagger={goTagger}
                level2={form.level2}
                productUrl={form.url}
                inputs={{
                  xcBudgetWan: toNum(form.xcDailyBudgetWan),
                  price: toNum(form.price),
                  stableRoi: toNum(form.stableRoi),
                  targetRoi: toNum(form.targetRoi),
                  reverseSelectPct: toNum(form.reverseSelectPct),
                  materialChasePct: toNum(form.materialChasePct),
                }}
                onGoBaopin={goBaopinNewTab}
              />
            </div>
          )}

          {/* 提交区（打分模式无 CTA，实时出分） */}
          {!isScore && (
          <div className="pt-4 border-t border-dashed border-gray-200">
            {isFull && (
            <p className="text-[11px] text-gray-500 mb-2.5 flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
              <span>三段顺滑衔接：① 商品分析（综合分/红线/AI策略）→ <b>自动带入</b> ② 内容创意：素材策略一页纸自动生成 + 该商品相关的星川爆款素材参考 + Brief 拆解（可编辑勾选）→ 按 Brief 生成四段式内容脚本（痛点分析·卖点分析·放大功效·加速转化）与跑量公式 → <b>自动带入</b> ③ 达人匹配。全程妙笔 FaaS 中继，无需 API Key。</span>
            </p>
            )}
            {isMatch && (
            <p className="text-[11px] text-gray-500 mb-2.5 flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
              <span>基于商品名/行业/卖点与上方内容偏好标签，从存量星川 + 优质星川达人库 AI 智能匹配，可在结果中调整数量后重跑。</span>
            </p>
            )}
            <button
              type="button"
              onClick={isMatch ? handleMatchStart : handleAnalyze}
              disabled={missing.length > 0 || loading}
              className="w-full py-3.5 rounded-[10px] bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-btn flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
                : isMatch ? <Users className="w-[18px] h-[18px]" /> : isScript ? <FileText className="w-[18px] h-[18px]" /> : <Sparkles className="w-[18px] h-[18px]" />}
              {loading
                ? (isScript ? '商品洞察与 Brief 方向拆解中…' : '商品分析 · 洞察 · 爆款参考 · Brief 拆解中…')
                : isMatch ? '开始匹配达人（存量星川 + 优质星川 AI 智能匹配）→'
                : isScript ? '生成商品洞察与拍摄 Brief（3-5 个方向）→'
                : '① 商品分析完成，开始生成 ② 商品洞察 · 爆款素材参考 · Brief 拆解 →'}
            </button>
            {missing.length > 0 && !loading && (
              <p className="mt-2 text-[11px] text-warn-ink text-center">
                待完善：{missing.join('、')}（商品链接可留空，直接录入产品名即可）
              </p>
            )}
          </div>
          )}
          {isScore && (
            <p className="text-[11px] text-gray-500 bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2.5 flex items-start gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
              <span>本模式专注商品分析：填完<b>二级类目 + 客单价 + 服务商 5 项参数</b>后右侧实时出 100 分制适配结果，点击「AI 诊断红线」生成红线检测与投放策略建议。
                {missing.length > 0 && <span className="text-warn-ink"> 待完善：{scoreMissing.concat(baseMissing).join('、')}。</span>}
              </span>
            </p>
          )}
        </div>

        {/* ============ 加载态 ============ */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="space-y-4">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                  AI 分析中，正在拆解商品与 Brief 方向…
                </p>
                {loadSteps.map((s, i) => {
                  const curIdx = loadSteps.findIndex(x => x.key === loadStepKey);
                  const done = loadStepKey === 'done' || (curIdx >= 0 && i < curIdx);
                  const active = !done && ((curIdx < 0 && i === 0) || i === curIdx);
                  const Icon = s.key === 'score' ? Gauge : s.key === 'gen_brief' ? ClipboardList : Clapperboard;
                  return (
                    <div key={s.key} className={`flex items-center gap-3 transition-all ${active || done ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        done ? 'bg-ok-bg text-ok-ink' : active ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <span className={`text-sm ${active ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        {['①', '②', '③'][i]} {s.label}
                        {active && <span className="text-brand-500 ml-1">…</span>}
                      </span>
                    </div>
                  );
                })}
                <p className="text-[11px] text-gray-400 pt-1">完成后可查看/编辑 Brief 方向，再点击「生成脚本」按所选 Brief 生成四段式脚本，失败会自动重试，请勿关闭页面…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ 错误态 ============ */}
        {error && !loading && (
          <div className="bg-danger-bg border border-danger-line rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <TriangleAlert className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-danger-ink">分析失败</p>
                <p className="text-xs text-danger-ink mt-1">{error}</p>
              </div>
              <button
                onClick={handleAnalyze}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-danger-ink transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> 重试
              </button>
            </div>
          </div>
        )}

        {/* ============ 结果区（全链路 / 单独内容脚本） ============ */}
        {result && !loading && (
          <div ref={resultRef} className="space-y-6 scroll-mt-20">
            <ResultView
              result={result}
              productName={form.productName}
              copied={copied}
              onCopy={handleCopyAll}
              hideScore={isScript}
              hideMatch={isScript}
              onOpenHotMarketing={openHotMarketingAdvance}
              onOpenSidePanel={openSideRefPanel}
              sidePanelKind={refHotOpen ? 'hot' : refMatOpen ? 'mat' : null}
              scriptFullText={ghScriptsFullText}
              initialLogId$={scriptInitialLogId$.current}
              registerSnapshot={registerDirSnapshot}
              registerIntroducer={registerDirIntroducer}
              briefs={briefs}
              selectedBriefIds={selectedBriefIds}
              onToggleBrief={toggleBrief}
              onPatchBrief={patchBrief}
              onSetAllBriefsSelected={setAllBriefsSelected}
              scriptGen={{
                loading: scriptLoading,
                progress: scriptProgress,
                error: scriptError,
                onGenerate: handleGenerateScripts,
              }}
              scriptProduct={{
                productName: form.productName.trim(),
                brand: form.brand.trim(),
                industry: form.industry || '其他',
                category: form.category.trim(),
                price: toNum(form.price),
                sellingPoints: form.sellingPoints.trim(),
                usageScene: form.usageScene.trim(),
                targetAudience: form.targetAudience.trim(),
                url: form.url.trim(),
              }}
              matchProduct={{
                productName: form.productName.trim(),
                brand: form.brand.trim(),
                industry: form.industry || '其他',
                category: form.category.trim(),
                sellingPoints: form.sellingPoints.trim() || result.product.sellingPoints.join('、'),
                targetAudience: form.targetAudience.trim() || result.product.targetAudience || '',
                tags: form.influencerTags,
                // 第二部分内容创意方向摘要 + wrap 目标达人画像，自动带入达人匹配 AI 评分
                creativeSummary: [
                  ...(result.creativeDirections || []).map((d, i) =>
                    `创意方向${i + 1}《${d.angle || ''}》：${String(d.concept || d.title || '').slice(0, 45)}`),
                  ...(result.influencerFramework || []).map(f =>
                    `目标达人：${f.persona || ''}（${f.contentForm || ''}，建议量级${f.followerTier || ''}）`),
                ].join('；').slice(0, 600),
              }}
              contentSaveSlot={
                /* 内容库：对外版=一键导出（复制/下载TXT）+ 存至内容库；对内版保留原「储存到内容库」。只属于内容创意方案板块末尾 */
                isGhPages() ? (
                  <div className="mt-5 flex flex-col items-center gap-2">
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button" onClick={() => void copyExportText()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-brand-300 text-[12.5px] font-bold text-brand-700 hover:bg-brand-50 shadow-sm"
                      >
                        <Copy className="w-4 h-4" /> 复制全文（Markdown）
                      </button>
                      <button
                        type="button" onClick={downloadExportTxt}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-brand-300 text-[12.5px] font-bold text-brand-700 hover:bg-brand-50 shadow-sm"
                      >
                        <Download className="w-4 h-4" /> 下载 TXT
                      </button>
                      <button
                        type="button" onClick={() => setSaveConfirmOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 text-white text-[13px] font-bold hover:brightness-105 shadow-sm"
                      >
                        <Save className="w-4 h-4" /> 存至内容库
                      </button>
                    </div>
                    {exportTip && (
                      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {exportTip}
                      </motion.p>
                    )}
                    {contentSavedTip && (
                      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 已保存到本机内容库，可在「我的工作台 → 内容脚本」查看
                      </motion.p>
                    )}
                  </div>
                ) : (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button" onClick={() => setSaveConfirmOpen(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border-2 border-brand-300 text-[13px] font-bold text-brand-700 hover:bg-brand-50 hover:border-brand-400 transition-colors shadow-sm"
                  >
                    <Save className="w-4 h-4" /> 储存到内容库
                  </button>
                  {contentSavedTip && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> 已保存到本机内容库，可在顶部「历史记录」查看
                    </motion.p>
                  )}
                </div>
                )
              }
              strategySlot={isGhPages() ? (
                <MaterialStrategyCard
                  key={`strategy-${form.url || form.productName}`}
                  autoGenerate
                  briefs={briefsVersion === 'optimized' && briefsOptimized ? briefsOptimized : briefs}
                  originalBriefs={briefs}
                  briefsVersion={briefsVersion}
                  briefsOptimized={briefsOptimized}
                  onOptimized={handleOptimizedBriefs}
                  onSwitchVersion={handleSwitchBriefVersion}
                  contextText={[
                    `商品名：${form.productName.trim()}`,
                    form.brand.trim() ? `品牌：${form.brand.trim()}` : '',
                    form.industry ? `行业：${form.industry}` : '',
                    (form.category.trim() || form.level2) ? `类目：${form.category.trim() || form.level2}` : '',
                    form.price ? `客单价：${form.price}` : '',
                    form.usageScene.trim() ? `使用场景：${form.usageScene.trim()}` : '',
                    form.sellingPoints.trim() ? `核心卖点：${form.sellingPoints.trim()}` : '',
                    form.targetAudience.trim() ? `目标人群：${form.targetAudience.trim()}` : '',
                    form.url.trim() ? `商品链接：${form.url.trim()}` : '',
                  ].filter(Boolean).join('\n')}
                  category={form.category.trim() || form.level2}
                  product={{
                    productName: form.productName.trim(),
                    brand: form.brand.trim(),
                    industry: form.industry,
                    category: form.category.trim() || form.level2,
                    url: form.url.trim(),
                    sellingPoints: form.sellingPoints.trim(),
                    targetAudience: form.targetAudience.trim(),
                  }}
                />
              ) : null}
              ghExtras={null}
            />
          </div>
        )}

        {/* ============ 单独「达人匹配」模式结果 ============ */}
        {isMatch && matchStarted && !loading && (
          <div id="sec-influencer" ref={resultRef} className="scroll-mt-20">
            <InfluencerMatch
              product={{
                productName: form.productName.trim(),
                brand: form.brand.trim(),
                industry: form.industry || '其他',
                category: form.category.trim() || form.level2,
                sellingPoints: form.sellingPoints.trim(),
                targetAudience: form.targetAudience.trim(),
                tags: form.influencerTags,
              }}
              framework={[]}
              onGoKocFit={() => switchMode('kocfit')}
            />
          </div>
        )}

        {/* 行业热点参考 / 千川爆款素材拆解 现为每张脚本方向卡上与「✏️ 优化迭代」并排的独立按钮（🔥 热点营销参考 / 🎬 千川爆款素材灵感），不再作为独立板块 */}

        {/* 回到顶部：修改信息后重新生成 */}
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-4 py-2 text-xs font-medium text-brand-700 shadow-sm transition hover:bg-brand-50"
          >
            <ArrowUp className="w-3.5 h-3.5" /> 回到顶部修改{isFull ? '商品分析参数（100 分制 · 红线 · AI 策略）' : '商品信息'}
          </button>
        </div>
      </main>

        {/* 右侧热点营销进阶面板（宽屏：画布右侧空白区 sticky 内嵌；与主流程解耦，失败不影响左侧） */}
        {hotDockOpen && (
          <aside className="hidden xl:block w-[380px] shrink-0 side-nav-sticky">
            <div className="rounded-2xl border border-rose-100 bg-white shadow-sm overflow-hidden h-[calc(100vh-92px)] min-h-0 flex flex-col">
              <HotMarketingDockBody
                plan={hotDockPlan}
                loading={hotDockLoading}
                error={hotDockError}
                contextLabel={hotDockContextLabel()}
                onRetry={() => void runHotDock()}
                onGenerate={(p) => void runHotDock(p)}
                onClose={() => setHotDockOpen(false)}
                quoteTargets={(result?.creativeDirections || []).map((d, i) => ({ index: i, label: `方向${i + 1} · ${d.angle}` }))}
                onQuote={(text, idx) => handleHotDockQuote(text, idx)}
              />
            </div>
          </aside>
        )}

        {/* 🔥 热点营销参考·右侧面板（宽屏 sticky 内嵌 / 窄屏右侧抽屉；常驻挂载保勾选与榜单状态，hidden 折叠） */}
        <div className={refHotOpen ? SIDE_REF_PANEL_CLS : 'hidden'}>
          <RefineHotNews
            active={refHotOpen}
            industry={form.industry || '其他'}
            category={form.category.trim()}
            onIntroduce={(text) => { lastHotTextRef.current = text; sideIntroduceRef.current(text, '\n', 'hot'); }}
            onOpenHotMarketingAdvance={openHotMarketingAdvance}
            onClose={() => setRefHotOpen(false)}
          />
        </div>

        {/* 🎬 千川爆款素材灵感·右侧面板（常驻挂载：已上传视频/拆解结果不随开关丢失） */}
        <div className={refMatOpen ? SIDE_REF_PANEL_CLS : 'hidden'}>
          <RefineBreakdown
            product={sideBreakdownProduct}
            onInject={(text) => { lastMatTextRef.current = text; sideIntroduceRef.current(text, '\n\n', 'mat'); }}
            onClose={() => setRefMatOpen(false)}
          />
        </div>
      </div>

      {/* 窄屏（<xl）：辅助面板遮罩（点击收起） */}
      <AnimatePresence>
        {(refHotOpen || refMatOpen) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-30 xl:hidden"
            onClick={closeRefPanels}
          />
        )}
      </AnimatePresence>

      {/* 窄屏（<xl）：热点营销进阶以右侧抽屉浮层展示 */}
      <AnimatePresence>
        {hotDockOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-30 xl:hidden"
              onClick={() => setHotDockOpen(false)}
            />
            <motion.div
              initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 z-40 w-[360px] max-w-[88vw] bg-white shadow-2xl xl:hidden flex flex-col min-h-0 overflow-hidden"
            >
              <HotMarketingDockBody
                plan={hotDockPlan}
                loading={hotDockLoading}
                error={hotDockError}
                contextLabel={hotDockContextLabel()}
                onRetry={() => void runHotDock()}
                onGenerate={(p) => void runHotDock(p)}
                onClose={() => setHotDockOpen(false)}
                quoteTargets={(result?.creativeDirections || []).map((d, i) => ({ index: i, label: `方向${i + 1} · ${d.angle}` }))}
                onQuote={(text, idx) => handleHotDockQuote(text, idx)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 引用爆品库 / 储存确认 / 内容历史 弹窗 */}
      <BaopinPicker
        open={baopinOpen}
        context={isScore ? '商品分析' : isScript ? '内容脚本' : isMatch ? '达人匹配' : ''}
        agency={isGhPages() ? '' : form.agent}
        onSelect={handlePickBaopin}
        onClose={() => setBaopinOpen(false)}
      />
      <ConfirmDialog
        open={saveConfirmOpen}
        title="是否储存本次内容分析结果？"
        confirmText="确认储存"
        confirming={savingContent}
        onConfirm={() => void handleSaveContent()}
        onClose={() => setSaveConfirmOpen(false)}
      >
        将保存商品名称、参考爆款素材与钩子、四段完整脚本、AI 概念视频、优化迭代记录、营销热点与千川拆解等内容，仅存储在本机浏览器。
      </ConfirmDialog>
      <ContentHistoryModal open={contentHistoryOpen} onClose={() => setContentHistoryOpen(false)} />
      {/* 演示悬浮开关：演示落地页保持「只有一个按钮」的纯净形态，不渲染 */}
      {!(demo && mode === 'select') && <DemoControls />}
    </div>
      </div>
    </>
  );
}

type NavNode = { id: string; label: string; children?: NavNode[]; highlight?: boolean };

function scrollToAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SideNav({ items }: { items: NavNode[] }) {
  const [active, setActive] = useState('');
  // 拍平一级+二级用于滚动高亮；序号只给一级
  const flat = useMemo(() => items.flatMap(it => [it, ...(it.children || [])]), [items]);
  const idsKey = flat.map(i => i.id).join('|');

  useEffect(() => {
    const update = () => {
      let current = '';
      for (const it of flat) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 140) current = it.id;
      }
      // 滚动到页面底部时高亮最后一个存在的锚点
      if (flat.length && window.innerHeight + window.scrollY >= document.body.scrollHeight - 60) {
        for (let i = flat.length - 1; i >= 0; i--) {
          if (document.getElementById(flat[i].id)) { current = flat[i].id; break; }
        }
      }
      setActive(current || items[0]?.id || '');
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (items.length < 2) return null;

  const renderLink = (it: { id: string; label: string; highlight?: boolean }, on: boolean, cls: string, num?: string) => (
    <a
      href={`#${it.id}`}
      onClick={(e) => { e.preventDefault(); scrollToAnchor(it.id); }}
      className={`flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] leading-tight border transition-colors ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? 'bg-brand-600' : it.highlight ? 'bg-amber-400' : 'bg-ink-300'}`} />
      <span className="truncate">{num ? `${num} ` : ''}{it.label}</span>
      {it.highlight && <span className="ml-auto shrink-0 text-[9.5px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-px">核心</span>}
    </a>
  );

  return (
    <nav className="side-nav-card rounded-2xl border border-line-soft bg-white shadow-card p-3">
      <p className="px-1.5 pb-2 text-[11px] font-bold text-ink-400 tracking-wide flex items-center gap-1.5">
        <Gauge className="w-3 h-3" /> 页面导览
      </p>
      <ul className="space-y-0.5">
        {items.map((it, i) => {
          const on = active === it.id;
          const childActive = !!it.children?.some(c => active === c.id);
          return (
            <li key={it.id}>
              {renderLink(it, on || childActive, on
                ? 'bg-brand-50 text-brand-700 font-bold border-brand-200'
                : 'text-ink-700 hover:bg-surface-2 border-transparent', String(i + 1) + '.')}
              {it.children && it.children.length > 0 && (
                <ul className="mt-0.5 mb-1 ml-3.5 pl-2.5 border-l border-line-soft/80 space-y-0.5">
                  {it.children.map(c => {
                    const con = active === c.id;
                    return (
                      <li key={c.id}>
                        {renderLink(c, con, con
                          ? 'bg-brand-50/80 text-brand-700 font-semibold border-brand-100 text-[11.5px]'
                          : c.highlight
                            ? 'text-amber-700 font-bold hover:bg-amber-50 border-transparent text-[11.5px]'
                            : 'text-ink-400 hover:bg-surface-2 border-transparent text-[11.5px]')}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ============================================================
// 打分明细元数据
// ============================================================

const DIM_META = {
  budget: { name: '投放预算', max: SCORE_MAX.budget, hard: true },
  roiTolerance: { name: 'ROI 阈值', max: SCORE_MAX.roiTolerance, hard: true },
  delivery: { name: '达人素材交付·卡寄样', max: SCORE_MAX.delivery, hard: true },
  trend: { name: '爆品趋势', max: SCORE_MAX.trend, hard: true },
  pricePoint: { name: '客单价', max: SCORE_MAX.pricePoint, hard: true },
} as const;

const SEG_META = {
  pain: { label: '痛点分析', desc: '痛点/场景开场', cls: 'bg-danger-bg text-danger-ink border-danger-line' },
  sell: { label: '卖点分析', desc: '核心卖点展示', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  release: { label: '放大功效', desc: '机制/效果放大', cls: 'bg-warn-bg text-warn-ink border-warn-line' },
  close: { label: '加速转化', desc: '福利机制促转化', cls: 'bg-ok-bg text-ok-ink border-ok-line' },
} as const;
type SegKey = keyof typeof SEG_META;
const SEG_KEYS: SegKey[] = ['pain', 'sell', 'release', 'close'];

function scoreBarColor(rate: number): string {
  if (rate >= 0.8) return 'bg-ok';
  if (rate >= 0.5) return 'bg-warn';
  return 'bg-danger';
}

// ============================================================
// 结果视图
// ============================================================

// 脚本导出 / 案例理由所需的产品上下文（复用 exportScript 的入参类型，额外带商品链接供飞书文档导出）
type ScriptProduct = Parameters<typeof exportScript>[0] & { url?: string };

function ResultView({ result, productName, copied, onCopy, scriptProduct, matchProduct, hideScore = false, hideMatch = false, onOpenHotMarketing, onOpenSidePanel, sidePanelKind = null, scriptFullText, initialLogId$, registerSnapshot, registerIntroducer, contentSaveSlot, briefs, selectedBriefIds, onToggleBrief, onPatchBrief, onSetAllBriefsSelected, scriptGen, ghExtras, strategySlot }: {
  result: AnalyzeResult; productName: string; copied: boolean; onCopy: () => void;
  scriptProduct: ScriptProduct; matchProduct: MatchProduct;
  /** 单独「内容脚本」模式：隐藏评分结论板块与第三部分达人匹配 */
  hideScore?: boolean; hideMatch?: boolean;
  /** 内容库本地保存按钮（由外层持有 IndexedDB 逻辑，插在内容创意方案板块末尾） */
  contentSaveSlot?: React.ReactNode;
  /** 对外版专属：客户 Brief 上传优化（插在 Brief 卡片下方） */
  ghExtras?: React.ReactNode;
  /** 对外版专属：素材策略单一页纸（插在 Brief 拆解之前） */
  strategySlot?: React.ReactNode;
  /** 注册/注销某方向卡的「优化输入框追加函数」，供热点营销进阶面板跨组件引用内容到指定方向 */
  registerIntroducer?: (index: number, fn: ((text: string, sep: string, source?: 'hot' | 'mat') => void) | null) => void;
  /** Brief 拆解层：方向卡（可编辑/勾选）+ 第二阶段脚本生成状态 */
  briefs: BriefDirection[];
  selectedBriefIds: Set<string>;
  onToggleBrief: (id: string) => void;
  onPatchBrief: (id: string, patch: Partial<BriefDirection>) => void;
  onSetAllBriefsSelected: (on: boolean) => void;
  scriptGen: {
    loading: boolean;
    progress: { done: number; total: number; name: string };
    error: string;
    onGenerate: () => void;
  };
  /** 打开右侧「热点营销进阶」面板（热点营销参考面板内按钮触发） */
  onOpenHotMarketing?: () => void;
  /** 打开/收起方向卡右侧辅助面板（'hot' 热点营销参考 / 'mat' 素材灵感）；introduce 回调把内容追加进触发卡片的优化输入框 */
  onOpenSidePanel?: (kind: 'hot' | 'mat', introduce: (text: string, sep: string, source?: 'hot' | 'mat') => void) => void;
  /** 当前打开的辅助面板类型（控制方向卡按钮高亮，三张卡共享同一面板） */
  sidePanelKind?: 'hot' | 'mat' | null;
  /** 单个/多个方向脚本全文生成（优化迭代埋点复用） */
  scriptFullText?: (dirs: CreativeDirection[]) => string;
  /** 初次生成台账记录ID的 Promise（优化迭代链根） */
  initialLogId$?: Promise<string | undefined>;
  /** 注册方向卡快照获取器（保存本地历史用） */
  registerSnapshot?: (index: number, getter: (() => ContentDirectionSnapshot) | null) => void;
}) {
  const redLineHit = result.scoring.redLines.some(r => r.hit);
  const grade = computeGrade(result.totalScore, redLineHit);
  const gradeCls =
    grade.tone === 'green' ? 'from-ok to-ok-ink shadow-ok-line'
    : grade.tone === 'yellow' ? 'from-warn to-warn shadow-warn-line'
    : 'from-danger to-danger shadow-danger-line';

  return (
    <>
      {/* 复制按钮 */}
      <div className="flex justify-end">
        <button onClick={onCopy}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-1.5 shadow-sm">
          {copied ? <Check className="w-3.5 h-3.5 text-ok-ink" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制完整报告'}
        </button>
      </div>

      {/* ===== 板块一：商品分析与打分（单独脚本模式隐藏；对外版已用素材策略单一页纸替代整块） ===== */}
      {!hideScore && !isGhPages() && (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
        <SectionTitle icon={Gauge} title="商品分析结论 · 产品拆解" desc="承接商品分析：100 分制五维适配 · 红线 · AI 策略" badge="分析结论" />

        {redLineHit && (
          <div className="mb-4 rounded-xl bg-danger-bg border border-danger-line px-4 py-3 flex items-start gap-2">
            <ShieldAlert className="w-[18px] h-[18px] text-danger-ink shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-danger-ink">触发红线一票降级</p>
              <p className="text-xs text-danger-ink mt-0.5">
                以下红线已命中：{result.scoring.redLines.filter(r => r.hit).map(r => r.name).join('、')}
              </p>
            </div>
          </div>
        )}

        {/* 总分大卡 */}
        <div className={`rounded-2xl bg-gradient-to-r ${gradeCls} p-5 text-white shadow-lg flex items-center justify-between mb-5`}>
          <div>
            <p className="text-xs opacity-80 mb-1">{productName} · 星川投放适配总分</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight">{result.totalScore}</span>
              <span className="text-sm opacity-80">/100</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80 mb-1">适配等级</p>
            <p className="text-xl font-bold">{grade.grade}</p>
          </div>
        </div>

        {/* 产品拆解 */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 mb-5">
          <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-brand-500" /> 产品拆解
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">核心卖点</p>
              <ul className="space-y-1">
                {result.product.sellingPoints.map((p, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ok-ink shrink-0 mt-0.5" />{p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">目标人群</p>
              <p className="text-xs text-gray-700 leading-relaxed">{result.product.targetAudience || '—'}</p>
              <p className="text-[11px] text-gray-400 mt-3 mb-1.5">内容风格</p>
              <p className="text-xs text-gray-700 leading-relaxed">{result.product.contentStyle || '—'}</p>
            </div>
            {(result.product.differentiators?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] text-gray-400 mb-1.5">差异化点</p>
                <ul className="space-y-1">
                  {result.product.differentiators!.map((p, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">风险点</p>
              <ul className="space-y-1">
                {result.product.risks.map((p, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {(result.product.competitors?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-400 mb-2">竞品概况</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-white">
                    <tr className="text-left text-gray-500">
                      <th className="px-3 py-2 font-medium">竞品</th>
                      <th className="px-3 py-2 font-medium">价格带</th>
                      <th className="px-3 py-2 font-medium">内容策略</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/60">
                    {result.product.competitors!.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{c.name}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{c.priceBand}</td>
                        <td className="px-3 py-2 text-gray-600">{c.contentStrategy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 五维打分 */}
        <div className="space-y-3 mb-5">
          {(Object.keys(DIM_META) as Array<keyof typeof DIM_META>).map(k => {
            const meta = DIM_META[k];
            const item: ScoreItem = result.scoring.scores[k];
            const rate = item.score / meta.max;
            return (
              <div key={k} className="rounded-xl border border-gray-100 p-3.5">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{meta.name}</span>
                    <span className="text-[10px] text-gray-400">满分 {meta.max}</span>
                    {meta.hard && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 border border-brand-100 font-medium">硬算</span>
                    )}
                    {item.confidence === 'low' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn-bg text-warn-ink border border-warn-bg font-medium">待校准</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    {item.aiScore != null && item.aiScore !== item.score && (
                      <span className="text-[10px] text-gray-400">AI 参考 {item.aiScore} 分</span>
                    )}
                    <span className="text-sm font-extrabold text-gray-900">{item.score}<span className="text-gray-400 text-xs font-normal">/{meta.max}</span></span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(rate * 100, 3)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${scoreBarColor(rate)}`}
                  />
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{item.rationale}</p>
                {item.confidence === 'low' && item.dataNeeded && (
                  <p className="text-[11px] text-warn-ink mt-1">需补充数据：{item.dataNeeded}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* 红线 */}
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-danger-ink" /> 红线判断
            <span className="text-[10px] text-gray-400 font-normal">（同行业案例命中 {result.industryCaseCount} 条）</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {result.scoring.redLines.map((rl, i) => (
              <div key={i} className={`rounded-xl border p-3 ${rl.hit ? 'border-danger-line bg-danger-bg' : 'border-ok-line bg-ok-bg/50'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {rl.hit
                    ? <XCircle className="w-4 h-4 text-danger-ink shrink-0" />
                    : <CheckCircle2 className="w-4 h-4 text-ok-ink shrink-0" />}
                  <span className={`text-xs font-bold ${rl.hit ? 'text-danger-ink' : 'text-ok-ink'}`}>
                    {rl.hit ? '命中' : '未命中'} · {rl.name}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed pl-[22px]">{rl.reason}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 策略建议 */}
        <div>
          <p className="text-xs font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-brand-500" /> 策略建议（短板 → 动作）
          </p>
          <ul className="space-y-2">
            {result.scoring.strategyAdvice.map((a, i) => (
              <li key={i} className="rounded-xl bg-brand-50/70 border border-brand-100 px-3.5 py-2.5 text-xs text-gray-700 leading-relaxed flex items-start gap-2">
                <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>

      )}

      {/* ===== 板块二：内容创意方案（脚本生成） ===== */}
      <div id="sec-creative" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 scroll-mt-20">
        <SectionTitle icon={Clapperboard} title="内容创意" desc="该商品相关的星川爆款素材参考 · 素材策略一页纸 · Brief 拆解（可编辑勾选）· 按 Brief 生成四段式脚本" badge="内容创意" />

        {/* 匹配案例 */}
        <div id="sec-cases-anchor" className="scroll-mt-20" />
        <p className="text-xs font-bold text-gray-700 mb-2.5">该商品相关的星川爆款素材参考（Top 3）</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {result.matchedCaseDetails.map(c => (
            <div key={c.caseIndex} className="rounded-xl border border-gray-100 overflow-hidden bg-white hover:shadow-md transition-shadow">
              <CoverImage url={c.coverImageUrl} />
              <div className="p-3">
                <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug min-h-[2rem]">{c.title}</p>
                <p className="text-[11px] text-brand-600 mt-1 font-medium">{c.brand || '未知品牌'}</p>
                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed line-clamp-3">{c.reason}</p>
              </div>
            </div>
          ))}
          {result.matchedCaseDetails.length === 0 && (
            <p className="text-xs text-gray-400 col-span-full">AI 未返回有效案例匹配</p>
          )}
        </div>

        {/* 更多爆款案例（多品牌去重，展开 5-10 条，含素材结构 + AI 匹配理由） */}
        {result.moreCases.length > 0 && (
          <MoreCasesSection cases={result.moreCases} product={scriptProduct} />
        )}

        {/* 素材策略单一页纸（先于 Brief 拆解；基于商品信息+爆款案例生成，指引 Brief 方向） */}
        {strategySlot}

        {/* Brief 拆解层：爆款素材参考 → Brief 方向（可查看/编辑/勾选）→ 生成四段式脚本 */}
        <div id="sec-brief-anchor" className="scroll-mt-20" />
        <BriefStepPanel
          briefs={briefs}
          selectedIds={selectedBriefIds}
          onToggle={onToggleBrief}
          onPatch={onPatchBrief}
          onSetAll={onSetAllBriefsSelected}
          scriptGen={scriptGen}
          scriptsReady={result.creativeDirections.length > 0}
        />
        {/* 客户 Brief 上传优化（位于 Brief 拆解之后） */}
        {ghExtras}

        {/* 以下内容在第二阶段（按 Brief 生成脚本）完成后展示 */}
        {result.creativeDirections.length > 0 && (
        <>
        <div id="sec-scripts-anchor" className="scroll-mt-20" />

        {/* 定制跑量公式（对外版已融入素材策略单一页纸，此处不再重复展示） */}
        {!isGhPages() && (
        <>
        <p className="text-xs font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-brand-500" /> 定制跑量公式（5 环节）
        </p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 mb-6">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">环节</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">手法</th>
                <th className="px-3 py-2.5 font-medium">具体内容</th>
                <th className="px-3 py-2.5 font-medium">目的</th>
              </tr>
            </thead>
            <tbody>
              {result.customFormula.map((s, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2.5 font-bold text-brand-700 whitespace-nowrap">{i + 1}. {s.stage}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{s.technique || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700 min-w-[180px]">{s.detail || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 min-w-[120px]">{s.goal || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )}

        {/* 创意方向（按勾选 Brief 数量生成，1-5 个） */}
        <div className="space-y-5 mb-6">
          {result.creativeDirections.map((d, i) => (
            <DirectionCard key={`${i}-${d.angle}-${d.script.pain.voiceover.slice(0, 16)}`} dir={d} index={i} product={scriptProduct} productName={productName} onOpenHotMarketing={onOpenHotMarketing} onOpenSidePanel={onOpenSidePanel} sidePanelKind={sidePanelKind} scriptFullText={scriptFullText} initialLogId$={initialLogId$} registerSnapshot={registerSnapshot} registerIntroducer={registerIntroducer} />
          ))}
        </div>

        {/* 拍摄建议 + 合规红线 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-warn-ink" /> 通用拍摄建议
            </p>
            <ul className="space-y-2">
              {result.shootingTips.map((t, i) => (
                <li key={i} className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />{t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-warn-line bg-warn-bg/60 p-4">
            <p className="text-xs font-bold text-warn-ink mb-2.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-warn-ink" /> 合规红线
            </p>
            <ul className="space-y-2">
              {result.complianceNotes.map((t, i) => (
                <li key={i} className="text-[11px] text-warn-ink/90 leading-relaxed flex items-start gap-1.5">
                  <TriangleAlert className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        </>
        )}

        {/* 储存到内容库：内容分析与脚本生成板块末尾（脚本生成后展示，不出现在达人匹配板块） */}
        {result.creativeDirections.length > 0 && contentSaveSlot}
      </div>

      {/* ===== 板块三：达人匹配推荐（存量星川 + 优质星川 AI 匹配；潜力星川库概况已接通；单独脚本模式隐藏） ===== */}
      {!hideMatch && (
        <div id="sec-influencer" className="scroll-mt-20">
          <InfluencerMatch product={matchProduct} framework={result.influencerFramework} />
        </div>
      )}
    </>
  );
}

// ============================================================
// Brief 拆解层面板（爆款素材参考 → Brief 方向卡可查看/编辑/勾选 → 生成四段式脚本）
// ============================================================

type BriefFieldKey = 'coreSellingPoint' | 'targetAudience' | 'materialFormat' | 'validationGoal';
const BRIEF_FIELDS: { key: BriefFieldKey; label: string; placeholder: string; rows: number }[] = [
  { key: 'coreSellingPoint', label: '核心卖点', placeholder: '该方向主打的 1 个核心卖点', rows: 2 },
  { key: 'targetAudience', label: '目标人群', placeholder: '人群画像（身份/场景/需求）', rows: 2 },
  { key: 'materialFormat', label: '素材形式建议', placeholder: '人物/场景/拍法/结构', rows: 2 },
  { key: 'validationGoal', label: '验证目标', placeholder: '首要验证的指标与信号', rows: 2 },
];

function BriefStepPanel({ briefs, selectedIds, onToggle, onPatch, onSetAll, scriptGen, scriptsReady }: {
  briefs: BriefDirection[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: Partial<BriefDirection>) => void;
  onSetAll: (on: boolean) => void;
  scriptGen: { loading: boolean; progress: { done: number; total: number; name: string }; error: string; onGenerate: () => void };
  scriptsReady: boolean;
}) {
  const selectedCount = briefs.filter(b => selectedIds.has(b.id)).length;
  const inpCls = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none transition-colors disabled:opacity-60';
  // 🎬 演示模式：Brief 只读展示（不渲染任何 input/textarea，保持零输入）
  const demo = isDemoMode();

  return (
    <div className="mb-6 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50/50 to-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-brand-600" />
          拍摄 Brief 拆解
          <span className="text-[11px] font-normal text-gray-400">
            基于商品洞察 + 上方爆款素材参考自动生成 · {briefs.length} 个方向
          </span>
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <button type="button" onClick={() => onSetAll(true)}
            className="text-brand-600 font-semibold hover:text-brand-700 disabled:opacity-50" disabled={scriptGen.loading}>
            全选
          </button>
          <button type="button" onClick={() => onSetAll(false)}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50" disabled={scriptGen.loading}>
            清空
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
        勾选要拍摄的方向（默认全选），所有字段可直接编辑；点击下方按钮后，每个选中方向将严格按其 Brief 生成「痛点分析 · 卖点分析 · 放大功效 · 加速转化」四段式脚本。
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        {briefs.map((b, i) => {
          const checked = selectedIds.has(b.id);
          return (
            <div key={b.id}
              className={`rounded-xl border bg-white p-3.5 transition-all ${checked ? 'border-brand-300 shadow-[0_0_0_2px_rgba(47,85,212,0.08)]' : 'border-gray-200 opacity-70'}`}>
              <div className="flex items-center gap-2 mb-3">
                <button type="button" onClick={() => onToggle(b.id)} disabled={scriptGen.loading}
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-brand-600 text-white' : 'border-2 border-gray-300 bg-white hover:border-brand-400'}`}
                  aria-label={checked ? '取消勾选该方向' : '勾选该方向'}>
                  {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </button>
                <span className="text-[11px] font-bold text-brand-500 shrink-0">方向{['①','②','③','④','⑤'][i] || i + 1}</span>
                <input
                  value={b.name}
                  onChange={e => onPatch(b.id, { name: e.target.value.slice(0, 12) })}
                  disabled={scriptGen.loading}
                  placeholder="方向名称"
                  className="flex-1 min-w-0 text-sm font-bold text-gray-900 border-0 border-b border-dashed border-gray-200 focus:border-brand-400 outline-none py-0.5 bg-transparent disabled:opacity-60"
                />
              </div>
              <div className="space-y-2.5">
                {BRIEF_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">{f.label}</label>
                    <textarea
                      value={b[f.key]}
                      rows={f.rows}
                      disabled={scriptGen.loading}
                      placeholder={f.placeholder}
                      onChange={e => onPatch(b.id, { [f.key]: e.target.value } as Partial<BriefDirection>)}
                      className={inpCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={scriptGen.onGenerate}
          disabled={scriptGen.loading || selectedCount === 0}
          className="w-full sm:w-auto sm:min-w-[360px] py-3 px-6 rounded-[10px] bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-btn flex items-center justify-center gap-2">
          {scriptGen.loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              正在生成四段式脚本 {scriptGen.progress.done}/{scriptGen.progress.total}
              {scriptGen.progress.name ? ` · ${scriptGen.progress.name}` : ''}…
            </>
          ) : (
            <>
              <Clapperboard className="w-4 h-4" />
              {scriptsReady ? `按当前 Brief 重新生成脚本（${selectedCount} 个方向）` : `基于勾选 Brief 生成四段式脚本（${selectedCount} 个方向）→`}
            </>
          )}
        </button>
        {scriptGen.loading && (
          <p className="text-[11px] text-gray-400">每个方向约 20-60 秒（服务端串行），失败自动重试，请勿关闭页面…</p>
        )}
        {!scriptGen.loading && scriptsReady && (
          <p className="text-[11px] text-success flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> 四段脚本已在下方生成；调整 Brief 后可重新生成。
          </p>
        )}
        {scriptGen.error && !scriptGen.loading && (
          <p className="text-[11px] text-danger flex items-center gap-1">
            <TriangleAlert className="w-3.5 h-3.5" /> {scriptGen.error}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 创意方向卡
// ============================================================

const ANGLE_STYLE: Record<string, { badge: string; ring: string }> = {
  痛点触达: { badge: 'bg-danger', ring: 'border-danger-line' },
  '反向劝阻/避坑': { badge: 'bg-warn', ring: 'border-warn-line' },
  '福利钩子/薅羊毛': { badge: 'bg-ok-ink', ring: 'border-ok-line' },
};
// 动态方向名命不中 ANGLE_STYLE 时，按卡片序号轮换配色
const ANGLE_STYLE_LIST = [
  { badge: 'bg-danger', ring: 'border-danger-line' },
  { badge: 'bg-warn', ring: 'border-warn-line' },
  { badge: 'bg-ok-ink', ring: 'border-ok-line' },
];

function DirectionCard({ dir, index, product, productName, onOpenHotMarketing, onOpenSidePanel, sidePanelKind = null, scriptFullText, initialLogId$, registerSnapshot, registerIntroducer }: {
  dir: CreativeDirection; index: number; product: ScriptProduct; productName: string;
  onOpenHotMarketing?: () => void;
  /** 打开/收起右侧辅助面板（'hot' 热点营销参考 / 'mat' 素材灵感） */
  onOpenSidePanel?: (kind: 'hot' | 'mat', introduce: (text: string, sep: string, source?: 'hot' | 'mat') => void) => void;
  /** 当前打开的面板类型（按钮高亮用） */
  sidePanelKind?: 'hot' | 'mat' | null;
  /** 方向脚本全文生成（优化迭代埋点用） */
  scriptFullText?: (dirs: CreativeDirection[]) => string;
  /** 初次生成台账记录ID（迭代链根） */
  initialLogId$?: Promise<string | undefined>;
  /** 注册本方向快照获取器（保存本地内容历史用） */
  registerSnapshot?: (index: number, getter: (() => ContentDirectionSnapshot) | null) => void;
  /** 注册本方向优化输入框追加函数（热点营销进阶面板跨组件引用用） */
  registerIntroducer?: (index: number, fn: ((text: string, sep: string, source?: 'hot' | 'mat') => void) | null) => void;
}) {
  const style = ANGLE_STYLE[dir.angle] || ANGLE_STYLE_LIST[index % ANGLE_STYLE_LIST.length];
  const [exporting, setExporting] = useState(false);
  const [scriptData, setScriptData] = useState<ScriptExport | null>(null);
  const [exportErr, setExportErr] = useState('');
  // 四段口播各选用说法①/②（默认①），底部「完整话术」按选择动态串联
  const [voPicks, setVoPicks] = useState<Record<SegKey, number>>({ pain: 0, sell: 0, release: 0, close: 0 });
  const [fullCopied, setFullCopied] = useState(false);
  // 导出飞书文档（含 AI 镜头视频块）
  const [docLoading, setDocLoading] = useState(false);
  const [docRes, setDocRes] = useState<ScriptDocResult | null>(null);
  const [docErr, setDocErr] = useState('');

  // 脚本迭代优化：cur=当前版本（随迭代更新），dir=原始版本；showOriginal 切换查看原版
  const [cur, setCur] = useState<CreativeDirection>(dir);
  const [version, setVersion] = useState(0);
  // 完整迭代链（每轮一个新版本，含轮次/类型/需求/台账ID）
  const [iterations, setIterations] = useState<ContentIteration[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineErr, setRefineErr] = useState('');
  const disp = showOriginal ? dir : cur;
  // 台账迭代链：本轮输入来源（hot=热点优化 / mat=千川爆款拆解优化 / 手输=自定义优化）+ 上一条记录ID
  const introSourceRef = useRef<'hot' | 'mat' | 'custom'>('custom');
  const lastLogIdRef = useRef<string | undefined>(undefined);

  // 快照最新状态（供 App 保存本地历史时读取，getter 只注册一次）
  const snapshotRef = useRef<{ cur: CreativeDirection; version: number; iterations: ContentIteration[] }>(
    { cur, version, iterations });
  snapshotRef.current = { cur, version, iterations };
  // 四段各自已生成的 AI 镜头图/视频（出片即记录，保存内容库时随快照落 IndexedDB）
  const segMediaRef = useRef<NonNullable<ContentDirectionSnapshot['segMedia']>>({});
  useEffect(() => {
    if (!registerSnapshot) return;
    registerSnapshot(index, () => ({
      index, angle: dir.angle, original: dir,
      current: snapshotRef.current.cur,
      version: snapshotRef.current.version,
      iterations: snapshotRef.current.iterations,
      segMedia: { ...segMediaRef.current },
    }));
    return () => registerSnapshot(index, null);
  }, [registerSnapshot, index, dir]);

  // 热点钩子 / 素材拆解结论引入：追加进优化输入框并自动展开优化迭代区，便于直接「重新生成」。
  // 注册给顶层右侧面板（点本卡按钮时随 onOpenSidePanel 上报，面板「引入」回调即写入本卡）。
  const appendRefine = useCallback((text: string, sep: string, source?: 'hot' | 'mat') => {
    if (source) introSourceRef.current = source;
    setRefineText(t => (t.trim() ? t.replace(/\s*$/, '') + sep : '') + text);
    setRefineOpen(true);
  }, []);

  // 注册本卡优化输入框追加函数（卸载注销）：热点营销进阶面板可跨组件「引用」内容到指定方向卡
  useEffect(() => {
    registerIntroducer?.(index, appendRefine);
    return () => registerIntroducer?.(index, null);
  }, [registerIntroducer, index, appendRefine]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportErr('');
    try {
      const se = await exportScript(product, cur);
      setScriptData(se);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : '脚本生成失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  // 当前版本四段口播说法列表（≥1 条），及底部「完整话术」串联文本（跟随说法①/②选择动态更新）
  const voMap = useMemo(() => {
    const m = {} as Record<SegKey, string[]>;
    SEG_KEYS.forEach(k => {
      const list = splitVoiceovers(disp.script[k].voiceover).filter(Boolean);
      m[k] = list.length ? list : [disp.script[k].voiceover || ''];
    });
    return m;
  }, [disp]);
  const fullScriptText = useMemo(
    () => SEG_KEYS.map(k => {
      const arr = voMap[k];
      const idx = Math.min(voPicks[k] ?? 0, arr.length - 1);
      return arr[idx] || '';
    }).filter(Boolean).join(''),
    [voMap, voPicks],
  );
  const copyFullScript = async () => {
    if (!fullScriptText) return;
    try {
      await navigator.clipboard.writeText(fullScriptText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullScriptText; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setFullCopied(true);
    window.setTimeout(() => setFullCopied(false), 2200);
  };

  // 导出飞书文档：四段脚本（含两版说法）+ 当前组合的完整话术 + 已生成 AI 镜头视频（内联文件块）
  const handleExportDoc = async () => {
    if (docLoading || showOriginal) return;
    setDocLoading(true);
    setDocErr('');
    try {
      const segments = SEG_KEYS.map(k => {
        const x = disp.script[k];
        const m = segMediaRef.current[k];
        return {
          key: k,
          label: SEG_META[k].label,
          visual: x.visual || '',
          versions: voMap[k],
          videoUrl: m?.url || '',
          mediaType: m?.mediaType || '',
        };
      });
      const res = await exportScriptDoc({
        title: `拍摄脚本·${String(product.productName || productName).slice(0, 20)}·${String(disp.angle || '').slice(0, 12)}`,
        product: {
          productName: product.productName || productName,
          brand: product.brand, industry: product.industry, category: product.category,
          url: product.url || '',
        },
        direction: {
          angle: disp.angle, title: disp.title, concept: disp.concept,
          hooks: disp.hooks, shootingTip: disp.shootingTip,
          materialPick: disp.materialPick || dir.materialPick,
        },
        fullScript: fullScriptText,
        segments,
      });
      if (!res.url) throw new Error('未返回文档链接');
      setDocRes(res);
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : '导出失败，请重试');
    } finally {
      setDocLoading(false);
    }
  };

  const handleRefine = async () => {
    const note = refineText.trim();
    if (!note || refining) return;
    setRefining(true);
    setRefineErr('');
    try {
      const refined = await refineScript(product, cur, note);
      const merged: CreativeDirection = { ...refined, angle: dir.angle, hookType: dir.hookType };  // 角度/钩子类型恒为原方向
      setCur(merged);
      const newRound = version + 1;
      setVersion(newRound);
      setShowOriginal(false);
      setRefineOpen(false);
      setRefineText('');
      setScriptData(null);  // 旧的 30s 分镜脚本失效，需重新导出
      setDocRes(null);      // 旧飞书文档对应上一版脚本
      segMediaRef.current = {};  // 旧版 AI 镜头随脚本版本失效，需按新版重新生成
      // 台账：每次优化单独写一条新记录（不覆盖历史），含迭代类型/轮次/本轮需求原文/本轮脚本全文/关联上一条
      const source = introSourceRef.current;
      const iterType = source === 'hot' ? '热点优化' : source === 'mat' ? '千川爆款拆解优化' : '自定义优化';
      const parentId = lastLogIdRef.current ?? (initialLogId$ ? await initialLogId$ : undefined);
      const singleFullText = scriptFullText ? scriptFullText([merged]) : '';
      // 参考爆款品牌/钩子：热点或素材引入的结论已包含在本轮需求原文中，一并落「参考爆款钩子」
      const refHooks = (source === 'hot' || source === 'mat') ? note : '';
      const idPromise = trackUsage('内容脚本', product.productName || productName, '',
        `第${newRound}轮优化｜${iterType}`,
        {
          fullInput: JSON.stringify({ 商品: product, 迭代轮次: newRound, 迭代类型: iterType }),
          iterType, iterRound: newRound, iterInput: note,
          refHooks, scripts: singleFullText, parentId,
        });
      introSourceRef.current = 'custom';
      // 本地迭代链：立即记录本轮新版本，台账 ID 返回后补挂（对应 Base parentId 链路）
      setIterations(list => [...list, { round: newRound, iterType, note, at: Date.now(), direction: merged }]);
      void idPromise.then(id => {
        if (id) {
          lastLogIdRef.current = id;
          setIterations(list => list.map(x => x.round === newRound ? { ...x, logId: id } : x));
        }
      });
    } catch (e) {
      setRefineErr(e instanceof Error ? e.message : '优化失败，请重试');
    } finally {
      setRefining(false);
    }
  };

  return (
    <div id={`sec-dir-anchor-${index}`} className={`rounded-2xl border ${style.ring} overflow-hidden scroll-mt-20`}>
      <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <span className={`text-white text-[11px] font-bold px-2.5 py-1 rounded-lg ${style.badge}`}>
          方向{index + 1} · {disp.angle}
        </span>
        {disp.hookType && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            {disp.hookType}钩子
          </span>
        )}
        <p className="text-sm font-bold text-gray-900">{disp.title}</p>
        {version > 0 && (
          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            showOriginal ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-ok-bg border-ok-line text-ok-ink'}`}>
            {showOriginal ? '原版' : `已优化 v${version}`}
          </span>
        )}
      </div>
      <div className="p-4 space-y-4">
        {showOriginal && (
          <p className="text-[11px] text-gray-500 bg-gray-100/70 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 shrink-0" /> 当前查看的是原始版本，优化版内容已在下方切换按钮可返回。
          </p>
        )}
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
          <span className="font-bold text-gray-700">方向逻辑：</span>{disp.concept}
        </p>
        {(() => {
          const mp = disp.materialPick || dir.materialPick;
          if (!mp) return null;
          return (
            <div className="space-y-1">
              <p className="text-[11.5px] text-gray-700 bg-brand-50/70 border border-brand-100 rounded-lg px-3 py-2 leading-relaxed flex items-start gap-1.5">
                <Clapperboard className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold text-brand-700">🎬 首选素材形式：{mp.type}</span>
                  <span className="text-gray-500"> —— {mp.reason}</span>
                </span>
              </p>
              {mp.secondType && (
                <p className="text-[11.5px] text-gray-600 bg-white border border-brand-100 rounded-lg px-3 py-2 leading-relaxed flex items-start gap-1.5">
                  <Clapperboard className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-bold text-brand-700">🔁 次选素材形式：{mp.secondType}</span>
                    {mp.secondReason && <span className="text-gray-500"> —— {mp.secondReason}</span>}
                  </span>
                </p>
              )}
            </div>
          );
        })()}

        {/* 四段式脚本：痛点分析 / 卖点分析 / 放大功效 / 加速转化 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['pain', 'sell', 'release', 'close'] as const).map(seg => {
            const meta = SEG_META[seg];
            const x = disp.script[seg];
            const voList = voMap[seg];
            const pickIdx = Math.min(voPicks[seg] ?? 0, voList.length - 1);
            return (
              <div key={seg} className="rounded-xl border border-gray-100 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${meta.cls}`}>{meta.label}</span>
                  <span className="text-[10px] text-gray-400">{meta.desc}</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-1">核心画面</p>
                <p className="text-xs text-gray-700 leading-relaxed mb-2.5">{x.visual}</p>
                <p className="text-[11px] text-gray-500 mb-1">口播说法（点选①/②，底部自动组合完整话术）</p>
                <div className="space-y-1.5">
                  {voList.map((vo, vi) => {
                    const active = vi === pickIdx;
                    return (
                      <button
                        key={vi}
                        type="button"
                        onClick={() => setVoPicks(s => ({ ...s, [seg]: vi }))}
                        title={active ? '已选入完整话术' : '点选该说法'}
                        className={`w-full text-left text-xs leading-relaxed font-medium pl-2.5 pr-2 py-1.5 rounded-r-md border-l-2 transition-all ${
                          active
                            ? 'border-brand-500 bg-brand-50/80 text-gray-900 italic ring-1 ring-brand-200'
                            : 'border-brand-200 text-gray-600 italic hover:border-brand-400 hover:bg-brand-50/40'
                        }`}
                      >
                        <span className={`not-italic text-[10px] align-middle mr-1 px-1 py-px rounded border ${
                          active ? 'bg-brand-600 text-white border-brand-600' : 'bg-brand-50 text-brand-600 border-brand-100'
                        }`}>说法{vi === 0 ? '①' : '②'}{active ? ' ✓' : ''}</span>
                        “{vo}”
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">参考案例：{x.refCaseTitle}</p>
                <ConceptVideoButton
                  key={`${seg}-${showOriginal ? 'orig' : `v${version}`}`}
                  seg={seg}
                  visual={x.visual || ''}
                  voiceover={voList[0] || x.voiceover || ''}
                  productName={productName}
                  industry={product?.industry || ''}
                  demoSeedVariant={index}
                  onMedia={(url, mediaType) => { segMediaRef.current[seg] = { url, mediaType }; }}
                />
              </div>
            );
          })}
        </div>

        {/* 完整话术：四段所选说法串联，达人可直接照念；随①/②选择动态更新 */}
        <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-[12px] font-bold text-brand-800 flex items-center gap-1.5">
              <Clapperboard className="w-3.5 h-3.5" />
              完整话术（痛点开场 → 卖点种草 → 功效放大 → 加速转化，约 30 秒，达人直接照念）
            </p>
            <button
              type="button"
              onClick={copyFullScript}
              disabled={!fullScriptText}
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50 transition-colors"
            >
              {fullCopied ? <Check className="w-3 h-3 text-ok-ink" /> : <Copy className="w-3 h-3" />}
              {fullCopied ? '已复制' : '复制完整话术'}
            </button>
          </div>
          <p className="text-[12.5px] text-gray-800 leading-7">{fullScriptText || '（暂无可串联的口播内容）'}</p>
          <p className="text-[10px] text-gray-400 mt-1.5">共 {fullScriptText.length} 字 · 切换上方说法①/②后此处实时更新，导出飞书文档时同步写入</p>
        </div>

        {/* 备选钩子 */}
        <div>
          <p className="text-[11px] text-gray-500 mb-1.5">备选开场钩子（各 ≤15 字）</p>
          <div className="flex flex-wrap gap-2">
            {disp.hooks.length > 0 ? disp.hooks.map((h, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100">{h}</span>
            )) : <span className="text-[11px] text-gray-400">—</span>}
          </div>
        </div>

        {disp.shootingTip && (
          <p className="text-[11px] text-gray-600 bg-warn-bg/70 border border-warn-bg rounded-lg px-3 py-2 leading-relaxed flex items-start gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />
            <span><span className="font-bold text-warn-ink">拍摄建议：</span>{disp.shootingTip}</span>
          </p>
        )}

        {/* 底部操作：导出 30s 脚本 + 优化迭代 + 版本切换 */}
        <div className="pt-1 space-y-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 flex-wrap pt-3">
            <button
              type="button"
              onClick={handleExportDoc}
              disabled={docLoading || showOriginal}
              title="新建飞书文档：四段脚本 + 完整话术 + 已生成的 AI 镜头视频（内联可播放）"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] bg-brand-600 text-white text-xs font-bold shadow-btn hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {docLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {docLoading ? '正在生成飞书文档（上传视频中）…' : '导出飞书文档（含 AI 镜头）'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || showOriginal}
              className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
              {exporting ? '正在生成…' : '30s 逐秒分镜预览'}
            </button>
            <button
              type="button"
              onClick={() => setRefineOpen(v => !v)}
              disabled={refining || showOriginal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              优化迭代{version > 0 ? `（当前 v${version}）` : ''}
            </button>
            <button
              type="button"
              onClick={() => onOpenSidePanel?.('hot', appendRefine)}
              disabled={showOriginal || !onOpenSidePanel}
              title="在画布右侧展开行业热点参考面板"
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                sidePanelKind === 'hot' ? 'border-orange-400 bg-orange-50 text-orange-600 ring-2 ring-orange-200' : 'border-orange-200 text-orange-500 hover:bg-orange-50'
              }`}
            >
              <Flame className="w-4 h-4" />
              热点营销参考
            </button>
            <button
              type="button"
              onClick={() => onOpenSidePanel?.('mat', appendRefine)}
              disabled={showOriginal || !onOpenSidePanel}
              title="在画布右侧展开千川爆款素材拆解面板"
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                sidePanelKind === 'mat' ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-200' : 'border-brand-200 text-brand-700 hover:bg-brand-50'
              }`}
            >
              <Film className="w-4 h-4" />
              千川爆款素材灵感
            </button>
            {version > 0 && (
              <button
                type="button"
                onClick={() => setShowOriginal(v => !v)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-gray-500 hover:text-brand-700 hover:bg-brand-50 transition-all ml-auto"
              >
                <History className="w-3.5 h-3.5" />
                {showOriginal ? '返回优化版' : '查看原版'}
              </button>
            )}
          </div>
          {exportErr && <p className="text-[11px] text-danger-ink">{exportErr}</p>}
          {docErr && <p className="text-[11px] text-danger-ink">飞书文档导出失败：{docErr}</p>}
          {docRes ? (
            <div className="rounded-xl border border-ok-line bg-ok-bg/70 px-3.5 py-3 space-y-1.5">
              <p className="text-[12px] font-bold text-ok-ink flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 飞书文档已生成
                {docRes.embeddedCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-ok-line text-ok-ink">
                    🎬 {docRes.embeddedCount}/{docRes.videoCount} 个 AI 镜头视频已内联
                  </span>
                )}
              </p>
              <a
                href={docRes.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-700 hover:text-brand-800 underline underline-offset-2 break-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {docRes.title || docRes.url}
              </a>
              <p className="text-[10.5px] text-gray-500 leading-relaxed">
                文档已自动加你为协作者，可直接打开跟踪视频进度或转发达人。
                {docRes.embeddedCount < docRes.videoCount && '部分视频内联失败，文档内保留了在线播放链接。'}
                {docRes.warnings.length > 0 && '（链接公开分享权限需应用管理员开通 scope，当前仅协作者可打开）'}
              </p>
            </div>
          ) : null}

          {/* 优化迭代输入区（仅保留：说明 + 输入框 + 快捷 chips + 重新生成） */}
          <AnimatePresence>
            {refineOpen && !showOriginal && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden">
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5 space-y-2.5">
                  <p className="text-[11px] font-bold text-brand-800 flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> 填写优化方向，AI 将基于{version > 0 ? `当前 v${version}` : '本脚本'}改写
                  </p>

                  <textarea
                    rows={3}
                    value={refineText}
                    onChange={e => setRefineText(e.target.value)}
                    placeholder="例：把痛点改成职场脱发场景 / 增加价格锚点 / 口播更自然不要太推销 / 强化成分信任背书…"
                    className="w-full px-3 py-2 rounded-lg border border-brand-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {['口播更自然', '强化卖点', '增加价格锚点', '换个痛点场景'].map(s => (
                      <button key={s} type="button" onClick={() => setRefineText(t => (t ? t + '；' : '') + s)}
                        className="text-[10px] px-2 py-1 rounded-full bg-white border border-brand-200 text-brand-600 hover:bg-brand-100 transition-all">
                        + {s}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleRefine}
                      disabled={!refineText.trim() || refining}
                      className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {refining ? 'AI 改写中…' : '重新生成'}
                    </button>
                  </div>
                  {refineErr && <p className="text-[11px] text-danger-ink">{refineErr}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {scriptData && (
        <ScriptModal
          script={scriptData}
          productName={productName}
          direction={`方向${index + 1} · ${dir.angle}`}
          onClose={() => setScriptData(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// 更多爆款案例（多品牌去重，展开 5-10 条，含素材结构 + AI 匹配理由）
// ============================================================

function MoreCasesSection({ cases, product }: { cases: MoreCaseItem[]; product: ScriptProduct }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const brandCount = new Set(cases.map(c => c.brand).filter(Boolean)).size;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    // 首次展开：批量拉取 AI 匹配理由
    if (next && reasons.length === 0 && !loading) {
      setLoading(true);
      setErr('');
      try {
        const r = await fetchCaseReasons(
          {
            productName: product.productName, brand: product.brand,
            industry: product.industry, category: product.category,
            sellingPoints: product.sellingPoints, targetAudience: product.targetAudience,
          },
          cases,
        );
        setReasons(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'AI 匹配理由生成失败，案例结构字段仍可参考');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 text-brand-700 text-xs font-bold hover:bg-brand-100/70 transition-all"
      >
        <Film className="w-4 h-4" />
        {open ? '收起更多案例' : `查看更多爆款案例（${cases.length} 条 · 覆盖 ${brandCount} 个品牌，多品牌去重）`}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {loading && (
              <p className="mt-3 text-[11px] text-brand-600 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在为 {cases.length} 条案例逐条生成 AI 匹配理由…
              </p>
            )}
            {err && <p className="mt-3 text-[11px] text-warn-ink">{err}</p>}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cases.map((c, i) => (
                <MoreCaseCard key={c.id || i} item={c} reason={reasons[i] || ''} reasoning={loading && reasons.length === 0} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MoreCaseCard({ item, reason, reasoning }: { item: MoreCaseItem; reason: string; reasoning: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="flex gap-3 p-3">
        <div className="w-24 shrink-0">
          <CoverImage url={item.coverImageUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-600 text-white">{item.brand}</span>
            {item.industry && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.industry}</span>}
            {item.consumption && <span className="text-[10px] text-warn-ink">星川消耗 {item.consumption}</span>}
          </div>
          <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
          {item.videoLink && (
            <a href={item.videoLink} target="_blank" rel="noreferrer"
               className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-700 hover:underline">
              <ExternalLink className="w-3 h-3" /> 看原视频
            </a>
          )}
        </div>
      </div>
      <div className="px-3 pb-3 space-y-2 text-[11px] leading-relaxed">
        {item.hotAnalysis && (
          <div>
            <p className="text-gray-400 font-bold mb-0.5">爆款内容简述</p>
            <p className="text-gray-700 line-clamp-3">{item.hotAnalysis}</p>
          </div>
        )}
        {item.hookDesign && (
          <div>
            <p className="text-gray-400 font-bold mb-0.5">钩子设计</p>
            <p className="text-gray-700 line-clamp-2">{item.hookDesign}</p>
          </div>
        )}
        {item.structure && (
          <div>
            <p className="text-gray-400 font-bold mb-0.5">素材结构（钩子→卖点→转化）</p>
            <p className="text-gray-700 line-clamp-3">{item.structure}</p>
          </div>
        )}
        <div className="rounded-lg bg-brand-50/80 border border-brand-100 px-2.5 py-2">
          <p className="text-brand-600 font-bold text-[10px] mb-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI 匹配理由
          </p>
          {reasoning ? (
            <p className="text-brand-400 text-[10px] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 生成中…</p>
          ) : (
            <p className="text-brand-900/80">{reason || '—'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 30s 完整拍摄脚本弹窗（逐秒分镜 / 台词 / 画面 / 字幕 / 拍摄注意事项 + 一键复制）
// ============================================================

const SEG_PHASE_CLS: Record<string, string> = {
  痛: 'bg-danger-bg text-danger-ink border-danger-line',
  卖: 'bg-brand-50 text-brand-700 border-brand-200',
  放: 'bg-warn-bg text-warn-ink border-warn-line',
  逼: 'bg-ok-bg text-ok-ink border-ok-line',
};

function segPhaseCls(phase: string): string {
  if (phase.includes('痛') || phase.includes('钩子')) return SEG_PHASE_CLS['痛'];
  if (phase.includes('卖') || phase.includes('证明')) return SEG_PHASE_CLS['卖'];
  if (phase.includes('放') || phase.includes('场景') || phase.includes('放大')) return SEG_PHASE_CLS['放'];
  if (phase.includes('逼') || phase.includes('转化') || phase.includes('成交')) return SEG_PHASE_CLS['逼'];
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

function ScriptModal({ script, productName, direction, onClose }: {
  script: ScriptExport; productName: string; direction: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = scriptToText(script, { productName, direction });

  const handleCopy = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-brand-600 to-brand-600 text-white shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold flex items-center gap-2">
              <Clapperboard className="w-4 h-4 shrink-0" />
              <span className="truncate">{script.title || '30s 完整拍摄脚本'}</span>
            </p>
            <p className="text-[11px] text-white/80 mt-0.5 truncate">{productName} · {direction}</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors" aria-label="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {script.segments.map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-100 p-3.5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md border bg-gray-900 text-white">{s.range}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${segPhaseCls(s.phase)}`}>{s.phase}</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <p><span className="text-gray-400 font-bold">画面/分镜：</span><span className="text-gray-700">{s.visual}</span></p>
                <p className="border-l-2 border-brand-300 pl-2.5 italic text-gray-800 font-medium">“{s.voiceover}”</p>
                {s.subtitle && (
                  <p className="text-[11px]"><span className="text-gray-400 font-bold">字幕花字：</span><span className="inline-block px-1.5 py-0.5 rounded bg-warn-bg text-warn-ink border border-warn-bg">{s.subtitle}</span></p>
                )}
              </div>
            </div>
          ))}

          {script.shootingTips.length > 0 && (
            <div className="rounded-xl border border-warn-line bg-warn-bg/60 p-3.5">
              <p className="text-xs font-bold text-warn-ink mb-2 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> 拍摄注意事项
              </p>
              <ul className="space-y-1.5">
                {script.shootingTips.map((t, i) => (
                  <li key={i} className="text-[11px] text-warn-ink/90 leading-relaxed flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />{t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all">
            关闭
          </button>
          <button onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-600 text-white text-xs font-bold flex items-center gap-1.5 hover:from-brand-700 hover:to-brand-700 transition-all">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制到剪贴板' : '一键复制完整脚本'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
