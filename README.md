# make.fun frontend

A small, read-only frontend for discovering make.fun bounties and following public
entries and builders. This is the Sandi207/makefun-frontend entry for
[makefun-frontend-01](https://make.fun/c/makefun-frontend-01).

## Open the app

Serve `app/` as the root of any static HTTP host. With Node.js 22.18 or later,
`node serve.ts` provides the kit's local server; open http://localhost:8080.
The frontend needs network access to `https://make.fun/api`, but no account or key.
There are no dependencies, external fonts, framework or build step.

| Surface | Hash URL | Data |
| --- | --- | --- |
| Bounty board | `#/` | Live pot, entry fee, deadline, entries, local search and status filters |
| Bounty detail | `#/bounty/<slug>` | Summary, description, rules, base rewards, live pot and dates |
| Leaderboard | `#/bounty/<slug>/leaderboard` | Public ranks, metrics, grading state and dev/final phases |
| Profile | `#/profile/<handle>` | Public identity, avatar, bio, statistics and competition history |

Each URL supports refresh and browser back/forward on a plain static host.
Overdue open bounties remain visible as awaiting results. Lists render at most
25 entries per page. Search and sorting explicitly cover the current API page.

The first load is HTML, CSS and one authored module containing the GET cache,
router and board. Three view modules use literal local dynamic imports; their
shared stylesheet loads only on those routes. Public GET responses are deduplicated
and cached with a 32-URL / 1-MiB LRU limit. Stale routes revalidate exposed ETags,
retain cached content on refresh failures and respect Retry-After without polling.

## Check and package offline

```sh
node tests/offline.mjs
MAKEFUN_OUTPUT_DIR=/tmp/makefun-output node main.ts
```

Choose an empty output directory outside this repository. `main.ts` checks for
exactly three captures and validates the dossier before copying any files. It uses
only Node's standard library and the unchanged kit vendor library; packaging needs
no network. See [VALIDATION.md](VALIDATION.md) for measured bytes, mocked request counts and live checks still needed.

## Captures still required

`screenshots/` currently contains the kit's three unchanged placeholder JPEGs.
They let packaging run and are **not screenshots of this implementation**.
The parent must replace all three with original, unedited live browser captures
using the routes and viewports in `shots.json`, then rerun the offline checks and
packaging. The final capture is planned at a phone viewport. Each image must be
at most 256 KiB, with long side at most 1280 and short side at least 360 pixels.

This build session used saved API documentation and no browser or live HTTP.
The parent must verify successful response field shapes, CORS-exposed ETag behavior,
keyboard navigation, phone layout and all four routes against the live API before
submission. The MIT license and kit vendor library are retained.
