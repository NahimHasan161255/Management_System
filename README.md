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

To run checks:

```powershell
npm test
npm run typecheck
npm run build
```

### Current scope and security boundary

This increment provides the React/TypeScript frontend, Express/TypeScript API,
input-validation and centralized error-handling foundations, and a health
endpoint. It does not yet include authentication, authorization, a database,
student data, or LAN access. Keep both development servers bound to localhost;
do not expose them to a network.

The approved design is to add PostgreSQL, server-side authorization, secure
document storage, and LAN-only deployment in later increments. Database schema
work will follow the approved Phase 0 proposal.
