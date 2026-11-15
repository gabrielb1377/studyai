const CONSENT_PREFIX = "studyai:voice-consent:v1:";
const STORAGE_SCOPE_KEY = "studyai:storage-scope";

export type VoiceConsentState = {
  accepted: boolean;
  enabled: boolean;
  updatedAt?: string;
};

function resolveScope(scope?: string): string {
  if (scope?.trim()) return scope.trim();
  if (typeof window === "undefined") return "guest";
  try {
    return window.localStorage.getItem(STORAGE_SCOPE_KEY)?.trim() || "guest";
  } catch {
    return "guest";
  }
}

export function getVoiceConsentState(scope?: string): VoiceConsentState {
  if (typeof window === "undefined") return { accepted: false, enabled: false };
  try {
    const raw = window.localStorage.getItem(`${CONSENT_PREFIX}${resolveScope(scope)}`);
    if (!raw) return { accepted: false, enabled: false };
    const parsed = JSON.parse(raw) as Partial<VoiceConsentState>;
    const accepted = parsed.accepted === true;
    return {
      accepted,
      enabled: accepted && parsed.enabled !== false,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { accepted: false, enabled: false };
  }
}

function saveVoiceConsentState(state: VoiceConsentState, scope?: string): VoiceConsentState {
  if (typeof window === "undefined") return state;
  try {
    window.localStorage.setItem(`${CONSENT_PREFIX}${resolveScope(scope)}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
  return state;
}

export function grantVoiceConsent(scope?: string): VoiceConsentState {
  return saveVoiceConsentState(
    {
      accepted: true,
      enabled: true,
      updatedAt: new Date().toISOString(),
    },
    scope,
  );
}

export function disableVoiceInput(scope?: string): VoiceConsentState {
  const current = getVoiceConsentState(scope);
  return saveVoiceConsentState(
    {
      accepted: current.accepted,
      enabled: false,
      updatedAt: new Date().toISOString(),
    },
    scope,
  );
}

export function enableVoiceInput(scope?: string): VoiceConsentState {
  const current = getVoiceConsentState(scope);
  if (!current.accepted) {
    return current;
  }
  return saveVoiceConsentState(
    {
      accepted: true,
      enabled: true,
      updatedAt: new Date().toISOString(),
    },
    scope,
  );
}
