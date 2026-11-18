"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type StatefulButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
  children: React.ReactNode;
  successLabel?: string;
  errorLabel?: string;
};

/** Aceternity stateful-button, adaptado para preservar erros reais e evitar duplo clique. */
export function Button({ children, className, onClick, disabled, successLabel = "Concluído", errorLabel = "Falhou. Tente novamente", ...props }: StatefulButtonProps) {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);
  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (status === "loading" || disabled) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStatus("loading");
    try {
      await onClick?.(event);
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      resetTimer.current = setTimeout(() => setStatus("idle"), 2300);
    }
  };
  return (
    <motion.button
      type="button"
      {...props}
      disabled={disabled || status === "loading"}
      aria-busy={status === "loading"}
      data-state={status}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.18 }}
      onClick={handleClick}
      className={cn("stateful-aceternity inline-flex min-h-11 min-w-[150px] items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[0_7px_22px_rgba(32,211,169,0.20)] ring-offset-2 transition-[background,box-shadow] duration-200 hover:bg-emerald-300 hover:ring-2 hover:ring-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={status} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.17 }} className="inline-flex items-center justify-center gap-2 text-center">
          {status === "loading" ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true"/><span>PROCESSANDO...</span></> :
           status === "success" ? <><Check className="size-4" aria-hidden="true"/><span>{successLabel}</span></> :
           status === "error" ? <><AlertCircle className="size-4" aria-hidden="true"/><span>{errorLabel}</span></> : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
