"use client";

import { useState } from "react";

export function CopyButtons({
  link,
  squadText,
}: {
  link: string;
  squadText: string;
}) {
  const [note, setNote] = useState<string | null>(null);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNote(`Copied ${label}`);
      window.setTimeout(() => setNote(null), 1500);
    } catch {
      setNote("Copy failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => copy(link, "link")}
        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
      >
        Copy link
      </button>
      <button
        type="button"
        onClick={() => copy(squadText, "squad")}
        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
      >
        Copy squad
      </button>
      {note && <span className="text-xs text-accent">{note}</span>}
    </div>
  );
}
