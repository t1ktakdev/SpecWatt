/** Server simulator transport. Never reads or mutates the offline demo store. */
import { createSchedulerApi } from "./scheduler-api.ts";
export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ApiError";
    this.code = code;
  }
}

export function normalizeServerUrl(value: string, development = false): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiError("invalid_url");
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(
    url.hostname,
  );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname) ||
    (url.protocol !== "https:" &&
      !(development && local && url.protocol === "http:"))
  ) {
    throw new ApiError("invalid_url");
  }
  return url.origin;
}

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ApiError("invalid_response");
  return value as RecordValue;
}
function string(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.length || value.length > max)
    throw new ApiError("invalid_response");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ApiError("invalid_response");
  return value;
}
export type ServerController = {
  id: string;
  name: string;
  source: "simulator";
};
function parseController(value: unknown): ServerController {
  const item = object(value);
  if (item.source !== "simulator") throw new ApiError("unsupported_source");
  return {
    id: string(item.id, 128),
    name: string(item.name, 80),
    source: "simulator",
  };
}
export type ServerChannel = {
  id: "CH1" | "CH2" | "CH3";
  protected: boolean;
  watts: number | null;
  last_known_watts: number;
  freshness: "fresh" | "stale";
  assigned: { name: string; room: string; image: string; allow_auto: boolean };
};
export type ServerSnapshot = {
  controller_id: string;
  name: string;
  source: "simulator";
  measured_at: number;
  telemetry_sequence: number;
  freshness: "fresh" | "stale";
  total_watts: number | null;
  peak_watts: number;
  channels: ServerChannel[];
};
export function parseSnapshot(value: unknown): ServerSnapshot {
  const item = object(value);
  const sequence = item.telemetry_sequence === undefined ? 0 : number(item.telemetry_sequence);
  if (!Number.isSafeInteger(sequence)) throw new ApiError("invalid_response");
  if (item.source !== "simulator") throw new ApiError("unsupported_source");
  if (
    !["fresh", "stale"].includes(item.freshness as string) ||
    !Array.isArray(item.channels) ||
    item.channels.length !== 3
  )
    throw new ApiError("invalid_response");
  const channels = item.channels.map((raw): ServerChannel => {
    const ch = object(raw),
      assigned = object(ch.assigned);
    if (
      !["CH1", "CH2", "CH3"].includes(ch.id as string) ||
      typeof ch.protected !== "boolean" ||
      ch.protected !== (ch.id === "CH3") ||
      ch.freshness !== item.freshness ||
      typeof assigned.allow_auto !== "boolean" ||
      (ch.id === "CH3" && assigned.allow_auto)
    )
      throw new ApiError("invalid_response");
    const watts = ch.watts === null ? null : number(ch.watts);
    if ((item.freshness === "fresh") !== (watts !== null))
      throw new ApiError("invalid_response");
    const last = number(ch.last_known_watts);
    if (ch.id === "CH3" && (last !== 2.4 || (watts !== null && watts !== 2.4)))
      throw new ApiError("invalid_response");
    if (typeof assigned.room !== "string" || assigned.room.length > 80)
      throw new ApiError("invalid_response");
    return {
      id: ch.id as ServerChannel["id"],
      protected: ch.protected,
      watts,
      last_known_watts: last,
      freshness: ch.freshness as ServerChannel["freshness"],
      assigned: {
        name: string(assigned.name, 80),
        room: assigned.room,
        image: string(assigned.image, 40),
        allow_auto: assigned.allow_auto,
      },
    };
  });
  if (new Set(channels.map((ch) => ch.id)).size !== 3)
    throw new ApiError("invalid_response");
  const total = item.total_watts === null ? null : number(item.total_watts);
  if (
    (item.freshness === "fresh") !== (total !== null) ||
    (total !== null &&
      Math.abs(total - channels.reduce((sum, ch) => sum + (ch.watts ?? 0), 0)) >
        0.001)
  )
    throw new ApiError("invalid_response");
  return {
    controller_id: string(item.controller_id, 128),
    name: string(item.name, 80),
    source: "simulator",
    measured_at: number(item.measured_at),
    telemetry_sequence: sequence,
    freshness: item.freshness as ServerSnapshot["freshness"],
    total_watts: total,
    peak_watts: number(item.peak_watts),
    channels,
  };
}
export type ServerCommand = {
  id: string;
  controller_id: string;
  channel_id: ServerChannel["id"];
  on: boolean;
  status:
    | "requested"
    | "sent"
    | "acknowledged"
    | "rejected"
    | "cancelled"
    | "timeout"
    | "transport-error"
    | "reconciled";
  reason: string | null;
  transitions: { status: string; at: number }[];
};
function parseCommand(value: unknown): ServerCommand {
  const item = object(value);
  if (
    item.source !== "simulator" ||
    !["CH1", "CH2", "CH3"].includes(item.channel_id as string) ||
    ![
      "requested",
      "sent",
      "acknowledged",
      "rejected",
      "cancelled",
      "timeout",
      "transport-error",
      "reconciled",
    ].includes(item.status as string) ||
    typeof item.on !== "boolean" ||
    !Array.isArray(item.transitions) ||
    item.transitions.length > 20
  )
    throw new ApiError("invalid_response");
  return {
    id: string(item.id, 128),
    controller_id: string(item.controller_id, 128),
    channel_id: item.channel_id as ServerChannel["id"],
    on: item.on,
    status: item.status as ServerCommand["status"],
    reason: item.reason === null ? null : string(item.reason, 80),
    transitions: item.transitions.map((raw) => {
      const step = object(raw);
      return { status: string(step.status, 32), at: number(step.at) };
    }),
  };
}

export interface TokenVault {
  get(baseUrl: string): Promise<string | null>;
  set(baseUrl: string, token: string): Promise<void>;
  clear(baseUrl: string): Promise<void>;
  /** Compare-and-clear: drop the stored session only when it still holds exactly this token. */
  clearMatching?(baseUrl: string, token: string): Promise<void>;
}

/** Minimal storage seam so the native vault path is testable without expo-secure-store. */
export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// One queue for every vault instance in the process: instances share the same
// SESSION_KEY record, so per-instance queues would let a read of one instance
// interleave with the write of another and resurrect or lose a session.
let nativeVaultQueue: Promise<unknown> = Promise.resolve();
function serializeNativeVault<T>(job: () => Promise<T>): Promise<T> {
  const run = nativeVaultQueue.then(job, job);
  nativeVaultQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let nativeStoragePromise: Promise<SecureStoreLike> | null = null;
async function resolveNativeStorage(injected?: SecureStoreLike): Promise<SecureStoreLike> {
  if (injected) return injected;
  nativeStoragePromise ??= (async () => {
    const secure = await import("expo-secure-store");
    return {
      getItemAsync: (key: string) => secure.getItemAsync(key),
      setItemAsync: (key: string, value: string) =>
        secure.setItemAsync(key, value, {
          keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      deleteItemAsync: (key: string) => secure.deleteItemAsync(key),
    };
  })();
  return nativeStoragePromise;
}

let browserSession: { baseUrl: string; token: string } | null = null;
const SESSION_KEY = "specwatt.server.session.v1";
/** Web intentionally has no persisted bearer token. Native uses the OS encrypted store. */
export function createTokenVault(
  native: boolean,
  injectedStorage?: SecureStoreLike,
): TokenVault {
  if (!native) {
    return {
      async get(baseUrl) {
        return browserSession?.baseUrl === baseUrl ? browserSession.token : null;
      },
      async set(baseUrl, token) {
        browserSession = { baseUrl, token };
      },
      async clear(baseUrl) {
        if (browserSession?.baseUrl === baseUrl) browserSession = null;
      },
      async clearMatching(baseUrl, token) {
        if (browserSession?.baseUrl === baseUrl && browserSession.token === token)
          browserSession = null;
      },
    };
  }
  return {
    get(baseUrl) {
      return serializeNativeVault(async () => {
        const secure = await resolveNativeStorage(injectedStorage);
        const raw = await secure.getItemAsync(SESSION_KEY);
        if (!raw) return null;
        try {
          const saved = object(JSON.parse(raw));
          return saved.baseUrl === baseUrl ? string(saved.token, 512) : null;
        } catch {
          await secure.deleteItemAsync(SESSION_KEY);
          return null;
        }
      });
    },
    async set(baseUrl, token) {
      await serializeNativeVault(async () => {
        const secure = await resolveNativeStorage(injectedStorage);
        await secure.setItemAsync(SESSION_KEY, JSON.stringify({ baseUrl, token }));
      });
    },
    async clear(baseUrl) {
      await serializeNativeVault(async () => {
        const secure = await resolveNativeStorage(injectedStorage);
        const raw = await secure.getItemAsync(SESSION_KEY);
        if (raw) {
          try {
            const saved = object(JSON.parse(raw));
            if (saved.baseUrl !== baseUrl) return;
          } catch {
            // A corrupt record matches no server; repairing it is safe.
          }
        }
        await secure.deleteItemAsync(SESSION_KEY);
      });
    },
    async clearMatching(baseUrl, token) {
      await serializeNativeVault(async () => {
        const secure = await resolveNativeStorage(injectedStorage);
        const raw = await secure.getItemAsync(SESSION_KEY);
        if (!raw) return;
        try {
          const saved = object(JSON.parse(raw));
          if (saved.baseUrl === baseUrl && saved.token === token)
            await secure.deleteItemAsync(SESSION_KEY);
        } catch {
          // A corrupt record cannot match any live session; the next read repairs it.
        }
      });
    },
  };
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type RequestOptions = { signal?: AbortSignal };

type Options = {
  baseUrl: string;
  development?: boolean;
  vault: TokenVault;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
};
export class BrainClient {
  baseUrl: string;
  private vault: TokenVault;
  private fetcher: typeof fetch;
  private timeoutMs: number;
  private retryDelayMs: number;
  constructor(options: Options) {
    this.baseUrl = normalizeServerUrl(options.baseUrl, options.development);
    this.vault = options.vault;
    // Browser fetch requires the global receiver; calling it as a client
    // method otherwise throws Illegal invocation before reaching the network.
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.retryDelayMs = options.retryDelayMs ?? 400;
  }
  async hasSession() {
    return !!(await this.vault.get(this.baseUrl));
  }
  /**
   * A 401 (or the logout of an obsolete session) may arrive long after its
   * session was replaced: only the exact rejected token may be dropped.
   * Both vaults shipped here implement the atomic `clearMatching`; the
   * get-compare-clear fallback is a best-effort path for custom/test vaults
   * that do not (a concurrent `set` between the two awaits could in theory be
   * cleared — production never hits it).
   */
  private async invalidateToken(token: string | null): Promise<void> {
    if (!token) return;
    if (this.vault.clearMatching) {
      await this.vault.clearMatching(this.baseUrl, token);
      return;
    }
    if ((await this.vault.get(this.baseUrl)) === token)
      await this.vault.clear(this.baseUrl);
  }
  /** Validated business code inside an error payload, or null when the shape is unusable. */
  private errorCode(raw: string): string | null {
    if (raw.length > 250000) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    try {
      const detail = object(parsed).detail;
      if (detail && typeof detail === "object" && "code" in detail) {
        const code = detail.code;
        if (typeof code === "string" && /^[a-z0-9_-]{1,80}$/.test(code))
          return code;
      }
    } catch {
      // null/primitive/array payload or detail: the HTTP status answers instead.
    }
    return null;
  }
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    authorized = true,
    signal?: AbortSignal,
    tokenOverride?: string | null,
  ): Promise<unknown> {
    // Exactly one recovery attempt for safe GETs; a mutation never repeats itself.
    const attempts = method === "GET" ? 2 : 1;
    let failure = new ApiError("network_error");
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const token = authorized
        ? tokenOverride !== undefined
          ? tokenOverride
          : await this.vault.get(this.baseUrl)
        : null;
      if (authorized && !token) throw new ApiError("session_required");
      if (signal?.aborted) throw new ApiError("request_cancelled");
      const abort = new AbortController(),
        timeout = setTimeout(() => abort.abort(), this.timeoutMs);
      const abortFromCaller = () => abort.abort();
      if (signal) {
        if (signal.aborted) abort.abort();
        else signal.addEventListener("abort", abortFromCaller, { once: true });
      }
      try {
        const response = await this.fetcher(this.baseUrl + path, {
          method,
          signal: abort.signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 401) {
          try {
            await this.invalidateToken(token);
          } catch {
            // The server definitively rejected the token; a local vault
            // failure must not turn this into a transient transport error.
          }
        }
        if (response.status === 204 && response.ok) return null;
        const raw = await response.text();
        if (!response.ok) {
          // The HTTP status is authoritative for every error: a syntactically
          // valid but wrong-shaped payload (null, primitive, array, oversize)
          // must not mask an authentication or server failure. A real backend
          // business code still wins when the shape carries one.
          throw new ApiError(this.errorCode(raw) ?? `http_${response.status}`);
        }
        if (raw.length > 250000) throw new ApiError("invalid_response");
        let result: unknown;
        try {
          result = JSON.parse(raw);
        } catch {
          throw new ApiError("invalid_response");
        }
        return result;
      } catch (error) {
        failure = signal?.aborted
          ? new ApiError("request_cancelled")
          : error instanceof ApiError
            ? error
            : new ApiError(
                abort.signal.aborted ? "request_timeout" : "network_error",
              );
        const transient =
          failure.code === "network_error" || failure.code === "request_timeout";
        if (error instanceof ApiError || !transient || attempt >= attempts)
          throw failure;
        await delay(this.retryDelayMs);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
      }
    }
    throw failure;
  }
  async authenticate(
    mode: "login" | "register",
    email: string,
    password: string,
  ): Promise<void> {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.length > 254 ||
      password.length < 12 ||
      password.length > 128
    )
      throw new ApiError("invalid_credentials_format");
    const result = object(
      await this.request(
        `/v1/auth/${mode}`,
        "POST",
        { email: email.trim(), password },
        false,
      ),
    );
    if (
      result.token_type !== "bearer" ||
      number(result.expires_at) <= Date.now() / 1000
    )
      throw new ApiError("invalid_response");
    string(result.user_id, 128);
    await this.vault.set(this.baseUrl, string(result.access_token, 512));
  }
  async logout(): Promise<void> {
    // Capture the session identity once: the bearer sent to the server must
    // be the exact token removed locally, even if a concurrent login rotates
    // the vault while this POST is in flight. A rotated-in token survives.
    const token = await this.vault.get(this.baseUrl);
    try {
      await this.request(
        "/v1/auth/logout",
        "POST",
        undefined,
        true,
        undefined,
        token,
      );
    } finally {
      if (token) {
        try {
          await this.invalidateToken(token);
        } catch {
          // A local storage failure must not mask the server outcome; the
          // next authenticated request repairs the stale token via its 401.
        }
      }
    }
  }
  async controllers(options?: RequestOptions): Promise<ServerController[]> {
    const result = await this.request("/v1/controllers", "GET", undefined, true, options?.signal);
    if (!Array.isArray(result) || result.length > 200)
      throw new ApiError("invalid_response");
    return result.map(parseController);
  }
  async createSimulator(name: string): Promise<ServerController> {
    if (!name.trim() || name.trim().length > 80)
      throw new ApiError("invalid_name");
    return parseController(
      await this.request("/v1/controllers/simulator", "POST", {
        name: name.trim(),
      }),
    );
  }
  private path(id: string) {
    return "/v1/controllers/" + encodeURIComponent(id);
  }
  scheduler() {
    return createSchedulerApi((path, method, body, signal) =>
      this.request(path, method, body, true, signal),
    );
  }
  async snapshot(id: string, options?: RequestOptions) {
    return parseSnapshot(
      await this.request(this.path(id) + "/snapshot", "GET", undefined, true, options?.signal),
    );
  }
  async commands(id: string, options?: RequestOptions): Promise<ServerCommand[]> {
    const result = await this.request(
      this.path(id) + "/commands?limit=100",
      "GET",
      undefined,
      true,
      options?.signal,
    );
    if (!Array.isArray(result) || result.length > 100)
      throw new ApiError("invalid_response");
    return result.map(parseCommand);
  }
  async automationConsent(id: string, channel: ServerChannel, allowed: boolean): Promise<ServerSnapshot> {
    if (channel.id === "CH3" || channel.protected) throw new ApiError("protected_channel");
    return parseSnapshot(await this.request(
      this.path(id) + "/channels/" + encodeURIComponent(channel.id) + "/assignment",
      "PATCH", { ...channel.assigned, allow_auto: allowed },
    ));
  }
  async command(
    id: string,
    channel: "CH1" | "CH2",
    on: boolean,
    key: string,
  ): Promise<ServerCommand> {
    if (channel !== "CH1" && channel !== "CH2")
      throw new ApiError("protected_channel");
    return parseCommand(
      await this.request(this.path(id) + "/commands", "POST", {
        channel_id: channel,
        on,
        origin: "manual",
        idempotency_key: key,
      }),
    );
  }
  async step(
    id: string,
    outcome: "acknowledged" | "timeout" | "transport-error" = "acknowledged",
  ): Promise<ServerSnapshot> {
    const result = object(
      await this.request(this.path(id) + "/simulator/step", "POST", {
        outcome,
      }),
    );
    if (result.source !== "simulator") throw new ApiError("unsupported_source");
    number(result.processed);
    return parseSnapshot(result.snapshot);
  }
  async sample(id: string, snapshot: ServerSnapshot): Promise<ServerSnapshot> {
    const channels = Object.fromEntries(
      snapshot.channels.map((ch) => [ch.id, ch.last_known_watts]),
    );
    return parseSnapshot(
      await this.request(this.path(id) + "/simulator/telemetry", "POST", {
        channels,
      }),
    );
  }
}
