import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

// 通用确认弹窗：标题 + 内容 + 确认/取消；支持确认中 loading 态
export default function ConfirmDialog({
  open, title, children, confirmText = '确认保存', cancelText = '取消',
  confirmTone = 'violet', confirming = false, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmTone?: 'violet' | 'red' | 'blue' | 'emerald';
  confirming?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const toneCls = {
    violet: 'bg-brand-600 hover:bg-brand-700 shadow-brand-200',
    red: 'bg-danger hover:bg-danger-ink shadow-red-200',
    blue: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
  }[confirmTone];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
          onClick={confirming ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <HelpCircle className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">{title}</h3>
              </div>
              {children && (
                <div className="text-[13px] text-gray-600 leading-relaxed pl-[52px]">
                  {children}
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-2.5">
              <button
                type="button" onClick={onClose} disabled={confirming}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {cancelText}
              </button>
              <button
                type="button" onClick={onConfirm} disabled={confirming}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${toneCls}`}
              >
                {confirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
