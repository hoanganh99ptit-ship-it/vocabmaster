import { AlertTriangle } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useTheme();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in border ${
        theme === 'cinema'
          ? 'bg-[#18130e] border-amber-500/40 text-amber-100 shadow-black/80'
          : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            theme === 'cinema' ? 'bg-rose-950/80 border border-rose-500/40' : 'bg-rose-100'
          }`}>
            <AlertTriangle className={`w-6 h-6 ${theme === 'cinema' ? 'text-rose-400' : 'text-rose-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>{title}</h3>
            <p className={`mt-1 text-sm ${theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'}`}>{message}</p>
          </div>
        </div>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              theme === 'cinema'
                ? 'text-stone-300 hover:bg-stone-800 hover:text-white'
                : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
