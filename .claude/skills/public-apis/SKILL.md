---
name: public-apis
description: Searchable, offline catalog of 1,650+ free public APIs (weather, geocoding/maps, finance, real estate-adjacent open data, images, government, ML, and more) vendored from the public-apis/public-apis GitHub list. Use this skill whenever a task needs external data or a third-party API and no specific provider has been chosen yet — to discover candidate APIs, compare auth/HTTPS/CORS requirements, and get the exact endpoint URL to call. Triggers on "is there a free API for X", "find an API", "public API", "what API can I use", or any feature that needs live external data (weather, currency rates, addresses/geocoding, stock/crypto prices, news, images, jobs, etc.).
---

# Public APIs Catalog

A local, offline-searchable catalog of **1,658 free/freemium public APIs** across
**50 categories**, vendored from
[public-apis/public-apis](https://github.com/public-apis/public-apis) (checked out
2026-08-14). Every session in this repo has this data available immediately —
no network fetch of the upstream README needed to discover what's out there.

## When to use this skill

Reach for this any time a task would benefit from a third-party data source and
no API has already been decided on, e.g.:
- "Is there a free API to look up property/address data, weather, or currency rates?"
- "Add a feature that shows local weather / maps / stock prices / news."
- "What public API could give us X?"

Don't use it once a specific API is already chosen — at that point just read that
API's own docs.

## How to search the catalog

Use the bundled query script rather than grepping `data/apis.json` by hand — it
handles filtering by auth requirement and HTTPS support:

```bash
# Keyword search across name + description
python3 .claude/skills/public-apis/scripts/query_apis.py --search "geocod"

# Only APIs that need no signup/API key at all
python3 .claude/skills/public-apis/scripts/query_apis.py --search weather --no-auth-only

# Only HTTPS APIs, as JSON (for programmatic use)
python3 .claude/skills/public-apis/scripts/query_apis.py --search maps --https-only --json

# Browse a whole category
python3 .claude/skills/public-apis/scripts/query_apis.py --category "Real Estate" 2>/dev/null || true
python3 .claude/skills/public-apis/scripts/query_apis.py --list-categories
```

Each result gives: category, name, one-line description, URL (the API's docs/home
page — **not always a bare base endpoint**, read the linked docs before calling),
whether it requires an `apiKey`/OAuth/`X-Mashape-Key`, whether it supports HTTPS,
and whether it supports CORS (relevant for calling directly from browser JS).

## Raw data

`data/apis.json` — the full parsed catalog if you need to load it directly (e.g.
from a Node/Python script instead of the CLI):

```json
{
  "source": "https://github.com/public-apis/public-apis",
  "category_count": 50,
  "api_count": 1658,
  "categories": {
    "<Category Name>": [
      {"name": "...", "url": "...", "description": "...", "auth": "No|apiKey|OAuth|...", "https": "Yes|No", "cors": "Yes|No|Unknown"}
    ]
  }
}
```

Categories present: Animals, Anime, Anti-Malware, Art & Design, Authentication &
Authorization, Blockchain, Books, Business, Calendar, Cloud Storage & File Sharing,
Continuous Integration, Cryptocurrency, Currency Exchange, Data Validation,
Development, Dictionaries, Documents & Productivity, Email, Entertainment,
Environment, Events, Finance, Food & Drink, Games & Comics, Geocoding, Government,
Health, Jobs, Machine Learning, Music, News, Open Data, Open Source Projects,
Patent, Personality, Phone, Photography, Programming, Science & Math, Security,
Shopping, Social, Sports & Fitness, Test Data, Text Analysis, Tracking,
Transportation, URL Shorteners, Vehicle, Video, Weather.

There's no dedicated "Real Estate" category upstream — property/listing-adjacent
data (addresses, geocoding, open government parcel/property records) lives mostly
under **Geocoding**, **Government**, and **Open Data**.

## Actually calling an API

1. Search the catalog, pick a candidate, open its `url` to read the real docs —
   the catalog only stores name/description/auth-type, not full endpoint specs or
   response schemas.
2. Check `auth`:
   - `No` → call directly, no signup needed.
   - `apiKey` / `OAuth` / other → the target service requires registering for a
     free-tier key. This skill cannot obtain that key for you; tell the user
     which service needs a key and where to get one, and ask them to provide it
     (e.g. as an env var) before wiring up the call.
3. Prefer `https: Yes` entries when there's a choice, especially for anything
   handling user data.
4. If `cors: No`/`Unknown` and the call needs to happen from browser-side JS,
   route it through a backend/serverless proxy instead of calling it directly
   from the client.

## Refreshing the catalog

This is a point-in-time snapshot, not a live mirror. To update it later:

```bash
git clone --depth 1 https://github.com/public-apis/public-apis /tmp/public-apis-src
python3 .claude/skills/public-apis/scripts/refresh_catalog.py /tmp/public-apis-src/README.md
```

`refresh_catalog.py` re-parses the upstream README's per-category markdown tables
and overwrites `data/apis.json` in place.
