export type ConnectivityStatus = "online" | "offline" | "degraded";

export type ConnectivitySnapshot = {
  status: ConnectivityStatus;
  browserOnline: boolean;
  remoteReachable: boolean | null;
  isOnline: boolean;
  reconnected: boolean;
};

type Listener = (snapshot: ConnectivitySnapshot) => void;

const listeners = new Set<Listener>();
let initialized = false;
let browserOnline = true;
let remoteReachable: boolean | null = null;
let wasOffline = false;
let reconnected = false;

function buildSnapshot(): ConnectivitySnapshot {
  const status: ConnectivityStatus = !browserOnline
    ? "offline"
    : remoteReachable === false
      ? "degraded"
      : "online";

  return {
    status,
    browserOnline,
    remoteReachable,
    isOnline: browserOnline,
    reconnected,
  };
}

let cachedSnapshot: ConnectivitySnapshot = buildSnapshot();

function notifyIfChanged() {
  const next = buildSnapshot();
  if (
    next.status === cachedSnapshot.status &&
    next.browserOnline === cachedSnapshot.browserOnline &&
    next.remoteReachable === cachedSnapshot.remoteReachable &&
    next.reconnected === cachedSnapshot.reconnected
  ) {
    return;
  }
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener(cachedSnapshot);
  }
}

function handleOffline() {
  browserOnline = false;
  wasOffline = true;
  reconnected = false;
  remoteReachable = false;
  notifyIfChanged();
}

function handleOnline() {
  browserOnline = true;
  remoteReachable = null;
  if (wasOffline) {
    wasOffline = false;
    reconnected = true;
  }
  notifyIfChanged();
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  browserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  wasOffline = !browserOnline;
  window.addEventListener("offline", handleOffline);
  window.addEventListener("online", handleOnline);
  cachedSnapshot = buildSnapshot();
}

export function isLikelyNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  return /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected/i.test(
    error.message,
  );
}

export const ConnectivityService = {
  getSnapshot(): ConnectivitySnapshot {
    ensureInitialized();
    const currentBrowserOnline = typeof navigator !== "undefined" ? navigator.onLine : browserOnline;
    if (currentBrowserOnline !== browserOnline) {
      if (currentBrowserOnline) handleOnline();
      else handleOffline();
    }
    return cachedSnapshot;
  },

  subscribe(listener: Listener): () => void {
    ensureInitialized();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  reportNetworkSuccess() {
    ensureInitialized();
    remoteReachable = true;
    notifyIfChanged();
  },

  reportNetworkFailure(error?: unknown) {
    ensureInitialized();
    if (error !== undefined && !isLikelyNetworkError(error)) return;
    remoteReachable = false;
    notifyIfChanged();
  },

  dismissReconnected() {
    ensureInitialized();
    if (!reconnected) return;
    reconnected = false;
    notifyIfChanged();
  },
};
