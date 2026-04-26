# Poké Roulette — Backend Specification

Version 1.0

---

## 1. Overview

The Poké Roulette backend is a lightweight HTTP API server providing user authentication, room management, Pokémon list synchronisation, and live event streaming for the Poké Roulette web application.

| | |
|---|---|
| **Language** | Go |
| **Database** | SQLite (single file, embedded via `modernc.org/sqlite`) |
| **Auth** | Username + password, JWT (sliding 30-day expiry) |
| **Real-time** | Server-Sent Events (SSE) |
| **Deployment** | Single Docker container, exposes one HTTP port |
| **Reverse proxy** | Sits behind caller-provided reverse proxy (Traefik, Nginx, etc.) |

---

## 2. Authentication

### 2.1 Scheme

JWT (HS256). The secret is a random string configured via environment variable at startup. Tokens are signed and verified server-side.

### 2.2 Sliding Expiry

Tokens have a 30-day TTL measured from last use. On every authenticated request, if the token has passed its halfway point (i.e. less than 15 days remaining), the server issues a refreshed token and returns it in the response header:

```
X-Refreshed-Token: <new_jwt>
```

The client replaces its stored token when this header is present. If the token has more than 15 days remaining, no refresh is issued.

### 2.3 Token Storage (client responsibility)

Tokens are stored in memory on the client. The server has no concept of sessions — any valid JWT is accepted.

### 2.4 Token Invalidation

All tokens for a user are invalidated when the user changes their password. This is implemented by storing a `token_version` integer per user in the database and embedding it as a JWT claim. On password change, `token_version` is incremented; any token carrying an older version is rejected.

---

## 3. API Reference

All endpoints are prefixed with `/api/v1`. Authenticated endpoints require a `Bearer` token in the `Authorization` header.

### 3.1 Auth

#### `POST /api/v1/auth/register`

Register a new account.

**Request body:**
```json
{ "username": "alice", "password": "hunter2" }
```

**Rules:**
- Username: 1–32 characters, alphanumeric, hyphens and underscores allowed, case-insensitive (stored lowercase), must be unique.
- Password: no requirements (any non-empty string accepted).

**Response `200`:**
```json
{ "token": "<jwt>" }
```

**Errors:**
- `400` — missing/invalid fields
- `409` — username already taken

---

#### `POST /api/v1/auth/login`

Authenticate an existing account.

**Request body:**
```json
{ "username": "alice", "password": "hunter2" }
```

**Response `200`:**
```json
{ "token": "<jwt>" }
```

**Errors:**
- `400` — missing fields
- `401` — invalid credentials

---

#### `PUT /api/v1/auth/password`

Change password. Authenticated.

**Request body:**
```json
{ "current_password": "hunter2", "new_password": "correct-horse" }
```

**Behaviour:** Increments `token_version`, invalidating all existing tokens including the caller's. Client must re-login after this call.

**Response `204`:** No content.

**Errors:**
- `400` — missing fields
- `401` — current password incorrect

---

### 3.2 Rooms

#### `POST /api/v1/rooms`

Create a new room. Authenticated. Creator becomes host.

**Request body:**
```json
{
  "code": "my-room",
  "lists": {
    "pool": ["Bulbasaur", "Charmander"],
    "done": [],
    "todo": []
  }
}
```

**Room code rules (enforced server-side):**
- 3–32 characters
- ASCII letters, digits, hyphens only
- No leading, trailing, or consecutive hyphens
- Case-insensitive (stored lowercase)
- Must be globally unique

**Response `201`:**
```json
{ "code": "my-room" }
```

**Errors:**
- `400` — invalid room code format or missing lists
- `409` — room code already in use

---

#### `POST /api/v1/rooms/{code}/join`

Join an existing room. Authenticated. Joining user becomes a guest.

If the user is already a member of the room, the call succeeds and returns the current state (idempotent).

**Response `200`:**
```json
{
  "code": "my-room",
  "role": "guest",
  "lists": {
    "pool": ["Bulbasaur", "Charmander"],
    "done": [],
    "todo": []
  },
  "members": [
    { "user_id": "alice", "role": "host" },
    { "user_id": "bob", "role": "guest" }
  ]
}
```

**Errors:**
- `404` — room not found

---

#### `POST /api/v1/rooms/{code}/leave`

Leave a room. Authenticated.

**Rules:**
- Host cannot leave unless they are the only member (in which case the room is also closed automatically).
- Host with other members present receives `403` with `"Transfer host role before leaving"`.

**Response `204`:** No content.

**Errors:**
- `403` — host attempted to leave with members present
- `404` — room not found or caller not a member

---

#### `DELETE /api/v1/rooms/{code}`

Close a room. Authenticated. Host only.

Closes the room, removes all members, sends `room_closed` SSE event to all connected clients, then terminates all SSE connections for this room.

**Response `204`:** No content.

**Errors:**
- `403` — caller is not host
- `404` — room not found

---

#### `PUT /api/v1/rooms/{code}/lists`

Push full list state to the room. Authenticated. Any member (guest, moderator, or host).

Last write wins. The server stores the new state and broadcasts a `lists_updated` SSE event to all other members.

**Request body:**
```json
{
  "lists": {
    "pool": ["Bulbasaur"],
    "done": ["Charmander"],
    "todo": []
  }
}
```

**Response `204`:** No content.

**Errors:**
- `403` — caller is not a member
- `404` — room not found

---

#### `PUT /api/v1/rooms/{code}/members/{username}/role`

Assign a role to a room member. Authenticated.

**Request body:**
```json
{ "role": "moderator" }
```

**Valid roles:** `host`, `moderator`, `guest`

**Permission rules:**

| Caller role | Can assign |
|---|---|
| Host | `host`, `moderator`, `guest` |
| Moderator | `guest` only |
| Guest | Nothing (403) |

Assigning `host` to another user transfers host status: the caller becomes `moderator` and the target becomes `host`. There is always exactly one host per room.

**Response `204`:** No content.

**Errors:**
- `400` — invalid role value
- `403` — caller lacks permission
- `404` — room or target member not found

---

#### `GET /api/v1/rooms/{code}/events`

Open an SSE stream for live room updates. Authenticated.

The caller must already be a member of the room. The connection stays open indefinitely. The server sends a heartbeat comment (`: ping`) every 30 seconds to keep the connection alive through proxies.

**Response:** `text/event-stream`

**On connect**, the server immediately sends a `connected` event with full current state:

```
event: connected
data: {"lists":{"pool":[...],"done":[...],"todo":[...]},"members":[{"user_id":"alice","role":"host"},...],"role":"guest"}
```

**Subsequent events:**

```
event: lists_updated
data: {"lists":{"pool":[...],"done":[...],"todo":[...]},"updated_by":"alice"}

event: member_joined
data: {"user_id":"bob","role":"guest"}

event: member_left
data: {"user_id":"bob"}

event: role_changed
data: {"user_id":"bob","role":"moderator","changed_by":"alice"}

event: room_closed
data: {"closed_by":"alice"}
```

The server does not echo `lists_updated` back to the member who triggered it.

**Errors:**
- `403` — caller is not a member
- `404` — room not found

---

## 4. Database Schema

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE room_members (
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('host', 'moderator', 'guest')),
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_lists (
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE PRIMARY KEY,
  lists_json TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Error Response Format

All error responses return JSON:

```json
{ "error": "Human-readable message" }
```

---

## 6. Configuration

Configured via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8080` | HTTP listen port |
| `DB_PATH` | No | `./data/pokeroulette.db` | Path to SQLite database file |
| `JWT_SECRET` | Yes | — | Secret for JWT signing (min 32 chars recommended) |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS allowed origins |

---

## 7. Docker

The container exposes port `8080` by default. The database file should be mounted as a volume to persist data across restarts:

```yaml
services:
  pokeroulette-api:
    image: pokeroulette-api:latest
    environment:
      JWT_SECRET: "your-secret-here"
      ALLOWED_ORIGINS: "https://pokeroulette.example.com"
    volumes:
      - ./data:/app/data
    ports:
      - "8080:8080"
```

---

## 8. Out of Scope

- Email verification or password reset via email
- Rate limiting (assumed to be handled by reverse proxy)
- Room passwords or invite codes
- Spectator roles
- Admin API
- Metrics or health endpoints beyond basic liveness
