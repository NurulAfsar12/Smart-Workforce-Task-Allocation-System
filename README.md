# Smart Workforce & Task Allocation System

A full-stack workforce management platform with PostgreSQL-driven allocation intelligence, an Express/JWT API and a React/Tailwind frontend.

## Tech stack

| Layer | Technology |
| --- | --- |
| Database | PostgreSQL 17.11 |
| Backend | Node.js v24.18.0, Express, JSON Web Tokens, node-postgres |
| Frontend | React 18, Vite, React Router, Tailwind CSS |
| Tooling | esbuild (in Vite), jsdom (route smoke test) |

## Quick start

### 1. Prerequisites
- PostgreSQL 17 running on `localhost:5432`
- Node.js 24.18+ and npm 11+

### 2. Set up the database
```bash
cd database
psql -h localhost -U postgres -f 00_install.sql
```
This installs enums, tables, indexes, constraints, triggers, functions, views and seed data. Database: `smart_workforce`, user: `postgres`, password: `postgres`.

### 3. Start the API server
```bash
cd server
npm install
npm run start
```
Health check: `GET http://localhost:5000/health` should report `{"status":"ok","database":"connected"}`.

### 4. Start the React client (development)
```bash
cd client
npm install
npm run dev
```
The Vite dev server runs on `http://localhost:5173` and proxies `/api/*` to `http://localhost:5000`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | admin@smartworkforce.com | Password123! |
| EMPLOYEE | tanvirahmed@smartworkforce.com | Password123! |
| EMPLOYEE | ayesha.rahman@smartworkforce.com | Password123! |

Roles: `ADMIN`, `EMPLOYEE`.

## Allocation engine

Allocation is enforced in PostgreSQL via `fn_task_candidates(task_id)` and `fn_allocate_task(task_id)`. See `docs/ERD.md` (Allocation engine section) for weights, hard filters and business rules. `tasks.actual_hours` is synchronised from `work_logs` via triggers.

## Workflow

Tasks move through `PENDING → ASSIGNED → IN_PROGRESS → REVIEW → COMPLETED`, with `ON_HOLD` and `CANCELLED`. Every transition is validated and logged to `task_history`.

## Documentation

- [Project Report](docs/Smart-Workforce-Project-Report.docx) — full written report (29 pages): requirements, database design, allocation algorithm, concurrency strategy, testing and reflection
- [Presentation Deck](docs/Smart-Workforce-Presentation.pptx) — 18 slides covering architecture, the allocation engine, triggers, views and the demo run sheet
- [Entity Relationship Diagram](docs/ERD.md) — auto-generated from the live schema (`server/scripts/generateErd.mjs`)
- [Postman Collection](docs/SmartWorkforce.postman_collection.json) — import into Postman, set `{{baseUrl}}` and `{{token}}` (acquired from the Login request)

## Verification

### API regression tests (62 checks)
```bash
cd server
node scripts/testApi.js
```
Expected: `passed: 62   failed: 0`.

### Session expiry regression (401 interceptor)
```bash
cd client
npm run test:auth
```
Asserts that a valid request keeps the token, that a 401 from a protected endpoint clears it and raises one notification, and that a failed login raises none.

### Production build
```bash
cd client
npm run build
```
Builds static assets into `client/dist/`.

### Route smoke test (live data, DOM render)
```bash
cd client
npm run smoke
```
Mounts all 14 routes against the live API in a real DOM (jsdom), waits for data to settle, and verifies each page renders cleanly (no null dereferences). Requires the API server on port 5000.

## Project layout

| Path | Description |
| --- | --- |
| `database/` | PostgreSQL schema, functions, triggers, views, seed data and master installer |
| `server/` | Express API, controllers, services, routes, validators and test scripts |
| `client/` | React application (Vite + Tailwind), pages, shared UI, hooks and API client |
| `docs/` | ERD, Postman collection and project documentation |
