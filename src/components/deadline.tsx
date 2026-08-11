"use client";

import { useEffect, useState } from "react";

import { cx } from "./ui";

function breakdown(msRemaining: number) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Live countdown to a deadline or price-change window. */
export function DeadlineCountdown({
  deadline,
  label,
  align = "end",
}: {
  /** Deadline as an epoch in milliseconds. */
  deadline: number;
  label: string;
  /** Label alignment — use "start" inside full-width strips. */
  align?: "start" | "end";
}) {
  const [remaining, setRemaining] = useState(() => deadline - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const { days, hours, minutes, seconds } = breakdown(remaining);
  const passed = remaining <= 0;

  const units = [
    { value: days, unit: "days" },
    { value: hours, unit: "hrs" },
    { value: minutes, unit: "min" },
    { value: seconds, unit: "sec" },
  ];

  return (
    <div className="w-full min-w-0">
      <div
        className={cx(
          "text-[11px] font-medium leading-snug tracking-wider text-ink-dim uppercase",
          align === "end" ? "text-right" : "text-left",
        )}
      >
        {passed ? "Deadline passed" : label}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {units.map(({ value, unit }) => (
          <div
            key={unit}
            className="rounded-lg border border-line bg-surface-2/60 px-1.5 py-1.5 text-center"
          >
            <div className="text-xl font-semibold tabular-nums text-ink">
              {String(passed ? 0 : value).padStart(2, "0")}
            </div>
            <div className="text-[10px] tracking-wide text-ink-dim uppercase">
              {unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
