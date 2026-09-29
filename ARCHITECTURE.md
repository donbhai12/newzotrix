# ZOTRIX Next.js Architecture

```text
Browser
  |
  | Next.js App Router
  | Existing React operations workspace
  v
Next.js /api/* route handler
  |
  | Express compatibility adapter
  v
Existing Express routes, JWT authorization, audit logging, and Mongoose models
  |
  v
MongoDB / Atlas
```

## Runtime

The repository-root Next.js application serves the existing Zotrix workspace and exposes the API on the same origin. API requests are adapted to the existing Express routers so validation, permissions, audit logging, and response formats are preserved during this migration. Start locally with `npm run dev`; deploy with `npm run build` and `npm start`.

## Database

MongoDB remains the source of truth. No collections, schemas, credentials, or records are renamed or rewritten by this migration.

- `users`: identities, roles, project access, and accounting categories
- `projects`: project portfolio
- `workers`: labour records, wage, and payment details
- `attendances`: one record per worker/date
- `expenses`: financial history with soft-delete fields
- `settings`: company name, logo, categories, and payment modes
- `auditlogs`: create, update, delete, and security events

## Business rules

- An eligible active worker defaults to Present on today's sheet until an explicit attendance record is saved.
- Labour paid is calculated only from expenses where `type === "Labour Payment"` and the expense is linked to a worker.
- Legacy JSON imports retain legacy IDs when possible. Plaintext passwords are not imported; fresh labour credentials are generated.

## Environment

Set `MONGODB_URI`, `JWT_SECRET`, and `SETUP_KEY` in `.env.local` for local development and in the hosting provider for production. The hosting platform supplies `PORT`.
