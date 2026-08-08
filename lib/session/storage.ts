import { deriveBoundaryStates } from "@/lib/domain/derive";
import { SessionSchema, type Session } from "@/lib/domain/schemas";

export const SESSION_STORAGE_KEY = "relationship-boundary-map.session.v2";
export const LEGACY_SESSION_STORAGE_KEY = "relationship-boundary-map.session.v1";

function migrateLegacy(value: unknown): Session | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.schemaVersion !== 1) return null;
  const rawResponses = Array.isArray(legacy.rawResponses) ? legacy.rawResponses : [];
  const evidence = Array.isArray(legacy.evidence) ? legacy.evidence : [];
  return SessionSchema.parse({
    ...legacy,
    schemaVersion: 2,
    conditions: [],
    boundaryFlips: [],
    hiddenCosts: [],
    boundaryStates: deriveBoundaryStates(rawResponses as never[], evidence as never[]),
    probeIntents: [],
    acceptedInterpretations: Array.isArray(legacy.acceptedInterpretations)
      ? legacy.acceptedInterpretations
      : [],
    telemetry: [],
    adaptiveConfig: { minAdaptive: 8, targetTotal: 38, softLimit: 45, hardLimit: 50 },
    reportStatus: "IDLE",
    structuredReport: undefined,
  });
}

function parseStored(stored: string | null): Session | null {
  if (!stored) return null;
  try {
    const raw = JSON.parse(stored);
    const current = SessionSchema.safeParse(raw);
    if (current.success) return current.data;
    return migrateLegacy(raw);
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const current = parseStored(window.localStorage.getItem(SESSION_STORAGE_KEY));
  if (current) return current;
  const migrated = parseStored(window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY));
  if (migrated) saveSession(migrated);
  return migrated;
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SessionSchema.parse(session)));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}
