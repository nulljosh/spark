![Spark](icon.svg)

# Spark

![version](https://img.shields.io/badge/version-v1.2.0-blue)

Idea-sharing platform with upvoting and JWT auth.

[Live](https://spark.heyitsmejosh.com)

## Features

- Vanilla JS -- single `index.html`, no build step
- JWT auth with sign up, login, forgot password
- Category filters and Hot/New sorting
- Upvoting and trending
- Dark/light theme toggle
- PWA with offline support
- Vercel serverless + Supabase PostgreSQL

## Run

```bash
npx serve .
npm test
```

Deploy: push to main, Vercel deploys automatically.

## Roadmap

- [ ] SMTP email delivery for password reset
- [ ] Real-time updates via Supabase Realtime
- [ ] Comment threads
- [ ] User profiles with post history
- [ ] Moderation tools

## Changelog

- v1.2.0

## License

MIT 2026 Joshua Trommel
