# Phase 3 — intelligence and coaching

Authorized 7 November 2026. Preserve the blue/black design and optional local-only audio saving. Multiplayer and MUN remain outside scope.

Implement private, versioned analysis snapshots of saved debate turns. Model JSON is validated against typed schemas and exact transcript excerpts before any atomic save. Normalize argument nodes/links, factual claims, advisory ballots and separate coaching reports; reject dangling/cross-session references. Current Quick Debate uses the documented `quick-v1` text rubric. Delivery is unavailable because recordings are local and never sent to the evaluator. In-progress debates can receive argument analysis/coaching; final judging requires completion.

Use React Flow for inspectable argument relationships and Recharts for actual evaluation trends. Keep accessible text/table alternatives. Show source version, model, time, uncertainty, potential-fallacy language and simulation labels. Latest nonsimulated evaluation per completed session contributes to skill averages; reruns must not inflate progress. Store drill attempts with idempotent submissions and rubric feedback, then derive achievements from real account activity. Export and deletion cover all added private records.

Evidence research is optional through the existing OpenAI BYOK provider's native web search. No additional search account or arbitrary URL-fetching service is required. Only provider-returned search citations may be saved; model-invented URLs are not sources. Unsupported/missing research leaves a claim unverified, never automatically false. Research incurs the user's provider charges and is explicitly initiated. Verified/disputed labels are advisory AI source assessments, not independent proof.

Verify schemas/grounding, unsafe citations and malformed provider output, SQL ownership/version/idempotency/cascades, analysis → graph → ballot/coach → progress → drill, simulations excluded from score analytics, empty/error states and both existing voice/text flows. Real infrastructure/provider/microphone checks remain separately documented.
