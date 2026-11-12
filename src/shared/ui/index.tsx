import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

/* ------------------------------------------------------------------ buttons */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'warn' | 'success' | 'ghost';

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary:
    'bg-brand text-white border border-brand-dark/30 shadow-[0_1px_2px_rgb(15_23_42/0.16)] hover:bg-brand-dark',
  secondary:
    'bg-white/70 text-ink border border-line hover:bg-white hover:border-line-strong shadow-[0_1px_2px_rgb(15_23_42/0.05)]',
  danger: 'bg-bad/[0.08] text-bad border border-bad/35 hover:bg-bad/[0.15]',
  warn: 'bg-warn/[0.10] text-warn border border-warn/35 hover:bg-warn/[0.17]',
  success: 'bg-good/[0.10] text-good border border-good/35 hover:bg-good/[0.17]',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-ink/[0.05]',
};

const BTN_SHAPE =
  'inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold leading-tight disabled:cursor-not-allowed disabled:border-transparent disabled:bg-ink/[0.08] disabled:text-slate-500 disabled:shadow-none';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  full?: boolean;
}

export function Btn({ variant = 'primary', full, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`press ${BTN_SHAPE} ${BTN_VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- cards */

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card min-w-0 p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`headline ${className}`}>{children}</h2>;
}

/* ------------------------------------------------------------------- badges */

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

const BADGE_TONES: Record<BadgeTone, string> = {
  good: 'bg-good/[0.12] text-good border-good/30',
  warn: 'bg-warn/[0.14] text-warn border-warn/30',
  bad: 'bg-bad/[0.12] text-bad border-bad/30',
  info: 'bg-info/[0.12] text-info border-info/30',
  neutral: 'bg-ink/[0.05] text-ink border-ink/15',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex min-h-[32px] items-center rounded-full border px-3 py-0.5 text-sm font-bold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- big numbers */

export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: 'ink' | 'good' | 'bad' | 'warn' | 'brand';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-good'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'brand'
            ? 'text-brand'
            : 'text-ink';
  return (
    <Card className="flex min-h-[132px] flex-col justify-between">
      <p className="meta">{label}</p>
      <p className={`num-xl ${toneClass}`}>{value}</p>
      {sub ? <p className="meta">{sub}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------------- modal */

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim-in fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-panel sheet-in flex max-h-[94vh] w-full flex-col overflow-hidden rounded-b-none rounded-t-[1.25rem] sm:rounded-[1.25rem] ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="headline">{title}</h2>
            {subtitle ? <p className="meta mt-1">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this window"
            className="press -mr-2 -mt-1 flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-ink/[0.06]"
          >
            <X size={28} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-base font-semibold">{label}</span>
      {children}
      {hint && !error ? <span className="meta mt-1 block">{hint}</span> : null}
      {error ? <span className="mt-1 block font-semibold text-bad">{error}</span> : null}
    </label>
  );
}

const INPUT_CLS =
  'w-full min-h-[54px] rounded-xl border border-line bg-white/80 px-4 text-base text-ink placeholder:text-slate-500 focus:border-brand focus:bg-white focus:outline-none';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${INPUT_CLS} ${className}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select {...rest} className={`${INPUT_CLS} ${className}`}>
      {children}
    </select>
  );
}

export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      inputMode="decimal"
      type="number"
      min={0}
      className={`${INPUT_CLS} num-md ${className}`}
    />
  );
}

/* ------------------------------------------------------------- segmented tabs */

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="scroll-x flex min-w-0 gap-2 overflow-x-auto pb-1">
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.id)}
            className={`press inline-flex min-h-[54px] shrink-0 items-center gap-2 rounded-xl border px-5 text-base font-semibold ${
              active
                ? 'border-brand/40 bg-brand-soft text-brand-dark'
                : 'border-line bg-white/70 text-ink hover:bg-white hover:border-line-strong'
            }`}
          >
            {t.label}
            {typeof t.badge === 'number' && t.badge > 0 ? (
              <span className="num-md rounded-full bg-bad px-2.5 py-0.5 text-sm text-white">{t.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- empty state */

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {hint ? <p className="meta max-w-md">{hint}</p> : null}
      {action}
    </Card>
  );
}

export function PageIntro({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h1 className="display">{title}</h1>
      {hint ? <p className="meta mt-1.5">{hint}</p> : null}
    </div>
  );
}

/** Small labelled row used inside detail cards. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-base text-slate-600">{label}</span>
      <span className="num-md text-right">{value}</span>
    </div>
  );
}
