# Deployment

Current publishing status: Phases 1–4 are uploaded to the public https://github.com/SidAjmera/Verbalist repository. Phase 5 starts on `phase-5-mun`. The user requested GitHub-only publishing for now. The selected Neon + Clerk migration and Vercel deployment are deferred; current code still uses the verified Supabase adapter. The attempt to create a dedicated Supabase project did not succeed because the free-project limit was reached. Do not claim a hosted database or functioning deployment exists.

The MUN starter adds `20261107131839_phase5_mun_practice.sql`; apply all five migrations only to a deliberately selected compatible database after the chosen identity/database migration is implemented. No remote migration was run. Its owner-filtered tables, drafts and transcripts participate in export/deletion. The SQL currently uses the existing `auth.users`/`auth.uid()` contract; this must be deliberately adapted during the Neon + Clerk migration rather than pointed at Neon unchanged.

The frontend and API deploy independently. No deployment or hosted Supabase configuration was performed during implementation.

## Frontend (Vercel-compatible)

Import the monorepo with the root directory set to `apps/web`, Next.js framework detection, and npm as the package manager. Ensure the build can access the root workspace and `packages/shared-types`. Use the committed root `package-lock.json` with `npm ci`; build the web workspace. Standard `next build`/`next start` also works on other Node hosts.

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_SITE_URL` before building. Public configuration is embedded at build time; redeploy when it changes. The API and frontend origins must be HTTPS in production. Never set `NEXT_PUBLIC_SUPABASE_SECRET_KEY` or publish a service-role key.

Do not statically export the frontend: authenticated server layouts, cookie refresh and callback route handlers require a Next.js server runtime. Authenticated rendering is dynamic and private/no-store; never CDN-cache auth responses or `Set-Cookie` responses.

## API

Build from `apps/api` using its Dockerfile, or install `requirements.lock` under Python 3.13 and launch:

```sh
uvicorn verbalist.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

Configure API-only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ENVIRONMENT=production`, `ENABLE_MOCK_AI=false`, and `WEB_ORIGINS=["https://YOUR_FRONTEND"]`. Configure optional operator-controlled compatible/local endpoints only when available. Local HTTP inference must stay on a trusted network; use TLS for remote inference. Do not expose unauthenticated local inference ports publicly.

The stateless API has no in-process credential vault. Each provider key lives only for the authenticated request; restart and worker routing do not require secret persistence. Multiple workers share rate counters and optimistic versions in PostgreSQL. Configure request timeouts of at least 90 seconds for model inference, a 64 KiB request limit at the edge as defense in depth, TLS and explicit CORS origins. The application enforces actual streamed request bytes too.

Use a region near the Supabase project. Health `/health` proves the process is alive and reports configuration presence; use authenticated smoke checks for database reachability. Turn off request-body/header capture and redact Authorization/X-AI-Key in load balancers, tracing, APM and crash reporting. Debug logging of HTTP client requests is prohibited.

## Database/auth release

Review and apply the versioned migration to the intended dedicated Supabase project. Check RLS/advisors after applying; verify the Auth trigger on a fresh account. Configure production Site URL, allowlisted callbacks, Google consent/client configuration and production SMTP independently of local/test environments. Email confirmation must stay enabled.

Run the live checklist in `docs/verification.md` with disposable test accounts before calling a deployment verified. In particular, test on two browsers/devices, reject cross-account table/API access, confirm export contents, delete an account and reject its previous token. Do not point the mock Auth fixture at production or enable mock AI there.

## Phase 2 transport and speech

Host FastAPI on an ASGI service that supports long-lived WebSockets. Enable WebSocket upgrades, an idle timeout above 30 seconds (heartbeats every 15 seconds), `--ws-max-size 16384`, and exact frontend `WEB_ORIGINS`. Do not put first-frame socket authentication or provider headers in logs. Socket state is ephemeral; reconnection and REST polling recover after worker restarts.

For `/respond/stream`, disable proxy response buffering and compression that delays SSE frames; allow at least 100 seconds end-to-end. A compatible provider may not implement streaming even when its text endpoint works; retain the standard-response option. Validate SSE through the intended deployed proxy before release.

Browser speech needs HTTPS, microphone permission and Web Speech support. The Permissions-Policy permits only the application's own microphone context. Check real browser/OS speech services, autoplay restrictions, device disconnection, online/offline transitions and mobile suspension. Audio files are optional local downloads; no Supabase bucket or audio upload service is needed. Browser speech may still use vendor cloud processing.

Existing Phase 1 sessions remain untimed. Phase 2 changes the default theme to dark while retaining explicit light preferences; its historical evidence is in `docs/phase-2-verification.md`. The Phase 3 release below covers the current migration set and scope.

## Phase 3 release

Phase 3 is now authorized and implemented locally. Apply all three versioned migrations in order, including `20261107072739_phase3_intelligence.sql`; review RLS/grants/functions and run live Supabase advisors before release. No hosted database was changed here. New private analysis, claims/citations, drill, progress and achievement data participate in account export/deletion. The shared drill catalog has no client write grant.

Analysis/coaching and drills use the existing provider configuration and request-scoped BYOK header. They require JSON-following text models; native structured-output support is not falsely advertised. Full review can use up to 6,500 output tokens and a 75-second provider timeout; output, fields, references and write sizes are bounded. Preserve at least a 100-second request timeout at the proxy. Research uses an optional OpenAI native web-search request, requires explicit consent and model/key access, and has a 90-second total deadline. No additional provider resource was provisioned. Costs remain with the user's selected provider account.

Check the new flow with real provider/model access: saved turn → versioned argument map → final advisory ballot → coaching → drill → progress. Test malformed JSON, nonexistent transcript quotations, concurrent updates and uncertain retries. Review model quality, citation relevance, bias and rubric explanations with human judgment; wire/fixture tests do not prove evaluative validity. The graph and chart load as separate client bundles and have text/table alternatives.

See `docs/phase-3-verification.md` for that historical checkpoint and `docs/phase-4-verification.md` for current local evidence. Phase 4 is authorized and implemented locally. Phase 5 requires authorization. No deployment, project container or paid account was created.

## Phase 4 release and relay setup

Apply all four reviewed migrations, ending with `20261107083107_phase4_multiplayer.sql`. The API and Next frontend must be released together. The API host must support long-lived ASGI WebSockets; an ordinary request-only serverless endpoint is insufficient. Set exact HTTPS `WEB_ORIGINS` and allow WSS upgrades through the reverse proxy. Redact authentication frames, Authorization/X-AI-Key headers, invitation bodies, SDP and ICE candidates from logs/APM. Membership is checked on every one-second tick and signaling write, identity every 30 seconds. One live text/audio connection per account per room replaces that account's previous tab; microphone sharing needs a new explicit join after connection loss or tab suspension. Polling still refreshes shared text if live updates cannot connect.

No third-party relay was provisioned. For internet audio, operate coturn or another TURN REST-compatible server. Configure its shared-secret authentication (`use-auth-secret`, `static-auth-secret`, fixed realm), reachable UDP/TCP/TLS listener and relay-port ranges, valid TLS certificates for `turns:`, firewall rules, bandwidth/abuse limits and monitoring. Configure backend-only JSON `TURN_URLS`, e.g. `["turns:relay.example.com:5349?transport=tcp","turn:relay.example.com:3478?transport=udp"]`, and the matching `TURN_SHARED_SECRET`. Optional `STUN_URLS` is another JSON array. The room-authorized ICE route signs a ten-minute `expiry:user-id` username with Base64 HMAC-SHA1. Neither the shared secret nor privileged Supabase key enters the frontend. Clients fetch new credentials on audio join; leave/rejoin to obtain fresh credentials after a long interruption. Rotate operator secrets with a planned call restart.

`RTC_RELAY_ONLY=true` requires TURN and avoids direct peer connectivity, at the cost of relay bandwidth. Default false permits direct ICE and peer IP exposure; this is disclosed before joining. Empty ICE arrays can work between local browser contexts but do not establish public-network reliability. Test two physical devices on different networks, forced relay candidate selection, UDP-blocked/TLS fallback, denied/revoked microphone permission, real playback/autoplay, tab suspension and rejoin before publishing a live-voice claim. Encrypted WebRTC audio is not uploaded, transcribed by the server or retained in Supabase. Participants can still independently record a call. Browser dictation is a separate vendor-processed opt-in.

Signaling expires from reads after 60 seconds. Live ticks physically prune expired mailbox rows; idle databases do not guarantee immediate physical deletion. If stricter at-rest retention is required, install and verify an operator-scheduled cleanup. Presence is considered offline after 15 seconds and is overwritten on reconnect. No general chat or file transfer is accepted in the signaling protocol.

Before release, check real Supabase function grants/RLS, token replacement, inactive membership revocation, invitations under concurrent joins, private draft separation, export, deletion and result/bracket transactions. Independent judges are role-authorized accounts, not verified professional officials. The opt-in leaderboard is a transparent practice points table; it has no anti-collusion, identity verification, Swiss pairing or official rating system. Cancelled tournament matches require cancelling/recreating the small event. Account deletion intentionally removes containing shared rooms/tournaments and linked credits; the profile screen discloses the effect on other members.
