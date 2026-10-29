import type { Channel, ChannelId } from "./model";

/** W is instantaneous power. Wh integrates W × elapsed hours; 1 kWh = 1000 Wh. */
export type PowerSample = {
  at: number;
  watts: number | null;
  freshness: "fresh" | "stale" | "missing";
  source: "demo" | "measured" | "forecast" | "simulator";
};
export type EnergySummary = {
  observedWh: number;
  kWh: number;
  coveredMs: number;
  missingMs: number;
  complete: boolean;
  peakW: number | null;
  averageW: number | null;
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const precise = (n: number) => Math.round(n * 1e12) / 1e12;
const hour = 3600000;

/**
 * Integrates only bracketed valid intervals. No extrapolation, filling missing
 * readings, or combining demo with measured data. Step means the recorded state
 * is held until the next sample; trapezoid linearly interpolates meter samples.
 */
export function integratePower(
  samples: readonly PowerSample[],
  options: {
    from?: number;
    to?: number;
    maxGapMs?: number;
    method?: "step" | "trapezoid";
  } = {},
): EnergySummary {
  const maxGapMs = options.maxGapMs ?? 5 * 60 * 1000;
  const method = options.method ?? "step";
  if (
    !finite(maxGapMs) ||
    maxGapMs <= 0 ||
    !["step", "trapezoid"].includes(method)
  )
    throw new Error("invalid-integration-options");
  let previous = -1;
  const source = samples[0]?.source;
  for (const s of samples) {
    if (
      !finite(s.at) ||
      s.at < 0 ||
      s.at <= previous ||
      !["demo", "measured", "forecast", "simulator"].includes(s.source) ||
      s.source !== source ||
      !["fresh", "stale", "missing"].includes(s.freshness) ||
      !(
        s.watts === null ||
        (finite(s.watts) && s.watts >= 0 && s.watts <= 1e9)
      ) ||
      (s.freshness === "fresh" && s.watts === null)
    )
      throw new Error("invalid-power-sample");
    previous = s.at;
  }
  const from = options.from ?? samples[0]?.at ?? 0,
    to = options.to ?? samples.at(-1)?.at ?? from;
  if (!finite(from) || !finite(to) || from < 0 || to < from)
    throw new Error("invalid-integration-range");
  let observedWh = 0,
    coveredMs = 0,
    peakW: number | null = null;
  for (const s of samples)
    if (
      s.at >= from &&
      s.at <= to &&
      s.freshness === "fresh" &&
      s.watts !== null
    )
      peakW = Math.max(peakW ?? 0, s.watts);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const left = Math.max(from, a.at),
      right = Math.min(to, b.at);
    if (
      right <= left ||
      b.at - a.at > maxGapMs ||
      a.freshness !== "fresh" ||
      b.freshness !== "fresh" ||
      a.watts === null ||
      b.watts === null
    )
      continue;
    const startW =
      method === "trapezoid"
        ? a.watts + ((b.watts - a.watts) * (left - a.at)) / (b.at - a.at)
        : a.watts;
    const endW =
      method === "trapezoid"
        ? a.watts + ((b.watts - a.watts) * (right - a.at)) / (b.at - a.at)
        : a.watts;
    observedWh += (((startW + endW) / 2) * (right - left)) / hour;
    coveredMs += right - left;
    peakW = Math.max(peakW ?? 0, startW, endW);
  }
  const missingMs = to - from - coveredMs;
  return {
    observedWh: precise(observedWh),
    kWh: precise(observedWh / 1000),
    coveredMs,
    missingMs,
    complete: missingMs === 0 && coveredMs > 0,
    peakW,
    averageW: coveredMs ? observedWh / (coveredMs / hour) : null,
  };
}

export type DemoHistory = {
  source: "demo";
  samples: PowerSample[];
  byChannel: Record<ChannelId, PowerSample[]>;
  summary: EnergySummary;
  durationHours: 12;
};
/** A deterministic, explicitly modelled twelve-hour history, not live statistics. */
export function createDemoHistory(
  channels: readonly Channel[],
  endAt = Date.UTC(2026, 9, 26, 8),
): DemoHistory {
  if (
    !finite(endAt) ||
    endAt < 12 * hour ||
    channels.length !== 3 ||
    new Set(channels.map((c) => c.id)).size !== 3 ||
    channels.some((c) => !["CH1", "CH2", "CH3"].includes(c.id))
  )
    throw new Error("invalid-demo-history");
  const byChannel: DemoHistory["byChannel"] = { CH1: [], CH2: [], CH3: [] };
  const samples: PowerSample[] = [];
  for (let i = 0; i <= 24; i++) {
    const at = endAt - ((24 - i) * hour) / 2;
    const lamp = (i >= 4 && i < 12) || i >= 20 ? 1.8 : 0;
    const led = i >= 12 && i < 18 ? 4.2 : 0;
    const powers: Record<ChannelId, number> = { CH1: lamp, CH2: led, CH3: 2.4 };
    for (const id of ["CH1", "CH2", "CH3"] as const) {
      const current = channels.find((c) => c.id === id)!;
      const watts = i === 24 ? current.watts : powers[id];
      const freshness = i === 24 ? current.freshness : "fresh";
      byChannel[id].push({
        at,
        watts: finite(watts) && watts >= 0 ? watts : null,
        freshness: finite(watts) && watts >= 0 ? freshness : "missing",
        source: "demo",
      });
    }
    const values = Object.values(byChannel).map((s) => s[i]);
    const fresh = values.every(
      (s) => s.freshness === "fresh" && s.watts !== null,
    );
    samples.push({
      at,
      watts: fresh
        ? precise(values.reduce((sum, s) => sum + (s.watts ?? 0), 0))
        : null,
      freshness: fresh ? "fresh" : "missing",
      source: "demo",
    });
  }
  return {
    source: "demo",
    samples,
    byChannel,
    summary: integratePower(samples, { maxGapMs: hour }),
    durationHours: 12,
  };
}

export type LoadTask = {
  id: string;
  channelId: string;
  watts: number;
  durationMinutes: number;
  preferredStartMinute: number;
  earliestMinute: number;
  latestEndMinute: number;
  priority: number;
  movable: boolean;
  allowAuto: boolean;
  protected: boolean;
  manualUntilMinute?: number;
};
export type ScheduleResult = {
  status: "feasible" | "infeasible" | "search-limit";
  reason:
    | "within-limit"
    | "power-conflict"
    | "channel-conflict"
    | "constraints-conflict"
    | "search-limit";
  starts: Record<string, number>;
  beforePeakW: number;
  afterPeakW: number | null;
  beforeEnergyWh: number;
  afterEnergyWh: number | null;
  searchNodes: number;
};
/**
 * Bounded exact minute-grid feasibility search for at most eight same-day tasks.
 * Higher-priority tasks retain their preferred start whenever feasible; lower
 * priority tasks move first. A search cap is reported, never called infeasible.
 * Protected, unpermitted, immovable or manually held tasks keep their starts.
 */
export function scheduleLoads(
  tasks: readonly LoadTask[],
  options: {
    limitWatts: number;
    baseWatts: number;
    nowMinute?: number;
    horizonMinutes?: number;
    maxSearchNodes?: number;
  },
): ScheduleResult {
  const horizon = options.horizonMinutes ?? 1440,
    cap = options.maxSearchNodes ?? 50000,
    now = options.nowMinute ?? 0;
  if (
    !finite(options.limitWatts) ||
    options.limitWatts <= 0 ||
    options.limitWatts > 1e9 ||
    !finite(options.baseWatts) ||
    options.baseWatts < 0 ||
    options.baseWatts > 1e9 ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 1440 ||
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 1000000 ||
    !Number.isInteger(now) ||
    now < 0 ||
    now > horizon ||
    tasks.length > 8 ||
    new Set(tasks.map((t) => t.id)).size !== tasks.length
  )
    throw new Error("invalid-scheduler-options");
  for (const t of tasks) {
    if (
      typeof t.id !== "string" ||
      !t.id.length ||
      t.id.length > 80 ||
      typeof t.channelId !== "string" ||
      !t.channelId.length ||
      t.channelId.length > 80 ||
      !finite(t.watts) ||
      t.watts < 0 ||
      t.watts > 1e9 ||
      ![
        t.durationMinutes,
        t.preferredStartMinute,
        t.earliestMinute,
        t.latestEndMinute,
        t.priority,
      ].every(Number.isInteger) ||
      t.durationMinutes < 1 ||
      t.earliestMinute < 0 ||
      t.preferredStartMinute < t.earliestMinute ||
      t.preferredStartMinute + t.durationMinutes > t.latestEndMinute ||
      t.latestEndMinute > horizon ||
      t.priority < 0 ||
      t.priority > 100 ||
      typeof t.movable !== "boolean" ||
      typeof t.allowAuto !== "boolean" ||
      typeof t.protected !== "boolean" ||
      (t.manualUntilMinute !== undefined &&
        (!Number.isInteger(t.manualUntilMinute) ||
          t.manualUntilMinute < 0 ||
          t.manualUntilMinute > horizon))
    )
      throw new Error("invalid-load-task");
  }
  const before = Array<number>(horizon).fill(options.baseWatts);
  for (const t of tasks)
    for (
      let m = t.preferredStartMinute;
      m < t.preferredStartMinute + t.durationMinutes;
      m++
    )
      before[m] += t.watts;
  const beforePeakW = precise(Math.max(...before));
  const beforeEnergyWh = precise(
    (options.baseWatts * horizon) / 60 +
      tasks.reduce((sum, t) => sum + (t.watts * t.durationMinutes) / 60, 0),
  );
  const result: ScheduleResult = {
    status: "infeasible",
    reason: "power-conflict",
    starts: {},
    beforePeakW,
    afterPeakW: null,
    beforeEnergyWh,
    afterEnergyWh: null,
    searchNodes: 0,
  };
  if (options.baseWatts > options.limitWatts) return result;
  const fixed = (t: LoadTask) =>
    t.channelId === "CH3" ||
    t.protected ||
    !t.movable ||
    !t.allowAuto ||
    (t.manualUntilMinute ?? 0) > now;
  const ordered = [...tasks].sort(
    (a, b) =>
      Number(fixed(b)) - Number(fixed(a)) ||
      b.priority - a.priority ||
      a.id.localeCompare(b.id),
  );
  const load = Array<number>(horizon).fill(options.baseWatts),
    assigned: { task: LoadTask; start: number }[] = [];
  let exhausted = false,
    sawChannel = false,
    sawPower = false;
  function search(index: number): boolean {
    if (index === ordered.length) return true;
    const task = ordered[index];
    const candidates = fixed(task)
      ? [task.preferredStartMinute]
      : Array.from(
          {
            length:
              task.latestEndMinute -
              task.durationMinutes -
              task.earliestMinute +
              1,
          },
          (_, i) => task.earliestMinute + i,
        ).sort(
          (a, b) =>
            Math.abs(a - task.preferredStartMinute) -
              Math.abs(b - task.preferredStartMinute) || a - b,
        );
    for (const start of candidates) {
      if (result.searchNodes >= cap) {
        exhausted = true;
        return false;
      }
      result.searchNodes++;
      const end = start + task.durationMinutes;
      if (
        assigned.some(
          (a) =>
            a.task.channelId === task.channelId &&
            start < a.start + a.task.durationMinutes &&
            end > a.start,
        )
      ) {
        sawChannel = true;
        continue;
      }
      let fits = true;
      for (let m = start; m < end; m++)
        if (load[m] + task.watts > options.limitWatts + 1e-9) {
          fits = false;
          break;
        }
      if (!fits) {
        sawPower = true;
        continue;
      }
      for (let m = start; m < end; m++) load[m] += task.watts;
      assigned.push({ task, start });
      if (search(index + 1)) return true;
      assigned.pop();
      for (let m = start; m < end; m++) load[m] -= task.watts;
      if (exhausted) return false;
    }
    return false;
  }
  if (search(0))
    return {
      ...result,
      status: "feasible",
      reason: "within-limit",
      starts: Object.fromEntries(assigned.map((a) => [a.task.id, a.start])),
      afterPeakW: precise(Math.max(...load)),
      afterEnergyWh: beforeEnergyWh,
    };
  return {
    ...result,
    status: exhausted ? "search-limit" : "infeasible",
    reason: exhausted
      ? "search-limit"
      : sawChannel && sawPower
        ? "constraints-conflict"
        : sawChannel
          ? "channel-conflict"
          : "power-conflict",
  };
}
