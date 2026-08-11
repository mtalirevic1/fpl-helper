"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Stages a transfer suggestion into the URL as `preview=out:in,out:in` so the
 * server can rebuild the squad analysis around the staged moves.
 */
export function TransferPreviewButtons({
  previews,
}: {
  previews: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const active = searchParams.get("preview");

  const setPreview = (key: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set("preview", key);
    else params.delete("preview");
    startTransition(() => router.push(`/my-team?${params}`));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {previews.map((preview) => (
        <button
          key={preview.key}
          type="button"
          disabled={pending}
          onClick={() =>
            setPreview(active === preview.key ? null : preview.key)
          }
          className={
            active === preview.key
              ? "rounded-md border border-accent bg-accent/10 px-2 py-1 text-xs text-accent"
              : "rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
          }
        >
          {active === preview.key ? "Clear preview" : preview.label}
        </button>
      ))}
      {active && (
        <Link
          href={`/my-team?${(() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("preview");
            return params;
          })()}`}
          className="rounded-md border border-line px-2 py-1 text-xs text-ink-dim"
        >
          Reset
        </Link>
      )}
    </div>
  );
}
