FROM node:22-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund

COPY backend/prisma backend/prisma
COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run prisma:generate --workspace backend \
    && npm run build --workspace backend

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=5000

# Keep the Prisma CLI so deployment can run the checked-in SQL migrations.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/package-lock.json /app/package-lock.json
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/prisma /app/backend/prisma
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/package.json /app/frontend/package.json

USER node
EXPOSE 5000
CMD ["node", "backend/dist/server.js"]
