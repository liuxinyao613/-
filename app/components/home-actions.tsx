"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  clearSession,
  LEGACY_SESSION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "@/lib/session/storage";

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return Boolean(
    window.localStorage.getItem(SESSION_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY),
  );
}

export function HomeActions() {
  const hasSession = useSyncExternalStore(subscribe, getSnapshot, () => false);

  return (
    <div className="hero-actions">
      <Link className="primary-action" href="/assessment">
        {hasSession ? "继续上次测试" : "开始边界测试"}
        <span aria-hidden="true">→</span>
      </Link>
      {hasSession ? (
        <Link className="text-action" href="/assessment" onClick={clearSession}>
          重新开始
        </Link>
      ) : null}
    </div>
  );
}
