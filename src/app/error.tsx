"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-sm text-ink-muted">
        The page failed to load. The FPL API is sometimes briefly unavailable —
        try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand hover:bg-accent-dim"
      >
        Try again
      </button>
    </div>
  );
}
