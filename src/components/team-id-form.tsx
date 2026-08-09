"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

const STORAGE_KEY = "fpl-helper:team-id";

/**
 * Takes a public FPL team ID. No login is involved — the ID is the number in the
 * URL of your points page on the official site. The last ID used is remembered in
 * the browser so it does not have to be typed again.
 */
export function TeamIdForm({ current }: { current?: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (current) {
      window.localStorage.setItem(STORAGE_KEY, String(current));
      return;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && input.current && !input.current.value) {
      input.current.value = saved;
    }
  }, [current]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const id = Number(input.current?.value.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    startTransition(() => router.push(`/my-team?id=${id}`));
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] tracking-wider text-ink-dim uppercase">
          FPL team ID
        </span>
        <input
          ref={input}
          defaultValue={current ? String(current) : ""}
          inputMode="numeric"
          placeholder="e.g. 1234567"
          className="w-44 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-dim disabled:opacity-60"
      >
        {pending ? "Loading…" : "Analyse"}
      </button>
    </form>
  );
}
