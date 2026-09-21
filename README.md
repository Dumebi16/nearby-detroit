# Nearby

Find what's open near you in Detroit — food, bills, housing, kids, jobs, health — as a
conversational, explorable canvas of real, verified resources.

Built for the Build 313 Buildathon (Thriving Neighborhoods).

## What it is
- Talk to it ("food for my kids", "help with my DTE bill") → it maps real, open places around you.
- An endless, draggable node canvas connected to *you*, with a canvas ⇄ map toggle.
- Location-aware: nearest first, with real distances (free OpenStreetMap geocoding).
- Rich detail per place: hours, what to bring, who qualifies, call + directions.
- Saved searches (boards) and a Context profile, stored on-device.
- Honest data only: ~31 hand-verified Detroit resources; open/closed computed from real hours.

## Stack
- Static site: plain HTML/CSS/JS (no build step). `index.html`, `styles.css`, `app.js`, `data.js`.
- Map: Leaflet + OpenStreetMap tiles (no key).
- Hosting: Cloudflare Pages (auto-deploys from `main` via GitHub Actions).

## Run locally
Open `index.html`, or serve the folder: `python3 -m http.server 8137`.

## Deploy
Every push to `main` deploys to Cloudflare Pages via `.github/workflows/deploy.yml`
(needs a `CLOUDFLARE_API_TOKEN` repo secret). Live at https://nearby-detroit.pages.dev

## Roadmap
- Live resource data (Michigan 211 / findhelp) via Supabase.
- Community "suggest a resource / report an issue".
- More neighborhoods and cities.
