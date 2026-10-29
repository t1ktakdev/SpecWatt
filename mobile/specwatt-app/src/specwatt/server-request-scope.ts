/** Response ordering only: backend bearer/owner checks remain authoritative. */
export type ServerSession<C> = Readonly<{ connection: C; generation: number }>;
type Request<C> = Readonly<{ session: ServerSession<C>; id: string; selection: number; request: number }>;

/** Command statuses the server treats as an in-flight command; only these block a new manual one. */
export const BLOCKING_COMMAND_STATUSES = ['requested', 'sent'] as const;
export function blocksNewCommands(status: string): boolean {
  return (BLOCKING_COMMAND_STATUSES as readonly string[]).includes(status);
}

/**
 * Outcomes where the server may or may not have applied a mutation: the
 * transport failed, was aborted, or broke the response contract. Both server
 * screens must treat these the same way: report the failure honestly, mark
 * the result unknown and never repeat the request automatically.
 */
const AMBIGUOUS_MUTATION_CODES = [
  'request_timeout',
  'network_error',
  'invalid_response',
  'unsupported_source',
  'operation_failed',
  'request_cancelled',
] as const;
export function isAmbiguousMutationOutcome(code: string): boolean {
  return (AMBIGUOUS_MUTATION_CODES as readonly string[]).includes(code) || /^http_5/.test(code);
}

/** A concurrent refresh may have already persisted this exact command. */
export function appendCommand<T extends { id: string }>(current: T[], command: T): T[] {
  return current.some((item) => item.id === command.id) ? current : [command, ...current];
}

/** Same rule the server applies: 0 <= age <= maxAgeSeconds on a fresh snapshot. */
export function isSnapshotFresh(
  snapshot: { freshness: string; measured_at: number } | null,
  nowSeconds: number,
  maxAgeSeconds = 30,
): boolean {
  if (!snapshot || snapshot.freshness !== 'fresh') return false;
  const age = nowSeconds - snapshot.measured_at;
  return age >= 0 && age <= maxAgeSeconds;
}

export function isSessionFailure(code: string) {
  return ['session_required', 'session_expired', 'invalid_session', 'authentication_required', 'http_401'].includes(code);
}

export type InFlightRequest = Readonly<{ signal: AbortSignal; done: () => void }>;

export function createServerRequestScope<C>() {
  let connection: C | null = null, sessionGeneration = 0, selection = 0, request = 0;
  let selectedId: string | null = null;
  const inflight = new Set<AbortController>();
  const abortInflight = () => {
    for (const controller of inflight) controller.abort();
    inflight.clear();
  };
  const isSession = (session: ServerSession<C> | null): session is ServerSession<C> =>
    session !== null && session.connection === connection && session.generation === sessionGeneration;
  const issue = (session: ServerSession<C>, id: string): Request<C> =>
    ({ session, id, selection, request: ++request });
  return {
    activate(next: C): ServerSession<C> {
      abortInflight();
      connection = next; sessionGeneration++; selection++; request++; selectedId = null;
      return { connection: next, generation: sessionGeneration };
    },
    invalidate() { abortInflight(); connection = null; sessionGeneration++; selection++; request++; selectedId = null; },
    isSession,
    select(session: ServerSession<C> | null, id: string): Request<C> | null {
      if (!isSession(session)) return null;
      abortInflight();
      selectedId = id; selection++;
      return issue(session, id);
    },
    refresh(session: ServerSession<C> | null, id: string): Request<C> | null {
      if (!isSession(session) || selectedId !== id) return null;
      return issue(session, id);
    },
    canCommit(ticket: Request<C> | null): boolean {
      return ticket !== null && isSession(ticket.session) && ticket.id === selectedId &&
        ticket.selection === selection && ticket.request === request;
    },
    /** Register a local request so session changes cancel it; `done` must run in a finally block. */
    begin(): InFlightRequest {
      const controller = new AbortController();
      inflight.add(controller);
      let closed = false;
      return {
        signal: controller.signal,
        done() {
          if (closed) return;
          closed = true;
          inflight.delete(controller);
        },
      };
    },
  };
}
