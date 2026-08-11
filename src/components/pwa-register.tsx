"use client";

import { useEffect } from "react";

/** Registers the shell-only service worker for installability / offline shell. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail on non-secure origins in some browsers.
    });
  }, []);
  return null;
}
