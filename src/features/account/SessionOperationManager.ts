"use client";

export class SessionChangedError extends Error {
  constructor(message = "A sessão mudou durante a operação.") {
    super(message);
    this.name = "SessionChangedError";
  }
}

export type SessionOperation = {
  readonly userId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  release(): void;
};

type RuntimeState = {
  userId?: string;
  generation: number;
  suspended: boolean;
};

let state: RuntimeState = { generation: 0, suspended: true };
const controllers = new Set<AbortController>();

function abortOperations() {
  for (const controller of controllers) controller.abort(new SessionChangedError());
  controllers.clear();
}

export const SessionOperationManager = {
  beginTransition() {
    abortOperations();
    state = { userId: state.userId, generation: state.generation + 1, suspended: true };
    return state.generation;
  },

  activate(userId?: string) {
    abortOperations();
    state = { userId, generation: state.generation + 1, suspended: false };
    return state.generation;
  },

  current() {
    return { ...state };
  },

  start(expectedUserId?: string): SessionOperation {
    if (state.suspended || !state.userId || (expectedUserId && expectedUserId !== state.userId)) {
      throw new SessionChangedError("A operação não pertence à sessão ativa.");
    }
    const userId = state.userId;
    const generation = state.generation;
    const controller = new AbortController();
    controllers.add(controller);
    const assertCurrent = () => {
      if (controller.signal.aborted || state.suspended || state.userId !== userId || state.generation !== generation) {
        throw new SessionChangedError();
      }
    };
    return {
      userId,
      generation,
      signal: controller.signal,
      assertCurrent,
      release: () => controllers.delete(controller),
    };
  },

  assert(operation: Pick<SessionOperation, "userId" | "generation" | "signal">) {
    if (operation.signal.aborted || state.suspended || state.userId !== operation.userId || state.generation !== operation.generation) {
      throw new SessionChangedError();
    }
  },
};
