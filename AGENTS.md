# Verbalist project instructions

This checkout contains Verbalist, a private debate training platform. The directory is historically named Vocalist; the product name is **Verbalist**.

- Phases 1–4 are authorized. Phase 5 requires explicit user authorization.
- Read `docs/architecture.md`, `docs/api.md`, and `README.md` before architectural changes.
- Keep Next.js frontend, FastAPI backend, shared contracts and SQL migrations separate.
- Every functional page/API requires verified Supabase authentication. No guest or mock-auth production fallback.
- All user data is private and protected by RLS. Never use a secret/service-role key for ordinary user queries.
- AI keys are request-scoped and held in browser memory only. Never persist or log them.
- Do not invent account statistics, judging, evidence or test results.
- Use mocked AI in standard tests. Live external checks must be reported separately.
- Keep project plans, decisions, contracts, setup, test evidence and limitations in this checkout.
