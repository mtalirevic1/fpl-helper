import type { ReactNode } from "react";

import type { PositionId } from "@/lib/fpl/rules";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-line bg-surface/80 backdrop-blur-sm",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "warn" | "danger";
}) {
  const tones = {
    default: "text-ink",
    accent: "text-accent",
    warn: "text-warn",
    danger: "text-danger",
  } as const;
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3">
      <div className="text-[11px] font-medium tracking-wider text-ink-dim uppercase">
        {label}
      </div>
      <div className={cx("mt-1 text-2xl font-semibold tabular-nums", tones[tone])}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

const POSITION_TONES: Record<PositionId, string> = {
  1: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  2: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  3: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  4: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
};

export function PositionBadge({ position }: { position: PositionId }) {
  const labels: Record<PositionId, string> = {
    1: "GKP",
    2: "DEF",
    3: "MID",
    4: "FWD",
  };
  return (
    <span
      className={cx(
        "inline-flex h-5 w-11 shrink-0 items-center justify-center rounded-md text-[10px] font-bold leading-none tracking-wide ring-1 ring-inset",
        POSITION_TONES[position],
      )}
    >
      {labels[position]}
    </span>
  );
}

/**
 * Shared sizing for fixture pills and blank slots so rows stay aligned.
 * Fixed height + min-width keeps chips uniform; width can grow for longer
 * labels, but text never wraps (that was the original height skew).
 */
export const FIXTURE_CHIP =
  "inline-flex h-5 min-w-[3.25rem] shrink-0 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold leading-none whitespace-nowrap tabular-nums";

/** A fixture difficulty rating, coloured 1 (easiest) to 5 (hardest). */
export function DifficultyPill({
  difficulty,
  children,
  title,
}: {
  difficulty: number;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        FIXTURE_CHIP,
        "border border-transparent",
        `fdr-${Math.min(5, Math.max(1, difficulty))}`,
      )}
    >
      {children}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "danger" | "info";
  title?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-muted ring-line",
    accent: "bg-accent/10 text-accent ring-accent/30",
    warn: "bg-warn/10 text-warn ring-warn/30",
    danger: "bg-danger/10 text-danger ring-danger/30",
    info: "bg-cyan/10 text-cyan ring-cyan/30",
  } as const;
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A horizontal bar for comparing a value against the largest in a set. */
export function Meter({
  value,
  max,
  tone = "accent",
}: {
  value: number;
  max: number;
  tone?: "accent" | "cyan" | "warn";
}) {
  const width = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  const tones = {
    accent: "bg-accent/70",
    cyan: "bg-cyan/70",
    warn: "bg-warn/70",
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={cx("h-full rounded-full", tones[tone])}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-2 text-sm text-ink-muted">{children}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
