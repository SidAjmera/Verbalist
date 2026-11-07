# Phase 1 verification — 7 November 2026 (Singapore)

Historical Phase 1 checkpoint. Phase 2 is now authorized; see [Phase 2 verification](phase-2-verification.md) for the current scope and results. Statements below describe the earlier checkpoint.

## Implemented story

A verified account opens the protected workspace, chooses a motion/position/difficulty, configures its own AI provider, saves a draft, completes six ordered debate turns through FastAPI, and reopens the private transcript from another authenticated browser session. Account export/deletion and ephemeral credential handling use the same boundaries.

## Automated results

**53 tests passed.**

| Check                             | Result                     | Evidence/scope                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend component and hook tests | 7 passed                   | Login, registration verification message, recovery, safe errors, speaking order, autosave, conflict recovery.                                                                                                                                                                   |
| Backend/API and adapter tests     | 30 passed                  | Auth rejection, ownership filters, validation/body limits, turn conflicts, five provider wire contracts, missing keys, safe upstream failures, production mock prohibition, session-specific reauthentication and revoke-before-delete, export pagination.                      |
| PostgreSQL migration/RLS tests    | 8 passed                   | Real PostgreSQL WebAssembly execution with simulated Auth identities: grants/RLS, anonymous/unverified rejection, account isolation, immutable turns, draft CAS, idempotency, side/order, pause/resume/completion, unique usernames, shared rate limits and cascading deletion. |
| Browser acceptance                | 8 passed                   | Four scenarios each on desktop Chromium and iPhone 13-sized Chromium; actual Next.js → FastAPI → PostgreSQL flow, simulated Supabase Auth/PostgREST and mock AI. Latest complete run: 8 passed in 1.3 minutes, exit 0.                                                          |
| Frontend lint                     | Passed                     | ESLint with zero allowed warnings; generated Next outputs excluded.                                                                                                                                                                                                             |
| Frontend type checking            | Passed                     | Next route type generation and `tsc --noEmit`.                                                                                                                                                                                                                                  |
| Python lint/format                | Passed                     | Ruff check and format check; Python compilation also passed.                                                                                                                                                                                                                    |
| Frontend production build         | Passed                     | Next.js 16.4.5 compiled all Phase 1 routes; authenticated pages/callbacks use server rendering.                                                                                                                                                                                 |
| npm dependency audit              | 0 reported vulnerabilities | An online audit identified a dev-only minimatch advisory. A scoped override plus lockfile update resolved it; subsequent install/audit reported zero. This is a point-in-time dependency check.                                                                                 |

The backend test runner emitted one Starlette deprecation warning about its use of HTTPX for TestClient; the 30 tests passed. Browser development servers emitted Node color-environment warnings. These do not establish production integration behavior.

## Browser boundaries exercised

- All seven functional route entry points reject unauthenticated users.
- Registration requires a simulated verification link before workspace access; the new account can subsequently be deleted through the real UI/API deletion flow.
- Provider preferences save to the account. Draft autosaving persists across reload and a second independent browser login.
- Navigation during a pending draft debounce saves before leaving. The mobile drawer dismisses when selecting Settings/Profile. Keyboard dismissal/focus management is implemented but was not independently exercised by these browser scenarios.
- Three human arguments and three mock AI arguments complete the debate; history reopens the completed transcript.
- A different authenticated account receives “Debate not found” for the private session.
- Account export downloads JSON.
- A test provider key remains absent from localStorage, sessionStorage and cookies, and is cleared after reload. The credential is not sent to any real AI service.
- Light/dark UI and desktop/mobile layouts render, with horizontal overflow assertions on sign-in and the debate screen. QA images in `docs/qa/` contain disposable fixture data.

## Live checks still required

No real Supabase project, SMTP server, Google application, API key or installed local model was supplied/configured in this session. No remote migration, account, hosting deployment or paid model call was created. The Docker image and GitHub-hosted CI workflow are provided but were not run in those environments.

Before treating an external deployment as verified:

1. Apply the reviewed migration to the intended dedicated project; run Supabase advisors and confirm table grants/RLS and the Auth trigger against actual PostgREST.
2. Register a disposable real account, receive the verification email and test confirmation in another browser/device. Verify password-reset delivery and recovery. The test fixture does not send mail.
3. Complete Google OAuth consent/callback and session refresh with the intended production redirect allowlist.
4. Sign in on two physical devices; verify shared drafts, deliberate conflicting writes, saved history and preference sync.
5. Confirm a second account cannot access another user's sessions, profiles, turns or exports through either the API or direct Data API calls.
6. Test a real configured cloud model and a locally installed compatible model. Confirm correct model IDs, quotas, timeouts and error behavior. Wire mocks establish adapter shape, not real provider availability or strategic output quality.
7. Verify infrastructure does not capture Authorization/X-AI-Key headers or request bodies. Check HTTPS, CORS, edge rate controls and private auth response caching.
8. Export the disposable account, delete it after fresh authentication, verify cascades and reject its previous access token.

## Practical limits and scope

Autosaving commits after approximately 900 ms of idle typing. Unsaved text exists only in the editor until a successful save; force-closing the browser or losing the device before that point can lose it. Offline draft persistence is not implemented. Text mode is untimed. AI output is unverified and no judging/delivery scores are generated.

Phases 2–5 remain design-only. The ChatGPT/Codex project container was deferred at the user's request; this checkout contains the source, original brief, instructions, architecture, contracts and handoff documentation. No project container was successfully created.
