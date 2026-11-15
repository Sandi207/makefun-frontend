# Final entry validation

Finalization was performed offline on 2026-11-15 with Node v24.22.1. No network
fetches, local server, browser or screenshot generation were attempted in this
sandbox. The parent already verified rendering on live data in a real browser
and supplied three original, unedited JPEG captures. The final packaging
measurements below include those captures and the profile score fix.

## Profile score fix and Retry review

The parent's live verification found that Public work serialized each score
object. The saved public profile response at
`/home/hatch/workspace/codex-ar-test/api-docs/profile-vivid-gecko-35.json`
confirms that solution scores contain column metadata, a numeric `value` and a
formatted `display`. The profile now prefers `score.display`, then `score.value`,
then “Not published”, while preserving a plain numeric score, including zero.
Null scores are unpublished.
The selected value is escaped before rendering, as on the leaderboard. Reference
JSON remains outside the repository.

An additional offline render check read the saved response directly and verified
all three published score cells. Twelve authored cases covered formatted display
priority, value fallback, numeric scores and zero, missing/null fields, an empty
score object, an empty display string and escaped markup. No reference payload
was copied into the repo.

The Retry button's `data-retry` click calls `render(true)`. That flag reaches
every `resource(path, force)` call and bypasses fresh cache reuse. Settled failed
requests are removed from the in-flight map, allowing a new GET after recovery.
Explicit retries respect an active Retry-After cooldown. No API recovery defect
was found, so the existing Retry path is retained.

Mocked clicks through the actual document click handler recovered from both a
network failure and HTTP 500. Each Retry made a new GET, restored the profile,
updated the checked notice and set `window.__shotReady` to true. A second click
on each freshly cached result also made a GET. These checks used a minimal DOM
facade and mocked fetch, with no browser or live traffic.

## API evidence and limits

Read the saved OpenAPI document and agent documentation at
`/home/hatch/workspace/codex-ar-test/api-docs/`; neither reference file was copied
into this repo.
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
The parent verified live rendering; finalization additionally checked profile
scores against the saved real response. Missing optional fields are shown as
unpublished, rather than fabricated as zero or a live prize split. Offline
fixtures do not establish every optional payout shape or CORS header behavior.

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
Capture counts of 0, 2 and 4 fail before output exists. Group 13's directory
fixture named `2.jpg` is still rejected, with no output created. Its cleanup
now uses `rmSync(path, { recursive: true, force: true })` before replacing it
with a regular-file fixture; this fixes `ERR_FS_EISDIR` without weakening any
assertion. The same group verifies that an output inside the repository is
rejected and an occupied output retains its existing file. All fixtures are
under a temporary directory, separate from the real `screenshots/`.

The four hash routes remain intact. Route starts clear `window.__shotReady`;
only successfully rendered current-route data enables it. Missing accounts and
invalid routes remain unready, and late responses cannot overwrite a newer
route. Supplemental rules remain unready while loading. Stale refresh failures
retain previously rendered data with an explicit failure notice.

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
Totals: first load 3 files, 8549 bytes gzip-9 (23984 raw); later by import() 4 files, 6961 bytes gzip-9; whole app 8 files, 46223 bytes
```

| Initial file | Raw bytes | gzip-9 bytes |
| --- | ---: | ---: |
| index.html | 1,238 | 631 |
| style.css | 5,205 | 1,754 |
| main.js | 17,541 | 6,164 |
| Total | 23,984 | 8,549 |

8,549 bytes is 8.35 KiB, 357 bytes above the 8-KiB target. These are computed file
sizes, not observed browser transfer sizes; API JSON and image transfers are
excluded.
The four deferred JS modules total 6,961 gzip bytes. Deferred `surfaces.css` is
4,737 raw / 1,422 gzip bytes; it is linked by the shared surface module and is
not included in the library's literal-import module total. Eagerly loading these
same view modules and CSS would increase the initial load to 16,932 gzip bytes
across 8 files: lazy loading saves 8,383 gzip bytes and 5 board file requests.

Every JS/MJS file passed `node --check`: the five app modules and
`tests/offline.mjs`. Both rewritten TypeScript entrypoints, `main.ts` and
`serve.ts`, also passed `node --check`. `main.ts` executed successfully;
`serve.ts` was syntax-checked only, without starting a server.

Two final `main.ts` runs used separate, empty directories outside this repo:

- `/tmp/makefun-rebuild-a-nCiP7U`
- `/tmp/makefun-rebuild-b-liRkX9`

All 12 output files and the entire 14-entry tree are byte-identical. Each dossier
also equals a fresh `buildDossier(output, caps)` result byte for byte.
Dossier SHA-256: `c58d410c2dcbe69ef4654799969a493b2c07f687a8f5c86be59b01042309d1d2`.

| Packaging measurement | Result | Limit |
| --- | ---: | ---: |
| App files/directories (root excluded) | 8 / 0 | 993 entries |
| App bytes | 46,223 | 16,777,216 |
| Dossier text including Load block | 47,571 | 163,840 |
| Dossier JSON with real captures | 343,111 | 1,572,864 |
| Entire output files/directories | 12 / 2 | 1,000 entries |
| Entire output bytes | 609,705 | 67,108,864 |

All source fits without truncation, verified by matching each complete source
against the dossier text. `file` verifies that each retained capture is a JPEG
with the dimensions below; the measured file lengths meet the byte cap. Their
hashes match the start of this finalization, and both outputs preserve their
bytes, with no editing or recompression:

| Real browser capture | Bytes | Dimensions |
| --- | ---: | --- |
| 1-board.jpg | 98,269 | 1280 × 960 |
| 2-bounty.jpg | 81,363 | 1280 × 960 |
| 3-bounty.jpg | 40,739 | 390 × 844 |

All three are below 262,144 bytes, have a long side at most 1280 and a short side
at least 360, and match their `shots.json` viewports. The first two shot entries
are unchanged. The third is
`#/bounty/github-core-clone-01/leaderboard?phase=dev`; the older FPS final phase
has no published standings and is no longer the capture target. An empty
`.nojekyll` file is present at the repository root for GitHub Pages.

Vendor SHA-256 matches the kit:
`4c8da1c8e76490b3a847670f49137d3ec23953e3c988fe6a6cb320fce5739240`.
The saved API docs, build outputs and measurements JSON remain outside the repo.
The real screenshots, `shots.json`, `.nojekyll`, `.makefun/owner.json`, `LICENSE`,
`README.md` and `PLAN.md` also match their hashes at the start of this pass.

Final measurements JSON: `/tmp/makefun-rebuild-measurements.json`.

## Parent handoff

The parent already verified the app on live data and supplied all three captures.
The profile correction has been verified offline against the saved live profile
and the score edge cases above. No live HTTP or local serving was attempted here.

This sandbox makes the working checkout's `.git` read-only: `git add` failed
creating `.git/index.lock`. The finalization commit is therefore prepared in a
temporary local bare repository, using this working tree and the same base HEAD,
and exported to `/tmp/makefun-rebuild-commit-pp_maw39/makefun-rebuild.bundle`.
The original checkout keeps its uncommitted working files. The parent must
import the bundle and update this checkout's Git metadata before pushing; the
working files already match the exported commit.

Then push the finalized commit, run the kit's submission check, seal the session
recordings and submit. If submission occurs on or after 2026-11-17 00:00 UTC,
include the required truthful run record. Nothing is pushed from this sandbox.
