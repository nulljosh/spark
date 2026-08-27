# Sparkjar API

Base URL: `https://sparkjar.heyitsmejosh.com`

One Cloudflare Pages Function (`functions/api/[[route]].js`) fronts every
handler in `api/`. Responses are JSON; errors are `{ "error": "message" }` with
the matching status.

## Authentication

Bearer JWT. Register or log in, then send the token:

```bash
TOKEN=$(curl -s -X POST https://sparkjar.heyitsmejosh.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"you","password":"..."}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" https://sparkjar.heyitsmejosh.com/api/notifications
```

Routes marked **auth** return `401` without a token. Posting is rate limited to
10 per minute per IP for non-Pro accounts (`429` when exceeded).

## Ideas

### `GET /api/posts`

Query: `limit`, `offset`. Returns `{ posts: [...] }`. Falls back to seed data if
the database is unreachable, so this route does not 500.

### `POST /api/posts` — auth

```json
{ "title": "…", "content": "…", "category": "…", "linked_repo": "https://…" }
```

`title` max 200 chars, `content` max 5000. `linked_repo` must be an `http(s)`
URL — other schemes are rejected, since the value is rendered into an `href`.

### `DELETE /api/posts/:id` — auth

Deletes one of your own posts.

### `POST /api/posts/:id/vote` — auth

Body `{ "voteType": "up" | "down" }`. Returns the post's new score.

## Comments

- `GET /api/comments?post_id=:id` — comments on one post
- `GET /api/comments?post_ids=1,2,3` — comment counts in bulk
- `POST /api/comments` — auth. Body `{ post_id, content }`

## Account

- `POST /api/auth/:action` — `login`, `register`, `password-reset`
- `GET /api/notifications` — auth
- `GET|PATCH /api/user` — auth. Profile
- `GET /api/users` — public profiles
- `POST /api/avatar` — auth
- `GET /api/stripe?action=status`, `POST /api/stripe` — auth. Pro billing
- `POST /api/ai` — auth. Idea enrichment
- `POST /api/stripe-webhook` — signature-verified, not for client use

CORS allows only `https://sparkjar.heyitsmejosh.com`. Server-to-server callers
are unaffected; browser callers on other origins are not supported.

## WebMCP

With the app open, sparkjar registers tools on `document.modelContext`, reusing
the token already in `localStorage`. Source: `webmcp.js`.

### Read-only

| Tool | Does |
|---|---|
| `search_ideas` | List ideas; filter by `query`, `category`, `limit`, `offset` |
| `get_idea` | One idea with its comments |
| `get_comments` | Comments on one idea |
| `get_notifications` | The signed-in user's notifications |
| `whoami` | Who is signed in, if anyone |

### Reversible writes

| Tool | Does |
|---|---|
| `vote_idea` | Upvote or downvote |
| `post_comment` | Comment on an idea |

### Requires human confirmation

| Tool | Does |
|---|---|
| `submit_idea` | Publishes a new idea publicly under the user's name |
| `delete_idea` | Permanently deletes one of the user's own ideas |
