# SpecWATT Grid integration gate

No flashed/tested ESP32 firmware is delivered in this iteration. The actual board, schematic, relay polarity, GPIO assignments, sensor variant/address, protection circuit, current limits and startup state have not been confirmed. Do not choose these from a generic tutorial.

Intended scope: confirmed low-voltage educational stand, currently conceptual 5 V DC; CH1 lamp, CH2 LED, CH3 protected fan. No experimental 220 V wiring.

Before implementation: obtain board/BOM/schematic; confirm INA3221 vs INA219, switching circuit, power budget, CH3 hardware protection and emergency behavior; define pairing proof and authenticated command/telemetry protocol. Commands need unique IDs, bounded expiry and durable idempotency. Measurements need identity, sequence, timestamp and sensor validity. Firmware must reject CH3 switching independently, enforce capability/permission limits and avoid replaying uncertain commands after restart. Link loss must inhibit new automation; actual relay fail-safe behavior requires hardware design review.

Bench acceptance: sensor calibration; power-on/reset/brownout; duplicate and expired commands; unauthorized controller; dropped acknowledgement; Wi-Fi loss; watchdog; sensor missing; short/overcurrent protections; protected fan remains in the hardware-approved state. Record firmware version, wiring and actual measurements. Backend simulator tests do not satisfy these tests.
