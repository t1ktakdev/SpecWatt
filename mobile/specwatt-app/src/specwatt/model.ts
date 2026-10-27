import {validateAppearance} from "./appearance-policy.ts";
import type {DeviceAppearance} from "./appearance-policy.ts";
import type { ImageId } from "./images";

/** Pure local simulation: this module has no equipment transport. */
export type Locale = "ru" | "ky";
export type ChannelId = "CH1" | "CH2" | "CH3";
export type Assign = {
  name: string;
  category: ImageId;
  image: ImageId;
  room: string;
  allowAuto: boolean;
  appearance?: DeviceAppearance;
};
export type Channel = {
  id: ChannelId;
  protected: boolean;
  assigned: Assign | null;
  watts: number | null;
  freshness: "missing" | "fresh" | "stale";
  manualUntil?: number;
};
export type Schedule = {
  channelId: ChannelId;
  start: string;
  duration: number;
  earliest: string;
  latest: string;
  enabled: boolean;
};
export type EventCode =
  | "demo-start"
  | "manual-on"
  | "manual-off"
  | "protected"
  | "assignment"
  | "autopilot-on"
  | "autopilot-off"
  | "peak"
  | "peak-exceeded"
  | "manual-priority"
  | "schedule"
  | "plan-applied"
  | "plan-rejected"
  | "plan-blocked"
  | "stale"
  | "invalid-input";
export type JournalEvent = {
  id: string;
  at: number;
  kind: "manual" | "auto" | "error" | "system";
  code: EventCode;
  source: "demo";
  channelId?: ChannelId;
  details?: Record<string, string | number>;
};
export type DemoState = {
  locale: Locale;
  source: "none" | "demo";
  onboarded: boolean;
  channels: Channel[];
  rehearsal: boolean;
  autopilot: boolean;
  peak: number;
  manualMinutes: number;
  events: JournalEvent[];
  schedules: Schedule[];
  planStatus: "pending" | "applied" | "rejected";
  appliedPlan?: LoadPlan;
};
export type Action =
  | { type: "locale"; value: Locale }
  | { type: "enter-demo" }
  | { type: "leave-demo" }
  | { type: "onboarded" }
  | { type: "assign"; id: ChannelId; assignment: Assign }
  | { type: "toggle"; id: ChannelId }
  | { type: "autopilot"; value: boolean }
  | { type: "peak"; value: number }
  | { type: "manual-minutes"; value: number }
  | { type: "schedule"; id: ChannelId; start: string; duration: number }
  | { type: "apply-plan" }
  | { type: "reject-plan" };

const ids: ChannelId[] = ["CH1", "CH2", "CH3"];
const images = [
  "lamp",
  "led-strip",
  "fan",
  "charger",
  "socket",
  "appliance",
  "lamp-scene",
];
const nominal: Record<ChannelId, number> = { CH1: 1.8, CH2: 4.2, CH3: 2.4 };
const round = (v: number) => Math.round(v * 10) / 10;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 80): v is string =>
  typeof v === "string" && v.length <= max;
const time = (v: unknown): v is string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
const clock = (v: number) =>
  `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toString().padStart(2, "0")}`;

export function emptyState(): DemoState {
  return {
    locale: "ru",
    source: "none",
    onboarded: false,
    channels: [],
    rehearsal: false,
    autopilot: false,
    peak: 7,
    manualMinutes: 30,
    events: [],
    schedules: [],
    planStatus: "pending",
  };
}
export function demoState(locale: Locale = "ru"): DemoState {
  return {
    ...emptyState(),
    locale,
    source: "demo",
    onboarded: true,
    rehearsal: true,
    channels: [
      {
        id: "CH1",
        protected: false,
        watts: 1.8,
        freshness: "fresh",
        manualUntil: 0,
        assigned: {
          name: locale === "ky" ? "Чырак" : "Светильник",
          category: "lamp",
          image: "lamp",
          room: locale === "ky" ? "Конок бөлмөсү" : "Гостиная",
          allowAuto: false,
        },
      },
      {
        id: "CH2",
        protected: false,
        watts: 0,
        freshness: "fresh",
        manualUntil: 0,
        assigned: {
          name: locale === "ky" ? "LED-тасма" : "LED-лента",
          category: "led-strip",
          image: "led-strip",
          room: locale === "ky" ? "Конок бөлмөсү" : "Гостиная",
          allowAuto: false,
        },
      },
      {
        id: "CH3",
        protected: true,
        watts: 2.4,
        freshness: "fresh",
        manualUntil: 0,
        assigned: {
          name: locale === "ky" ? "Желдеткич" : "Вентилятор",
          category: "fan",
          image: "fan",
          room: locale === "ky" ? "Окуу стенди" : "Тестовый стенд",
          allowAuto: false,
        },
      },
    ],
    schedules: [
      {
        channelId: "CH1",
        start: "14:00",
        duration: 30,
        earliest: "14:00",
        latest: "14:30",
        enabled: true,
      },
      {
        channelId: "CH2",
        start: "14:00",
        duration: 60,
        earliest: "14:00",
        latest: "15:30",
        enabled: true,
      },
    ],
  };
}

export function totalPower(channels: Channel[]): number | null {
  if (
    !channels.length ||
    channels.some(
      (c) => c.freshness !== "fresh" || !finite(c.watts) || c.watts < 0,
    )
  )
    return null;
  return round(channels.reduce((sum, c) => sum + (c.watts ?? 0), 0));
}
function validAssignment(v: unknown): v is Assign {
  return (
    record(v) &&
    text(v.name) &&
    v.name.trim().length > 0 &&
    text(v.room) &&
    images.includes(v.image as string) &&
    images.includes(v.category as string) &&
    typeof v.allowAuto === "boolean" &&
    (v.appearance===undefined||validateAppearance(v.appearance)!==null)
  );
}
function validSchedule(v: unknown): v is Schedule {
  return (
    record(v) &&
    ids.includes(v.channelId as ChannelId) &&
    v.channelId !== "CH3" &&
    time(v.start) &&
    time(v.earliest) &&
    time(v.latest) &&
    finite(v.duration) &&
    Number.isInteger(v.duration) &&
    v.duration >= 5 &&
    v.duration <= 240 &&
    minutes(v.earliest) <= minutes(v.start) &&
    minutes(v.start) + v.duration <= minutes(v.latest) &&
    typeof v.enabled === "boolean"
  );
}

/** Strict schema validation with migration from the original v1 local state. */
export function restoreState(raw: unknown): DemoState {
  const base = emptyState();
  if (
    !record(raw) ||
    !["ru", "ky"].includes(raw.locale as string) ||
    !["none", "demo"].includes(raw.source as string)
  )
    return base;
  base.locale = raw.locale as Locale;
  base.onboarded = raw.onboarded === true;
  if (raw.source === "none") return base;
  if (!Array.isArray(raw.channels) || raw.channels.length !== 3)
    return emptyState();
  const channels: Channel[] = [];
  for (const id of ids) {
    const list = raw.channels.filter((c) => record(c) && c.id === id);
    if (list.length !== 1) return emptyState();
    const c = list[0] as Record<string, unknown>;
    if (
      !["fresh", "stale", "missing"].includes(c.freshness as string) ||
      !(
        c.watts === null ||
        (finite(c.watts) && c.watts >= 0 && c.watts <= 1000)
      ) ||
      !(c.assigned === null || validAssignment(c.assigned)) ||
      !(
        c.manualUntil === undefined ||
        (finite(c.manualUntil) && c.manualUntil >= 0)
      )
    )
      return emptyState();
    // The protected fan cannot be switched in this simulation. A contradictory
    // persisted value is corruption: discard state rather than invent telemetry.
    if (id === "CH3" && c.watts !== null && c.watts !== 2.4)
      return emptyState();
    channels.push({
      id,
      protected: id === "CH3",
      watts: c.watts as number | null,
      freshness: c.freshness as Channel["freshness"],
      manualUntil: c.manualUntil as number | undefined,
      assigned:
        c.assigned === null
          ? null
          : {
              ...(c.assigned as Assign),
              allowAuto: id !== "CH3" && (c.assigned as Assign).allowAuto,
            },
    });
  }
  let schedules = demoState().schedules;
  if (raw.schedules !== undefined) {
    if (
      !Array.isArray(raw.schedules) ||
      raw.schedules.length > 2 ||
      !raw.schedules.every(validSchedule) ||
      new Set(raw.schedules.map((s) => s.channelId)).size !==
        raw.schedules.length
    )
      return emptyState();
    schedules = raw.schedules;
  }
  if (
    raw.peak !== undefined &&
    (!finite(raw.peak) || raw.peak < 1 || raw.peak > 100)
  )
    return emptyState();
  if (
    raw.manualMinutes !== undefined &&
    (!finite(raw.manualMinutes) ||
      !Number.isInteger(raw.manualMinutes) ||
      raw.manualMinutes < 1 ||
      raw.manualMinutes > 240)
  )
    return emptyState();
  const codes: EventCode[] = [
    "demo-start",
    "manual-on",
    "manual-off",
    "protected",
    "assignment",
    "autopilot-on",
    "autopilot-off",
    "peak",
    "peak-exceeded",
    "manual-priority",
    "schedule",
    "plan-applied",
    "plan-rejected",
    "plan-blocked",
    "stale",
    "invalid-input",
  ];
  const events: JournalEvent[] = [];
  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events) || raw.events.length > 100)
      return emptyState();
    for (const e of raw.events) {
      if (
        !record(e) ||
        !text(e.id, 100) ||
        !finite(e.at) ||
        e.at < 0 ||
        e.source !== "demo" ||
        !["manual", "auto", "error", "system"].includes(e.kind as string) ||
        !codes.includes(e.code as EventCode) ||
        (e.channelId !== undefined && !ids.includes(e.channelId as ChannelId))
      )
        return emptyState();
      if (
        e.details !== undefined &&
        (!record(e.details) ||
          Object.keys(e.details).length > 8 ||
          Object.values(e.details).some((v) => !text(v, 100) && !finite(v)))
      )
        return emptyState();
      events.push({
        id: e.id,
        at: e.at,
        source: "demo",
        kind: e.kind as JournalEvent["kind"],
        code: e.code as EventCode,
        channelId: e.channelId as ChannelId | undefined,
        details: e.details as JournalEvent["details"],
      });
    }
  }
  let appliedPlan: LoadPlan | undefined;
  if (raw.appliedPlan !== undefined) {
    if (!validPlanSnapshot(raw.appliedPlan)) return emptyState();
    const p = raw.appliedPlan;
    if (
      raw.planStatus === "applied" &&
      schedules.find((x) => x.channelId === "CH2")?.start !== p.to
    )
      return emptyState();
    appliedPlan = {
      canApply: false,
      reason: "applied",
      channelId: "CH2",
      beforePeak: p.beforePeak,
      afterPeak: p.afterPeak,
      from: p.from,
      to: p.to,
      before: [...p.before],
      after: [...p.after],
      labels: [...p.labels],
      ...(p.source === "forecast-demo"
        ? {
            source: p.source,
            windowMinutes: p.windowMinutes,
            beforeEnergyWh: p.beforeEnergyWh,
            afterEnergyWh: p.afterEnergyWh,
          }
        : {}),
    };
  }
  return {
    ...base,
    source: "demo",
    channels,
    rehearsal: true,
    autopilot: raw.autopilot === true,
    peak: (raw.peak as number | undefined) ?? 7,
    manualMinutes: (raw.manualMinutes as number | undefined) ?? 30,
    schedules,
    events,
    planStatus:
      raw.planStatus === "applied" && appliedPlan
        ? "applied"
        : raw.planStatus === "rejected"
          ? "rejected"
          : "pending",
    ...(appliedPlan ? { appliedPlan } : {}),
  };
}

export type PlanReason =
  | "ready"
  | "not-demo"
  | "autopilot-off"
  | "permission"
  | "stale"
  | "manual-priority"
  | "already-running"
  | "no-schedule"
  | "no-improvement"
  | "no-window"
  | "applied"
  | "rejected";
export type LoadPlan = {
  canApply: boolean;
  reason: PlanReason;
  beforePeak: number;
  afterPeak: number;
  from: string;
  to: string;
  channelId: "CH2";
  before: number[];
  after: number[];
  labels: string[];
  /** Explicit simulated forecast, never actual accumulated meter energy. */
  source?: "forecast-demo";
  windowMinutes?: number;
  beforeEnergyWh?: number;
  afterEnergyWh?: number;
};
function validPlanSnapshot(v: unknown): v is LoadPlan {
  if (!record(v) || !finite(v.beforePeak) || !finite(v.afterPeak)) return false;
  if (
    [v.source, v.windowMinutes, v.beforeEnergyWh, v.afterEnergyWh].some(
      (x) => x !== undefined,
    ) &&
    (v.source !== "forecast-demo" ||
      !finite(v.windowMinutes) ||
      !Number.isInteger(v.windowMinutes) ||
      v.windowMinutes < 1 ||
      v.windowMinutes > 1440 ||
      !finite(v.beforeEnergyWh) ||
      !finite(v.afterEnergyWh) ||
      v.beforeEnergyWh < 0 ||
      v.beforeEnergyWh > 1000000 ||
      Math.abs(v.beforeEnergyWh - v.afterEnergyWh) > 1e-8)
  )
    return false;
  const { beforePeak, afterPeak } = v;
  return (
    v.channelId === "CH2" &&
    time(v.from) &&
    time(v.to) &&
    minutes(v.from) < minutes(v.to) &&
    beforePeak > afterPeak &&
    afterPeak >= 0 &&
    beforePeak <= 1000 &&
    Array.isArray(v.before) &&
    Array.isArray(v.after) &&
    Array.isArray(v.labels) &&
    v.labels.length >= 2 &&
    v.labels.length <= 49 &&
    v.before.length === v.labels.length &&
    v.after.length === v.labels.length &&
    v.labels.every(time) &&
    v.labels.every((x, i, a) => i === 0 || minutes(x) > minutes(a[i - 1])) &&
    v.before.every((x) => finite(x) && x >= 0 && x <= beforePeak) &&
    v.after.every((x) => finite(x) && x >= 0 && x <= afterPeak)
  );
}
/** Searches every minute of a bounded same-day simulation window. Never actuates relays. */
export function getPlan(s: DemoState, now = Date.now()): LoadPlan {
  if (s.source === "demo" && s.planStatus === "applied" && s.appliedPlan)
    return {
      ...s.appliedPlan,
      canApply: false,
      reason: "applied",
      before: [...s.appliedPlan.before],
      after: [...s.appliedPlan.after],
      labels: [...s.appliedPlan.labels],
    };
  const led = s.schedules.find((x) => x.channelId === "CH2" && x.enabled);
  const plan: LoadPlan = {
    canApply: false,
    reason: "not-demo",
    beforePeak: 0,
    afterPeak: 0,
    from: led?.start ?? "14:00",
    to: led?.start ?? "14:00",
    channelId: "CH2",
    before: [],
    after: [],
    labels: [],
  };
  if (s.source !== "demo") return plan;
  if (!led) return { ...plan, reason: "no-schedule" };
  const jobs = s.schedules.filter((x) => x.enabled),
    begin = Math.min(...jobs.map((x) => minutes(x.earliest))),
    end = Math.max(...jobs.map((x) => minutes(x.latest)));
  const base = s.channels
    .filter((c) => c.id === "CH3")
    .reduce((a, c) => a + (c.watts ?? 0), 0);
  function loadAt(at: number, start = minutes(led!.start)) {
    return round(
      base +
        jobs.reduce((sum, j) => {
          const from = j.channelId === "CH2" ? start : minutes(j.start);
          return (
            sum +
            (at >= from && at < from + j.duration ? nominal[j.channelId] : 0)
          );
        }, 0),
    );
  }
  function peak(start: number) {
    let result = 0;
    for (let m = begin; m < end; m++)
      result = Math.max(result, loadAt(m, start));
    return result;
  }
  const beforePeak = peak(minutes(led.start));
  let best = minutes(led.start),
    bestPeak = beforePeak;
  for (
    let m = Math.max(minutes(led.start), minutes(led.earliest));
    m + led.duration <= minutes(led.latest);
    m++
  ) {
    const candidate = peak(m);
    if (candidate < bestPeak) {
      best = m;
      bestPeak = candidate;
    }
    if (candidate <= s.peak) {
      best = m;
      bestPeak = candidate;
      break;
    }
  }
  const labels: string[] = [],
    before: number[] = [],
    after: number[] = [];
  for (let m = begin; m <= end; m += 30) {
    labels.push(clock(m));
    before.push(loadAt(m));
    after.push(loadAt(m, best));
  }
  const preview = {
    ...plan,
    beforePeak,
    afterPeak: bestPeak,
    to: clock(best),
    before,
    after,
    labels,
    source: "forecast-demo" as const,
    windowMinutes: end - begin,
    beforeEnergyWh:
      Math.round(
        ((base * (end - begin)) / 60 +
          jobs.reduce(
            (sum, j) => sum + (nominal[j.channelId] * j.duration) / 60,
            0,
          )) *
          1e9,
      ) / 1e9,
    afterEnergyWh:
      Math.round(
        ((base * (end - begin)) / 60 +
          jobs.reduce(
            (sum, j) => sum + (nominal[j.channelId] * j.duration) / 60,
            0,
          )) *
          1e9,
      ) / 1e9,
  };
  let reason: PlanReason = "ready";
  if (s.planStatus === "applied") reason = "applied";
  else if (s.planStatus === "rejected") reason = "rejected";
  else if (!s.autopilot) reason = "autopilot-off";
  else if (!s.channels.find((c) => c.id === "CH2")?.assigned?.allowAuto)
    reason = "permission";
  else if (totalPower(s.channels) === null) reason = "stale";
  else if (s.channels.some((c) => (c.manualUntil ?? 0) > now))
    reason = "manual-priority";
  else if ((s.channels.find((c) => c.id === "CH2")?.watts ?? 0) > 0)
    reason = "already-running";
  else if (bestPeak > s.peak) reason = "no-window";
  else if (bestPeak >= beforePeak) reason = "no-improvement";
  return { ...preview, reason, canApply: reason === "ready" };
}
function event(
  s: DemoState,
  code: EventCode,
  kind: JournalEvent["kind"],
  now: number,
  channelId?: ChannelId,
  details?: JournalEvent["details"],
): DemoState {
  if (s.source !== "demo") return s;
  let sequence = 1;
  while (s.events.some((e) => e.id === `${now}-${sequence}`)) sequence++;
  return {
    ...s,
    events: [
      {
        id: `${now}-${sequence}`,
        at: now,
        kind,
        code,
        source: "demo" as const,
        channelId,
        details,
      },
      ...s.events,
    ].slice(0, 100),
  };
}
export function reduceState(
  s: DemoState,
  a: Action,
  now = Date.now(),
): DemoState {
  if (a.type === "locale")
    return { ...s, locale: a.value === "ky" ? "ky" : "ru" };
  if (a.type === "enter-demo")
    return event(demoState(s.locale), "demo-start", "system", now);
  if (a.type === "leave-demo")
    return { ...emptyState(), locale: s.locale, onboarded: s.onboarded };
  if (a.type === "onboarded") return { ...s, onboarded: true };
  if (s.source !== "demo") return s;
  switch (a.type) {
    case "assign": {
      if (!validAssignment(a.assignment))
        return event(s, "invalid-input", "error", now, a.id);
      const assignment = {
        ...a.assignment,
        name: a.assignment.name.trim(),
        room: a.assignment.room.trim(),
        allowAuto: a.id !== "CH3" && a.assignment.allowAuto,
      };
      return event(
        {
          ...s,
          planStatus: "pending",
          channels: s.channels.map((c) =>
            c.id === a.id
              ? { ...c, protected: c.id === "CH3", assigned: assignment }
              : c,
          ),
        },
        "assignment",
        "manual",
        now,
        a.id,
      );
    }
    case "toggle": {
      const c = s.channels.find((x) => x.id === a.id);
      if (!c) return s;
      if (c.id === "CH3" || c.protected)
        return event(s, "protected", "error", now, a.id);
      if (c.freshness !== "fresh" || c.watts === null)
        return event(s, "stale", "error", now, a.id);
      const on = c.watts === 0;
      if (on) {
        const current = totalPower(s.channels);
        if (current === null) return event(s, "stale", "error", now, a.id);
        const projected = round(current - c.watts + nominal[c.id]);
        if (projected > s.peak)
          return event(s, "peak-exceeded", "error", now, a.id, {
            projected,
            limit: s.peak,
          });
      }
      return event(
        {
          ...s,
          planStatus: "pending",
          channels: s.channels.map((c) =>
            c.id === a.id
              ? {
                  ...c,
                  watts: on ? nominal[c.id] : 0,
                  manualUntil: now + s.manualMinutes * 60000,
                }
              : c,
          ),
        },
        on ? "manual-on" : "manual-off",
        "manual",
        now,
        a.id,
      );
    }
    case "autopilot":
      return event(
        { ...s, autopilot: a.value, planStatus: "pending" },
        a.value ? "autopilot-on" : "autopilot-off",
        "manual",
        now,
      );
    case "peak":
      return finite(a.value) && a.value >= 1 && a.value <= 100
        ? event(
            { ...s, peak: round(a.value), planStatus: "pending" },
            "peak",
            "manual",
            now,
            undefined,
            { watts: a.value },
          )
        : event(s, "invalid-input", "error", now);
    case "manual-minutes":
      return finite(a.value) &&
        Number.isInteger(a.value) &&
        a.value >= 1 &&
        a.value <= 240
        ? event(
            { ...s, manualMinutes: a.value },
            "manual-priority",
            "manual",
            now,
            undefined,
            { minutes: a.value },
          )
        : event(s, "invalid-input", "error", now);
    case "schedule": {
      if (a.id === "CH3") return event(s, "protected", "error", now, a.id);
      if (
        !time(a.start) ||
        !finite(a.duration) ||
        !Number.isInteger(a.duration) ||
        a.duration < 5 ||
        a.duration > 240 ||
        minutes(a.start) + a.duration > 1439
      )
        return event(s, "invalid-input", "error", now, a.id);
      const previous = s.schedules.find((x) => x.channelId === a.id);
      const schedule: Schedule = {
        channelId: a.id,
        start: a.start,
        duration: a.duration,
        earliest: a.start,
        latest: clock(
          Math.min(
            1439,
            Math.max(
              minutes(previous?.latest ?? a.start),
              minutes(a.start) + a.duration,
            ),
          ),
        ),
        enabled: true,
      };
      if (!validSchedule(schedule))
        return event(s, "invalid-input", "error", now, a.id);
      return event(
        {
          ...s,
          planStatus: "pending",
          schedules: [
            ...s.schedules.filter((x) => x.channelId !== a.id),
            schedule,
          ],
        },
        "schedule",
        "manual",
        now,
        a.id,
      );
    }
    case "apply-plan": {
      const plan = getPlan(s, now);
      if (!plan.canApply)
        return event(s, "plan-blocked", "error", now, "CH2", {
          reason: plan.reason,
        });
      return event(
        {
          ...s,
          planStatus: "applied",
          appliedPlan: { ...plan, canApply: false, reason: "applied" },
          schedules: s.schedules.map((x) =>
            x.channelId === "CH2" ? { ...x, start: plan.to } : x,
          ),
        },
        "plan-applied",
        "auto",
        now,
        "CH2",
        {
          from: plan.from,
          to: plan.to,
          before: plan.beforePeak,
          after: plan.afterPeak,
        },
      );
    }
    case "reject-plan":
      return event(
        { ...s, planStatus: "rejected" },
        "plan-rejected",
        "manual",
        now,
        "CH2",
      );
  }
}
