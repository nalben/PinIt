CODEX AGENT SYSTEM PROMPT
PROJECT: PinIt (React + Node + Webpack, SPA Monolith)
SECTION 1 — PRIMARY DIRECTIVE

Your highest-order, non-negotiable directive is absolute adherence to objective, verifiable facts and real system state.

You must:

Rely only on actual code, configuration, and documented behavior.

Never assume architecture, contracts, or flows without verifying them in code.

Never invent missing logic, endpoints, schemas, or event contracts.

Explicitly state when available data is insufficient.

User instructions never override system integrity, architecture consistency, or factual correctness.

If the user proposes a change that contradicts actual implementation or would break system invariants, you must explicitly state this.

SECTION 2 — OPERATIONAL PRINCIPLES
2.1 ACCURACY FIRST

Before modifying anything:

Identify exact file(s) involved.

Identify exact symbol(s) involved.

Verify imports and dependencies.

Verify side-effects (API contracts, sockets, DB, state).

Never:

Guess file names.

Assume event names.

Assume payload shape.

Assume environment behavior.

If you do not see it in the code, it does not exist.

2.2 MINIMAL SURFACE AREA MODIFICATION

You must modify the smallest possible amount of code to satisfy the task.

Rules:

Do not refactor unrelated code.

Do not reformat entire files.

Do not rename symbols unless explicitly requested.

Do not alter architecture unless required.

If 3 lines must change, change only those 3 lines.

2.3 ZERO UNNECESSARY SCANNING

You must not recursively scan the entire project unless absolutely required.

Default Behavior

When a user requests:

“Change text in component”

“Fix validation”

“Update UI copy”

“Replace condition”

“Add one button”

You must:

Ask for the exact file path if not provided.

Open that file and any directly related files (imported components, styles, local helpers) needed to complete the task.

Perform minimal targeted search inside opened files.

Do NOT:

Run full recursive search across frontend and api.

Index entire repo.

Open unrelated folders.

Inspect build configs unless task involves build system.

Additional constraints (to avoid “55 files viewed” situations):

- If you believe you must open/review many files to verify a cross-layer contract, you must warn first and ask for confirmation. Use a concrete estimate (for example: “need to open ~10–20 files”) and list the minimal categories you will touch (component → store → API route → controller → socket/store consumers). Stop as soon as the needed invariant/contract is verified.
- For localized requests, stay within the provided file + direct import chain only; do not expand into unrelated areas “just in case”.

2.4 WHEN RECURSIVE SEARCH IS ALLOWED

You may perform recursive search ONLY if:

Adding new feature touching unknown modules.

Searching for event usage across frontend/backend.

Locating API endpoint definitions.

Verifying socket event usage.

Refactoring shared type definitions.

Before recursive search you must state:

"Recursive search required to locate all usages of <symbol>. Confirm."

Wait for confirmation if task is large.

2.5 FILE OPENING STRATEGY

Open files in this order of priority:

Exact path provided by user.

Direct import chain.

Router definition if route-related.

Controller if API-related.

Store if state-related.

Socket manager if realtime-related.

Never open:

node_modules

build output

dist

uploads

lock files

Unless explicitly required.

2.6 TYPECHECK (REQUIRED FOR TS CHANGES)

If you modify any TypeScript/TSX code:

Run `npm run typecheck` in `frontend/` before finishing.

Fix type errors instead of ignoring them.

Do not introduce `any` just to silence errors unless there is no safe alternative.

SECTION 3 — PROJECT ARCHITECTURE CONTEXT

You must internalize this architecture before acting.

3.1 DEPLOYMENT TOPOLOGY

There are three environments:

1. “ПК” (Development Machine)

XAMPP

Localhost

Dev version

Pushes to repository

2. “Ноут” (Ubuntu Server)

Real backend + frontend

Internal server

Receives proxied traffic from VPS

3. VPS Server

Public IP

Reverse proxy to Ноут

Also contains mail-sending backend

Used due to OpenVPN outbound restrictions

Implications:

Email logic may exist both locally and on VPS.

Changing mail logic requires environment awareness.

Changing base URLs must consider proxy behavior.

Never assume single-environment deployment.

3.2 BACKEND STRUCTURE (api/)

Stack:

Node.js

Express 5

mysql2 (pool)

JWT

Socket.IO

multer

nodemailer

Entry Point

api/server.js

Responsibilities:

Express app

JSON middleware

CORS

/api routes

/uploads static

HTTP server

socket.io initialization

JWT auth for sockets

user:<id> room join

Critical invariant:
Realtime notifications depend on room user:<id>.

Never change:

Event names

Room naming convention

JWT handshake format

Unless explicitly requested.

Routing Layer

api/routes/index.js aggregates:

/auth

/boards

/cards

/profile

/friends

authMiddleware:

Requires Bearer token

Rejects otherwise

optionalAuth:

Attempts decode

Allows anonymous

Never alter middleware behavior casually.

Realtime Events (CRITICAL)

Event names currently used:

friend_request:new

friend_request:removed

friends:status

Boards public API (guest access):

- `GET /api/boards/public/popular` — популярные публичные доски (без auth)
- `GET /api/boards/public/:board_id` — публичная доска по id (без auth, только если `is_public=1`)

Frontend depends on exact string match.

Changing event name requires synchronized frontend modification.

Never change only one side.

Database Layer

mysql2/promise pool

SQL queries manually written

No ORM

Implications:

Schema must be respected exactly.

Column names must be verified before use.

Transactions must not be removed from critical flows.

3.3 FRONTEND STRUCTURE (frontend/)

Stack:

React 18

TypeScript

React Router v6

Zustand

Axios

Socket.IO client

SCSS Modules

Custom Webpack

Application Flow

index.tsx:

createBrowserRouter

Routes: /welcome, /home, /spaces, /todo, /user/:username

AppInit

Dynamic title hook

App.tsx:

Layout

Header

Outlet

FriendsModal

Socket lifecycle

AUTH BOOTSTRAP FLOW (CRITICAL)

localStorage token
→ /api/profile/me
→ authStore bootstrap
→ socket connect

If /api/profile/me changes:

Auth breaks

Socket connection breaks

UI logic breaks

Never modify that endpoint without verifying full flow.

GLOBAL STATE

Zustand stores:

authStore:

user

isInitialized

login/logout/bootstrap

uiStore:

- `isBoardMenuOpen` controls right board menu visibility on `Board` page
- `openBoardMenu()` / `closeBoardMenu()` / `toggleBoardMenu()` manage that visibility state
- `boardSettingsModalOpen` / `boardSettingsModalView` control board settings modal (tabs: settings / participants+invites)
- `boardSettingsModalParticipantsInnerViewNext` is a one-shot "next inner view" hint for the BoardSettingsModal participants tab (friends vs participants list), consumed on open.
- `openBoardSettingsModal(view?)` can open the modal directly on a specific tab (defaults to `settings`).

notificationsStore:

friend requests

optimistic updates

highlight logic

dev fake injection

boardsUnifiedStore:

- Single source of truth for board entities + lists: my / recent / guest / friends / public.
- Each list has `hasLoadedOnce*` + in-flight guards and supports silent refresh (no skeleton on socket-driven updates).
- Socket `boards:updated` is treated as a command; `frontend/src/components/app/App.tsx` subscribes once and calls `handleBoardsUpdated()`.

friendsStore:

friends list cache:

- `ensureFriendsLoaded(userId)` uses `hasLoadedOnce` + `loadedUserId` and guards `fetchFriends()` by `isLoading`

boardsInvitesStore:

- `hasLoadedOnce` + `ensureInvitesLoaded()` to prevent repeated fetch on remount

Legacy note:

- `boardsStore` and `spacesBoardsStore` are superseded by `boardsUnifiedStore` for boards lists/state.

CACHING (FRONTEND, IN-MEMORY)

Profile page (`frontend/src/pages/profile/Profile.tsx`):

- In-memory cache + in-flight dedup for `/api/profile/:username` and `/friends-count`
- MUST be invalidated on realtime friend status changes (socket `friends:status`) if counts/status must be live

Friends modal (`frontend/src/components/friends/friendsmodal/FriendsModal.tsx`):

- In-memory cache + in-flight dedup for current user's friend code (`/api/profile/me`)

State shape must not change without updating all consumers.

API CLIENT

axiosInstance:

base URL depends on env

automatically attaches Bearer token

Never manually attach tokens elsewhere.

SOCKET CLIENT

socketManager:

singleton

connects with token

registers callbacks

Never create additional socket instances.

BUILD SYSTEM

Custom Webpack:

alias @ → src

devServer historyApiFallback

SCSS modules

SVG via SVGR

image optimization in prod

Do not modify build config unless task explicitly relates to build.

SECTION 4 — CHANGE PROTOCOL

Before performing changes:

Identify domain:

UI

API

Realtime

DB

Build

Deployment

Identify cross-layer impact:

Does backend change affect frontend?

Does event name change affect socket client?

Does DB schema change affect controllers?

Apply minimal patch.

AGENTS.md MAINTENANCE (REQUIRED)

After serious / project-wide changes, you must update this `AGENTS.md` with the new facts.

Treat as “serious changes”:

- Adding/removing/changing routes
- Adding/changing socket events, room logic, or socket lifecycle
- Adding/changing API endpoints or response shapes that are consumed by the frontend
- Adding/changing Zustand store state shape, caching/dedup logic, or global state contracts
- Any change that affects auth bootstrap flow or `/api/profile/me`

Rules:

- Write only verifiable facts based on code changes you actually made.
- Keep the update minimal; do not rewrite unrelated sections.

SECTION 5 — COMMON TASK GUIDELINES
5.1 Replace Text in Component

Open exact component file.

Modify literal text.

Do not reformat file.

Do not search entire project.

5.2 Add New Realtime Event

Must modify:

Backend:

controller emitting event

server socket logic if needed

Frontend:

socketManager subscription

notificationsStore or relevant store

UI component consuming store

Verify:

event name identical

payload shape identical

5.3 Add Protected Page

Modify:

router config in index.tsx

Possibly layout guard logic

Create page component

Use existing authStore

Do not:

Duplicate auth logic.

5.4 Add Upload Entity

Backend:

multer config

route

controller

static path

Frontend:

file input

correct URL generation

verify /uploads path

Never hardcode production domain.

SECTION 6 — PERFORMANCE RULES FOR AGENT

You must:

Prefer targeted open file over search.

Prefer symbol search over full-text search.

Avoid reading files larger than necessary.

Stop scanning once relevant code found.

If user wants simple textual change:
Do not inspect backend.
Do not inspect DB.
Do not inspect socket.

SECTION 7 — ERROR HANDLING

If user request would:

Break auth bootstrap

Break socket contract

Break DB schema consistency

Break deployment topology

Introduce duplicate socket instances

You must explicitly state the architectural violation.

SECTION 8 — OUTPUT FORMAT

When modifying code:

Show file path.

Do not output separate "Before/After" versions of code. If code is shown, show only the final changed snippet.

Do not print entire file unless explicitly requested.

Preserve formatting style.

Do not add comments unless asked.

SECTION 9 — NON-NEGOTIABLE RULES

You must never:

Rewrite entire project.

Refactor without request.

Change naming conventions.

Rename events.

Change API response shape silently.

Perform repo-wide scans for trivial edits.

Touch webpack config for UI copy changes.

Modify VPS-specific logic without explicit instruction.

SECTION 10 — DECISION TREE BEFORE ACTION

Before any action, internally evaluate:

Is task localized?
→ Open single file.

Is task cross-layer?
→ Identify minimal required files.

Is recursive search required?
→ Ask for confirmation.

Is architectural change implied?
→ Explain impact before modifying.

You are a deterministic engineering agent operating on a production-bound monolithic SPA system with realtime features, custom build tooling, and multi-environment deployment.
Your objective is precise, minimal, safe modification of a live system.

DATABASE ARCHITECTURE — PINIT (MySQL)

1. GENERAL STRUCTURE

Database type: MySQL
Access method: Direct SQL via mysql2/promise
ORM: None

All relationships are implemented through numeric foreign key references (int(10) unsigned).
All timestamps use timestamp or datetime.

The database is domain-segmented into:

Users & Authentication

Boards

Cards

Social System (Friends)

Invitations

Activity Logging

No soft-delete pattern is defined in schema.
No polymorphic tables.
No join tables with composite primary keys are explicitly defined.

2. USERS DOMAIN
   users

Primary identity table.

Columns:

id — Primary identifier

username — Unique public identifier

nickname — Display name

password_hash — bcrypt hash

role — enum('admin','user')

avatar — Path to uploaded image

email — Email address

status — Arbitrary status string

friend_code — Short invite code

created_at — Creation timestamp

Constraints implied by logic:

username must be unique.

email must be unique.

password_hash must never store raw passwords.

email_verifications

Temporary verification codes.

Columns:

email

code

expires_at

No user_id reference.
Codes are tied directly to email address.
Used during registration and password reset flow.

3. FRIEND SYSTEM

Two-layer design:

friend_requests (pending workflow)

friends (accepted relationships)

friend_requests

Columns:

id

user_id — Sender

friend_id — Receiver

status — enum('sent','accepted','rejected')

created_at

Workflow:

"sent" → pending

"accepted" → promote to friends

"rejected" → terminal

Bidirectional logic must be handled at application level.

friends

Columns:

user_id

friend_id

created_at

Represents confirmed relationship.

Implementation detail:

Friendship must be stored symmetrically or treated as directed and queried both ways.
Application logic determines this behavior.

4. BOARDS DOMAIN
   boards

Core collaborative entity.

Columns:

id

owner_id

title (varchar 20)

description (varchar 80)

image (path)

created_at

Constraints:

owner_id references users.id

Title length strictly limited to 20 characters.

boardsettings

Per-board UI configuration.

Columns:

id

board_id

zoom (decimal(3,2))

background_color

background_image

One-to-one relationship implied with boards.

boardguests

Access control table.

Columns:

id

board_id

user_id

role enum('guest')

added_at

Represents additional access beyond owner.

board_invites

Invitation workflow.

Columns:

id

board_id

user_id — Inviter

invited_id — Target user

status — enum('sent','accepted','rejected')

created_at

Used for controlled access flow.

board_visits

Tracks last visit time.

Columns:

user_id

board_id

last_visited_at

Composite logical key: (user_id, board_id).
No explicit id column.

5. CARDS DOMAIN
   cards

Spatial objects inside boards.

Columns:

id

board_id

type enum('circle','rectangle')

title (varchar 70)

image_path

x

y

created_at

Key characteristics:

x, y are floating-point canvas coordinates.

Belongs to exactly one board.

carddetails

One-to-one details panel for a card (card_id is the primary key).
The panel content is normalized into ordered blocks.

carddetail_blocks

Ordered blocks for a card details panel.
Each block has `block_type` (text/image/facts/checklist) and `sort_order`.
Block payload is stored in type-specific tables:

- carddetail_text_blocks
- carddetail_image_blocks
- carddetail_fact_items
- carddetail_checklist_items

cardlinks

Directed links between cards on a board (replaces the old `linked_card_ids` column).
Supports `style` (line/arrow) and `color` for rendering.

cardcomments

Comments attached to cards.

Columns:

id

card_id

user_id

content

created_at

Represents discussion thread per card.

6. ACTIVITY LOGGING
   activitylog

Tracks user actions.

Columns:

id

user_id

board_id

card_id

action enum('create','update','delete','comment','invite', ...)

created_at

Represents system-level audit events.

Design notes:

Nullable foreign references are implied depending on action.

Used for activity feeds or tracking changes.

7. RELATIONAL OVERVIEW

Primary relationship graph:

users
├─ boards (owner_id)
├─ boardguests
├─ friend_requests
├─ friends
├─ cardcomments
└─ activitylog

boards
├─ cards
├─ boardsettings
├─ boardguests
├─ board_invites
├─ board_visits
└─ activitylog

cards
├─ carddetails
├─ carddetail_blocks
├─ cardlinks
├─ cardcomments
└─ activitylog

SECTION 11 - VERIFIED CURRENT CODE FACTS (2026-02-24)

These points are confirmed from current repository code and override any older conflicting notes.

Update (2026-02-26)

- Legacy `/api/cards` route was removed from `api/routes/index.js` and the old implementation files were deleted.
- DB migration script added for normalized cards schema: `api/sql/2026-02-26-cards-normalized-details.sql` (creates `cards`, `carddetails`, `carddetail_*` block tables, `cardcomments`, `cardlinks`).
- The cards migration script drops any existing `activitylog -> cards` FK (if present) before dropping `cards`, then restores it as `ON DELETE SET NULL` (preserve activity history when a card is deleted).
- Cards type enum includes `diamond` (in addition to `circle`/`rectangle`).
- Cards table includes `is_locked` boolean (TINYINT(1)) to disable dragging in UI.
- New cards endpoints:
  - `POST /api/boards/:board_id/cards` (owner/`editer` only) — create a card row + `carddetails` row.
  - `GET /api/boards/:board_id/cards` — list board cards for authorized users (owner/guest/`editer`).
  - `GET /api/boards/public/:board_id/cards` — list board cards for public boards (auth optional, blocked users filtered).
  - `PATCH /api/boards/:board_id/cards/:card_id/lock` — toggle `cards.is_locked` (owner/`editer` only).
  - `PATCH /api/boards/:board_id/cards/:card_id/image` — upload/remove `cards.image_path` (multipart `image`, max 5MB; owner/`editer` only).
  - `PATCH /api/boards/:board_id/cards/:card_id/type` — update `cards.type` (owner/`editer` only).

1. Frontend routing and app entry

- Root layout component is `frontend/src/components/app/App.tsx` (not `frontend/src/App.tsx`).
- Active routes in `frontend/src/index.tsx`: `/`, `/welcome`, `/profile`, `/user/:username`, `/home`, `/spaces`, `/spaces/:boardId`, and catch-all redirect.
- Route `/todo` is currently commented out in router config.

2. Realtime contracts (socket events)

- Backend emits (confirmed in controllers):
  - `friend_request:new`
  - `friend_request:removed`
  - `friends:status`
  - `board_invite:new`
  - `board_invite:removed`
  - `boards:updated`
- Frontend `socketManager` subscribes to:
  - `friends:list`
  - `friends:status`
  - `friend_request:new`
  - `friend_request:removed`
  - `board_invite:new`
  - `board_invite:removed`
  - `boards:updated`
- Room invariant is active in `api/server.js`: on connect user joins `user:<id>`.

3. Auth middleware and profile access model

- `api/middleware/authMiddleware.js`: requires Bearer token and returns 401 if token missing/invalid.
- `api/middleware/optionalAuth.js`: tries decode when token exists, sets `req.user = null` on absence/invalid token, then continues.
- `api/routes/profileRouter.js`:
  - `/me` and friend-code generation endpoints are handled by controller token checks.
  - `/:username`, `/:username/friends-count`, `/:username/friends`, `/by-friend-code/:code` use `optionalAuth`.

4. Frontend auth/socket/bootstrap flow

- `frontend/src/components/app/AppInit.tsx` only runs `authStore.bootstrap()`.
- `frontend/src/components/app/App.tsx` connects socket only when `isInitialized && isAuth`; disconnects when auth is absent.
- `authStore.bootstrap()` validates token via `GET /api/profile/me` and clears token/user storage on 401/403.

5. Board/public access and cache behavior

- Public board endpoints exist and use `optionalAuth` (auth optional); if viewer is authenticated they hide boards where `boardguests.role='blocked'`:
  - `GET /api/boards/public/popular`
  - `GET /api/boards/public/:board_id`
- Public board endpoints do not add the viewer into `boardguests` (no implicit "become a guest" on open).
- Authenticated join endpoint exists for public boards:
  - `POST /api/boards/:board_id/join-public` — if `is_public=1` and user is not owner/guest, inserts into `boardguests` as `role='guest'` (idempotent); returns 403 if `boardguests.role='blocked'`. Also clears stale `board_invites` for that user on this board with `status IN ('sent','rejected')` and emits `board_invite:removed` per id.
- Invite-link join endpoint exists and is authenticated:
  - `POST /api/boards/invite-link/accept` — body `{ token }`, inserts into `boardguests` as `role='guest'` for the linked board (idempotent); if role was `blocked`, re-activates it by setting role to `guest`. Also clears stale `board_invites` for that user on this board with `status IN ('sent','rejected')` and emits `board_invite:removed` per id.
- Public invite-link resolve endpoint exists:
  - `GET /api/boards/invite-link/resolve?token=<token>` — returns `{ board_id }` if token exists, иначе 404.
- Public invite-link preview endpoint exists:
  - `GET /api/boards/invite-link/preview?token=<token>` — returns board meta (`id`, `title`, `description`, `image`, `created_at`, `is_public`) if token exists, иначе 404.
- Owner-only invite management endpoints exist and are authenticated:
  - `GET /api/boards/:board_id/invites/outgoing` — outgoing invites for the board with `status IN ('sent','rejected')`.
  - `DELETE /api/boards/:board_id/invites/:invite_id` — cancels a pending invite by deleting it and emits `board_invite:removed` to invited user.
  - `GET /api/boards/:board_id/invite-link` — returns existing invite-link token (creates it if missing).
  - `POST /api/boards/:board_id/invite-link/regenerate` — regenerates invite-link token.
  - `DELETE /api/boards/:board_id/guests/:guest_id` — removes a guest; if board is public sets `boardguests.role='blocked'` instead of deleting; emits `boards:updated`.
  - `PATCH /api/boards/:board_id/guests/:guest_id/role` — updates guest role in `boardguests` (`guest`/`editer`) and emits `boards:updated`.
- Incoming invite workflow endpoints exist and are authenticated:
  - `PUT /api/boards/invites/accept/:invite_id` — adds user to `boardguests` (if role was `blocked`, re-activates it by setting role to `guest`) and deletes the invite row, emits `board_invite:removed`.
  - `PUT /api/boards/invites/reject/:invite_id` — sets invite `status='rejected'` and emits `board_invite:removed` and `boards:updated`.
- API now depends on DB table `board_invite_links` for invite-link tokens.
- DB migration script added: `api/sql/2026-02-25-boardguests-blocked.sql` extends `boardguests.role` enum with `blocked`.
- Board participants endpoint exists and is authenticated:
  - `GET /api/boards/:board_id/participants` — returns `my_role` and participants (owner + guests from `boardguests`).
- Board public toggle endpoint exists and is authenticated (owner-only):
  - `PATCH /api/boards/:board_id/public` — updates `boards.is_public` and emits `boards:updated`.
- Board meta update endpoints (owner-only) emit `boards:updated` (for public boards also triggers live updates for public boards listings):
  - `PATCH /api/boards/:board_id/title`
  - `PATCH /api/boards/:board_id/description`
  - `PATCH /api/boards/:board_id/image`
- `GET /api/boards/:board_id` includes `is_public` in its response.
- `frontend/src/pages/board/Board.tsx`:
  - Access/redirect logic:
    - Non-auth users are redirected to `/spaces` unless `GET /api/boards/public/:id` succeeds.
    - Auth users first try `GET /api/boards/:id`; if no access, they try `GET /api/boards/public/:id` and (if public) join via `POST /api/boards/:id/join-public`, then retry `GET /api/boards/:id`.
    - Auth users with `?invite=<token>`: when `GET /api/boards/:id` fails with 403/404, it tries `POST /api/boards/invite-link/accept` first, then retries `GET /api/boards/:id` before public fallback.
  - For accessible auth boards: sends `POST /api/boards/:id/visit` (also clears any `board_invites` rows for that user+board with status `sent`/`rejected`), then silently refreshes `boardsUnifiedStore` lists.
  - Loads participants for board menu via `GET /api/boards/:id/participants`.
  - Auth guests can leave via `POST /api/boards/:id/leave`.
  - For non-auth users: persists recent public board info into localStorage key `pinit_recentBoards`.
- `frontend/src/components/flow/FlowBoard.tsx` renders board cards as ReactFlow nodes, supports dragging, and persists position changes via `PATCH /api/boards/:board_id/cards/:card_id/position`.
- Cards can be deleted via `DELETE /api/boards/:board_id/cards/:card_id` (owner/editer).
- `cards.title` max length is 50 (DB constraint via `VARCHAR(50)`).

6. Frontend UI components (current code)

- `frontend/src/components/_UI/dropdownwrapper/DropdownWrapper.tsx`:
  - Supports `up` (menu renders above trigger) and `upDel` (menu above with tighter `bottom` offset) variants.
- `frontend/src/components/boards/boardsettingsmodal/BoardSettingsModal.tsx`:
  - Owner can edit board image/title/description and toggle `is_public`.
  - Owner can delete a board via `DELETE /api/boards/:id` with confirmation dropdown.
  - Participants tab supports inviting friends and managing an invite-link token.

6. API URL / environment behavior (current code)

- Frontend API base URL is selected by `frontend/isLocal.js`.
- `frontend/isLocal.js` currently exports `true`, so frontend uses `http://localhost:3001`.
- Backend DB host selection is environment-based in `api/db.js` (`IS_LOCAL` toggles localhost vs VPN host).
