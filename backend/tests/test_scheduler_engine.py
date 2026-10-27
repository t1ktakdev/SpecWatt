"""Unit tests for the pure planning engine (no HTTP, no database).

These pin the mathematical invariants: unit consistency (W·s/3600 = Wh),
measured-vs-forecast separation, honest energy reporting (a peak reduction is
never reported as an energy reduction), deterministic slot search and the
guarantees that infeasible plans are detected, not silently accepted.
"""
import unittest

from specwatt_api.scheduler import engine

BASE = 1793253600.0  # 2026-10-27 14:00:00 UTC, arbitrary fixed instant


def channel(cid, watts=0.0, protected=False, allow_auto=True, manual_until=0.0):
    return {'id': cid, 'watts': watts, 'protected': int(protected), 'allow_auto': int(allow_auto),
            'manual_until': manual_until}


def controller(peak=7.0, measured_at=BASE - 65, uncertain=0):
    # measured_at defaults to 5 s before the tests' "now" (BASE - 60): a
    # sample from the future is not fresh, exactly as on the server.
    return {'peak_watts': peak, 'measured_at': measured_at, 'uncertain': uncertain,
            'manual_priority_minutes': 30}


def schedule(sid, cid, start, end):
    return {'id': sid, 'channel_id': cid, 'action': 'on', 'start_at': start, 'end_at': end,
            'priority': 0, 'status': 'pending'}


def plan(cid, start, end, action='on'):
    return {'channel_id': cid, 'action': action, 'start_at': start, 'end_at': end, 'priority': 0}


class EnergyAndUnitsTests(unittest.TestCase):
    def test_energy_wh_is_watts_times_hours(self):
        # 2.4 W held for exactly half an hour must be 1.2 Wh, not 1.2 W·s.
        segments = [engine.Segment(BASE, BASE + 1800, 2.4, engine.BASIS_MEASURED, engine.SOURCE_STATE)]
        self.assertAlmostEqual(engine.energy_wh(segments, (BASE, BASE + 1800)), 1.2)
        # A window wider than the segments only integrates covered time.
        self.assertAlmostEqual(engine.energy_wh(segments, (BASE, BASE + 3600)), 1.2)

    def test_peak_and_its_first_instant(self):
        segments = [engine.Segment(BASE, BASE + 600, 2.4, engine.BASIS_FORECAST, engine.SOURCE_PLAN),
                    engine.Segment(BASE + 600, BASE + 1200, 6.6, engine.BASIS_FORECAST, engine.SOURCE_PLAN),
                    engine.Segment(BASE + 1200, BASE + 1800, 4.2, engine.BASIS_FORECAST, engine.SOURCE_SCHEDULE)]
        peak, at = engine.peak_in_window(segments, (BASE, BASE + 1800))
        self.assertEqual((peak, at), (6.6, BASE + 600))

    def test_duration_above_counts_only_exceeding_time(self):
        segments = [engine.Segment(BASE, BASE + 600, 2.4, engine.BASIS_FORECAST, engine.SOURCE_PLAN),
                    engine.Segment(BASE + 600, BASE + 1500, 8.4, engine.BASIS_FORECAST, engine.SOURCE_PLAN)]
        self.assertAlmostEqual(engine.duration_above(segments, (BASE, BASE + 1800), 7.0), 900.0)


class ForecastModelTests(unittest.TestCase):
    def setUp(self):
        self.channels = [channel('CH1', 0.0), channel('CH2', 0.0), channel('CH3', 2.4, protected=True)]

    def test_protected_channel_is_always_on_in_every_projection(self):
        merged = engine.controller_forecast(self.channels, [], None, BASE, BASE + 3600)
        self.assertEqual([(s.watts, s.basis) for s in merged], [(2.4, engine.BASIS_MEASURED)])

    def test_measured_baseline_is_held_and_schedule_overrides_window(self):
        self.channels[0]['watts'] = 1.8  # lamp currently on
        running = [schedule('s1', 'CH1', BASE, BASE + 1800)]
        merged = engine.controller_forecast(self.channels, running, None, BASE, BASE + 3600)
        # Inside the window the lamp runs at its nominal 1.8 W (same value as
        # the held baseline, but tagged as forecast); CH3 adds 2.4.
        self.assertEqual([(s.watts, s.basis, s.source) for s in merged],
                         [(4.2, engine.BASIS_FORECAST, engine.SOURCE_SCHEDULE),
                          (4.2, engine.BASIS_MEASURED, engine.SOURCE_STATE)])
        self.assertEqual(merged[0].end, BASE + 1800)

    def test_scheduled_run_on_off_channel_returns_to_baseline(self):
        running = [schedule('s1', 'CH1', BASE, BASE + 1800)]
        merged = engine.controller_forecast(self.channels, running, None, BASE, BASE + 3600)
        self.assertEqual([(s.watts, s.basis) for s in merged],
                         [(4.2, engine.BASIS_FORECAST), (2.4, engine.BASIS_MEASURED)])


class EvaluatePlanTests(unittest.TestCase):
    def setUp(self):
        self.channels = [channel('CH1', 0.0), channel('CH2', 0.0), channel('CH3', 2.4, protected=True)]
        self.controller = controller()

    def test_feasible_plan_projection_is_fully_tagged(self):
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE, BASE + 1800), BASE - 60)
        self.assertTrue(result['feasible'])
        self.assertEqual(result['verdict'], 'feasible')
        p = result['projection']
        self.assertAlmostEqual(p['projected_peak_watts'], 4.2)
        self.assertAlmostEqual(p['device_energy_wh'], 0.9)  # 1.8 W * 0.5 h
        self.assertAlmostEqual(p['plan_energy_wh'], 2.1)    # 4.2 W * 0.5 h
        self.assertAlmostEqual(p['baseline_energy_wh'], 1.2)  # 2.4 W * 0.5 h
        self.assertAlmostEqual(p['delta_energy_wh'], 0.9)
        # Inside the plan window every contributing channel is projected
        # (schedule/plan or held baseline under an active plan), so the
        # window segments are forecast-tagged; the measured/forecast split
        # itself is pinned by ForecastModelTests.
        bases = {s['basis'] for s in p['segments']}
        self.assertEqual(bases, {engine.BASIS_FORECAST})

    def test_energy_honesty_shift_reduces_peak_not_energy(self):
        # A plan that only moves an already-running load cannot promise energy
        # savings: delta stays ~0 while the peak may change.
        self.channels[0]['watts'] = 1.8
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE, BASE + 1800), BASE - 60)
        p = result['projection']
        self.assertAlmostEqual(p['delta_energy_wh'], 0.0, places=6)
        self.assertAlmostEqual(p['projected_peak_watts'], 4.2)

    def test_check_list_mirrors_command_guards(self):
        self.channels[2] = channel('CH3', 2.4, protected=True)
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH3', BASE, BASE + 60), BASE - 60)
        self.assertFalse(result['feasible'])
        codes = [c['code'] for c in result['checks']]
        for code in ['protected_channel', 'stale_measurements', 'automation_not_allowed']:
            self.assertIn(code, codes)

    def test_infeasible_forever_when_nominal_plus_protected_exceeds_peak(self):
        self.controller['peak_watts'] = 4.2
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH2', BASE, BASE + 1800), BASE - 60)
        self.assertFalse(result['feasible'])
        codes = {c['code'] for c in result['checks'] if not c['ok']}
        self.assertIn('nominal_exceeds_peak', codes)
        self.assertIn('peak_exceeded', codes)
        self.assertEqual(result['suggestions'], [])

    def test_stale_measurements_reject_any_plan(self):
        self.controller['measured_at'] = BASE - 31
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE, BASE + 60), BASE)
        self.assertFalse(result['feasible'])
        self.assertIn('stale_measurements', [c['code'] for c in result['checks'] if not c['ok']])
        uncertain = controller(uncertain=1)
        result = engine.evaluate_plan(self.channels, [], uncertain, plan('CH1', BASE, BASE + 60), BASE)
        self.assertFalse(result['feasible'])

    def test_past_and_far_windows_are_rejected(self):
        past = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE - 120, BASE - 60), BASE)
        self.assertFalse(past['feasible'])
        far = engine.evaluate_plan(self.channels, [], self.controller,
                                   plan('CH1', BASE + 8 * 24 * 3600, BASE + 8 * 24 * 3600 + 60), BASE)
        self.assertFalse(far['feasible'])

    def test_manual_hold_rejects_overlapping_plan(self):
        self.channels[0]['manual_until'] = BASE + 60
        result = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE, BASE + 1800), BASE - 60)
        self.assertFalse(result['feasible'])
        ok = engine.evaluate_plan(self.channels, [], self.controller, plan('CH1', BASE + 120, BASE + 180), BASE - 60)
        self.assertTrue(ok['feasible'])


class SlotSearchTests(unittest.TestCase):
    def setUp(self):
        self.channels = [channel('CH1', 0.0), channel('CH2', 0.0), channel('CH3', 2.4, protected=True)]
        self.controller = controller()

    def test_slots_are_deterministic_and_respect_the_limit(self):
        self.channels[0]['allow_auto'] = 1
        self.channels[1]['allow_auto'] = 1
        # CH1 already scheduled 14:00-14:30 leaves only 6.6 W for CH2 afterwards.
        active = [schedule('s1', 'CH1', BASE, BASE + 1800)]
        slots = engine.find_slots(self.channels, active, self.controller, plan('CH2', BASE, BASE + 1800), BASE - 60)
        self.assertEqual(slots, [{'start_at': BASE + 1800, 'end_at': BASE + 3600,
                                  'projected_peak_watts': 6.6}])
        again = engine.find_slots(self.channels, active, self.controller, plan('CH2', BASE, BASE + 1800), BASE - 60)
        self.assertEqual(slots, again)

    def test_overlapping_boundary_is_not_a_conflict(self):
        first = schedule('s1', 'CH1', BASE, BASE + 1800)
        second = plan('CH1', BASE + 1800, BASE + 3600)
        result = engine.evaluate_plan(self.channels, [first], self.controller, second, BASE - 60)
        self.assertTrue(result['feasible'])

    def test_overlapping_window_conflicts_report_ids(self):
        first = schedule('s1', 'CH1', BASE, BASE + 1800)
        result = engine.evaluate_plan(self.channels, [first], self.controller,
                                      plan('CH1', BASE + 900, BASE + 2700), BASE - 60)
        self.assertFalse(result['feasible'])
        conflict = next(c for c in result['checks'] if c['code'] == 'schedule_conflict')
        self.assertEqual(conflict['detail']['schedule_ids'], ['s1'])
        # A different channel is never a same-channel conflict; the peak here
        # must allow both loads at once (1.8 + 4.2 + 2.4 = 8.4).
        cross = engine.evaluate_plan(self.channels, [first], controller(peak=8.4),
                                     plan('CH2', BASE + 900, BASE + 2700), BASE - 60)
        self.assertTrue(cross['feasible'])

    def test_suggestions_move_after_conflicting_schedule(self):
        result = engine.evaluate_plan(self.channels, [schedule('s1', 'CH1', BASE, BASE + 1800)],
                                      self.controller, plan('CH2', BASE, BASE + 1800), BASE - 60)
        self.assertFalse(result['feasible'])
        self.assertEqual(result['suggestions'][0]['start_at'], BASE + 1800)
        self.assertAlmostEqual(result['suggestions'][0]['projected_peak_watts'], 6.6)


if __name__ == '__main__':
    unittest.main()
