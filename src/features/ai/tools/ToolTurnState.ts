/**
 * StudyAI — Tool Engine (TE-1)
 * Controle de limites por turno, isolamento por conta/sessão/turno,
 * prevenção de corridas, loops de intenção repetida, recursão e replay de confirmação.
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §5:
 * - Máx. 3 chamadas de ferramenta por turno.
 * - Sem recursão (ferramenta não chama ferramenta).
 * - Repetição da mesma ferramenta com os mesmos argumentos no turno é recusada.
 */

import { GLOBAL_MAX_TOOL_CALLS_PER_TURN } from "./ToolRegistry";

export const MAX_TURN_BUCKETS = 256;

interface TurnBucket {
  callsReserved: number;
  activeExecutions: number;
  readonly seenFingerprints: Set<string>;
  readonly usedConfirmations: Set<string>;
}

export type TurnAcquireResult =
  | { readonly ok: true; readonly callsInTurn: number; readonly release: () => void }
  | {
      readonly ok: false;
      readonly reason: "turn_limit_exceeded" | "recursion_blocked" | "loop_detected";
      readonly callsInTurn: number;
    };

export class ToolTurnManager {
  private readonly buckets = new Map<string, TurnBucket>();

  private keyFor(userId: string, sessionId: string, turnId: string): string {
    return JSON.stringify([userId, sessionId, turnId]);
  }

  private getOrCreate(userId: string, sessionId: string, turnId: string): TurnBucket {
    const key = this.keyFor(userId, sessionId, turnId);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_TURN_BUCKETS) {
        for (const [oldKey, oldBucket] of this.buckets.entries()) {
          if (oldBucket.activeExecutions === 0) {
            this.buckets.delete(oldKey);
            break;
          }
        }
      }
      bucket = {
        callsReserved: 0,
        activeExecutions: 0,
        seenFingerprints: new Set<string>(),
        usedConfirmations: new Set<string>(),
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  getCallsInTurn(userId: string, sessionId: string, turnId: string): number {
    return this.buckets.get(this.keyFor(userId, sessionId, turnId))?.callsReserved ?? 0;
  }

  isConfirmationUsed(userId: string, sessionId: string, turnId: string, confirmationId: string): boolean {
    const bucket = this.buckets.get(this.keyFor(userId, sessionId, turnId));
    return bucket ? bucket.usedConfirmations.has(confirmationId) : false;
  }

  markConfirmationUsed(userId: string, sessionId: string, turnId: string, confirmationId: string): void {
    const bucket = this.getOrCreate(userId, sessionId, turnId);
    bucket.usedConfirmations.add(confirmationId);
  }

  /**
   * Reserva slot de forma síncrona ANTES de qualquer operação assíncrona.
   * Impede que chamadas concorrentes ultrapassem o teto de 3 por turno,
   * bloqueia recursão (quando enforceNoRecursion=true) e bloqueia loops repetidos.
   */
  acquireSlot(params: {
    readonly userId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly fingerprint: string;
    readonly maxCallsForTool: number;
    readonly blockIfActive?: boolean;
  }): TurnAcquireResult {
    const bucket = this.getOrCreate(params.userId, params.sessionId, params.turnId);
    const effectiveMax = Math.min(GLOBAL_MAX_TOOL_CALLS_PER_TURN, params.maxCallsForTool);

    if (params.blockIfActive && bucket.activeExecutions > 0) {
      return { ok: false, reason: "recursion_blocked", callsInTurn: bucket.callsReserved };
    }

    if (bucket.seenFingerprints.has(params.fingerprint)) {
      return { ok: false, reason: "loop_detected", callsInTurn: bucket.callsReserved };
    }

    if (bucket.callsReserved >= effectiveMax) {
      return { ok: false, reason: "turn_limit_exceeded", callsInTurn: bucket.callsReserved };
    }

    bucket.callsReserved += 1;
    bucket.activeExecutions += 1;
    bucket.seenFingerprints.add(params.fingerprint);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      bucket.activeExecutions = Math.max(0, bucket.activeExecutions - 1);
    };

    return { ok: true, callsInTurn: bucket.callsReserved, release };
  }
}
