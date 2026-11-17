// ============================================================
// AI镜头客户端：FaaS 直连火山方舟 Seedance
//   gen_concept_video  写台账并同步提交 Seedance 任务（约 20 秒），返回 {available, taskId}
//   poll_video_task    按 taskId 轮询 Ark 状态；完成时 FaaS 转存 TOS 并带回 videoUrl/mediaType
// 产物：3 秒竖屏 9:16 MP4（异常时可能降级为图片，mediaType=image）
// ============================================================
import { FAAS_URL } from './api';
import { isGhPages, getGhAuth } from './gh';
// 🎬 演示模式：直接使用预置视频，不走 FaaS
import { isDemoMode, demoLatency } from './demo';
import { pickDemoConceptVideo } from './demo-data';

export type ConceptSeg = 'pain' | 'sell' | 'release' | 'close';

export const CONCEPT_SEG_LABEL: Record<ConceptSeg, string> = {
  pain: '痛点分析',
  sell: '卖点分析',
  release: '放大功效',
  close: '加速转化',
};

/** 取模块「核心画面」+「口播原话」拼装视频生成 prompt */
export function buildConceptVideoPrompt(
  seg: ConceptSeg,
  productName: string,
  visual: string,
  voiceover: string,
): string {
  const label = CONCEPT_SEG_LABEL[seg];
  const v = (visual || '').trim();
  const vo = (voiceover || '').trim();
  const parts: string[] = [];
  parts.push(`生成一条抖音带货短视频的「${label}」段落（竖屏9:16，时长3秒，写实拍摄风格，不要字幕贴纸）。`);
  if (productName.trim()) parts.push(`商品：${productName.trim()}。`);
  if (v) parts.push(`核心画面：${v}。`);
  if (vo) parts.push(`人物口播原话：「${vo}」，画面节奏与口播一致，中近景为主，真实自然光，质感贴近真实达人带货素材。`);
  return parts.join('\n').slice(0, 1500);
}

async function postStage(payload: Record<string, unknown>, timeoutMs = 45_000): Promise<any> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(FAAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await resp.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export interface GenConceptResult {
  available: boolean;
  taskId?: string;
  error?: string;
}

/** 入队：把某一段脚本的核心画面/口播原话/prompt 写入概念视频任务表 */
export async function genConceptVideo(params: {
  seg: ConceptSeg;
  prompt: string;
  productName: string;
  industry?: string;
  visual?: string;
  voiceover?: string;
}): Promise<GenConceptResult> {
  if (isDemoMode()) { await demoLatency(); return { available: true, taskId: 'demo-concept-task' }; }
  const gh = isGhPages();
  const auth = gh ? getGhAuth() : null;
  const r = await postStage({
    stage: 'gen_concept_video',
    moduleType: params.seg,
    prompt: params.prompt,
    productName: params.productName || '',
    industry: params.industry || '',
    visual: params.visual || '',
    voiceover: params.voiceover || '',
    source: gh ? '对外' : '对内',
    account: gh ? `${auth?.agency || ''} ${auth?.name || ''}`.trim() : '渠道侧',
    ...(gh && auth?.token ? { token: auth.token } : {}),
  });
  if (r && r.available === false) return { available: false };
  if (r && r.ok && r.taskId) return { available: true, taskId: String(r.taskId) };
  return { available: false, error: String(r?.error || '任务创建失败，请稍后再试').slice(0, 120) };
}

export type ConceptTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown';

export interface PollConceptResult {
  status: ConceptTaskStatus;
  videoUrl?: string;
  mediaType?: 'video' | 'image';
  error?: string;
}

/** 轮询任务状态（前端每 4 秒一次；命中完成的那轮 FaaS 要转存 TOS，超时放宽到 70 秒） */
export async function pollConceptVideo(taskId: string, seg?: ConceptSeg): Promise<PollConceptResult> {
  if (isDemoMode()) {
    const preset = pickDemoConceptVideo(seg || 'pain', 0);
    return { status: 'completed', videoUrl: preset.url, mediaType: preset.mediaType };
  }
  const r = await postStage({ stage: 'poll_video_task', taskId }, 70_000);
  if (!r || !r.ok) return { status: 'pending', error: String(r?.error || '').slice(0, 120) || undefined };
  const status = (['pending', 'running', 'completed', 'failed', 'unknown'].includes(r.status)
    ? r.status : 'unknown') as ConceptTaskStatus;
  return {
    status,
    ...(r.videoUrl ? { videoUrl: String(r.videoUrl) } : {}),
    ...(r.mediaType === 'image' ? { mediaType: 'image' as const } : { mediaType: 'video' as const }),
    ...(r.error ? { error: String(r.error).slice(0, 120) } : {}),
  };
}
