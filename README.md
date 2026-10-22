# CampusFind

Lost and found system for Northwest Samar State University: an Android app for
students and a web-based admin dashboard for the ISSC office, both backed by
Supabase (database, auth, storage and Edge Functions).

## Run it locally with Docker

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
installed and running. No Node.js, no `.env` file, no backend to start.

```bash
git clone https://github.com/fumio65/campusfind.git
cd campusfind
docker compose up -d --build
```

The first build takes a few minutes. Then open **http://localhost:5174**:

- Students sign in with their Student ID and password.
- Admin accounts are taken to the dashboard at `/admin` after signing in.

Use `localhost:5174` exactly. The server only accepts requests from approved
addresses, so `127.0.0.1:5174` or a different port will fail to load data.

Other commands:

| What | Command |
|------|---------|
| Stop it | `docker compose down` |
| Update after `git pull` | `docker compose up -d --build` |
| See logs | `docker compose logs -f web` |

> **This connects to the live system.** Reports, claims, and account changes
> you make here are real and visible to every user. Use test accounts.

## Local development (without Docker)

```bash
cd app
cp .env.example .env.local   # then fill in the values (ask the project lead)
npm install
npm run dev                  # http://localhost:5174
```

The `server/` folder is the old Express backend and is no longer used; all
server-side logic runs in Supabase Edge Functions (`supabase/functions/`).
