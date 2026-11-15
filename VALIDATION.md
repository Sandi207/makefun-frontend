# Session 2 validation

Validation was performed offline on 2026-11-15 with Node v24.22.1. No network
fetches, local server, browser or screenshot generation were attempted.

## API evidence and limits

Read the saved OpenAPI document and agent documentation at
`/tmp/codex-ar-test/api-docs/`; neither reference file was copied into this repo.
OpenAPI declares public GET access and the following parameters:

- Board: `status=open`, `activity=times`, `limit`, `cursor`. Agent docs establish
  `items` and `next_cursor` list pagination. Request size is 25, with a local
  25-row fallback if a response contains more rows.
- Detail: `submissions=summary` omits the full submissions array. Agent docs
  establish rules, prizes, phases and resolution in the detail response.
  A missing rules/prizes block triggers at most one public `/requirements` GET.
- Leaderboard: `phase=dev|final`, `view=performance`, `ties=runs`. There is no
  documented cursor or limit. Fetch the full collection once and render 25 rows.
  Column definitions, values/display, server ranks, withheld scores, provisional
  placements, house/baseline flags and public grading/eligibility are preserved.
- Profile: `/profiles/{handle}` includes public record and solutions. No separate
  history endpoint is needed. Hidden identity links remain absent.

The successful OpenAPI responses have descriptions but **no JSON schemas or
examples**. The agent docs establish semantic contracts, with ranking/prize
field names also corroborated by the kit's bundled contract declarations.
Field compatibility still requires live verification, particularly profile
picture shapes and the optional requirements payout block. Missing fields are
shown as unpublished, rather than fabricated as zero or a live prize split.

The rules document public CORS and minute-bound ETags. OpenAPI/agent docs do not
prove that browsers can read ETag/Date or send If-None-Match across origins. The
client conditionally revalidates when a tag is readable and falls back to timed
caching otherwise. Exposed Cache-Control/Date/Age inform freshness, bounded by
the next server minute for ETagged responses. Profile's documented cache policy
is `public, max-age=120, stale-while-revalidate=300`; no-store responses are not
retained. Browser HTTP cache is bypassed so the app's validation is explicit.

## Offline behavior checks

`node tests/offline.mjs`: 13 groups passed using authored fixtures and a minimal
DOM facade, never a browser. Checks cover strict routes, URL canonicalization,
concurrent deduplication, fresh reuse, 304 before parsing, unchanged 200 across
minute rollover, Retry-After cooldowns, failed refresh retention, 32-URL eviction,
1-MiB UTF-8 byte eviction, oversized uncached responses, missing ETags, no-store,
malformed JSON, account 404, overdue status, rules/rewards, null scores, withheld
standings, safe avatar URLs, missing public stats, route races and shot readiness.
Capture counts of 0, 2 and 4 fail before output exists.

Measured mocked GET calls (not observed live browser traffic):

| Navigation | GET calls |
| --- | ---: |
| Board / new API cursor | 1 |
| Bounty with embedded rules/prizes | 1 |
| Bounty → leaderboard with fresh detail | 1 |
| Direct leaderboard with uncached detail | 2 |
| Profile | 1 |
| Fresh profile revisit | 0 |
| Search change on a fresh board API page | 0 |

Optional missing rules/rewards add at most 1 GET. Module/style requests and CORS
OPTIONS are separate from these counts. There are no per-entry/profile reads,
keystroke requests, eager prefetches or automatic retries. Refresh/focus/navigation
revalidate stale records; minute countdown updates never call the API. At most
25 board, leaderboard or profile-history rows are emitted per view (verified on
fixtures; actual browser DOM counts remain unmeasured).

## Final measurements

The unchanged dossier library reports:

```text
Totals: first load 3 files, 8126 bytes gzip-9 (22380 raw); later by import() 4 files, 5972 bytes gzip-9; whole app 8 files, 39777 bytes
```

| Initial file | Raw bytes | gzip-9 bytes |
| --- | ---: | ---: |
| index.html | 1,054 | 588 |
| style.css | 5,045 | 1,676 |
| main.js | 16,281 | 5,862 |
| Total | 22,380 | 8,126 |

8,126 bytes is 7.94 KiB, below the 8-KiB target. These are computed file sizes,
not observed browser transfer sizes; API JSON and image transfers are excluded.
The four deferred JS modules total 5,972 gzip bytes. Deferred `surfaces.css` is
3,880 raw / 1,253 gzip bytes; it is linked by the shared surface module and is
not included in the library's literal-import module total. Eagerly loading these
same view modules and CSS would increase the initial load to 15,351 gzip bytes
across 8 files: lazy loading saves 7,225 gzip bytes and 5 board file requests.

Every JS/MJS file passed `node --check`: the five app modules and
`tests/offline.mjs`. `main.ts` also passed syntax checking and execution.
The unchanged TypeScript `serve.ts` was not executed; Node's direct `--check`
rejects its type annotations, so it was excluded from the JS-only syntax sweep.

Two final `main.ts` runs used separate, empty directories outside this repo:

- `/tmp/makefun-final-a-wkkae6mk`
- `/tmp/makefun-final-b-dwx2khjo`

All 12 output files and the entire 14-entry tree are byte-identical. Each dossier
also equals a fresh `buildDossier(output, caps)` result byte for byte.
Dossier SHA-256: `63d990f6d8fb97108790406a236ccf8b6d174e634a0f63b0c7cfa00d808b8659`.

| Packaging measurement | Result | Limit |
| --- | ---: | ---: |
| App files/directories (root excluded) | 8 / 0 | 993 entries |
| App bytes | 39,777 | 16,777,216 |
| Dossier text including Load block | 41,125 | 163,840 |
| Dossier JSON with placeholder images | 563,188 | 1,572,864 |
| Entire output files/directories | 12 / 2 | 1,000 entries |
| Entire output bytes | 993,538 | 67,108,864 |

All source fits without truncation. Current captures are unchanged kit JPEGs:

| Placeholder | Bytes | Dimensions |
| --- | ---: | --- |
| 1-board.jpg | 113,857 | 1280 × 800 |
| 2-bounty.jpg | 160,410 | 1280 × 800 |
| 3-bounty.jpg | 116,306 | 1280 × 800 |

All three are below 262,144 bytes and meet the dimension limits. The parent must
remeasure after replacing them; their current viewports differ from `shots.json`.

Vendor SHA-256 matches the kit:
`4c8da1c8e76490b3a847670f49137d3ec23953e3c988fe6a6cb320fce5739240`.
The saved API docs, build outputs and measurements JSON remain outside the repo.

## Parent verification

Replace the three unchanged starter placeholders with original, unedited live
browser captures. Current placeholder dimensions and dossier sizes validate only
packaging, not visual correctness. The planned phone capture uses the older FPS bounty’s final leaderboard; confirm
that its standings are published before capturing. Check `shots.json` routes, reward visibility,
phone leaderboard columns, actual profile picture fields and all four direct
URLs/reloads/back/forward. Check keyboard focus, the skip link, image error
fallbacks, status transitions and screen-reader behavior in a browser.
