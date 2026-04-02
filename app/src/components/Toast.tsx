import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Toast } from '../hooks/useToast';

const borderColors: Record<string, string> = {
  success: 'border-l-green',
  info: 'border-l-blue',
  error: 'border-l-red',
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto bg-bg-secondary border border-border rounded-lg shadow-xl px-4 py-3 min-w-72 max-w-96 border-l-4 ${borderColors[toast.type] || 'border-l-blue'} flex items-center gap-3`}
          >
            <span className="text-sm text-text-primary flex-1">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="text-xs font-semibold text-accent-light hover:text-accent transition-colors cursor-pointer whitespace-nowrap"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
