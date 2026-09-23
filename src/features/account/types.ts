export type AccountSession = {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    profile?: { userId: string; name: string; photoUrl?: string; language: string; theme: string; preferences: Record<string, unknown>; updatedAt: string };
  };
  csrfToken: string;
  sessionId: string;
  devices: Array<{ id: string; deviceId: string; deviceName: string; expiresAt: string; lastUsedAt: string }>;
  database: "postgres" | "memory";
};

export type CloudSyncState = {
  status: "idle" | "syncing" | "offline" | "error";
  lastSyncAt?: string;
  cursor: number;
  pending: number;
  uploadedBytes: number;
  lastError?: string;
};
