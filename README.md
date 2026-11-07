# Verbalist

A private, account-based debate training platform. **Phases 1–4**: text/voice Quick Debate, argument maps, advisory judging/coaching, practice drills, saved progress, private multiplayer and tournaments. The checkout folder is named `Vocalist`; the product is **Verbalist**.

## What is implemented

- Next.js App Router, React, TypeScript, Tailwind CSS and local shadcn/ui primitives; responsive navigation and light/dark themes.
- Supabase email/password registration, verification, sign-in, Google OAuth, recovery, logout and protected application routes.
- FastAPI identity verification and PostgreSQL ownership RLS. No guest mode or production mock-auth path.
- A curated motion library, custom motions and AI-generated motions.
- Quick Debate: proposition starts, three rounds, six alternating turns. Opening, rebuttal and closing; three strategic difficulty levels and three personas.
- Pause/resume, early finish after both sides speak, immutable transcripts, versioned autosaving, cross-device recovery, history and real account activity counts.
- OpenAI, Anthropic, Gemini, compatible API and local compatible-server adapters; explicit nonproduction simulation for tests.
- Request-scoped BYOK, private profiles/preferences, JSON export and account deletion with cascading data removal.
- Account-saved text/voice input and text/voice/both output, language, voice and playback speed; live transcription, speech controls, permission handling and text fallbacks.
- Streaming AI text, authenticated WebSocket updates, reconnect/backoff, polling fallback and synchronized practice clocks.
- Optional audio recording for each take: **off by default**, held in page memory for local preview/download/discard, with no audio upload or account storage. Transcripts remain private account data.
- Blue-and-black default appearance, with a light alternative.
- Private transcript-grounded argument snapshots, interactive React Flow maps, potential-fallacy findings, separate advisory ballots/coaching and optional source research.
- Five rubric-based drills, saved feedback, Recharts skill trends, model provenance, personalized focus areas and activity achievements. Simulation scores never enter performance averages.
- Component, backend, PostgreSQL/RLS and browser tests; no paid AI calls in the standard suite.

Phase 4 adds private human debate rooms, invitations, player/judge/spectator roles, synchronized clocks, WebRTC audio, moderation, advisory AI ballots, human-confirmed results, opt-in practice standings and private 2/4/8-player tournaments. See [Phase 4](docs/phase-4.md). The Multiplayer list is the shared match history, separate from solo Debate history.

MUN and advanced formats remain Phase 5. Practice standings are not official competition ratings. Optional clocks close the microphone floor at the allowance; users review and submit text. Public-network voice needs an operator-configured TURN relay and separate live verification.

## Private multiplayer

For Phase 4, open **Multiplayer**, create a private room and choose whether to host as proposition or as the independent judge. Create a role-specific invitation, copy its code and share it manually. Guests join with the code and an alias. Both players choose Ready; the host/judge starts the debate, then the current speaker opens their clock, drafts or dictates, and submits. Judges/spectators can explicitly join audio to listen. **Save my next speaking take as audio** is a separate, default-off choice for the player's own microphone. Stop dictation and review the text before submitting.

After completion, the independent judge can request an advisory ballot using their Settings provider/key, then write and explicitly confirm a final decision. The room list retains match history. **Practice standings** requires both players' global opt-ins and per-room consent; it uses transparent points and is not an official rating. **Tournaments** lets a nonplaying organizer invite 2/4/8 entrants, seed a full roster in join order, schedule match starts and judge each advancing result. No messages are automatically sent to guests. See [relay setup and deployment limits](docs/deployment.md#phase-4-release-and-relay-setup).

## Analysis, coaching and practice

Save a human turn, then choose **Analyze saved turns** in the debate. The model extracts argument nodes/relationships, candidate factual claims and separate coaching. Every reference must match an exact saved transcript excerpt; invalid JSON, invented quotes, dangling links and stale session versions are rejected before an atomic save. Existing reviews display their model, timestamp and source version. After completing the debate, **Evaluate debate** (or **Analyze again**) adds the advisory `quick-v1` ballot. See the [Quick Debate rubric](docs/quick-debate-rubric.md).

The graph supports pan/zoom, node selection and dragging, with a text alternative. Potential fallacies and model confidence are uncertain interpretations. Delivery is not scored because optional recordings stay local. Coaching offers cited strengths/weaknesses, illustrative rewrites and links to drills. Practice saves the submitted response, three-criterion feedback and model provenance. AI analysis/drills need a model that follows JSON instructions; compatible/local models vary. A missing key or failed model leaves the transcript/response available for retry.

Progress and the overview derive actual account data. Each completed debate contributes only its latest nonsimulated final evaluation to all-time skill averages; the chart shows the latest 30 evaluated debates. Its links reopen the exact saved evaluation. Repeated below-6 skill scores suggest focus areas, not diagnoses. Model differences and small samples limit comparison. Drill completion and achievements use saved activity; simulated evaluations/drills are visibly marked and excluded from evaluation/drill achievements and performance statistics.

Evidence research is optional and independently initiated. Select OpenAI with a web-search-capable model, hold its key for the session, consent to sending the selected claim and choose **Research claim**. This uses native OpenAI web search and may incur provider charges. Only usable HTTPS citations returned in provider tool metadata are retained. Without a completed search and citations a claim remains **unverified**, never automatically false. Verified/disputed labels are advisory AI source assessments. Other providers still support basic debate/analysis without research. No extra search account, arbitrary URL fetcher or cloud audio bucket is required.

## Using voice and optional audio

In Settings, choose Voice input and Text, Voice or Both output. Save your language, speed and preferred browser voice. Create a timed debate (initially enabled for voice input), start the speaking clock, consent to browser speech processing, then start the microphone. Interim words appear live; finalized words enter the editable, autosaved draft. Stop the microphone and review before submitting. AI text streams first; supported browser speech reads the committed response with pause/resume/stop controls. A standard response option works with endpoints that cannot stream.

For each take, choose **Don’t save audio** or **Record for download** before starting. Recording requires the latter choice; stopping presents a local preview with Save audio to device and Discard audio. Files are never uploaded and do not appear in history/export. Save or discard before navigating; browser close/reload warns about an unsaved file. Forced close or device loss can still lose page-memory recordings. The browser controls the actual download destination.

Voice needs HTTPS (or localhost), microphone permission and a compatible browser. Web Speech recognition has limited availability and may send speech to the browser vendor’s service. Browser/OS voices may also use online services; these features are independent of the selected text AI provider. Choosing Local model does not make browser speech offline. Unsupported speech leaves text available. No provider-native realtime audio or WebRTC peer connection is implemented.

## Quick start

Requirements: Node.js 22+, Python 3.13, [uv](https://docs.astral.sh/uv/), and a dedicated Supabase project or Docker for the local Supabase stack. No paid AI subscription is required. Install a local model server or explicitly enable the development simulation.

```powershell
npm ci
uv sync --project apps/api --frozen
```

Configure Supabase using either path below, then create `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

Create `apps/api/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
WEB_ORIGINS=["http://127.0.0.1:3000"]
ENVIRONMENT=development
ENABLE_MOCK_AI=false
LOCAL_AI_BASE_URL=
COMPATIBLE_AI_BASE_URL=
```

The API secret key is only needed for account deletion. Never put it in frontend configuration. Legacy local `anon`/`service_role` keys work with the corresponding variables. All `.env` files are ignored. Use the same hostname consistently: `127.0.0.1` and `localhost` have different cookies and OAuth redirect URLs.

Start two terminals:

```powershell
# Terminal 1, repository root
npm run dev

# Terminal 2
cd apps/api
uv run uvicorn verbalist.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Open **http://127.0.0.1:3000**. The frontend shows a configuration notice until Supabase values are supplied. The API's `/health` reports configuration presence, not a successful database connection. REST documentation: `http://127.0.0.1:8000/docs`.

This workspace also contains ignored portable Node/uv/Python installations under `.tools` from the implementation session. `scripts/dev.ps1 -Target web` or `scripts/dev.ps1 -Target api` can use those runtimes when normal commands are unavailable. The portable directories are not application source and are not required on another machine.

## Supabase setup

### Local stack

With Docker running:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase status
```

The reset command is for a disposable **local development database** and deletes its data. Copy the local API URL/public key into the frontend and API environment files. Put the local service-role key only in `apps/api/.env`. View verification/recovery messages in the local mail viewer shown by `supabase status`. Local email confirmation is enabled in `supabase/config.toml`.

### Hosted project

Use a dedicated project. The initial migration provisions profile/preferences rows for existing Auth accounts in that project.

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

Review the linked project and pending migrations before pushing. The [foundation migration](supabase/migrations/20261107022330_phase1_foundation.sql) creates tables, grants, RLS, ownership-checking RPCs and account triggers. [Phase 2](supabase/migrations/20261107041721_phase2_voice_and_clocks.sql) adds voice preferences/clocks; [Phase 3](supabase/migrations/20261107072739_phase3_intelligence.sql) adds private analysis, research, drills and progress; [Phase 4](supabase/migrations/20261107083107_phase4_multiplayer.sql) adds private multiplayer, reviewed practice standings and tournaments. Apply all four in order. New migrations should be created using `npm run db:new -- descriptive_name`.

In Supabase Auth:

1. Enable email/password sign-ups and **Confirm email**. Set the minimum password length to 12.
2. Set Site URL to the frontend's exact origin. Allow `/auth/callback`, `/auth/callback?next=/reset-password` and `/auth/confirm` on that origin. Add production URLs separately.
3. Configure SMTP for actual user delivery. Built-in test email restrictions and quotas may prevent external recipients from receiving mail.
4. For cross-device confirmation/recovery, set the confirmation template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` and the recovery link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. HTML template examples are in `supabase/templates/`.
5. Enable Google in Auth Providers; configure the Google client ID/secret in Supabase only. Register `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as Google's authorized redirect URI. Complete Google's consent/test-user configuration as required by your Google project.
6. Use a short access-token expiry appropriate to your application. Deletion revokes refresh sessions before removing the account; the API also checks account existence on each request.

The frontend verifies users on the server; the API independently verifies every token with Supabase Auth. Database queries use the caller's token. All private table writes go through validated RPCs; direct insert/update/delete access is revoked.

## AI configuration

Sign in, open **Settings**, select a provider and enter a model identifier available to your account. Model suggestions are examples, not a guarantee of account access. Choose a model with at least 32k context for full-length debates.

Cloud providers require **your own API key**. Enter it in the credential field and choose **Use for this session**. Keys are kept in React memory, sent in `X-AI-Key` over HTTPS in production, forwarded by FastAPI and discarded after the request. They are not saved to PostgreSQL, cookies, localStorage or sessionStorage. Reload, sign-out, account change or **Clear credentials** removes the key. Preference sync excludes secrets.

Disable request-header/body capture in hosting proxies, tracing and APM. Redact `Authorization` and `X-AI-Key`. Never put keys in URLs, logs or analytics. The stateless request-scoped approach supports multiple backend workers without persisting session credentials. AI providers receive your transcript and may have their own retention policies; OpenAI requests explicitly set `store: false`.

For **local inference**, install a compatible model server on the API host, for example Ollama, then set:

```dotenv
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
```

Pull a text model separately using your model server, select **Local model** and enter its installed model ID. Hardware/RAM requirements depend on that model. This adapter uses `/chat/completions`. It does not install a model, run inside the browser, or make a laptop's localhost accessible to a remote backend. Only the server operator can configure endpoints.

For an OpenAI-compatible **cloud** endpoint, set `COMPATIBLE_AI_BASE_URL=https://PROVIDER/v1`. HTTPS is required. Arbitrary per-request URLs and redirects are rejected.

For a clearly labeled **development simulation**:

```dotenv
ENVIRONMENT=development
ENABLE_MOCK_AI=true
```

Restart the API, select Development simulation in Settings and save. This uses scripted responses, not a model, and is forbidden in production. Real cloud/local adapter calls require separate verification against configured services.

## Checks

```powershell
npm run lint
npm run typecheck
npm test                       # Components/hooks + PostgreSQL migration/RLS tests
npm run build
uv run --project apps/api pytest apps/api/tests
uv run --project apps/api ruff check apps/api
uv run --project apps/api ruff format --check apps/api
npm run format:check
```

Backend tests can also run from `apps/api` with `uv run pytest`. PGlite executes the real migration in PostgreSQL WebAssembly with test Auth identities. It verifies SQL rules but does not reproduce GoTrue, PostgREST, SMTP or Google.

For desktop and mobile browser acceptance tests:

```powershell
npx playwright install chromium
npm run test:e2e
```

The browser suite starts a test-only Auth/PostgREST fixture, the actual FastAPI API with mock AI, and the actual Next.js frontend on ports **54400**, **8100** and **3100**. It uses the real SQL migration. These services are loopback-only and are never production authentication. No real mail, Google login or paid AI is used. Override `VERBALIST_PYTHON` if the API virtualenv is elsewhere. The fixture is not a demo login for the application.

See [Phase 4 verification](docs/phase-4-verification.md), historical [Phase 3 verification](docs/phase-3-verification.md), [Phase 2 verification](docs/phase-2-verification.md) and [Phase 1 verification](docs/verification.md) for results and remaining live checks. [API contracts](docs/api.md), [deployment](docs/deployment.md), and [security](docs/security.md) describe the integration boundaries.

## Repository

```text
apps/web/                 Next.js application and UI/browser tests
apps/api/verbalist/       FastAPI routes, validation, auth, AI and database services
apps/api/tests/           Deterministic backend/adapter tests
packages/shared-types/   Typed frontend API contracts
supabase/                Configuration, migrations and email template examples
tests/                   PostgreSQL/RLS tests and isolated integration fixtures
docs/                    Architecture, contracts, security, deployment and verification
scripts/                 Local Windows launch helper
.github/workflows/       Automated checks
```

The Codex/ChatGPT project container has been deferred at the user's request. All project source and durable instructions are in this checkout; attach this directory when creating **Verbalist** later.
