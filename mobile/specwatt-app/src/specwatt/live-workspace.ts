/** One authenticated workspace. No DemoState import, persistence or token ownership here. */
import { ApiError } from "./api.ts";
import type { BrainClient, ServerSnapshot, ServerCommand, ServerController, ServerEvent, ServerMeasurement } from "./api.ts";
import { createServerRequestScope, appendCommand, blocksNewCommands, isSnapshotFresh, isAmbiguousMutationOutcome, isSessionFailure } from "./server-request-scope.ts";

export type WorkspaceState = Readonly<{
  kind: "demo" | "server-simulator" | "unconfigured";
  client: BrainClient | null; controllers: ServerController[]; selectedId: string | null;
  snapshot: ServerSnapshot | null; commands: ServerCommand[];
  events: ServerEvent[]; measurements: ServerMeasurement[];
  busy: boolean; refreshing: boolean; uncertain: boolean; error: string;
}>;
const empty = (kind: WorkspaceState["kind"]): WorkspaceState => ({kind, client:null, controllers:[], selectedId:null,
  snapshot:null, commands:[], events:[], measurements:[], busy:false, refreshing:false, uncertain:false, error:""});
export const LIVE_POLL_MS = 10000;

export function createLiveWorkspace(options: {client: BrainClient; connect: (url: string) => BrainClient; now?: () => number; uuid: () => string}) {
  const scope = createServerRequestScope<BrainClient>();
  let session: ReturnType<typeof scope.activate> | null = null;
  let state = empty("demo");
  let read: Promise<void> | null = null, mutation = false;
  let eventCursor = 0, measurementCursor = 0;
  let selectionGeneration = 0;
  const listeners = new Set<() => void>();
  const now = options.now ?? Date.now;
  function set(patch: Partial<WorkspaceState>) { state = {...state,...patch}; listeners.forEach(fn=>fn()); }
  function clear(kind: WorkspaceState["kind"], error = "") {
    scope.invalidate(); selectionGeneration++; session = null; read = null; mutation = false; eventCursor = measurementCursor = 0;
    state = {...empty(kind), error}; listeners.forEach(fn=>fn());
  }
  function fail(error: unknown, started: typeof session, isMutation = false) {
    if (started && !scope.isSession(started)) return;
    const code = error instanceof ApiError ? error.code : "operation_failed";
    if (isSessionFailure(code)) { clear("unconfigured", code); return; }
    if (["controller_not_found","http_404","http_403"].includes(code)) {
      eventCursor = measurementCursor = 0;
      set({selectedId:null,snapshot:null,commands:[],events:[],measurements:[]});
    }
    set({error:code, ...(isMutation && isAmbiguousMutationOutcome(code) ? {uncertain:true} : {})});
  }
  async function refresh(reconcile = false) {
    if (mutation && !reconcile) return;
    if (read) return read;
    const started = session, id = state.selectedId;
    const ticket = id ? scope.refresh(started,id) : null;
    if (!started || !ticket || !id) return;
    const flight = scope.begin(), client = started.connection;
    set({refreshing:true});
    const operation = (async()=>{
      try {
        const [snapshot, commands, events, measurements] = await Promise.all([
          client.snapshot(id,{signal:flight.signal}),client.commands(id,{signal:flight.signal}),
          client.events(id,eventCursor,{signal:flight.signal}),client.measurements(id,measurementCursor,{signal:flight.signal}),
        ]);
        if (!scope.canCommit(ticket)) return;
        if (snapshot.controller_id !== id || commands.some(c=>c.controller_id!==id) || events.some(e=>e.controller_id!==id)) {
          set({snapshot:null,commands:[],events:[],measurements:[]});
          throw new ApiError("invalid_response");
        }
        eventCursor = events.at(-1)?.sequence ?? eventCursor;
        measurementCursor = measurements.at(-1)?.sequence ?? measurementCursor;
        set({snapshot,commands,events:[...state.events,...events].slice(-500),measurements:[...state.measurements,...measurements].slice(-500),error:"",uncertain:false});
      } catch(error) { if (scope.canCommit(ticket)) fail(error,started); }
      finally { flight.done(); if (scope.canCommit(ticket)) set({refreshing:false}); }
    })();
    read = operation;
    try { await operation; } finally { if(read===operation) read=null; }
  }
  async function select(id: string, reconcile = false) {
    if (!session || !state.controllers.some(row=>row.id===id)) return;
    scope.select(session,id); selectionGeneration++; read = null; eventCursor = measurementCursor = 0;
    set({selectedId:id,snapshot:null,commands:[],events:[],measurements:[],uncertain:false,error:"",refreshing:false});
    await refresh(reconcile);
  }
  async function mutate<T>(action: (client: BrainClient, id: string) => Promise<T>, accepted?: (result: T) => void) {
    const started = session, id = state.selectedId;
    if (!started || !id || mutation || read) return;
    const selected = selectionGeneration;
    const current = () => scope.isSession(started) && state.selectedId === id && selected === selectionGeneration;
    mutation = true; set({busy:true,error:""});
    try {
      const result = await action(started.connection,id);
      if (!current()) return;
      accepted?.(result);
      // Read real server state; a successful POST is never turned into a local ACK.
      await refresh(true);
    } catch(error) { if(current()) fail(error,started,true); }
    finally { if(scope.isSession(started)) { mutation=false;set({busy:false}); } }
  }
  return {
    getState: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return ()=>{listeners.delete(fn);}; },
    async restore() {
      const started = scope.activate(options.client); session = started;
      const flight = scope.begin();
      try {
        if (!(await options.client.hasSession())) return;
        const controllers = await options.client.controllers({signal:flight.signal});
        if(scope.isSession(started)) set({kind:"server-simulator",client:options.client,controllers});
      } catch(error) { fail(error,started); }
      finally { flight.done(); }
    },
    async authenticate(url: string, mode: "login" | "register", email: string, password: string) {
      clear("unconfigured");
      let connection: BrainClient;
      try { connection=options.connect(url); } catch(error) { fail(error,null);return; }
      const started = scope.activate(connection); session=started;
      const flight=scope.begin(); set({busy:true});
      try {
        await connection.authenticate(mode,email,password,{signal:flight.signal});
        const controllers=await connection.controllers({signal:flight.signal});
        if(scope.isSession(started)) set({kind:"server-simulator",client:connection,controllers,error:""});
      } catch(error) { fail(error,started); }
      finally { flight.done();if(scope.isSession(started))set({busy:false}); }
    },
    async create(name: string) {
      const started=session;
      if(!started || mutation || state.busy) return;
      mutation=true;set({busy:true,error:""});
      try {
        const row=await started.connection.createSimulator(name);
        const controllers=await started.connection.controllers();
        if(!scope.isSession(started))return;
        set({controllers}); await select(row.id,true);
      }catch(error){fail(error,started,true);}
      finally{if(scope.isSession(started)){mutation=false;set({busy:false});}}
    },
    select, refresh,
    async command(channel: string, on: boolean) {
      if(channel!=="CH1"&&channel!=="CH2") {set({error:"protected_channel"});return;}
      if(state.uncertain||state.commands.some(c=>blocksNewCommands(c.status)))return;
      if(state.error||!isSnapshotFresh(state.snapshot,now()/1000)) {set({error:state.error||"stale_measurements"});return;}
      const ch=state.snapshot?.channels.find(c=>c.id===channel);
      if(!ch||ch.protected||ch.watts===null||ch.freshness!=="fresh")return;
      const key=options.uuid();
      await mutate((client,id)=>client.command(id,channel,on,key),command=>set({commands:appendCommand(state.commands,command)}));
    },
    step: () => mutate((client,id)=>client.step(id)),
    sample: () => mutate((client,id)=>client.sample(id,state.snapshot!)),
    consent: (id: string, allowed: boolean) => {
      const channel=state.snapshot?.channels.find(c=>c.id===id);
      if(!channel||channel.protected)return Promise.resolve();
      return mutate((client,controller)=>client.automationConsent(controller,channel,allowed));
    },
    expire() { clear("unconfigured","session_expired"); },
    demo() { clear("demo"); },
    cancelReads() { scope.select(session,state.selectedId ?? "");read=null;set({refreshing:false}); },
    async logout() {
      const connection=state.client;
      clear("unconfigured");
      try {await connection?.logout();}catch{/* Vault clears matching token in finally; no old data restored. */}
    },
    dispose() { scope.invalidate();listeners.clear(); },
  };
}
export type LiveWorkspace = ReturnType<typeof createLiveWorkspace>;
