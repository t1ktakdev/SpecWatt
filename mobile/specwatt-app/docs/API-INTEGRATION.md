# Mobile → SpecWATT Brain integration

The `/server` route is an explicit server-simulator workspace. It uses real FastAPI accounts and commands against simulated controllers. It never reads or writes the offline demo state, and it does not connect to ESP32 hardware.

## Start a disposable backend

From the repository's `backend` directory, install and run according to `backend/README.md`. Example PowerShell commands after dependencies are installed:

```powershell
$env:SPECWATT_DB = Join-Path $env:TEMP ('specwatt-api-smoke-' + [guid]::NewGuid().ToString() + '.sqlite3')
$env:SPECWATT_CORS_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
python -m uvicorn specwatt_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

If dependencies were installed in a virtual environment, use that environment's Python executable. The database above is disposable; smoke tests create an account and simulator and do not delete existing data. Stop Uvicorn with Ctrl+C after testing. Never point the smoke test at production.

## Portable client checks

From `mobile/specwatt-app`, with Node 24 (verified with 24.18.0):

```powershell
node --experimental-strip-types --test tests/api.test.mjs
npx tsc --noEmit
npx eslint src/specwatt/api.ts src/screens/server.tsx src/app/server.tsx
```

The unit tests use injected transports and memory token vaults, without a server or native modules. They cover URL boundaries, total/CH3/schema validation, stale telemetry, auth token validation, token removal on 401, no automatic retry, abort timeout, logout failure and web origin scoping.

With the disposable backend running, explicitly opt in to the integration smoke:

```powershell
$env:SPECWATT_API_URL = 'http://127.0.0.1:8000'
node --experimental-strip-types scripts/api-smoke.mjs
```

The smoke script has no default server address. It creates unique test credentials in memory without printing them; exercises register/login, create/list/snapshot, CH1 request→step (4.2→2.4 W), CH2 request→step (6.6 W), explicit simulated telemetry sample, CH3 client guard, session persistence and logout. A successful request alone does not change the displayed measurements. The backend's explicit `/simulator/step` performs dispatch and simulated acknowledgement in one call while retaining all transitions.

## Use the screen

1. Start the app and open Settings → server simulator, or route `/server`.
2. Enter the exact backend origin; choose registration or login. Passwords require 12–128 characters.
3. Create a named simulator, select it and inspect current telemetry.
4. Request CH1 off. Its reading stays unchanged until “Отправить и подтвердить · шаг симулятора”.
5. After acknowledgement, request CH2 on and run another explicit step. Total becomes 6.6 W. CH3 remains protected.
6. Read command transitions. Telemetry becomes stale after 30 seconds. “Повторить последний образец телеметрии” explicitly injects another server-simulator sample from its last known values; it is not a physical hardware poll.

The UI prevents duplicate taps while a request is active and blocks new commands while a command is unresolved. Network errors/timeouts do not retry: refresh history and reconcile before continuing. If logout cannot reach the server, the local token is still deleted; remote revocation is unconfirmed and the server session remains subject to its expiry.

## Endpoint and platform limits

- Release app code accepts HTTPS origins only. Development code additionally accepts HTTP for exactly `localhost`, `127.0.0.1`, `::1` and Android-emulator host alias `10.0.2.2`. Credentials, paths, queries and fragments in the server origin are rejected.
- Android emulator on the same workstation generally reaches the host at `http://10.0.2.2:8000`; device routing and cleartext policy must be verified with the actual native build. This integration has not been run on Android here.
- With a connected physical device and ADB, `adb reverse tcp:8000 tcp:8000` can expose workstation loopback as device `http://127.0.0.1:8000` in a development build. An ordinary LAN HTTP address is intentionally not accepted. Use HTTPS for other hosts.
- Allowing HTTP in the JS validator does not configure Android's native cleartext policy. A development-only native configuration may be needed. Do not infer Expo Go or release-build behavior from the Node smoke test.
- Browser requests require an explicit allowed origin in `SPECWATT_CORS_ORIGINS`. Match the actual Expo web origin/port. HTTPS web pages can also block HTTP requests as mixed content. Browser simulator interaction has not been established by the Node smoke test.
- The fetch timeout is eight seconds. Redirects are rejected and authorization is scoped to the configured server origin. No passwords or tokens are logged by the client.
- Native tokens use Expo SDK 58 `expo-secure-store`, with device-only unlocked keychain access where applicable. Configure its native plugin/backup behavior and verify on a real Android build. SecureStore was not exercised by Node tests.
- Web tokens live only in module memory; browser refresh removes the session. Neither localStorage nor AsyncStorage stores bearer tokens. The server URL is editable and is not persisted by this screen.
- The app checks response source, IDs/types, channel protection and measured totals. This is client defense; backend ownership/authorization/protection remain authoritative.

Official SDK 58 reference: <https://docs.expo.dev/versions/v58.0.0/sdk/securestore/>. Password reset, email ownership verification and physical controller transport are not implemented by this integration.
