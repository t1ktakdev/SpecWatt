/** Response ordering only: backend bearer/owner checks remain authoritative. */
export type ServerSession<C> = Readonly<{ connection: C; generation: number }>;
type Request<C> = Readonly<{ session: ServerSession<C>; id: string; selection: number; request: number }>;

export function isSessionFailure(code: string) {
  return ['session_required', 'session_expired', 'invalid_session', 'authentication_required', 'http_401'].includes(code);
}

export function createServerRequestScope<C>() {
  let connection: C | null = null, sessionGeneration = 0, selection = 0, request = 0;
  let selectedId: string | null = null;
  const isSession = (session: ServerSession<C> | null): session is ServerSession<C> =>
    session !== null && session.connection === connection && session.generation === sessionGeneration;
  const issue = (session: ServerSession<C>, id: string): Request<C> =>
    ({ session, id, selection, request: ++request });
  return {
    activate(next: C): ServerSession<C> {
      connection = next; sessionGeneration++; selection++; request++; selectedId = null;
      return { connection: next, generation: sessionGeneration };
    },
    invalidate() { connection = null; sessionGeneration++; selection++; request++; selectedId = null; },
    isSession,
    select(session: ServerSession<C> | null, id: string): Request<C> | null {
      if (!isSession(session)) return null;
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
  };
}
