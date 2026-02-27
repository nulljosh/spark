# Spark

Idea-sharing platform with upvoting and JWT auth. Post sparks, vote on others, no framework required.

**Live**: https://spark.heyitsmejosh.com

![Spark Feed](screenshots/spark-feed.png)

## Architecture

![Architecture](architecture.svg)

## Stack

- Vanilla HTML/JS (single `index.html`)
- Vercel serverless API — in-memory store
- JWT authentication

## Deploy

No build step. Push to main, Vercel deploys automatically.

```bash
# local preview
npx serve .
```

## Roadmap

- [x] iOS companion app
- [x] PWA support
- [ ] Persistent database (Supabase)
- [ ] Comment threads
- [ ] User profiles
- [ ] Topic tags and filtering
- [ ] Moderation tools
