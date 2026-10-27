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
}
let browserSession: { baseUrl: string; token: string } | null = null;
const SESSION_KEY = "specwatt.server.session.v1";
/** Web intentionally has no persisted bearer token. Native uses the OS encrypted store. */
export function createTokenVault(native: boolean): TokenVault {
  return {
    async get(baseUrl) {
      if (!native)
        return browserSession?.baseUrl === baseUrl
          ? browserSession.token
          : null;
      const secure = await import("expo-secure-store");
      const raw = await secure.getItemAsync(SESSION_KEY);
      if (!raw) return null;
      try {
        const saved = object(JSON.parse(raw));
        return saved.baseUrl === baseUrl ? string(saved.token, 512) : null;
      } catch {
        await secure.deleteItemAsync(SESSION_KEY);
        return null;
      }
    },
    async set(baseUrl, token) {
      if (!native) {
        browserSession = { baseUrl, token };
        return;
      }
      const secure = await import("expo-secure-store");
      await secure.setItemAsync(
        SESSION_KEY,
        JSON.stringify({ baseUrl, token }),
        { keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
      );
    },
    async clear(baseUrl) {
      if (!native) {
        if (browserSession?.baseUrl === baseUrl) browserSession = null;
        return;
      }
      const secure = await import("expo-secure-store");
      await secure.deleteItemAsync(SESSION_KEY);
    },
  };
}

type Options = {
  baseUrl: string;
  development?: boolean;
  vault: TokenVault;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};
export class BrainClient {
  baseUrl: string;
  private vault: TokenVault;
  private fetcher: typeof fetch;
  private timeoutMs: number;
  constructor(options: Options) {
    this.baseUrl = normalizeServerUrl(options.baseUrl, options.development);
    this.vault = options.vault;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }
  async hasSession() {
    return !!(await this.vault.get(this.baseUrl));
  }
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    authorized = true,
  ): Promise<unknown> {
    const token = authorized ? await this.vault.get(this.baseUrl) : null;
    if (authorized && !token) throw new ApiError("session_required");
    const abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), this.timeoutMs);
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
      if (response.status === 401) await this.vault.clear(this.baseUrl);
      if (response.status === 204 && response.ok) return null;
      const raw = await response.text();
      if (raw.length > 250000) throw new ApiError("invalid_response");
      let result: unknown;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new ApiError("invalid_response");
      }
      if (!response.ok) {
        const detail = object(result).detail;
        const code =
          detail && typeof detail === "object" && "code" in detail
            ? detail.code
            : null;
        throw new ApiError(
          typeof code === "string" && /^[a-z0-9_-]{1,80}$/.test(code)
            ? code
            : `http_${response.status}`,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        abort.signal.aborted ? "request_timeout" : "network_error",
      );
    } finally {
      clearTimeout(timeout);
    }
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
    try {
      await this.request("/v1/auth/logout", "POST");
    } finally {
      await this.vault.clear(this.baseUrl);
    }
  }
  async controllers(): Promise<ServerController[]> {
    const result = await this.request("/v1/controllers");
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
    return createSchedulerApi((path, method, body) => this.request(path, method, body));
  }
  async snapshot(id: string) {
    return parseSnapshot(await this.request(this.path(id) + "/snapshot"));
  }
  async commands(id: string): Promise<ServerCommand[]> {
    const result = await this.request(this.path(id) + "/commands?limit=100");
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
