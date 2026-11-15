# Plan for the make.fun frontend entry

Session 1 establishes the kit baseline, public owner claim and documentation.
Implementation belongs to session 2. Keep `app/`, `main.ts`, `serve.ts`,
`shots.json`, `LICENSE` and `vendor/makefun-frontend.ts` identical to the starter
for this setup; the vendor file stays unchanged throughout the competition.

## Priorities and evidence

The judge compares working surfaces first, performance second, first-load speed
third, and ease of use fourth. Complete all four real surfaces before spending
time on decorative features. The starter's `app/main.js` routes only the board
and bounty detail; `app/api.js` has only two uncached requests. The detail omits
rules, the rewards table and status. The fixed five-column board also needs a
phone layout, and route failures currently have no recovery.

Sources studied: the kit's `RULES.txt`, all starter source files, and public API
endpoint declarations and ranking/prize contracts bundled into the kit's
`cli/makefun.mjs`. No bundled client code will be copied into our implementation.

Both required live-document fetches were attempted with `curl`:

```sh
curl --fail --silent --show-error --location https://make.fun/api/openapi.json
curl --fail --silent --show-error --location https://make.fun/llms.txt
```

This session cannot retrieve either document: the configured egress proxy cannot
be reached, and direct connections cannot resolve `make.fun`. Endpoint paths
below are supported by the starter and bundled client, but current response
shapes and pagination parameters still require live OpenAPI verification. At the
start of session 2, repeat these fetches and inspect relevant GET paths, query
parameters, response schemas, cache headers and real responses before implementing
field adapters. API documentation is reference material, never downloaded app code.

## Four routes and their API calls

All requests use `https://make.fun/api` and public GET access. Encode slug and
handle path segments. Retain hash routing so direct URLs and refreshes work on a
plain static host without server rewrites.

| Surface | Route | Initial GET calls |
| --- | --- | --- |
| Bounty board | `#/` | `/competitions?status=open&activity=times` |
| Bounty page | `#/bounty/<slug>` | `/competitions/<slug>` |
| Leaderboard | `#/bounty/<slug>/leaderboard` | `/competitions/<slug>/leaderboard`, plus the bounty detail only when uncached and needed for heading/phase metadata |
| Account profile | `#/profile/<handle>` | `/profiles/<handle>` |

Keep pagination, leaderboard phase and board filters in each route's query string
once their API query names are verified. Match the complete leaderboard route
before the bounty route; the starter's loose bounty regex would swallow it.
Reject malformed route segments with a useful page and a link to the board.
Support browser back/forward, document titles and direct entry to every route.

The board shows every displayed bounty's title, summary, live pot, explicit entry
fee or free entry, deadline/time left and entry count. Use `potUsd` with
`rewardAmount` as the documented fallback. Determine whether entries are accepted
from both deadline and lifecycle state: `status=open` can remain after the
deadline. Keep overdue bounties visible as awaiting results, outside the accepting
entries filter, rather than silently losing a whole API page's items.

The bounty page adds separate readable summary, description and rules, a rewards
table, live pot versus base reward, entry fee, relevant dates and truthful status.
Use prize amounts supplied by the public response; distinguish base prizes from
fee shares if the API does not provide live per-place totals. Do not invent a
live distribution by rounding dollar values. Include clear links to its leaderboard,
the board and the original make.fun bounty. Verify where the detail response
exposes rules and prizes; fetch one documented public rules resource only if they
are absent, and count that additional request explicitly.

The leaderboard is a dedicated surface with the bounty title and phase, server
rank, entry title, account handle, score/primary metric and grading/eligibility
state. The bundled ranking contract exposes `rank`, `submission_id`, `handle`,
`title`, `status`, `values` and `display`; adapt to the verified public response
instead of assuming a flat numeric score. Render API column definitions and
formatted values, preserve server ordering/ties, and label provisional standings,
withheld results and house/baseline entries honestly. Show published uncertainty
intervals if returned. Account handles link to our profile route; never fetch a
profile for every row. Phase controls use the phases the API actually advertises.

The profile displays the public identity, avatar, bio and any returned public
competition history/statistics, with entry links back to the associated bounty
and leaderboard. Treat missing optional fields as absent, not zero achievements.
Check whether history is embedded in `/profiles/<handle>` before adding requests;
use an additional history endpoint only if the docs establish one. A 404 is a
clear account-not-found state, and a failed history request must not erase an
otherwise valid identity. Preserve public account privacy and source-withheld flags.

## Design and navigation

Use a compact editorial layout: warm light background, dark readable text, one
strong accent, subtle borders and generous spacing. System fonts and CSS provide
the visual identity. Place the live pot, entry fee and countdown in a consistent
metric group so users can compare opportunities immediately. Use a restrained
header, descriptive page headings, breadcrumbs, and visible detail/leaderboard
navigation. Carry the bounty context onto standings and return links.

Board search and useful accepting/awaiting-results filters operate on loaded data
without a request per keystroke. If the API supports server search, use its
documented query with a short debounce and reset pagination when filters change;
otherwise say that search covers loaded bounties. Sorting also states its scope.
Use real buttons for actions and links for destinations. Avoid account sign-in or
submission controls: this frontend is read-only.

Loading, empty, unpublished, not-found, offline and server-error states should
explain what happened and offer a relevant next step. Never turn a failed request
into an empty-success screen. Preserve already rendered data during a refresh and
show when it was last checked; an unobtrusive retry restores failed views.

## Performance and API restraint

Replace `api.js`'s helper with an authored small cache-aware GET client. Cache by
the complete canonical URL, including phase, filters and pagination. Each record
holds payload, raw response text, ETag, validation time and an in-flight promise.
Deduplicate concurrent calls and reuse detail data when moving to its leaderboard.
Use a bounded memory cache, with optional size-bounded session storage for warm
reloads; storage failures must fall back to memory without breaking navigation.
Start with an LRU bound of 32 URLs or 1 MiB of stored response text, whichever
comes first. Persist only public payload/tag/time records, never pending promises,
and avoid synchronous storage writes during the initial render.

On a fresh cache hit, render immediately without another request. On a stale hit,
keep the cached content visible and revalidate with `If-None-Match`. Handle HTTP
304 before `response.ok`/JSON parsing and reuse the stored payload. A 200 replaces
the payload and tag; if its content is identical, update freshness without
rebuilding the view. An ETag without a cached payload requires an unconditional
request, and a failed refresh must retain usable cached data.

The rules say ETags are minute-bound: the same minute may return 304, but the next
minute returns 200 and a new tag even for unchanged content. Use a roughly one
minute freshness policy informed by the server's exposed Date header where
available. Revalidate on stale navigation, focus or explicit refresh; do not poll
every second or in hidden tabs. The local countdown can update once per minute
without touching the API. Verify CORS exposes ETag and accepts If-None-Match;
conditional cross-origin requests may incur an OPTIONS preflight. If tags are
unavailable, bounded timed caching must still work.

Aim for one data GET for board/detail/profile, and one leaderboard GET plus at
most one uncached detail GET. There is no eager leaderboard/profile prefetch for
every card, no request per row and no background crawl of all list pages.

Page long boards and standings in small batches, initially 25 rows. Prefer the
API's verified cursor/page controls; do not guess that `limit`, `offset` or
`nextCursor` exist. If an endpoint returns the full collection, cache it once and
paginate rendering locally with an honest total. Reuse fetched pages on back/next,
reset page tokens when filters change, and keep row counts bounded rather than
building thousands of DOM nodes.

Keep the header and main shell stable; update only active content, changed rows,
freshness and countdowns. Route generations prevent a slow old request overwriting
a newer page. Give view-specific requests timeouts and cancellation where that
does not cancel another view's shared request. Check HTTP status and JSON errors,
and handle 429 with Retry-After and a bounded retry strategy. Prevent retry loops.

## First-load size

Use vanilla JavaScript ES modules, CSS and semantic HTML, no framework, bundler,
package installation, icon library or external fonts. Author every app change in
recorded sessions. Start with a small shared router/cache/format layer; lazily load
detail, leaderboard and profile modules through literal local `import()` paths
when measurement shows that this reduces the board's initial bytes. Never preload
all deferred surfaces. Keep names and exports clear because the judge sees a short
declaration outline, not the whole source.

The verified starter baseline is six initial files, 4,974 raw bytes and 2,652
summed gzip-9 bytes. Target under 8 KiB gzip for our initial HTML/CSS/JS, ideally
no more than five initial files; treat this as a measured target, not a claim.
Use the unchanged dossier
library's Load Totals to compare actual gzip/raw sizes with the baseline. Favor
fewer files where splitting produces little saving. No decorative image downloads
on the board's first load, no generated raster mockups and no build-only runtime.

Avatars or entry images may load only from URLs the API returns. Assign
`crossorigin="anonymous"` before assigning `src`, since make.fun images use
Cross-Origin-Resource-Policy. Set dimensions, lazy-load offscreen images and handle
failures with text initials to keep the layout stable.

## Phone layout and accessibility

Design from 360 CSS pixels upward, check 390 and 768 pixels, then desktop. Board
rows become cards with labeled metric groups; wrap long titles and handles. Keep
standings' essential rank/entry/score visible on phones; use an accessible bounded
horizontal table container if extra columns cannot fit. Do not make the entire
page scroll sideways. Make navigation wrap and controls comfortably touchable.

Use header/nav/main landmarks, a skip link, one h1 per view, correct heading
levels, labeled controls, table captions and column headers, and visible keyboard
focus. Move focus to the new view's heading on user navigation, preserve it while
refreshing rows, and announce loading/errors politely without announcing every
countdown tick. Supply meaningful image alternatives, minimum 4.5:1 text contrast,
text alongside status colors, and respect reduced motion. Escape all API text and
allow only safe HTTP(S) link targets; render rules as escaped readable text first,
with an authored limited formatter only if it materially improves readability.

## Session 2 sequence and completion checks

1. Verify the live API schemas and sample data, then implement cache/error handling
   and strict routing. Finish bounty rules, rewards and lifecycle details.
2. Implement leaderboard and profile views with real cross-links; verify each
   directly by URL, reload and browser back/forward before styling polish.
3. Apply the design and phone layout, then measure API request counts, DOM limits
   and actual first-load bytes. Add lazy modules only when measurements justify it.
4. Exercise keyboard navigation, failed requests, missing accounts, null scores,
   empty/unpublished boards, route races and past-deadline open bounties. Check
   fresh-cache reuse, 304 within a minute and unchanged 200 after a minute rolls.
5. Preserve `window.__shotReady`: false when a route begins, true only after its
   current data successfully renders; errors are not screenshot-ready success.
   Capture three original unedited browser images on live data: board as cover,
   bounty with rewards, and leaderboard. Use a phone viewport for one where the
   key data remains legible. Manually verify the profile as the fourth surface.
6. Update `shots.json` to match actual capture routes/viewports. Each PNG/JPEG must
   be at most 256 KiB, with long side at most 1280 and short side at least 360.
   Meet these limits during capture, never by editing or compositing an image.
7. Author and revise a meaningful `main.ts` packaging change in session 2: check
   that exactly three capture files exist and report an actionable error before
   copying the submission. Retain the unchanged library and standard-library-only,
   network-free build; the library alone currently permits fewer than three images.
   The transcript gate requires an authored entrypoint line and a code file revised
   across assistant writes; copying starter lines and revising docs alone do not
   satisfy those final-entry requirements. Keep session recordings intact; the
   parent handles their sealing and submission, including a truthful run record
   when required from 2026-11-17 00:00 UTC.
8. Run `main.ts` twice with separate `MAKEFUN_OUTPUT_DIR` directories outside the
   repo and compare all output bytes. Check dossier/reference/source/screenshot
   limits: app at most 993 files/directories and 16 MiB; each capture at most
   256 KiB; dossier at most 1.5 MiB with source text capped at 160 KiB; all output
   at most 1,000 entries and 64 MiB. Keep source small enough to avoid truncation,
   and verify the vendor hash still matches the kit. Document measured
   validation, commit the completed entry, and leave pushing to the parent.

Session 1 intentionally contains no screenshot images and no implemented
leaderboard/profile. It is a setup baseline, not a submission-ready entry.

Setup verification: all 11 requested starter files match the kit byte for byte;
the public owner claim matches the requested exact bytes; every starter JavaScript
module passes `node --check`. Vendor SHA-256 is
`4c8da1c8e76490b3a847670f49137d3ec23953e3c988fe6a6cb320fce5739240`.
`node main.ts` reaches the dossier library and correctly refuses the missing
screenshots; a complete build waits for our captures. This sandbox also refuses
binding localhost:8080, so browser rendering and live API checks remain unverified.
