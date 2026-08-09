"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { MODEL } from "@/lib/model/config";

import { cx } from "./ui";

/**
 * Changes how many gameweeks projections look ahead over. The value lives in the
 * URL so a view can be shared or bookmarked, and the page re-renders on the
 * server with the new horizon.
 */
export function HorizonPicker({ horizon }: { horizon: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (value: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("horizon", String(value));
    startTransition(() => router.push(`${pathname}?${params}`));
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] tracking-wider text-ink-dim uppercase">
        Horizon {pending && "· updating"}
      </span>
      <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
        {Array.from({ length: MODEL.maxHorizon }, (_, index) => index + 1).map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              className={cx(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                horizon === value
                  ? "bg-accent text-brand"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {value}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
