# API contracts — Phases 1–4

Phase 4 adds verified membership-based surfaces (see [multiplayer design](phase-4.md)):

| Surface                                                                    | Contract                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/POST /v1/rooms`                                                       | Member-filtered history, 30 rows per offset; create motion, alias, host role and timing.                                                                                                  |
| `GET /v1/rooms/{id}`                                                       | Room clock/version, active aliases/roles, committed turns, own private draft, events, latest advisory ballot and final result. Managers also see sanitized invitation metadata.           |
| `POST /v1/rooms/{id}/actions`                                              | Versioned ready/start/speak/pause/resume/finish/cancel/mute/remove/revoke_invite/concede with bounded action data.                                                                        |
| `PUT /v1/rooms/{id}/draft`, `POST .../turns`                               | Player-only draft CAS; ordered immutable turn with room/draft versions and replay UUID.                                                                                                   |
| `POST /v1/rooms/{id}/invitations`, `POST /v1/tournaments/{id}/invitations` | Manager-issued role-bound code shown once; only SHA256 hash stored.                                                                                                                       |
| `POST /v1/invitations/accept`                                              | Code in body, alias and explicit sharing consent; bounded, expiring, revocable.                                                                                                           |
| `GET /v1/rooms/{id}/ice`                                                   | Membership check; optional operator STUN and 10-minute TURN REST credentials. Backend relay secret never returned.                                                                        |
| `WS /v1/rooms/{id}/live`                                                   | Exact Origin; first frame authenticate token/connection UUID. Revision/presence ticks, target-only fenced SDP/ICE, own voice opt-in. Identity rechecked every 30s, membership every tick. |
| `POST /v1/rooms/{id}/ballots`                                              | Independent judge, completed two-sided transcript, provider request/BYOK header, expected version and replay UUID. Grounded text-only advisory output; snapshot version retained.         |
| `POST /v1/rooms/{id}/result`                                               | Independent judge, explicit human review, written reason, winner/draw, basis, optional advisory ballot, expected version and replay UUID. Immutable final result.                         |
| `GET/PUT /v1/ranking-profile`, `GET /v1/leaderboard`                       | Private versioned opt-in preference; consenting practice aliases and aggregate points only.                                                                                               |
| `GET/POST /v1/tournaments`, `GET .../{id}`, `POST .../{id}/actions`        | Member history/detail; organizer create, seed full roster, schedule/clear future match, revoke invites or cancel. Human results advance brackets atomically.                              |

Room audio travels peer-to-peer or through an operator relay, never through API uploads. Local recordings and invitation secrets/SDP/presence are excluded from export. Account export includes accessible shared records and only the caller's private drafts/credits. Account deletion removes containing shared rooms/tournaments and their derived records for all members.

Base: `/v1`. All routes except `/health` require `Authorization: Bearer <Supabase access token>` from a verified, non-anonymous account. All data routes are private. JSON errors expose a safe `detail` string. Validation errors never echo inputs. No raw upstream exceptions are returned.

- `GET /health`: liveness and configuration presence, no secrets.
- `GET /v1/me`, `PATCH /v1/me`: profile (patch includes expected `version`).
- `GET /v1/preferences`, `PATCH /v1/preferences`: nonsecret provider/model, theme, input_mode (`text|voice`), output_mode (`text|voice|both`), speech_language, speech_rate (0.75–1.5), speech_voice and default difficulty; optimistic `version`. Recording consent is never a stored preference.
- `GET /v1/providers`: explicit capabilities, enablement, model suggestions and limitations. A model ID is user-configurable; suggestions are not availability guarantees.
- `GET /v1/motions?category=...`: curated motion library.
- `POST /v1/motions/generate`: `{topic, provider, model}`. Returns `{text}`. Requires configured provider; no research/citation claims.
- `GET /v1/formats`: enabled format configurations.
- `GET /v1/dashboard`: real account counts, UTC activity streak and recent sessions. No fabricated scores.
- `GET /v1/debates?limit=30&offset=0`: paginated private history, newest update first.
- `POST /v1/debates`: `{motion, side, difficulty, persona, preparation_seconds, speaking_seconds, timed?}`; timed defaults false; server-generated ID/times; returns session and turns. Quick Debate has six alternating turns, proposition starts.
- `GET /v1/debates/{id}`: private session, ordered immutable turns and `server_time` for countdown offset. Timed sessions include clock_phase, clock_remaining_ms and clock_started_at. Pause freezes remaining time; resume starts from the persisted remainder. New human turns reset preparation.
- `POST /v1/debates/{id}/clock/start`: `{expected_version}`; starts the current human speaking period or skips preparation. Ownership, active status and version are checked atomically. Timed human submission requires a started speaking period; review/submission remains available after expiry.
- `POST /v1/debates/{id}/respond/stream`: same body/headers as `/respond`; SSE `data:` JSON frames: `{type:"delta",text}`, `{type:"complete",debate}` or `{type:"error",status,detail}`. Complete means the full provider response was atomically appended. Partial previews are not saved turns. Cancel/disconnect before completion stops generation; reload after interruption to resolve a commit/delivery race before retrying.
- `WS /v1/debates/{id}/live`: exact allowlisted browser Origin required. Within five seconds send `{type:"authenticate",token:"<Supabase access token>"}` as the first frame, never a query parameter. Owner check on connect and every two seconds, identity reverified every 30 seconds. Server sends revision metadata `{type:"revision",version,draft_version}`, heartbeat or a safe error. Only `{type:"ping"}` is accepted afterward. No audio, transcript or provider keys on this transport. Client reconnects with backoff; polling remains available.
- `PUT /v1/debates/{id}/draft`: `{draft, expected_draft_version}`. Compare-and-swap autosave. A 409 preserves the editor's local text for explicit conflict resolution.
- `POST /v1/debates/{id}/turns`: `{content, expected_version, expected_draft_version, request_id}`. Idempotent human submission. Saves before AI generation. Checks draft version to avoid discarding another device's draft.
- `POST /v1/debates/{id}/respond`: `{provider, model, expected_version}`. Request-scoped `X-AI-Key` for cloud adapters. Generates only when it is AI's turn; atomic append detects races. A timeout leaves no partial AI turn and can be retried.
- `PATCH /v1/debates/{id}/status`: `{status, expected_version}` for pause/resume/early finish. Early finish requires at least one turn from each participant; six turns complete automatically.
- `GET /v1/account/export`: JSON with profile, preferences, sessions, participants and turns. No provider secrets. Paginated retrieval internally avoids PostgREST's row cap.
- `DELETE /v1/account`: `{confirmation: "DELETE"}`. Requires authentication within the last ten minutes, revokes sessions globally and deletes Auth account with cascading records. Missing admin configuration returns 503.

Common responses: 401 invalid/missing session, 403 unverified/anonymous account or stale reauthentication, 404 no owned record, 409 version/turn conflict, 413 oversized body, 422 invalid input, 429 rate budget exhausted, 502 safe provider error, 503 unconfigured infrastructure, 504 provider timeout. Request bodies are limited to 64 KiB. Per-user database rate budgets bound API writes/AI requests across workers.

Shared TypeScript models live in `packages/shared-types/index.ts`. Pydantic request models and FastAPI-generated `/openapi.json` are authoritative for backend request validation.

## Intelligence and practice

All routes below use the same verified bearer identity, ownership checks, no-store responses and request-scoped `X-AI-Key` header. Standard tests use explicitly labeled mock AI; no model call is required to browse saved data.

- `GET /v1/rubrics/quick-v1`: versioned Quick Debate criteria, weights, scale, decision convention and delivery limitation.
- `GET /v1/debates/{id}/analysis?run_id=<optional UUID>`: latest owned snapshot, or an exact saved run belonging to that same owned debate. Returns null if no latest snapshot exists; an invalid/foreign requested run is 404. Includes run provenance, normalized nodes/links, claims/citations, nullable final ballot and separate coaching.
- `POST /v1/debates/{id}/analysis`: `{provider,model,expected_version,request_id}`. Requires a saved human argument of at least three characters. Strict model JSON, exact quote/speaker matching and graph validation precede an atomic ownership/version-checked save. In-progress analysis has no ballot; completed analysis must contain one. Request UUIDs prevent duplicate saves. JSON model failures return safe 502 without partial records. The browser retains a replay identifier across an uncertain failure for the same source version.
- `POST /v1/claims/{id}/research`: `{provider:"openai",model,expected_version,consent:true}` plus session key. Optional native web search, not an automatic phase of analysis. Requires the owned claim/version before any research call. Only provider citation metadata is accepted; absent completed search/citations yields unverified. Saves current assessment/research model/time/citations atomically. Research errors leave previous assessment unchanged. No provider key or user-supplied source URL is persisted.
- `GET /v1/learning/progress`: all-time eligible evaluation count/skill averages, last-30 per-debate trend with exact run/model/rubric provenance, nonsimulated drill count, simulation count and earned achievements. Recomputes the private progress cache. Latest nonsimulated final evaluation per debate contributes once.
- `GET /v1/drills`: five shared read-only `drill-v1` definitions with prompts and three scoring criteria.
- `GET /v1/drill-attempts`: latest 30 owned saved attempts/feedback, including clearly marked simulations.
- `POST /v1/drills/{id}/attempts`: `{provider,model,request_id,response}`; response 40–4,000 characters. Typed three-criterion scores (0–2 each) and exact response quotes are checked before saving. Same request/drill/response replays the existing attempt; reuse for another response is 409. Provider failure does not save an attempt.

Exports and account deletion cover every added private table. The public drill definitions are not account-owned data. These are self-owned advisory records: direct caller-owned RPC use is not cryptographically attested AI judging and must not become an official ranking source.
