# Phase 2 verification — 7 November 2026 (Singapore)

Historical Phase 2 checkpoint. See [Phase 3 verification](phase-3-verification.md) for the current scope and validation.

Phase 2 implements browser speech input/output, account-saved modes and voice preferences, streamed text responses, private real-time revision updates, practice clocks and a blue-and-black default theme. Audio saving is optional for each take and off by default. An opted-in recording stays in page memory for local preview/download/discard; no audio is uploaded or stored in the account.

## Automated evidence

**82 tests passed** across the four suites below. The full browser run completed with exit 0 in 3.0 minutes.

| Check              | Result    | Scope                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend tests     | 18 passed | Existing authentication/draft tests plus recognition interim/final results, no recorder when saving is off, explicit opt-in blob creation, unsupported/denied microphone, cancellation while permission is pending, recovery without duplicated text, interrupted callbacks, playback cancellation/pause allowance, clock derivation and split/incomplete/error SSE frames. |
| Backend tests      | 41 passed | Existing API/security checks plus five provider SSE contracts, bounded/incomplete/error handling, atomic streamed completion, no partial append on failure/disconnection, socket Origin/authentication/ownership and revision-only protocol. Real provider calls are mocked.                                                                                                |
| PostgreSQL tests   | 11 passed | Both actual migrations executed in PGlite PostgreSQL; RLS/ownership/versioning, preference constraints, clock start, pause/resume, stale/foreign clocks, timed turn resets and untimed compatibility. Auth identities are simulated.                                                                                                                                        |
| Browser acceptance | 12 passed | Six scenarios each on desktop and iPhone-sized Chromium, actual Next.js → FastAPI → PostgreSQL. Test-only Auth/PostgREST, mock AI and browser speech/MediaRecorder fixtures.                                                                                                                                                                                                |
| Static checks      | Passed    | ESLint, Next route generation/TypeScript, Ruff check/format and Prettier. Explicit file enumeration avoids OneDrive skipping source files during glob traversal.                                                                                                                                                                                                            |
| Production build   | Passed    | Next.js production compilation and route generation; private routes/callbacks use server rendering.                                                                                                                                                                                                                                                                         |

Browser voice scenarios exercise default no-save transcription, explicit recording/download/discard, an unsaved-file navigation guard, offline reconnection, timer pause/reload/resume, streamed response playback controls, cross-tab transcript synchronization, denied microphone access and standard-response text fallback. The existing account/debate/isolation/export/BYOK scenarios remain included. Browser speech fixtures do not establish actual microphone, speech-service or codec behavior.

Desktop/mobile screenshots in `docs/qa/phase2-voice-desktop.png` and `docs/qa/phase2-voice-mobile.png` were visually reviewed for the blue-and-black theme, readable controls and responsive layout. Horizontal overflow assertions passed. Lint also checked 55 explicitly enumerated frontend files with zero errors/warnings, avoiding OneDrive glob traversal gaps.

Test logs include the existing Starlette TestClient deprecation warning and Node color-environment warnings. Deliberately forcing an offline socket produced one Windows asyncio transport-reset callback; the reconnect assertions and full suite passed. No raw authentication frames, provider keys or transcript content appeared in that callback.

## Limits and live acceptance

No hosted deployment, real Supabase project, SMTP/Google setup, live AI provider key or installed local model was configured. Both migrations still need application to the intended database. Physical microphone capture, browser vendor recognition, OS voices, actual audio encoding/playback and provider streaming through a production proxy require manual acceptance. The Docker image and hosted CI runner were not exercised here.

1. Follow the historical Phase 1 live account, isolation, email/OAuth, export/deletion and infrastructure checklist in [verification.md](verification.md).
2. Apply both reviewed migrations in order and run Supabase advisors. Check new preferences/clock RPC ownership through real PostgREST and two physical devices.
3. Test real browser permission allow/deny/revoke, unsupported browsers, recognition accuracy/languages, background/mobile suspension, microphone disconnection, network loss and explicit restart. Text must remain usable.
4. Choose Don’t save audio and verify no recording is created. Opt in separately; record a real take, preview and download it, play the downloaded file, then discard. Confirm no audio upload/account retention and check unload warnings. Files in page memory can be lost on forced close/device loss.
5. Check actual browser voices, language/rate selection, pause/resume/stop, autoplay restrictions and speaking allowance. Choosing local text inference does not make vendor speech processing offline.
6. Exercise live cloud/local SSE, incomplete output, cancellation, concurrent version conflict, standard fallback and the commit/delivery race. Confirm saved turns after reconnecting; do not blindly retry an unknown outcome.
7. Verify HTTPS/WSS, exact Origin allowlists, first-frame token redaction, WebSocket upgrades/heartbeats and SSE buffering/timeouts on the deployed host, as described in [deployment.md](deployment.md).

Practice clocks stop capture but permit transcript review/editing and later submission. They are not official competition enforcement. No judging, coaching scores, multiplayer, cloud audio storage or provider-native realtime audio is implemented. Phases 3–5 remain unauthorized. Codex project creation remains deferred.

Primary implementation references: [Web Speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [speech synthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) and [OpenAI streaming](https://platform.openai.com/docs/guides/streaming-responses).
