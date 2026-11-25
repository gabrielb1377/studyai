/**
 * Configuração canônica de cotas acumuladas de armazenamento por conta (Lote 3B).
 *
 * Convenção adotada: MiB binário (1 MiB = 1.024 * 1.024 = 1.048.576 bytes),
 * consistente com `MAX_FILE_BYTES = 100 * 1024 * 1024` (FileSecurity.ts) e
 * `MAX_RESTORE_BYTES = 50 * 1024 * 1024` (CloudDatabase.ts).
 *
 * - Arquivos: 1.024 MiB = 1 GiB = 1.073.741.824 bytes (`STORAGE_FILES_QUOTA_BYTES`)
 * - Backups:  200 MiB   = 209.715.200 bytes (`STORAGE_BACKUPS_QUOTA_BYTES`)
 */

export const MIB = 1024 * 1024;
export const DEFAULT_FILES_QUOTA_BYTES = 1024 * MIB;
export const DEFAULT_BACKUPS_QUOTA_BYTES = 200 * MIB;
export const DEFAULT_STORAGE_RESERVATION_TTL_MS = 5 * 60_000;

export type StorageQuotaKind = "files" | "backups";

export type StorageUsageSummary = {
  files: { usedBytes: number; reservedBytes: number; limitBytes: number };
  backups: { usedBytes: number; reservedBytes: number; limitBytes: number };
};

function parseBytesEnv(name: string, fallback: number, min = 1, max = 100 * 1024 * MIB): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^[0-9]+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getStorageQuotaConfig() {
  return {
    filesQuotaBytes: parseBytesEnv("STORAGE_FILES_QUOTA_BYTES", DEFAULT_FILES_QUOTA_BYTES),
    backupsQuotaBytes: parseBytesEnv("STORAGE_BACKUPS_QUOTA_BYTES", DEFAULT_BACKUPS_QUOTA_BYTES),
    reservationTtlMs: parseBytesEnv("STORAGE_RESERVATION_TTL_MS", DEFAULT_STORAGE_RESERVATION_TTL_MS, 5_000, 30 * 60_000),
  };
}

export function formatMiB(bytes: number): string {
  return `${(bytes / MIB).toFixed(bytes >= 100 * MIB ? 0 : 1)} MB`;
}

export function storageQuotaExceededResponse(input: {
  kind: StorageQuotaKind;
  usedBytes: number;
  limitBytes: number;
  requestedBytes: number;
}): Response {
  const label = input.kind === "files" ? "arquivos" : "backups";
  return new Response(
    JSON.stringify({
      code: "STORAGE_QUOTA_EXCEEDED",
      kind: input.kind,
      usedBytes: input.usedBytes,
      limitBytes: input.limitBytes,
      requestedBytes: input.requestedBytes,
      error: `Cota de armazenamento de ${label} (${formatMiB(input.limitBytes)}) atingida. Remova itens antigos para liberar espaço.`,
    }),
    {
      status: 413,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );
}
