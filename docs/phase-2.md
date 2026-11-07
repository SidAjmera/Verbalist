# Phase 2 implementation plan

Authorized on 7 November 2026: complete real-time voice and adopt a blue-and-black visual theme. Phases 3–5 remain out of scope.

1. Extend account preferences with voice/text input, text/voice/both output, language and playback speed. Add versioned, server-timestamped practice clocks to debates; keep existing sessions untimed.
2. Add actual provider text streaming via SSE with request-scoped BYOK headers. Commit only complete responses atomically; cancellation/provider interruption leaves the saved human turn available for retry. Keep standard-response fallback for incompatible endpoints.
3. Add origin-checked, authenticated WebSocket notifications for private session revisions, reconnect/backoff and polling fallback. Authenticate using a bounded first message, never URL query credentials. Revalidate identity periodically; no provider key enters a WebSocket.
4. Implement browser microphone permissions, live interim/final recognition, automatic stop/recovery and text fallback. Require per-session speech-processing consent. Audio saving is optional for each take and off by default; explicit recording creates a page-memory file for preview/download/discard, with no upload or account audio storage. Browser vendors may process recognition online.
5. Implement browser voice selection, playback, pause/resume, stop/interruption and speaking indicators. Respect the saved speaking allowance and stop microphone capture at its end; retain editable transcript review before submission. These are practice clocks, not official competition enforcement.
6. Apply a dark default with near-black surfaces and electric-blue accents while preserving an accessible light option.
7. Verify SQL ownership/clock consistency, streamed provider contracts, WebSocket authorization, mocked browser speech interactions, recovery, responsive layouts and the existing Phase 1 flows. Document real-microphone/provider checks separately.

WebRTC is unnecessary for single-user browser speech plus text responses: no peer audio transport exists in Phase 2. Provider-native realtime audio, cloud audio storage, multiplayer voice and judging are not implied by browser speech support.
