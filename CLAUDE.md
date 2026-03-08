# Spark
Idea-sharing platform with auth, posts, and voting.
Live: https://spark.heyitsmejosh.com
Vanilla HTML/JS frontend, Vercel serverless API, Supabase PostgreSQL backend.

## Stack
- Frontend: single index.html, vanilla JS, PWA support
- API: Vercel serverless (Node.js)
- Database: Supabase PostgreSQL
- Auth: JWT with password hashing

## Roadmap
- [x] iOS companion app (spark-ios)
- [x] PWA support
- [x] Persistent database (Supabase)
- [x] Forgot password flow (UI ready, email pending)
- [ ] SMTP email delivery (Resend or nodemailer) -- needed for password reset emails
- [ ] Real-time updates via Supabase Realtime
- [ ] Comment threads on posts
- [ ] User profiles with post history
- [ ] Topic tags and filtering
- [ ] Moderation tools

## Quick Commands
- `./scripts/simplify.sh`
- `./scripts/monetize.sh . --write`
- `./scripts/audit.sh .`
- `./scripts/ship.sh .`
