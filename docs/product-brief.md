# VERBALIST — MASTER CODEX IMPLEMENTATION PROMPT

## ROLE AND OBJECTIVE

You are the lead software architect, full-stack engineer, UI/UX designer, and technical quality engineer responsible for building **Verbalist**, an advanced AI-powered debate, public speaking, and Model United Nations platform.

Build a production-oriented, scalable, secure, responsive full-stack web application.

The platform must support:

- AI-powered debates with text and voice
- Real-time argument analysis
- AI judging and personalized coaching
- Competitive multiplayer debates
- Model United Nations simulations
- Persistent user accounts and cross-device synchronization
- Hybrid AI using local/free models and user-supplied cloud API keys

**Critical instruction:** Plan the complete architecture, but implement the platform in five phases. Begin with Phase 1 only. Do not automatically implement later phases.

Do not build a superficial prototype or a collection of disconnected demos. Implement genuine working functionality, with clear interfaces for future expansion.

---

# 1. PRODUCT IDENTITY

Product name: Verbalist

Positioning: An intelligent debate training and competition platform that combines realistic debate experiences, AI coaching, performance analytics, and structured learning.

Target users:

- Competitive debaters
- Students learning debate
- Model United Nations delegates
- Public speakers
- People seeking to improve reasoning, persuasion, and communication

Design direction:

- Professional, modern, premium appearance
- Blue as the primary accent color
- Light and dark modes
- Clean typography and consistent spacing
- Responsive desktop, tablet, and mobile layouts
- Subtle animations and polished interactions
- Accessible navigation and keyboard support

Use Tailwind CSS and shadcn/ui. Prioritize usability over decorative complexity.

---

# 2. TECHNOLOGY STACK

Frontend:

- Next.js with App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- React Flow for argument visualization
- Recharts for analytics

Backend:

- Python
- FastAPI
- Pydantic for validation
- Modular service architecture
- REST APIs for standard operations
- WebSockets for appropriate real-time functionality

Authentication and persistence:

- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage when necessary
- Row Level Security

Real-time audio:

- Browser microphone APIs
- WebRTC where appropriate
- Streaming transcription architecture
- Speech synthesis architecture
- Graceful browser compatibility fallbacks

AI:

- Provider-independent AI service abstraction
- Local/free model adapters where feasible
- BYOK cloud provider adapters
- OpenAI, Anthropic, Google Gemini, and compatible providers
- Capability-based model selection

Deployment:

- Vercel-compatible frontend
- Independently deployable FastAPI backend
- Environment-based configuration
- Local development support

Use stable, compatible library versions. Avoid unnecessary dependencies and paid infrastructure.

---

# 3. MANDATORY ACCOUNT SYSTEM

Every user must authenticate before accessing Verbalist's functional platform.

There is no guest debate mode.

Implement:

- Email/password registration
- Email verification
- Email/password login
- Google OAuth login
- Password reset
- Logout
- Persistent authenticated sessions
- Protected application routes
- User profiles
- Optional usernames and profile images
- Account settings
- Account deletion
- User data export

Use Supabase Auth as the authentication provider.

Never implement a custom password storage system.

The frontend and backend must securely verify user identity.

Protect private database records with Row Level Security and backend authorization.

Never expose Supabase service-role credentials to the browser.

### Cross-device synchronization

A user's account must synchronize:

- Debate history
- Active debate progress
- Transcripts
- Judge ballots
- Coaching reports
- Performance statistics
- Achievements
- Completed drills
- Personal preferences
- AI provider preferences, excluding secrets

Use PostgreSQL as the authoritative source.

Implement autosaving, recovery from interrupted sessions, and conflict-safe updates.

Use server-generated identifiers, timestamps, and appropriate database constraints.

A user logging in from a different device must be able to access their saved progress.

---

# 4. HYBRID AI SYSTEM

Verbalist must support both:

1. Local/free AI models where technically feasible.
2. Cloud AI models using user-provided API keys.

Implement a modular provider adapter architecture.

Required provider categories:

- OpenAI
- Anthropic
- Google Gemini
- Compatible API providers
- Local model endpoints where feasible

Do not assume every provider supports every capability.

Define capabilities including:

- Text generation
- Streaming responses
- Structured output
- Speech recognition
- Speech synthesis
- Real-time audio
- Context length and availability

The interface must explain unsupported capabilities and offer appropriate alternatives.

### API key security

Cloud AI must use Bring Your Own Key.

Requirements:

- Users supply their own API keys.
- Keys must never be shared between accounts.
- Keys must not be committed to source control.
- Keys must not be logged or included in analytics.
- Keys must not be saved to the application database.
- Keys must not be persisted in localStorage or sessionStorage.
- Keys should be held only for the active authenticated session.
- Sensitive provider requests must use a secure backend proxy where necessary.
- Do not expose credentials through client error messages or WebSocket events.
- Provide a way to clear credentials immediately.

Design an ephemeral, secure server-side credential mechanism that works with the selected hosting architecture.

If the proposed deployment cannot safely support session-only credentials, document the limitation and implement a secure alternative rather than silently persisting keys.

### Local AI

Support practical local inference options, such as compatible locally running model servers and browser-based models where feasible.

Be transparent that:

- Some models require local installation.
- Some models require substantial RAM or compute.
- Browser-based models may not work well on mobile.
- Local AI endpoints may not be reachable from hosted devices.
- Not every feature can be offered entirely free.

Do not pretend that a cloud-hosted free model is running locally.

---

# 5. AI DEBATE ARENA

The Debate Arena is the core product.

Users must be able to:

- Choose a debate motion
- Generate a motion using AI
- Browse a motion library
- Select proposition or opposition
- Choose a debate format
- Select opponent difficulty
- Select an AI opponent persona
- Configure preparation time
- Configure speaking time
- Start, pause where permitted, and finish a debate
- Review transcripts and results
- Save and resume supported sessions

### Supported debate formats

Plan support for:

- Quick Debate
- British Parliamentary
- World Schools
- Public Forum
- Custom Debate

Each format should have configurable:

- Participant roles
- Speaking order
- Preparation periods
- Speaking durations
- Points of Information or cross-examination
- Reply speeches
- Scoring criteria

Use a format configuration system rather than hardcoding every format into unrelated components.

Formal formats should follow their appropriate rules, with configurable variations.

### AI opponent behavior

The AI must:

- Maintain its assigned debate position
- Respond to the user's actual arguments
- Identify relevant clashes
- Present coherent counterarguments
- Ask meaningful cross-examination questions
- Adapt to selected difficulty
- Respect speaking order and time constraints
- Avoid inventing evidence or citations
- Maintain debate context across turns

Difficulty should affect strategic sophistication and argument complexity, not merely response length.

---

# 6. VOICE AND TEXT SYSTEM

Users must be able to choose their preferred input and output methods.

Input modes:

- Text
- Voice

Output modes:

- Text
- Voice
- Both

These preferences should be stored in the user's account.

### Voice features

Implement in Phase 2:

- Microphone permission handling
- Live transcription
- Speech playback
- Speaking indicators
- Audio interruption controls
- Debate timers
- Transcript synchronization
- Audio connection recovery
- Error handling for unsupported browsers
- Fallback to text mode

Use WebRTC where appropriate and WebSockets for real-time events.

Do not introduce a permanently running audio server during Phase 1.

Record and store audio only with explicit user consent.

---

# 7. ARGUMENT INTELLIGENCE ENGINE

Implement in Phase 3.

Analyze debates to identify:

- Main claims
- Supporting evidence
- Reasoning
- Counterarguments
- Rebuttals
- Concessions
- Contradictions
- Unanswered arguments
- Potential logical fallacies

Create structured argument objects with:

- Unique identifier
- Debate session
- Speaker
- Argument type
- Text content
- Transcript references
- Timestamps
- Relationships to other arguments
- Confidence or uncertainty indicators

Build an interactive argument graph using React Flow.

Users should be able to inspect arguments and understand their relationships.

Logical fallacies must be presented as potential findings, with explanations, rather than unquestionable facts.

---

# 8. AI JUDGE AND COACH

Implement in Phase 3.

Evaluate:

- Reasoning
- Evidence
- Argument structure
- Rebuttal quality
- Delivery, when suitable audio evidence exists

Use documented, format-specific rubrics.

The AI judge should produce:

- Scores
- An explained decision
- Strengths
- Weaknesses
- Important debate clashes
- Relevant transcript excerpts
- Actionable improvement suggestions
- Uncertainty notes where necessary

Do not invent speaking-delivery metrics for text-only debates.

Separate judging from coaching.

The coach should:

- Explain how arguments could improve
- Recommend practice drills
- Track repeated weaknesses
- Identify improvement over time
- Provide personalized training suggestions

AI judging is advisory and must not be represented as guaranteed impartial or perfectly accurate.

---

# 9. EVIDENCE VERIFICATION

Plan an evidence-checking subsystem.

It should:

- Identify factual claims
- Retrieve supporting or conflicting sources when a research provider is available
- Display citations
- Distinguish verified, disputed, and unverified claims
- Explain limitations

Never fabricate sources.

Do not classify a claim as false merely because the system cannot verify it.

Research integrations must be optional and should not prevent basic debates from working.

---

# 10. USER DASHBOARD AND ANALYTICS

Create a personalized dashboard.

Display:

- Total completed debates
- Recent debates
- Average evaluation scores
- Practice streaks
- Debate formats practiced
- Strengths and weaknesses
- Skill trends
- Recommended exercises
- Achievements
- Saved sessions

Provide dedicated pages for:

- Dashboard
- Debate Arena
- Debate History
- Progress and Analytics
- Practice
- Settings
- Profile

Additional sections can appear as later phases are completed.

Use real account data.

Do not display invented statistics as though they were actual user performance.

Empty states must be polished and informative.

---

# 11. MULTIPLAYER SYSTEM

Implement in Phase 4.

Features:

- Private debate rooms
- Room invitations
- Human-versus-human debates
- Participant roles
- Synchronized timers
- Live text and voice
- Debate moderation controls
- AI-assisted judging
- Match history
- Competitive rankings
- Leaderboards

Plan tournament support with:

- Tournament creation
- Participants
- Brackets
- Match scheduling
- Results
- Judge ballots

Use secure room authorization and real-time synchronization.

Prevent unauthorized users from accessing private sessions.

Do not use AI judging alone as a basis for high-stakes official rankings without appropriate review mechanisms.

---

# 12. MODEL UNITED NATIONS SIMULATOR

Implement in Phase 5.

Features:

- Country assignments
- Committee selection
- Agenda selection
- AI delegates
- Opening speeches
- Moderated caucuses
- Negotiation practice
- Resolution drafting
- Amendments
- Delegate feedback

AI delegates should:

- Maintain consistent country positions
- Respond to negotiations
- Participate in committee discussions
- Follow configured committee procedures
- Avoid presenting invented country policies as verified facts

Allow users to practice realistic diplomatic speaking and negotiation.

Build the MUN system as a specialized extension of the underlying debate and AI architecture.

---

# 13. DATABASE ARCHITECTURE

Design migrations and typed models for:

Core:

- profiles
- user_preferences
- debate_formats
- debate_sessions
- debate_participants
- debate_turns

Argument intelligence:

- arguments
- argument_links

Evaluation:

- judge_ballots
- feedback_reports

Progress:

- practice_drills
- drill_attempts
- user_progress
- achievements

Multiplayer:

- debate_rooms
- rankings
- tournaments

MUN:

- mun_committees
- mun_delegates
- mun_resolutions

Use appropriate:

- Foreign keys
- Unique constraints
- Indexes
- Timestamps
- Ownership fields
- Row Level Security policies

Create only the tables required for the current implementation phase, while designing schemas for future compatibility.

All migrations must be version-controlled.

---

# 14. SECURITY AND PRIVACY

Implement:

- Secure authentication
- Server-side authorization
- Row Level Security
- Input validation
- Request size limits
- Rate limiting
- Protection against prompt injection
- Secure API key handling
- Safe error responses
- Appropriate CORS policies
- Secret redaction
- Secure WebSocket authentication when implemented
- Account deletion
- User data export
- Recording consent

Debate content and AI responses must be treated as untrusted input.

Never execute AI-generated instructions as privileged server actions.

Avoid storing sensitive data unnecessarily.

Default all debates to private.

Public rankings and multiplayer profile visibility must be controlled by clear user settings.

---

# 15. REPOSITORY STRUCTURE

Use a maintainable monorepo.

Suggested structure:

verbalist/
apps/
web/
api/
packages/
shared-types/
supabase/
migrations/
docs/
tests/
.github/
README.md
.env.example

Adjust the structure when necessary, but keep clear boundaries between frontend, backend, shared contracts, and database migrations.

Provide:

- Environment examples
- Setup instructions
- Development scripts
- Database migration instructions
- Testing commands
- Deployment documentation

Never include real credentials in the repository.

---

# 16. DEVELOPMENT PHASES

## PHASE 1 — FOUNDATION

Implement:

1. Next.js frontend
2. FastAPI backend
3. Supabase integration
4. Mandatory account registration and login
5. Google OAuth
6. Email verification and password reset
7. Protected routes
8. User profiles
9. Cross-device synchronization
10. User dashboard
11. Motion selection and generation
12. Text-based Quick Debate
13. AI opponent with adjustable difficulty
14. Basic turn-based debate flow
15. Hybrid AI provider architecture
16. BYOK configuration
17. Supported local AI configuration
18. Debate autosaving
19. Debate history
20. Basic user preferences
21. Light and dark themes
22. Responsive design
23. Basic account deletion and data export
24. Unit and integration tests

Phase 1 must produce a genuinely usable text-based debate platform.

### Phase 1 acceptance criteria

- A new user can register and verify an account.
- A user can sign in using supported methods.
- Unauthenticated users cannot access protected functionality.
- A user can choose a motion and position.
- A user can configure a supported AI provider.
- A user can complete a text debate with a working AI opponent.
- A user can save and reopen debate history.
- A user can log in on another device and retrieve saved progress.
- One user's private data cannot be accessed by another user.
- API keys are not persistently stored or exposed.
- The application handles missing credentials and provider failures gracefully.
- The UI works on desktop and mobile.
- Automated tests pass.

Do not claim a feature works unless it has been implemented and tested.

## PHASE 2 — REAL-TIME VOICE

Implement:

- Microphone input
- Live transcription
- AI speech output
- User-selectable input/output modes
- Audio playback controls
- Streaming updates
- Timers
- Session recovery
- Browser compatibility handling

## PHASE 3 — INTELLIGENCE AND COACHING

Implement:

- Argument extraction
- Argument graphs
- Logical-fallacy analysis
- Evidence verification
- AI judging
- Detailed coaching
- Practice drills
- Performance analytics
- Achievements

## PHASE 4 — MULTIPLAYER

Implement:

- Private rooms
- Human debates
- Real-time synchronization
- Multiplayer voice and text
- AI ballots
- Rankings
- Leaderboards
- Tournament support

## PHASE 5 — MUN AND ADVANCED FEATURES

Implement:

- MUN committees
- AI delegates
- Country assignments
- Negotiation
- Caucuses
- Resolution drafting
- Amendments
- Advanced debate formats
- Expanded practice tools

---

# 17. TESTING REQUIREMENTS

Use appropriate testing tools for each subsystem.

Frontend:

- Component tests
- User interaction tests
- Authentication flow tests
- Responsive layout verification

Backend:

- Unit tests
- API integration tests
- Authorization tests
- AI adapter tests using mocks
- Database access tests

End-to-end:

- Registration and login
- Debate creation
- Debate completion
- Saving and loading
- Cross-device account persistence
- Unauthorized access rejection

Use mocked AI providers for deterministic automated tests.

Never require real paid API calls for the standard test suite.

Provide linting, formatting, and type-checking commands.

---

# 18. DEVELOPMENT AND COST CONSTRAINTS

Prioritize free and open-source technologies.

Avoid unnecessary paid services.

Do not require a paid AI subscription for local development.

Provide a mock AI adapter for development and automated testing, clearly labeled as non-production.

Explain any functionality that requires:

- Cloud API usage
- Paid infrastructure
- Local model installation
- Specialized hosting
- Browser-specific capabilities

Do not silently introduce paid dependencies.

Design the frontend for Vercel deployment.

Keep the FastAPI backend independently deployable.

---

# 19. CODE QUALITY EXPECTATIONS

Write:

- Modular code
- Reusable components
- Typed interfaces
- Clear API contracts
- Maintainable database migrations
- Accessible UI
- Consistent error handling
- Meaningful tests
- Concise documentation

Avoid:

- Giant monolithic files
- Hardcoded credentials
- Fake production functionality
- Unnecessary abstractions
- Placeholder features presented as complete
- Excessive dependencies
- Repeated code
- Insecure authentication shortcuts

Use appropriate loading states, empty states, error boundaries, and retry behavior.

---

# 20. CODEX EXECUTION INSTRUCTIONS

Follow this sequence:

1. Inspect the existing repository, if any.
2. Summarize the proposed architecture.
3. Identify technical risks and infrastructure constraints.
4. Create a five-phase implementation plan.
5. Define the Phase 1 database schema and API contracts.
6. Set up the repository and development tooling.
7. Implement Phase 1 incrementally.
8. Run tests, linting, and type checking.
9. Fix discovered problems.
10. Document setup and configuration.
11. Summarize completed features and remaining limitations.

Do not proceed to Phase 2 without explicit authorization.

When external credentials or configuration are required, document exactly what is needed and avoid hardcoding secrets.

Do not invent successful test results or claim that external integrations have been verified without testing them.

Keep the application runnable throughout development.

The finished Phase 1 must be a polished, functional foundation for the complete Verbalist platform.

**Begin by planning the architecture and then implement Phase 1.**
