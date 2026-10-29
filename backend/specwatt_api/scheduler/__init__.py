"""Server-side load scheduling: planning engine, durable store, tick runner.

Public surface: ``engine`` (pure feasibility math), ``store`` (SQLite
persistence), ``runner`` (due-schedule execution), ``router``
(``register_scheduler_routes``), ``models`` (API contracts).
"""
