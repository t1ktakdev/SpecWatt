# Historical SpecWATT Brain proposal — superseded

The implemented contract is [backend/README.md](../../../backend/README.md). The text below records the prior iteration and must not be used as the current API.

Proposals for backend team review, no actual network calls exist here.

- GET /v1/controllers -> [{id,name,online,simulated:false,lastSeenAt}]
- POST /v1/controllers/pair -> {nonce,controllerId,fingerprint}; must verify identity.
- GET /v1/controllers/:id/channels -> [{id,protected,capabilities:{relay,meter,manual},freshness,powerW:null|number}]
- POST /v1/commands -> {idempotencyKey,channelId,targetOn,expectedVersion}
- GET /v1/commands/:id -> requested/sent/acknowledged/rejected/timeout/transport-error/reconciled.
- PUT /v1/devices/:id -> {channelId,name,categoryId,imageId,roomId,allowAuto}
- Auth endpoints: not yet defined. Needs email verification, password reset, token storage/rotation.

Never treat requested commands as confirmed, never blindly retry timeout, never allow CH3 actuation, never turn null readings into zero. Server and firmware must repeat these checks. Live user consent is separate from demo permission. Keep hardware at educational 5V.
