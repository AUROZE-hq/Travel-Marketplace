# AUROZE Travel Marketplace — Authentication & Identity Architecture (Stage 3A)

## 1. Overview

The AUROZE Travel Marketplace authentication and identity subsystem provides a high-security, production-grade identity foundation built on Node.js, Express, TypeScript, PostgreSQL, and Prisma ORM.

### Key Capabilities
- **Password Security**: Argon2id password hashing following OWASP guidelines with backward-compatible transparent migration for legacy scrypt hashes.
- **Short-Lived Access Tokens**: Signed HMAC-SHA256 JWTs (15-minute default) validated against explicit algorithm, issuer, and audience.
- **Stateful Opaque Refresh Tokens & Session Families**: Cryptographically secure 256-bit random opaque tokens stored exclusively as SHA-256 hashes. Full token rotation on every use with automatic reuse detection that revokes compromised session families.
- **Atomic Multi-Table Identity Creation**: Public customer registration atomically provisions `User`, `UserRole` (`CUSTOMER`), `CustomerProfile`, and initial `AuthSession` within a single database transaction.
- **Role-Based Access Control (RBAC)**: Support for multiple active roles per user (`CUSTOMER`, `OWNER`, `DRIVER`, `ADMIN`), with strict middleware enforcement and status checks (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`).
- **Account Enumeration Mitigation**: Generic credential error responses on login and constant-time dummy password hashing on non-existent accounts; HTTP 202 Accepted on password reset requests regardless of email existence.
- **Single-Use Password Reset**: Cryptographically random reset tokens with 15-minute expiry, single-use invalidation, atomic password update, and immediate revocation of all active sessions for the user.
- **Rate Limiting**: Sliding-window rate limiting on sensitive authentication endpoints (`/auth/login`, `/auth/register`, `/auth/password-reset/*`).

---

## 2. Token & Session Lifecycle

### Access Tokens (Stateful Revocation via Session Binding)
- **Format**: Signed JWT (`HS256`)
- **Default Lifetime**: 15 minutes (`JWT_ACCESS_EXPIRY=15m`)
- **Claims**:
  - `sub`: User UUID
  - `email`: Normalized email
  - `roles`: Array of user roles (`Role[]`)
  - `sid`: Bound Session UUID (`auth_session.id`)
  - `iss`: Configured issuer (`JWT_ISSUER`, default: `travel-marketplace-api`)
  - `aud`: Configured audience (`JWT_AUDIENCE`, default: `travel-marketplace-app`)
  - `exp`: Expiration timestamp
- **Transport**: Standard HTTP `Authorization: Bearer <token>` header.
- **Stateful Revocation & Revalidation**: Protected endpoints check user existence, account status (`status === ACTIVE`), and session existence in `auth_session` (`isRevoked === false` and `expiresAt > now()`). This guarantees that:
  - Revoking or logging out a session immediately invalidates the associated access token (no waiting for JWT expiry).
  - Refreshing a session immediately invalidates previous access tokens bound to the predecessor session.
  - Password reset invalidates all access tokens across all devices simultaneously.
  - Suspended or deactivated users are immediately blocked from protected routes.
  - Logging out one session does not impact unrelated sessions belonging to the same user.

### Refresh Tokens & Session Rotation
- **Format**: Cryptographically secure opaque string (32 bytes base64url).
- **Storage**: Only the SHA-256 hash (`token_hash`) is stored in the `auth_session` table.
- **Default Lifetime**: 7 days (`REFRESH_TOKEN_EXPIRY_DAYS=7`).
- **Rotation on Use**: Each valid refresh request generates a new opaque token, marks the previous session revoked (`is_revoked = true`), links to the successor (`replaced_by_token_hash`), and persists the replacement with the same `family_id`.
- **Immediate Invalidation of Predecessor Access Tokens**: Rotating a refresh token immediately revokes the predecessor `auth_session`. Consequently, the previous access token is invalidated instantly, and the client transitions to the newly returned `accessToken` and `refreshToken`.
- **Reuse Detection**: If a client attempts to refresh using a token that was already rotated or revoked, the backend detects token theft/replay, revokes all sessions belonging to the `family_id`, and records an audit log entry.
  - *Persistence Guarantee*: Reuse detection commits family invalidation outside the aborted transaction so that revocation persists even when returning HTTP `401 Unauthorized`.
- **Concurrent Safe**: Database concurrency uses atomic row update checks (`updateMany({ where: { id, is_revoked: false } })`) to ensure racing requests cannot multiply active sessions.

### Password Reset Tokens
- **Format**: 32-byte cryptographically secure random token (base64url).
- **Storage**: SHA-256 hash in `password_reset_token` table.
- **Lifetime**: 15 minutes (`PASSWORD_RESET_TOKEN_EXPIRY_MINUTES=15`).
- **Single-Use & Invalidation**: Once consumed, the token is marked with `used_at = now()` atomically via `updateMany`. Password change revokes all user refresh sessions across all devices and invalidates all outstanding reset tokens for that user.
- **Concurrency & Rehash Protection**: Login validates the password hash inside the transaction to prevent stale-password logins during password reset. Legacy scrypt rehashing uses targeted `updateMany({ where: { id, passwordHash } })` to ensure concurrent password resets are never overwritten by an asynchronous rehash.

---

## 3. Endpoints Reference

Base URL: `/api/v1`

### 1. `POST /auth/register`
Creates a user account with the `CUSTOMER` role only. Public.

- **Request Body**:
  ```json
  {
    "email": "traveler@example.com",
    "password": "SecurePassword123!",
    "fullName": "Jane Doe",
    "phone": "+94771234567"
  }
  ```
- **Validation**:
  - `email`: Valid email format, lowercase normalized, max 255 chars.
  - `password`: Minimum 10 characters, max 128 chars.
  - `fullName`: 1-120 characters, trimmed.
  - `phone`: Optional string, max 30 chars.
- **Response `201 Created`**:
  ```json
  {
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "v1.8f2a...",
      "expiresIn": 900,
      "user": {
        "id": "c1f72740-bf71-4648-9363-d1466dc0915a",
        "email": "traveler@example.com",
        "phone": "+94771234567",
        "fullName": "Jane Doe",
        "status": "ACTIVE",
        "emailVerified": false,
        "roles": ["CUSTOMER"],
        "ownerProfileId": null,
        "driverProfileId": null
      }
    }
  }
  ```
- **Errors**: `409 Conflict` (duplicate email), `422 Unprocessable Entity` (validation failed).

### 2. `POST /auth/login`
Authenticates user with email and password. Public.

- **Request Body**:
  ```json
  {
    "email": "traveler@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`**: Returns `{ data: AuthSession }`.
- **Errors**: `401 Unauthorized` (`UNAUTHENTICATED`: generic message to prevent account enumeration), `422 Unprocessable Entity`.

### 3. `POST /auth/refresh`
Rotates a refresh token and issues a new access token. Public.

- **Request Body**:
  ```json
  {
    "refreshToken": "v1.8f2a..."
  }
  ```
- **Response `200 OK`**: Returns `{ data: AuthSession }` with a fresh `accessToken` and newly rotated `refreshToken`.
- **Errors**: `401 Unauthorized` (`UNAUTHENTICATED`).

### 4. `POST /auth/logout`
Revokes the caller's refresh token. Requires `Authorization: Bearer <token>`.

- **Request Body**:
  ```json
  {
    "refreshToken": "v1.8f2a..."
  }
  ```
- **Response `204 No Content`**
- **Errors**: `401 Unauthorized`, `403 Forbidden` (cross-user revocation attempt).

### 5. `POST /auth/password-reset/request`
Requests a password reset email. Always returns 202 whether email exists or not. Public.

- **Request Body**:
  ```json
  {
    "email": "traveler@example.com"
  }
  ```
- **Response `202 Accepted`**

### 6. `POST /auth/password-reset/confirm`
Sets a new password using a reset token and invalidates all active user sessions. Public.

- **Request Body**:
  ```json
  {
    "token": "reset-token-value",
    "newPassword": "NewSecurePassword123!"
  }
  ```
- **Response `204 No Content`**
- **Errors**: `400 Bad Request` (invalid or expired token), `422 Unprocessable Entity`.

### 7. `GET /users/me`
Retrieves current user profile and assigned roles. Requires authentication.

- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
  ```json
  {
    "data": {
      "id": "c1f72740-bf71-4648-9363-d1466dc0915a",
      "email": "traveler@example.com",
      "phone": "+94771234567",
      "fullName": "Jane Doe",
      "status": "ACTIVE",
      "emailVerified": false,
      "roles": ["CUSTOMER"],
      "ownerProfileId": null,
      "driverProfileId": null
    }
  }
  ```

### 8. `PATCH /users/me`
Updates current user's full name and/or phone number. Requires authentication.

- **Headers**: `Authorization: Bearer <token>`
- **Request Body** (at least one field required; unauthorized fields rejected):
  ```json
  {
    "fullName": "Jane Doe Updated",
    "phone": "+94779876543"
  }
  ```
- **Response `200 OK`**: Returns updated `{ data: Me }`.

---

## 4. Error Code Reference

API errors follow the standard envelope:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error description",
    "details": []
  }
}
```

| HTTP Status | Code | Meaning / Scenario |
|---|---|---|
| `400` | `BAD_REQUEST` | Expired or invalid password reset token |
| `401` | `UNAUTHENTICATED` | Missing/invalid bearer token, invalid credentials, or expired/revoked session |
| `403` | `FORBIDDEN` | Insufficient role permissions or unauthorized resource revocation |
| `404` | `NOT_FOUND` | User or resource not found |
| `409` | `CONFLICT` | Duplicate email during registration |
| `422` | `VALIDATION_ERROR` | Zod schema validation failed (returns field path & message details) |
| `429` | `RATE_LIMITED` | Sliding window rate limit exceeded |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server failure (details redacted in production) |

---

## 5. RBAC Behavior

The application enforces a multi-role architecture:
- Roles: `CUSTOMER`, `OWNER`, `DRIVER`, `ADMIN`.
- Public registration strictly assigns only the `CUSTOMER` role.
- Owner and driver profiles are provisioned through verified business onboarding flows.
- Reusable Express middleware:
  - `authenticate`: Validates access token and checks account `ACTIVE` status in database.
  - `requireRole(role)`: Requires specific role membership.
  - `requireAnyRole(roles[])`: Requires membership in at least one of the permitted roles.
  - `requireOwnershipOrRoles(getOwnerId, allowedRoles)`: Enforces resource ownership with admin override capability.

---

## 6. Rate Limiting Architecture

The authentication endpoints are protected by an in-memory bounded sliding-window rate limiter:
- Protected routes:
  - `POST /auth/register`: 5 requests per 15-minute window per IP.
  - `POST /auth/login`: 5 requests per 15-minute window per IP/email.
  - `POST /auth/refresh`: 20 requests per 15-minute window per IP.
  - `POST /auth/password-reset/request`: 3 requests per 15-minute window per IP/email.
  - `POST /auth/password-reset/confirm`: 5 requests per 15-minute window per IP.
- **Memory Bounded**: The in-memory map is capped at 10,000 active keys with periodic expiration cleanup to prevent memory exhaustion attacks.
- **Standard Headers**: Exceeded limits return HTTP `429 Too Many Requests` with `Retry-After: <seconds>` header indicating the cool-off period.
- **Deployment-Configurable Trusted Proxy Settings**: Configurable via `TRUST_PROXY` (default: `false` in direct development to prevent arbitrary `X-Forwarded-For` client spoofing; supports `true`, integer hop counts such as `1`, or specific subnet CIDRs when fronted by trusted reverse proxies or load balancers).
- **Production Scalability Note**: The in-memory rate limiter is process-local. In horizontally scaled multi-replica production environments, a distributed Redis-backed rate limiter (e.g. `rate-limiter-flexible` with Redis cluster) should be deployed so limits are shared across backend pods.

---

## 7. Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `TRUST_PROXY` | string | `false` | Proxy trust setting (`false`, `true`, hop count `1`, or subnet). Protects against header spoofing. |
| `JWT_SECRET` | string | `dev-jwt-...` (min 32 chars) | Secret key for access token signing. Required in production. Rejected if using known dev/example secrets. |
| `JWT_ISSUER` | string | `travel-marketplace-api` | Expected JWT issuer claim (`iss`). |
| `JWT_AUDIENCE` | string | `travel-marketplace-app` | Expected JWT audience claim (`aud`). |
| `JWT_ACCESS_EXPIRY` | string | `15m` | Access token lifespan (e.g. `15m`, `900s`). |
| `REFRESH_TOKEN_EXPIRY_DAYS` | number | `7` | Refresh session duration in days. |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | number | `15` | Password reset token expiration window. |
| `PASSWORD_RESET_URL` | string | `http://localhost:5173/reset-password` | Base URL included in reset emails. |
| `SMTP_HOST` | string | *(optional)* | Outbound SMTP server hostname. |
| `SMTP_PORT` | number | `587` | Outbound SMTP server port. |
| `SMTP_USER` | string | *(optional)* | SMTP authentication username. |
| `SMTP_PASS` | string | *(optional)* | SMTP authentication password. |
| `SMTP_FROM` | string | `no-reply@travelmarketplace.lk` | Default sender address. |
| `SMTP_SECURE` | boolean | `false` | Enable TLS/SSL connection. |

---

## 8. Database Migrations

Migration `20261125110435_add_auth_models`:
1. `auth_session`: Stores hashed refresh tokens (`token_hash`), `family_id` for reuse detection, revocation timestamps, and device metadata (`ip_address`, `user_agent`).
2. `password_reset_token`: Stores hashed reset tokens with expiration and single-use `used_at` timestamps.
3. `auth_audit_log`: Security audit trail capturing logins, failures, rotations, reuse detection events, and password updates.

To apply migrations:
```bash
# In local development:
npm run db:migrate:deploy --workspace backend

# CI / Production:
npm run db:migrate:deploy --workspace backend
```

---

## 9. Frontend Integration Contract & Token Storage Guidance

Frontend pages for authentication do not yet exist in `frontend/src/pages` (only `HomePage.tsx` exists).
The following typed contracts and API client have been provided in the frontend workspace:
- Types: `frontend/src/types/auth.ts`
- API client wrapper: `frontend/src/services/authApi.ts`

### Token Storage Security Recommendations
1. **Never Store Refresh Tokens in `localStorage`**:
   - `localStorage` is vulnerable to any script execution via Cross-Site Scripting (XSS).
   - Recommended Pattern:
     - Keep `accessToken` in React application memory (e.g. `AuthContext` state).
     - For production web apps, prefer transporting `refreshToken` via `HttpOnly`, `SameSite=Lax`, `Secure` cookies with anti-CSRF measures.
     - If stored in memory/session storage during initial development, perform silent refresh before token expiry.
2. **Axios Response Interceptor**:
   - Configure an interceptor on `apiClient` to intercept `401 UNAUTHENTICATED`.
   - Queue concurrent requests while a single refresh operation is executing to prevent concurrent rotation collisions.
   - On refresh failure (e.g. family revoked), purge local auth state and redirect to `/login`.
3. **Recommended Frontend Implementation Steps**:
   - Create `LoginPage.tsx`, `RegisterPage.tsx`, and `ResetPasswordPage.tsx` using existing Tailwind and shadcn styling.
   - Implement `AuthContext` providing `user`, `login()`, `logout()`, `register()`, and `isAuthenticated`.
   - Add route guards (`ProtectedRoute`, `RoleGuard`) in `frontend/src/routes/AppRoutes.tsx`.

---

## 10. Production Security Checklist

- [x] Passwords hashed using Argon2id with OWASP parameters (64MB memory, 3 iterations).
- [x] Refresh tokens stored strictly as SHA-256 hashes.
- [x] Refresh token reuse detection enabled with session family invalidation.
- [x] Session binding (`sid`) in JWT access tokens verified against `auth_session` table on every request.
- [x] Immediate access token invalidation upon logout, refresh, password reset, or account suspension.
- [x] JWT access tokens validated for signature, algorithm, issuer, audience, and expiry.
- [x] Account enumeration prevented via generic error messages and timing equalization.
- [x] Password reset tokens single-use and expire in 15 minutes.
- [x] Password change atomically revokes all user sessions across devices.
- [x] Request rate limiting applied to login, registration, refresh, and reset endpoints with `Retry-After` header.
- [x] Strict Zod input validation rejecting unauthorized and oversized inputs.
- [x] Production startup validation enforces strong `JWT_SECRET` (≥ 32 characters) and blocks known dev secrets.
- [x] Helmet and CORS configured with restricted origins.
- [x] Sensitive fields (`passwordHash`, `tokenHash`) excluded from all API responses.
