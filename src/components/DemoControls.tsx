// ============================================================
// 🎬 演示模式 · 全局悬浮开关 + 顶部横幅
//   - 显眼的右下角开关（随时一键开/关）
//   - 开启时顶部展示「🎬 演示模式中 · 预置数据」横幅，可手动关闭
// 状态由 useDemoMode 统一管理：初始只认 URL ?demo=1/0，页内开关仅当前会话生效。
// ============================================================
import { useEffect, useState } from 'react';
import { Clapperboard, X } from 'lucide-react';
import { useDemoMode } from '../lib/demo';

export default function DemoControls() {
  const [on, setOn] = useDemoMode();
  // 横幅关闭仅为当前会话内的视觉隐藏（不改变 demo 状态）
  const [bannerHidden, setBannerHidden] = useState(false);

  // demo 从关→开时重新展示横幅
  useEffect(() => { if (on) setBannerHidden(false); }, [on]);

  return (
    <>
      {/* ===== 顶部横幅 ===== */}
      {on && !bannerHidden && (
        <div className="fixed top-0 inset-x-0 z-[80]">
          <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-brand-600 text-white shadow-lg">
            <div className="max-w-[1440px] mx-auto px-4 h-9 flex items-center justify-center relative">
              <span className="text-[12.5px] font-bold tracking-wide flex items-center gap-2">
                <Clapperboard className="w-4 h-4" />
                演示模式中 · 预置数据
                <span className="hidden sm:inline font-normal opacity-90">（四大模块秒出结果，不走实时 AI / 网络）</span>
              </span>
              <button
                type="button"
                onClick={() => setBannerHidden(true)}
                title="关闭横幅"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 右下角悬浮开关 ===== */}
      <button
        type="button"
        onClick={() => setOn(!on)}
        title={on ? '关闭演示模式，恢复真实数据' : '开启演示模式，使用预置数据'}
        className={`fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 pl-3 pr-2 h-11 rounded-full shadow-xl backdrop-blur transition-all border ${
          on
            ? 'bg-fuchsia-600/95 border-fuchsia-400 text-white hover:bg-fuchsia-600'
            : 'bg-white/95 border-gray-200 text-gray-700 hover:border-fuchsia-300 hover:text-fuchsia-700'
        }`}
      >
        <Clapperboard className="w-[18px] h-[18px]" />
        <span className="text-[12.5px] font-bold">演示模式</span>
        <span
          className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-white/30' : 'bg-gray-200'}`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
              on ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </span>
      </button>
    </>
  );
}
