// ============================================================
// 视频关键帧抽取（纯前端 <video> + canvas，无需 ffmpeg）
// 供「千川爆款素材拆解」相关组件复用（BreakdownPanel / 优化迭代弹窗内的 RefineBreakdown）
// ============================================================

export interface ExtractedFrames {
  frames: string[];   // dataURL（image/jpeg, 0.62 质量）
  times: number[];    // 每帧时间点（秒，1 位小数）
  duration: number;   // 视频总时长（秒）
}

/**
 * 从视频文件均匀抽取关键帧。
 * 时长 <15s 抽 8 帧、<40s 抽 10 帧、更长抽 12 帧；画面宽缩到 560px 等比缩放。
 */
export async function extractFrames(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ExtractedFrames> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  const wait = (ev: string, timeout = 15000) =>
    new Promise<void>((res, rej) => {
      const t = setTimeout(() => {
        video.removeEventListener(ev, ok);
        rej(new Error('视频加载超时'));
      }, timeout);
      const ok = () => {
        clearTimeout(t);
        video.removeEventListener(ev, ok);
        res();
      };
      video.addEventListener(ev, ok);
    });

  try {
    await wait('loadedmetadata');
    // 再等一帧可解码数据，提升 seek 稳定性
    await wait('loadeddata').catch(() => {});
    const duration = video.duration && isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error('无法读取视频时长（可能不是有效视频文件）');

    const n = duration < 15 ? 8 : duration < 40 ? 10 : 12;
    const targetW = 560;
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 1280;
    const w = Math.min(targetW, vw);
    const h = Math.round((w / vw) * vh);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 canvas 抽帧');

    const seekTo = (t: number) =>
      new Promise<void>((res) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', onSeeked);
          clearTimeout(timer);
          res();
        };
        const onSeeked = () => finish();
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', onSeeked);
          // 超时也尝试取当前帧
          res();
        }, 9000);
        video.addEventListener('seeked', onSeeked);
        // 兜底：部分浏览器 seeked 不触发时用 timeupdate
        video.addEventListener('timeupdate', function tu() {
          if (Math.abs(video.currentTime - t) < 0.3) {
            video.removeEventListener('timeupdate', tu);
            finish();
          }
        });
        video.currentTime = Math.min(t, Math.max(duration - 0.1, 0));
      });

    const frames: string[] = [];
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = duration * ((i + 0.5) / n);
      await seekTo(t);
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.62));
      times.push(Math.round(t * 10) / 10);
      onProgress?.(`抽帧 ${i + 1}/${n}`);
    }
    return { frames, times, duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
