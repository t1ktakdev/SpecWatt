"""Shared primitives used by both the core API and the scheduler package.

Keeping these here avoids an import cycle (``app`` imports the scheduler
router, scheduler models need the strict input base and nominal channel
powers). The names are re-exported by ``app`` so existing imports keep working.
"""
from pydantic import BaseModel, ConfigDict

#: Nominal power of each simulated channel in watts. CH3 is the always-on
#: protected teaching-stand fan; its value is enforced by SQLite constraints.
CHANNELS = {'CH1': 1.8, 'CH2': 4.2, 'CH3': 2.4}
#: A measurement older than this (or an uncertain controller) is stale.
FRESH_SECONDS = 30


class Input(BaseModel):
    """Strict request base: unknown fields rejected, no type coercion."""
    model_config = ConfigDict(extra='forbid', strict=True)
