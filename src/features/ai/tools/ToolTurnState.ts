/**
 * StudyAI — Tool Engine (TE-1 / TE-3 / TE-4)
 * Controle de limites por turno, isolamento por conta/sessão/turno,
 * prevenção de corridas, loops de intenção repetida, recursão e replay de confirmação.
 *
 * Endurecimento TE-4 (revisão diferencial TE-3):
 * - Fail-closed quando `retiredTurnKeys` atinge o teto (nunca descarta chave sem aposentar,
 *   impedindo reativação de turnos evictados com contador zerado).
 * - Controle global de `confirmationId` consumidos (`usedConfirmationsGlobal`), impedindo
 *   reuso da mesma confirmação em outro turno ou sessão.
 * - Suporte a `closeTurn` para encerramento explícito do ciclo de vida do turno.
 */

import { GLOBAL_MAX_TOOL_CALLS_PER_TURN } from "./ToolRegistry";

export const MAX_TURN_BUCKETS = 256;
export const MAX_RETIRED_TURN_KEYS = 2048;
export const MAX_CONSUMED_CONFIRMATIONS = 4096;

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
  /** Turnos evictados ou encerrados nunca podem ser reabertos com contador zerado. */
  private readonly retiredTurnKeys = new Set<string>();
  /** Registro global de confirmationIds consumidos (bloqueia replay entre turnos/sessões). */
  private readonly consumedConfirmations = new Set<string>();

  private keyFor(userId: string, sessionId: string, turnId: string): string {
    return JSON.stringify([userId, sessionId, turnId]);
  }

  private getOrCreate(userId: string, sessionId: string, turnId: string): TurnBucket | null {
    const key = this.keyFor(userId, sessionId, turnId);
    if (this.retiredTurnKeys.has(key)) {
      return null;
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_TURN_BUCKETS) {
        // Fail-closed: nunca evicta um bucket se não puder registrá-lo em retiredTurnKeys.
        if (this.retiredTurnKeys.size >= MAX_RETIRED_TURN_KEYS) {
          return null;
        }
        let evicted = false;
        for (const [oldKey, oldBucket] of this.buckets.entries()) {
          if (oldBucket.activeExecutions === 0) {
            this.buckets.delete(oldKey);
            this.retiredTurnKeys.add(oldKey);
            evicted = true;
            break;
          }
        }
        if (!evicted) {
          return null;
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

  /**
   * Encerra explicitamente um turno e o aposenta permanentemente para impedir reabertura/reset.
   */
  closeTurn(userId: string, sessionId: string, turnId: string): void {
    const key = this.keyFor(userId, sessionId, turnId);
    this.buckets.delete(key);
    if (this.retiredTurnKeys.size < MAX_RETIRED_TURN_KEYS) {
      this.retiredTurnKeys.add(key);
    }
  }

  getCallsInTurn(userId: string, sessionId: string, turnId: string): number {
    const key = this.keyFor(userId, sessionId, turnId);
    if (this.retiredTurnKeys.has(key)) return GLOBAL_MAX_TOOL_CALLS_PER_TURN;
    return this.buckets.get(key)?.callsReserved ?? 0;
  }

  isConfirmationUsed(userId: string, sessionId: string, turnId: string, confirmationId: string): boolean {
    if (this.consumedConfirmations.has(confirmationId)) return true;
    // Fail-closed se a memória de confirmações consumidas saturar.
    if (this.consumedConfirmations.size >= MAX_CONSUMED_CONFIRMATIONS) return true;
    const key = this.keyFor(userId, sessionId, turnId);
    if (this.retiredTurnKeys.has(key)) return true;
    const bucket = this.buckets.get(key);
    return bucket ? bucket.usedConfirmations.has(confirmationId) : false;
  }

  markConfirmationUsed(userId: string, sessionId: string, turnId: string, confirmationId: string): void {
    this.consumedConfirmations.add(confirmationId);
    const bucket = this.getOrCreate(userId, sessionId, turnId);
    if (bucket) {
      bucket.usedConfirmations.add(confirmationId);
    }
  }

  /**
   * Verificação somente-leitura antes do claim de confirmação para evitar
   * que confirmações inválidas/fabricadas envenenem `seenFingerprints` ou consumam slots,
   * sem jamais permitir bypass do limite global de 3 chamadas/turno.
   */
  canAcquireSlot(params: {
    readonly userId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly fingerprint: string;
    readonly maxCallsForTool: number;
    readonly blockIfActive?: boolean;
  }):
    | { readonly ok: true; readonly callsInTurn: number }
    | {
        readonly ok: false;
        readonly reason: "turn_limit_exceeded" | "recursion_blocked" | "loop_detected";
        readonly callsInTurn: number;
      } {
    const key = this.keyFor(params.userId, params.sessionId, params.turnId);
    if (this.retiredTurnKeys.has(key)) {
      return { ok: false, reason: "turn_limit_exceeded", callsInTurn: GLOBAL_MAX_TOOL_CALLS_PER_TURN };
    }
    const bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_TURN_BUCKETS && this.retiredTurnKeys.size >= MAX_RETIRED_TURN_KEYS) {
        return { ok: false, reason: "turn_limit_exceeded", callsInTurn: GLOBAL_MAX_TOOL_CALLS_PER_TURN };
      }
      return { ok: true, callsInTurn: 0 };
    }
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
    return { ok: true, callsInTurn: bucket.callsReserved };
  }

  /**
   * Reserva slot de forma síncrona ANTES de qualquer operação assíncrona.
   * Impede que chamadas concorrentes ultrapassem o teto de 3 por turno,
   * bloqueia recursão (quando blockIfActive=true), loops e reabertura de turnos evictados.
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
    if (!bucket) {
      return { ok: false, reason: "turn_limit_exceeded", callsInTurn: GLOBAL_MAX_TOOL_CALLS_PER_TURN };
    }
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
