# make.fun frontend

A lightweight, read-only frontend for discovering make.fun bounties and following
the people and entries competing in them. This repository is an entry for
[makefun-frontend-01: Build the best make.fun frontend](https://make.fun/c/makefun-frontend-01).

## Run locally

Use Node.js 22.18 or later. There is no build step or dependency installation.

```sh
node serve.ts
```

Open http://localhost:8080. The server serves `app/` as the site root; the browser
reads the public API at `https://make.fun/api`. Live data requires an internet
connection. The app uses public GET requests and needs no account or API key.

Hash routes work when opened directly or refreshed on any static server with
`app/` at its root. Use `node serve.ts --port 8081` if port 8080 is occupied.

## Four surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Bounty board | `http://localhost:8080/#/` | Browse live bounties, their live pots, entry fees, deadlines and entry counts. |
| Bounty page | `http://localhost:8080/#/bounty/<slug>` | Read the summary, description, rules, rewards, dates and status. |
| Leaderboard | `http://localhost:8080/#/bounty/<slug>/leaderboard` | Follow ranked entries and open their authors' public profiles. |
| Account profile | `http://localhost:8080/#/profile/<handle>` | See a public account and its competition entries. |

Session 1 is setup and planning only. The copied starter currently implements the
board and a basic bounty page. The other two URLs above describe planned routes;
the starter does not implement them yet. Leaderboard and profile views, richer
bounty details and the visual redesign belong to the next session. See
[PLAN.md](PLAN.md) for the implementation plan.

## Competition

[Competition page and kit](https://make.fun/c/makefun-frontend-01).
The root MIT license is retained, and `vendor/makefun-frontend.ts` must remain
byte for byte identical to the kit. `main.ts` packages `app/`, `screenshots/` and
the dossier for submission. The owner claim contains only a public wallet address.

The copied `shots.json` is the starter's capture manifest. Its images are not
included here: the final entry needs three original browser screenshots of our
completed app on live data, with the manifest updated to match those captures.
