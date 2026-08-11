"use client";

import Link from "next/link";

import { getStoredTeamId } from "@/lib/client-storage";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getTeamHref() {
  const id = getStoredTeamId();
  return id ? `/my-team?id=${id}` : "/my-team";
}

/** Client CTA that deep-links to the last analysed team ID. */
export function OpenMyTeamLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const href = useSyncExternalStore(subscribe, getTeamHref, () => "/my-team");
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
