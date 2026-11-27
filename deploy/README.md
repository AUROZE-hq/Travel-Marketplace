# CI and delivery

`.github/workflows/ci.yml` runs on pull requests and pushes to `development` and `main`.
The `verify` job installs from the lockfile, validates and generates Prisma,
checks lint/types/OpenAPI, runs frontend and PostgreSQL integration tests, builds
both workspaces, and fails on high or critical dependency advisories.

On a successful push to `development` or `main`, the `publish-backend` and
`publish-frontend` jobs build images and publish them to GitHub Container
Registry. Each image receives an immutable `sha-<commit>` tag and a moving
`development` or `main` tag. Pull requests cannot publish images. The workflow
uses the repository's `GITHUB_TOKEN` with `packages: write`; no registry token is
stored in the repository.

**No application is deployed yet.** A hosting destination, production database,
HTTPS reverse proxy, SMTP service, and environment secrets must be selected and
configured before enabling deployment. The images are delivery artifacts, not
evidence that a running environment was updated.

## When hosting is available

`compose.yaml` is a deployment template for a host with a managed PostgreSQL
database and HTTPS reverse proxy. It binds the frontend only to loopback port
8080, so the public proxy should terminate TLS and forward to that port. The
frontend serves the React app and proxies `/api/` to the backend on the internal
Compose network. Set `PUBLIC_ORIGIN` to the exact public HTTPS origin.

Store the required values in a host-only environment file, never in Git. Use
immutable image tags matching the same successful CI commit:

```text
BACKEND_IMAGE=ghcr.io/auroze-hq/travel-marketplace-backend:sha-<commit>
FRONTEND_IMAGE=ghcr.io/auroze-hq/travel-marketplace-frontend:sha-<commit>
PUBLIC_ORIGIN=https://<your-hostname>
DATABASE_URL=postgresql://<user>:<password>@<database-host>:5432/<database>
JWT_SECRET=<random-secret-at-least-32-characters>
SMTP_HOST=<mail-host>
SMTP_USER=<mail-user>
SMTP_PASS=<mail-password>
SMTP_FROM=<verified-sender>
```

Apply the checked-in migrations before starting the API; never use `prisma db
push` because database constraints are implemented in SQL migrations:

```bash
docker compose --env-file deployment.env -f deploy/compose.yaml run --rm backend \
  npm run db:migrate:deploy --workspace backend
docker compose --env-file deployment.env -f deploy/compose.yaml up -d
```

After a deployment target is chosen, add a deploy job that consumes the
`sha-<commit>` images **after** `verify` and protects production with a GitHub
environment. Configure `verify` as a required status check on both
`development` and `main`; a workflow file alone does not prevent unchecked
merges. The repository owner must configure branch rules and the production
environment in GitHub Settings.
