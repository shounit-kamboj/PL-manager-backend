# Collar PL API

REST API behind [Collar PL](https://www.collarpl.com), a platform that helps powerlifting coaches run their coaching business: athletes, payments, training blocks and competitions in one place.

[Live app](https://www.collarpl.com) · [Frontend repository](https://github.com/shounit-kamboj/PL-manager-frontend)

## Features

- **Athlete management** with server-side search, sorting, pagination and filters by status, age class, federation and qualification level
- **Payments** with paid, unpaid and overdue tracking, and automatic renewal on each athlete's billing cycle
- **Training blocks** with update reminders and optional automatic renewal when a block ends
- **Meet entries** against a shared calendar of federation competitions, plus coach-created custom competitions
- **Dashboard** with revenue, retention, overdue payments and upcoming meets, computed in a single batched round trip
- **Authentication** with email verification, password reset and cookie-based sessions

## Architecture

| Layer | Technology |
| --- | --- |
| Runtime | Node.js, Express 5, TypeScript |
| Database | PostgreSQL on Neon (serverless) |
| ORM | Drizzle ORM |
| Auth | Better Auth |
| Email | Resend |
| Security | Arcjet rate limiting and bot protection |
| Hosting | Railway: API service plus a scheduled jobs service |

## Engineering notes

- **Multi-tenant by design.** Every query is scoped to the signed-in coach, and the session is checked on every `/api` request.
- **Timezone-correct dates.** Requests carry the coach's local date, and scheduled jobs compute dates in `America/Vancouver`, so "today" never drifts to the server's UTC date.
- **Idempotent scheduled jobs.** A nightly service marks overdue payments and renews payments and training blocks. Each renewal swaps the old record for the new one in a single atomic batch, and re-running a job changes nothing.
- **Soft deletes.** Records are flagged as deleted instead of removed, so history is preserved and mistakes can be reversed.
- **Data integrity in the database.** Foreign keys enforce ownership, and partial unique indexes guarantee one current payment and one current training block per athlete.

## API

All routes are under `/api` and require an authenticated session, except `/api/auth`.

| Route | Resource |
| --- | --- |
| `/api/auth/*` | Sign-up, sign-in, email verification, password reset |
| `/api/athletes` | Athletes |
| `/api/athlete-competitions` | Meet entries |
| `/api/competitions` | Competitions |
| `/api/payments` | Payments |
| `/api/training-blocks` | Training blocks |
| `/api/dashboard` | Dashboard metrics |

## Project structure

```
src/
├── index.ts         Server, middleware and route registration
├── routes/          One router per resource
├── jobs/            Scheduled jobs (overdue payments, renewals)
├── middleware/      Session guard, rate limiting
├── lib/             Auth configuration, date utilities
└── db/              Drizzle client and schema
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start the compiled server |
| `npm test` | Run the test suite (Vitest) |