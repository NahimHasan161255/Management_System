# Japan Higher Study Management System

A local-first application for managing higher-study planning and related information.

## Development foundation

### Requirements

- Windows 10/11
- Node.js 24 LTS or later
- npm 11 or later

### Start locally

```powershell
Copy-Item apps\api\.env.example apps\api\.env
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://127.0.0.1:5173`). The
frontend calls the API through its development proxy; the API listens on
`127.0.0.1:3001` by default.

### PostgreSQL migrations

Install PostgreSQL 14 or later locally, create an empty `hsms_dev` database,
copy `apps\api\.env.example` to `apps\api\.env`, and replace the example
database password with your local PostgreSQL password. Do not commit `.env`.
The API still binds to localhost; PostgreSQL should not be exposed to the LAN.

Apply or roll back one migration from the repository root:

```powershell
npm run migrate:up
npm run migrate:down
```

The initial migration creates users, roles, permissions, role assignments,
role permissions, and hashed-token session storage, and seeds the Admin and
Staff roles with baseline permissions. It does not create student records or
implement login yet. Run rollback only when you intend to remove the tables
introduced by that migration and all data stored in them.

To run checks:

```powershell
npm test
npm run typecheck
npm run build
```

### Current scope and security boundary

This increment provides the React/TypeScript frontend, Express/TypeScript API,
input-validation and centralized error-handling foundations, and a health
endpoint. The API does not yet connect to the database and authentication,
authorization, student data, and LAN access are not implemented. Keep both
development servers bound to localhost; do not expose them to a network.

The approved design is to add PostgreSQL, server-side authorization, secure
document storage, and LAN-only deployment in later increments. Database schema
work will follow the approved Phase 0 proposal.
