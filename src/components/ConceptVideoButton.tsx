import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Info, Download, Maximize2 } from 'lucide-react';
import {
  buildConceptVideoPrompt, genConceptVideo, pollConceptVideo,
  type ConceptSeg,
} from '../lib/concept-video';
import { isDemoMode } from '../lib/demo';
import { pickDemoConceptVideo } from '../lib/demo-data';

// ============================================================
// 四段式脚本模块（痛点分析/卖点分析/放大功效/加速转化）的「🎬 AI镜头」
// FaaS 直连火山方舟 Seedance：提交后约 30-60 秒出 3 秒竖屏 MP4。
// 前端每 4 秒轮询；completed 后内嵌视频播放器（降级图片时用图片展示）。
// ============================================================
type Phase = 'idle' | 'working' | 'completed' | 'failed' | 'unavailable';

const POLL_INTERVAL = 4000;   // 每 4 秒轮询一次
const MAX_POLLS = 60;         // 最长轮询 4 分钟
const ETA_KEY = 'xc-ai-shot-eta';

/** 读取历史平均出片耗时（秒），无记录默认 60 秒 */
function readEta(): number {
  try {
    const v = Number(localStorage.getItem(ETA_KEY));
    if (v >= 20 && v <= 180) return Math.round(v);
  } catch { /* ignore */ }
  return 60;
}
/** 指数滑动更新平均耗时（α=0.4） */
function writeEta(seconds: number) {
  if (seconds < 10 || seconds > 240) return;
  try {
    const prev = Number(localStorage.getItem(ETA_KEY));
    const next = prev >= 20 ? Math.round(prev * 0.6 + seconds * 0.4) : Math.round(seconds);
    localStorage.setItem(ETA_KEY, String(next));
  } catch { /* ignore */ }
}

export default function ConceptVideoButton({
  seg, visual, voiceover, productName, industry, onMedia, demoSeedVariant = 0,
}: {
  seg: ConceptSeg;
  visual: string;
  voiceover: string;
  productName: string;
  industry?: string;
  /** 出片成功后回传媒体 URL 与类型（供父级快照保存到内容库） */
  onMedia?: (url: string, mediaType: 'video' | 'image') => void;
  /** 演示模式初始预置变体：父级传入脚本方向序号，保证每个方向的预置镜头各不相同 */
  demoSeedVariant?: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [videoUrl, setVideoUrl] = useState('');
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video');
  const [msg, setMsg] = useState('');
  const [eta, setEta] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  // 视频灯箱（点击小预览看完整 9:16）
  const [videoLightbox, setVideoLightbox] = useState(false);
  const timerRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const taskRef = useRef('');

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (clockRef.current != null) window.clearInterval(clockRef.current);
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const stopClock = () => {
    if (clockRef.current != null) { window.clearInterval(clockRef.current); clockRef.current = null; }
  };

  // 🎬 演示模式：每段预置 3 条真实 Seedance 视频（对应 3 个脚本方向）。挂载即按方向序号
  // 展示对应变体，不触发生成请求；点击按钮在预置镜头间切换，全程无网络 / FaaS 调用。
  const [demoVariant, setDemoVariant] = useState(demoSeedVariant);
  const applyDemoPreset = (variant: number) => {
    const preset = pickDemoConceptVideo(seg, variant);
    setVideoUrl(preset.url);
    setMediaType(preset.mediaType);
    setPhase('completed');
    onMedia?.(preset.url, preset.mediaType);
  };
  useEffect(() => {
    if (isDemoMode()) applyDemoPreset(demoSeedVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const busyText = elapsed < eta
    ? `⏳ 正在生成，预计约 ${Math.max(eta - elapsed, 1)} 秒`
    : '正在生成中，请稍候…';

  const start = async () => {
    if (phase === 'working') return;
    // 🎬 演示模式：只在预置镜头间切换，模拟约 0.8s 换片，不发任何请求
    if (isDemoMode()) {
      setPhase('working');
      setMsg('');
      timerRef.current = window.setTimeout(() => {
        if (!aliveRef.current) return;
        const next = demoVariant + 1;
        setDemoVariant(next);
        applyDemoPreset(next);
      }, 800);
      return;
    }
    clearTimer();
    stopClock();
    const initEta = readEta();
    setEta(initEta);
    setElapsed(0);
    const t0 = Date.now();
    clockRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    setPhase('working');
    setMsg('');
    setVideoUrl('');
    setMediaType('video');
    const finish = (fn: () => void) => { stopClock(); fn(); };
    try {
      const prompt = buildConceptVideoPrompt(seg, productName, visual, voiceover);
      const gen = await genConceptVideo({ seg, prompt, productName, industry, visual, voiceover });
      if (!aliveRef.current) return;
      // available:false 且无 error = 监听能力未就绪，友好提示
      if (!gen.taskId) {
        finish(() => {
          if (gen.error) { setMsg(gen.error); setPhase('failed'); }
          else setPhase('unavailable');
        });
        return;
      }
      taskRef.current = gen.taskId;
      let polls = 0;
      const tick = async () => {
        if (!aliveRef.current) return;
        polls += 1;
        let r: Awaited<ReturnType<typeof pollConceptVideo>>;
        try {
          r = await pollConceptVideo(taskRef.current);
        } catch {
          r = { status: 'pending' }; // 单次轮询网络抖动：继续轮，不打断
        }
        if (!aliveRef.current) return;
        if (r.status === 'completed' && r.videoUrl) {
          const cost = Math.max(1, Math.round((Date.now() - t0) / 1000));
          writeEta(cost);
          finish(() => {
            setVideoUrl(r.videoUrl!);
            const mt = r.mediaType || (/\.png|jpe?g|webp(\?|$)/i.test(r.videoUrl!) ? 'image' : 'video');
            setMediaType(mt);
            setPhase('completed');
            onMedia?.(r.videoUrl!, mt);
          });
          return;
        }
        if (r.status === 'failed') {
          finish(() => { setMsg(r.error || '视频生成失败'); setPhase('failed'); });
          return;
        }
        if (polls >= MAX_POLLS) {
          finish(() => {
            setMsg('素材仍在生成中，稍后再点「🎬 AI镜头」即可继续查看（不会重复生成）');
            setPhase('failed');
          });
          return;
        }
        timerRef.current = window.setTimeout(tick, POLL_INTERVAL);
      };
      timerRef.current = window.setTimeout(tick, isDemoMode() ? 0 : POLL_INTERVAL);
    } catch (e) {
      if (!aliveRef.current) return;
      finish(() => {
        setMsg(e instanceof Error ? e.message : '网络异常，请稍后再试');
        setPhase('failed');
      });
    }
  };

  const busy = phase === 'working';
  const btnLabel = busy
    ? '🎬 生成中…'
    : phase === 'completed'
      ? (isDemoMode() ? '🎬 换一个镜头' : '🎬 重新生成')
      : '🎬 AI镜头';

  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <span className="text-[10px] text-fuchsia-600 inline-flex items-center gap-1 font-medium">
            <Loader2 className="w-3 h-3 animate-spin" />
            {busyText}
          </span>
        )}
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 disabled:opacity-70 transition-colors"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {btnLabel}
        </button>
      </div>

      {busy && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-fuchsia-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-fuchsia-700">{busyText}</div>
            <div className="mt-1 h-1 w-44 overflow-hidden rounded-full bg-fuchsia-100">
              <div
                className="h-full rounded-full bg-fuchsia-500 transition-all duration-1000 ease-linear"
                style={{ width: `${Math.min(100, Math.round((elapsed / eta) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {phase === 'unavailable' && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>视频生成能力正在接入中，敬请期待</span>
        </div>
      )}

      {phase === 'failed' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-danger-ink">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{msg ? `${msg}，` : ''}生成失败，请重试</span>
        </div>
      )}

      {phase === 'completed' && videoUrl && (
        <div className="mt-2 w-[300px] max-w-full">
          {mediaType === 'image' ? (
            <>
              <button type="button" onClick={() => setLightbox(true)} title="点击放大查看"
                className="group relative block w-full h-[170px] rounded-lg overflow-hidden border border-gray-200 bg-black">
                <img src={videoUrl} alt="AI概念图" className="w-full h-full object-cover" />
                <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
              </button>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">🖼 AI 概念图</span>
                <a
                  href={videoUrl}
                  download={`${productName || '星川'}-AI概念图.jpg`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-600 hover:underline"
                >
                  <Download className="w-3 h-3" /> 下载图片
                </a>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setVideoLightbox(true)} title="点击放大查看 9:16 完整视频"
                className="group relative block w-full h-[170px] rounded-lg overflow-hidden border border-gray-200 bg-black">
                <video
                  src={videoUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
                <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] font-bold">
                  竖屏 9:16 · 3 秒
                </span>
                <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
                <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-1.5">
                  <span className="text-white/90 text-[10.5px] font-bold">点击放大查看完整视频</span>
                </span>
              </button>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">🎬 AI 短视频</span>
                <a
                  href={videoUrl}
                  download={`${productName || '星川'}-AI镜头.mp4`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-600 hover:underline"
                >
                  <Download className="w-3 h-3" /> 下载视频
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {lightbox && mediaType === 'image' && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img src={videoUrl} alt="AI概念图大图" className="max-h-[90vh] max-w-[90vw] rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {videoLightbox && mediaType === 'video' && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setVideoLightbox(false)}
        >
          <video
            src={videoUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[88vh] max-w-full rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
