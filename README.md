# Sprinto Outreach

MESA Term 2 · AI Case 2: Cold Outreach, at Scale. A domain list goes in; qualified, personalised cold emails land in your own inbox.

## The 7 steps (lib/)

| Step | File | Who decides |
|---|---|---|
| 1. Scrape homepage + trust + careers pages (robots.txt respected; JS shells re-read via Jina Reader; job boards via Greenhouse/Lever/Ashby/Workable public APIs) | `scrape.js` | code |
| 2. Extract named facts, each with a verbatim quote; quotes not found on the page are discarded | `extract.js` | Gemini extracts, code verifies |
| 3. Qualify with 5 gates; agent loop picks the next page when a fact is missing (max 4 extra fetches) | `qualify.js` | code decides, Gemini picks the page |
| 4. Find the PoC: Hunter (Option A) or `data/contacts.json` (Option B, Apollo by hand); title order by stage | `contact.js` | code |
| 5-6. Two evidence-linked pain points + the email; validator checks name, length, hook, evidence, invented numbers | `write.js` | Gemini writes, code validates |
| 7. Send via Gmail to `MY_EMAIL` only | `send.js` | code |

The ICP and all thresholds live in `lib/config.js`. The **ICP & evidence map** page in the app explains every rule.

Anything the rules cannot settle is parked, not guessed: **Review queue** (site unreachable, B2B unknown, no contact) and **Drafts** (validator failed or flagged). Edits and lessons feed the **Feedback loop**: lessons are injected into the writer prompt.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

Keys in `.env.local`:
- `GEMINI_API_KEY` (aistudio.google.com) - required
- `HUNTER_API_KEY` (hunter.io, free tier) - optional; without it, add contacts to `data/contacts.json`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google Account > Security > App passwords), `MY_EMAIL`
- `DATABASE_URL` (Neon) - needed on Vercel; locally it falls back to `.data/store.json`

## Terminal mode

```bash
npm run pipeline -- domains.txt
npm run pipeline -- rillet.com "attio.com, Series B"
```

## Deploy

`vercel` then add the same env vars (with `DATABASE_URL`) in the Vercel project. Set `APP_PASSWORD` to lock the site.
