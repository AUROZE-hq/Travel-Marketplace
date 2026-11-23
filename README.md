# Sri Lanka Travel Marketplace

A TypeScript monorepo foundation for the Sri Lanka Travel Marketplace. This repository currently contains only development infrastructure and a minimal application shell; marketplace business features will be added from the approved SRS in a later phase.

## Technology stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui configuration, React Router, Axios
- Backend: Node.js LTS, Express, TypeScript, Prisma, Zod, Helmet, CORS
- Database: PostgreSQL via Docker Compose
- Tooling: npm workspaces, ESLint, Prettier, Docker

## Prerequisites

- Node.js 20+ and npm 10+
- Docker Desktop or Docker Engine with Compose

## Project structure

`frontend/` contains the Vite React application. `backend/` contains the layered Express API and Prisma schema. `docker-compose.yml` runs only the local PostgreSQL service, allowing frontend and backend development servers to run directly with npm.

## Installation

```bash
npm install
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

The example backend credentials match the local Docker defaults. Change them together in `backend/.env` and your Docker environment if needed. Never commit `.env` files.

## PostgreSQL and Prisma

Start PostgreSQL:

```bash
npm run db:up
```

Apply migrations, seed and validate (details, constraints warning and test setup in
[backend/README.md](backend/README.md)):

```bash
npm run db:migrate --workspace backend
npm run db:seed --workspace backend
npm run prisma:validate
```

Never use `prisma db push` against a shared database — several constraints exist only in migrations.

Stop PostgreSQL:

```bash
npm run db:down
```

## Start the applications

In separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The frontend is available at `http://localhost:5173`; the API is available at `http://localhost:5000`.

## API checks

```bash
curl http://localhost:5000/api/v1/health
curl http://localhost:5000/api/v1/ready
```

Health returns the API status. Readiness runs `SELECT 1` through Prisma and returns a service-unavailable response when the database cannot be reached.

## Common commands

```bash
npm run build
npm run lint
npm run typecheck
npm run --workspace backend test
```

The frontend uses the `VITE_API_BASE_URL` variable. The backend validates `NODE_ENV`, `PORT`, `DATABASE_URL`, `FRONTEND_URL` and `ENABLE_SCHEDULER` at startup.

Design documentation: [docs/database/](docs/database/) and [docs/api/openapi.yaml](docs/api/openapi.yaml).
