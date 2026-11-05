"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, Info, Loader2, Volume2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Button ----------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "sun";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ocean-500 text-white hover:bg-ocean-600 shadow-[0_6px_16px_-6px_rgba(43,138,214,0.6)]",
  secondary: "bg-white text-ink border border-slate-200 hover:border-slate-300 hover:bg-slate-50",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
  danger: "bg-coral-500 text-white hover:bg-coral-600",
  soft: "bg-ocean-50 text-ocean-700 hover:bg-ocean-100",
  sun: "bg-sun-400 text-ink hover:bg-sun-500 shadow-[0_6px_16px_-6px_rgba(236,178,46,0.6)]",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-11 px-4 text-sm rounded-2xl gap-2",
  lg: "h-13 px-6 text-base rounded-2xl gap-2 min-h-[52px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 select-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------- Card ----------
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("rounded-3xl bg-white shadow-soft border border-slate-100", onClick && "cursor-pointer", className)}>
      {children}
    </div>
  );
}

// ---------- Progress ----------
export function ProgressBar({ value, max, className, barClassName, height = "h-2.5" }: { value: number; max: number; className?: string; barClassName?: string; height?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-slate-100", height, className)}>
      <div className={cn("h-full rounded-full bg-ocean-500 transition-all duration-500", barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, max, size = 96, stroke = 10, className, children, color = "#2b8ad6" }: { value: number; max: number; size?: number; stroke?: number; className?: string; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eef1f5" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// ---------- Pill ----------
type Tone = "ocean" | "leaf" | "sun" | "coral" | "slate" | "sand";
const TONES: Record<Tone, string> = {
  ocean: "bg-ocean-50 text-ocean-700",
  leaf: "bg-leaf-50 text-leaf-700",
  sun: "bg-sun-100 text-sun-600",
  coral: "bg-coral-100 text-coral-600",
  slate: "bg-slate-100 text-slate-600",
  sand: "bg-sand-100 text-sand-500",
};
export function Pill({ tone = "slate", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = { new: "slate", learning: "sun", review: "ocean", mastered: "leaf" };

// ---------- Modal (bottom sheet on mobile) ----------
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "md" | "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-lift animate-fade-up sm:m-4 sm:rounded-3xl", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 sm:px-6">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} aria-label="关闭" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Empty ----------
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-500">{icon}</div>}
      <div className="text-base font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Speak ----------
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === "en-US" && /Google|Samantha|Microsoft/i.test(x.name)) ?? voices.find((x) => x.lang?.startsWith("en"));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function SpeakButton({ text, className, size = "md" }: { text: string; className?: string; size?: "sm" | "md" }) {
  const [active, setActive] = useState(false);
  return (
    <button
      type="button"
      aria-label={`播放 ${text} 的发音`}
      onClick={(e) => {
        e.stopPropagation();
        setActive(true);
        speak(text);
        setTimeout(() => setActive(false), 700);
      }}
      className={cn(
        "grid place-items-center rounded-full bg-ocean-50 text-ocean-600 transition hover:bg-ocean-100 active:scale-95",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        active && "ring-2 ring-ocean-300",
        className,
      )}
    >
      <Volume2 className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </button>
  );
}

// ---------- Toast ----------
type ToastKind = "success" | "error" | "info" | "reward";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}
const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === "error" ? 4500 : 3000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lift animate-fade-up", t.kind === "error" ? "border-coral-100" : t.kind === "reward" ? "border-sun-100" : "border-slate-100")}>
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 text-leaf-500" />}
            {t.kind === "error" && <XCircle className="mt-0.5 h-5 w-5 text-coral-500" />}
            {t.kind === "info" && <Info className="mt-0.5 h-5 w-5 text-ocean-500" />}
            {t.kind === "reward" && <span className="mt-0.5 text-lg leading-none">🪙</span>}
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.push;
}

// ---------- Immersive (hide mobile nav) ----------
export const ImmersiveCtx = createContext<{ immersive: boolean; setImmersive: (v: boolean) => void }>({ immersive: false, setImmersive: () => {} });
export function useImmersive(active: boolean) {
  const { setImmersive } = useContext(ImmersiveCtx);
  useEffect(() => {
    setImmersive(active);
    return () => setImmersive(false);
  }, [active, setImmersive]);
}

export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#f7c948" stroke="#d19a1a" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#d19a1a" strokeWidth="1.2" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="#b8860b">W</text>
    </svg>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
