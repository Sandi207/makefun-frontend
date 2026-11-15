// Deterministic public-response fixtures; no HTTP server or live fetch is used.
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const documentEvents = new Map(), windowEvents = new Map(), appEvents = new Map();
const selectedNodes = new Map(), attributes = new Map(), sheets = [];
const notice = { textContent: '' };
let html = '', paints = 0, focuses = 0, minuteTick;
const app = {
  get innerHTML() { return html; },
  set innerHTML(value) { html = value; paints++; },
  setAttribute(name, value) { attributes.set(name, value); },
  querySelector() { return { focus() { focuses++; } }; },
  querySelectorAll(selector) { return selectedNodes.get(selector) || []; },
  addEventListener(type, callback) { appEvents.set(type, callback); },
  focus() { focuses++; },
};
globalThis.document = {
  hidden: false, title: '',
  getElementById(name) { return name === 'app' ? app : notice; },
  createElement() { return {}; },
  head: { append(sheet) { sheets.push(sheet); queueMicrotask(() => sheet.onload?.()); } },
  addEventListener(type, callback) { documentEvents.set(type, callback); },
};
globalThis.window = {
  addEventListener(type, callback) { windowEvents.set(type, callback); },
  scrollTo() {},
};
let hash = '#/initial-invalid-route';
globalThis.location = {
  get hash() { return hash; },
  set hash(value) { hash = value.startsWith('#') ? value : '#' + value; },
};

const originalNow = Date.now, originalInterval = globalThis.setInterval;
let clock = Date.parse('2026-11-15T09:00:10Z');
Date.now = () => clock;
globalThis.setInterval = (callback, delay) => { assert.equal(delay, 60000); minuteTick = callback; return 0; };
const reads = [];
let respond = address => { throw new Error('Unexpected mocked read: ' + address); };
globalThis.fetch = async (address, options) => {
  reads.push({ address, options });
  return respond(address, options);
};

const core = await import('../app/main.js');
assert.equal(sheets.length, 0, 'the initial module must not load view styles');
const detail = await import('../app/detail.js');
const leaderboard = await import('../app/leaderboard.js');
const profile = await import('../app/profile.js');
const shared = await import('../app/surface.js');
await shared.styled;
assert.equal(sheets.length, 1, 'deferred views share one stylesheet');

function reply(data, overrides = {}) {
  const headers = { ETag: '"offline"', Date: new Date(clock).toUTCString(), 'Cache-Control': 'public, max-age=60' };
  for (const [name, value] of Object.entries(overrides)) value == null ? delete headers[name] : headers[name] = value;
  return new Response(JSON.stringify(data), { headers });
}
const route = address => core.parseRoute(address);
const occurrences = (source, token) => source.split(token).length - 1;
const settle = () => new Promise(resolve => setImmediate(resolve));
const retryClick = () => documentEvents.get('click')({ target: { closest: selector => selector === '[data-retry]' ? {} : null } });
let passed = 0;
async function group(name, exercise) {
  await exercise();
  console.log(`PASS ${++passed}: ${name}`);
}

const bounty = {
  slug: 'sample-bounty', title: 'Build a useful tool', summary: 'Small programs for big ideas.',
  description: 'A readable public description.', rules: '# Original work\n\nExplain what you built.',
  status: 'open', deadline: '2026-11-14T12:00:00Z', createdAt: '2026-11-01T12:00:00Z',
  rewardAmount: '500', potUsd: '530.25', entryFeeUsd: '2.50', submissionCount: 0,
  prizes: [{ place: 1, amount_usd: '150' }], phases: [{ key: 'dev' }, { key: 'final', finalized: false }],
};

try {
  await group('Four strict routes and bounded query values', () => {
    for (const [address, kind, segment] of [
      ['', 'board', ''], ['#/', 'board', ''], ['#/bounty/sample-bounty', 'detail', 'sample-bounty'],
      ['#/bounty/sample-bounty/leaderboard?phase=dev', 'leaderboard', 'sample-bounty'],
      ['#/profile/%40tester?page=2', 'profile', '@tester'],
    ]) {
      const parsed = route(address);
      assert.equal(parsed.kind, kind); assert.equal(parsed.segment, segment);
    }
    const invalid = ['#/bounty/x/else', '#/bounty/x/', '#/profile/%2F', '#/bounty/%E0%A4%A',
      '#/?q=%GG', '#/?q=one?two', '#/?page=0', '#/?page=01', '#/?page=1&page=2',
      '#/?sort=random', '#/?filter=closed', '#/bounty/x/leaderboard?phase=other',
      '#/bounty/x?extra=1', '#/profile/tester?cursor=a', '#/?q=' + 'a'.repeat(201)];
    for (const address of invalid) assert.throws(() => route(address), address);
    assert.equal(shared.bountyPath('space/slug'), '/competitions/space%2Fslug?submissions=summary');
    assert.deepEqual(core.boardPaths(route('#/?cursor=one&q=tool&page=2')), ['/competitions?status=open&activity=times&limit=25&cursor=one']);
  });

  await group('Canonical GET deduplication and fresh reuse', async () => {
    let finish;
    respond = () => new Promise(resolve => { finish = resolve; });
    const before = reads.length;
    const first = core.resource('/checks/shared?z=2&a=1');
    const second = core.resource('/checks/shared?a=1&z=2');
    assert.equal(first.ready, second.ready); assert.equal(reads.length - before, 1);
    finish(reply({ items: [42] }));
    const entry = await first.ready;
    assert.equal(reads.at(-1).address, 'https://make.fun/api/checks/shared?a=1&z=2');
    assert.equal(reads.at(-1).options.credentials, 'omit'); assert.equal(reads.at(-1).options.cache, 'no-store');
    const warm = await core.resource('/checks/shared?z=2&a=1').ready;
    assert.equal(warm.data, entry.data); assert.equal(reads.length - before, 1);
  });

  await group('304 avoids parsing; a new minute preserves identical data', async () => {
    const before = core.resource('/checks/shared?a=1&z=2').record;
    let bodyReads = 0;
    respond = () => ({ status: 304, ok: false, headers: new Headers({ Date: new Date(clock).toUTCString() }),
      text() { bodyReads++; throw new Error('304 must have no body read'); } });
    const validated = await core.resource('/checks/shared?a=1&z=2', true).ready;
    assert.equal(validated.data, before.data); assert.equal(bodyReads, 0);
    assert.equal(reads.at(-1).options.headers['If-None-Match'], '"offline"');
    clock += 60000;
    respond = () => reply({ items: [42] }, { ETag: '"minute-b"' });
    const renewed = await core.resource('/checks/shared?a=1&z=2').ready;
    assert.equal(renewed.data, before.data); assert.equal(renewed.etag, '"minute-b"');
    assert.equal(renewed.until, clock - clock % 60000 + 60000);
    respond = () => reply({}, { Date: new Date(clock + 25000).toUTCString(), Age: '5', 'Cache-Control': 'max-age=120' });
    assert.equal((await core.resource('/checks/server-age').ready).until, clock + 20000);
  });

  await group('Refresh failures retain data and obey Retry-After', async () => {
    respond = () => new Response('', { status: 429, headers: { 'Retry-After': '20' } });
    await assert.rejects(core.resource('/checks/shared?a=1&z=2', true).ready, error => error.status === 429);
    assert.deepEqual(core.resource('/checks/shared?a=1&z=2').record.data, { items: [42] });
    let before = reads.length;
    await assert.rejects(core.resource('/checks/shared?a=1&z=2', true).ready);
    assert.equal(reads.length, before);
    clock += 21000; respond = () => reply({ recovered: true });
    await core.resource('/checks/shared?a=1&z=2', true).ready;
    respond = () => new Response('', { status: 503, headers: { 'Retry-After': new Date(clock + 7000).toUTCString() } });
    await assert.rejects(core.resource('/checks/busy').ready, error => error.status === 503);
    before = reads.length;
    await assert.rejects(core.resource('/checks/busy', true).ready); assert.equal(reads.length, before);
    clock += 8000; respond = () => reply({ recovered: true });
    await core.resource('/checks/busy', true).ready;
    respond = () => { throw new DOMException('aborted', 'AbortError'); };
    await assert.rejects(core.resource('/checks/abort').ready, /timed out/);
  });

  await group('LRU recency, 32 URLs and one MiB of UTF-8 bytes', async () => {
    respond = () => reply({ small: true });
    for (let index = 0; index < 32; index++) await core.resource(`/checks/count/${index}`).ready;
    await core.resource('/checks/count/0').ready;
    await core.resource('/checks/count/32').ready;
    const evicted = core.resource('/checks/count/1');
    assert.equal(evicted.record, undefined); await evicted.ready;
    assert.ok(core.resource('/checks/count/0').record);
    respond = () => reply({ buffer: '€'.repeat(200000) });
    const large = await core.resource('/checks/bytes/a').ready;
    assert.ok(large.size > 600000);
    await core.resource('/checks/bytes/b').ready;
    const removed = core.resource('/checks/bytes/a');
    assert.equal(removed.record, undefined); await removed.ready;
    respond = () => reply({ buffer: 'x'.repeat(1048580) });
    await core.resource('/checks/oversized').ready;
    const again = core.resource('/checks/oversized');
    assert.equal(again.record, undefined); await again.ready;
    assert.equal(reads.at(-1).options.headers['If-None-Match'], undefined);
  });

  await group('Board keeps overdue bounties and limits local pages to 25', () => {
    const items = Array.from({ length: 28 }, (_, index) => ({ ...bounty, slug: 'tool-' + index,
      title: index ? 'Tool ' + index : '<script>unsafe</script>', deadline: index === 27 ? '2026-11-20T12:00:00Z' : bounty.deadline }));
    const data = { items, next_cursor: 'cursor + space', total: 100 };
    const first = core.boardView([data], route('#/'));
    assert.equal(occurrences(first, 'class="bounty-copy"'), 25);
    assert.ok(first.includes('Awaiting results')); assert.ok(!first.includes('<script>'));
    const accepting = core.boardView([data], route('#/?filter=accepting'));
    assert.equal(occurrences(accepting, 'class="bounty-copy"'), 1); assert.ok(accepting.includes('Tool 27'));
    const second = core.boardView([data], route('#/?page=2'));
    assert.equal(occurrences(second, 'class="bounty-copy"'), 3); assert.ok(second.includes('cursor=cursor+%2B+space'));
    assert.equal(core.lifecycle(bounty), 'Awaiting results'); assert.equal(core.lifecycle({ ...bounty, demo: true }), 'Demo · no entries');
    assert.equal(core.money(null), 'Not published'); assert.equal(core.money(0), '$0'); assert.equal(core.fee({ entryFeeUsd: 0 }), 'Free entry');
    assert.ok(core.metrics({ ...bounty, potUsd: null }).includes('$500'));
  });

  await group('Detail separates live pot, base prizes and readable rules', () => {
    const overview = detail.render([bounty], route('#/bounty/sample-bounty'));
    for (const expected of ['$530.25', 'Base reward $500', '$150', 'Explain what you built.', 'Entry deadline']) assert.ok(overview.includes(expected), expected);
    assert.ok(overview.indexOf('id="rewards"') < overview.indexOf('id="description-title"'));
    assert.equal(detail.extra([bounty]), '');
    const missing = { ...bounty, rules: null, prizes: null };
    assert.equal(detail.extra([missing]), '/competitions/sample-bounty/requirements');
    const supplemental = detail.render([missing, { rules: '<script>rules</script>', payout_curve: [{ place: 2, amount_usd: '70' }] }], route('#/bounty/sample-bounty'));
    assert.ok(supplemental.includes('$70')); assert.ok(!supplemental.includes('<script>'));
    assert.equal(detail.extra([{ ...bounty, prizes: undefined, bundle: { prizes: [] } }]), '');
  });

  await group('Standings preserve server ordering, ties, metrics and privacy', () => {
    const standings = { phase: { key: 'dev', placements_held: true }, scores_visible: true,
      metrics_withheld: true, rank_key: 'points', columns: [{ key: 'cost', title: 'Cost' }, { key: 'points', title: 'Points' }],
      entries: [
        { rank: 4, title: 'Server first', handle: 'tester', baseline: true, status: 'grading', prize_eligible: false,
          source_withheld: true, display: { points: '92%' }, values: { cost: 0 }, interval: [0.9, 1], tie_runs: [[4, 5]] },
        { rank: 4, title: 'Tie remains second', house: true, values: { points: null }, reasons: ['Pending'] },
      ] };
    const address = route('#/bounty/sample-bounty/leaderboard');
    const table = leaderboard.render([bounty, standings], address);
    for (const expected of ['#/profile/tester', 'Provisional standings', 'No prize eligibility', 'Source private', 'Statistical tie reported', 'Identity withheld', '>—<', '>92%<']) assert.ok(table.includes(expected), expected);
    assert.ok(table.indexOf('>Points</th>') < table.indexOf('>Cost</th>'));
    assert.ok(table.indexOf('Server first') < table.indexOf('Tie remains second'));
    const hidden = leaderboard.render([bounty, { ...standings, scores_visible: false }], address);
    assert.ok(hidden.includes('Scores are not public yet')); assert.ok(!hidden.includes('Server first'));
    const many = { ...standings, entries: Array.from({ length: 27 }, (_, index) => ({ rank: index + 1, title: 'Entry ' + index })) };
    assert.equal(occurrences(leaderboard.render([bounty, many], address), 'class="rank"'), 25);
    assert.equal(occurrences(leaderboard.render([bounty, many], route('#/bounty/sample-bounty/leaderboard?page=2')), 'class="rank"'), 2);
  });

  await group('Profile score display/value, missing stats and safe avatars', () => {
    const account = { handle: 'tester', bio: '<iframe src=bad>', record: { competitions_won: 3 },
      solutions: [{ title: 'My public work', competition: { slug: bounty.slug, title: bounty.title }, place: 1, score: null }] };
    const address = route('#/profile/tester');
    const publicPage = profile.render([account], address);
    assert.ok(publicPage.includes('<dt>Wins</dt><dd>3</dd>')); assert.ok(!publicPage.includes('<dt>Bounties entered</dt>'));
    assert.ok(publicPage.includes('#/bounty/sample-bounty/leaderboard')); assert.ok(!publicPage.includes('<iframe'));
    const cases = [
      [{ column: { key: 'rating' }, display: '9.3 / 10', value: 9.3 }, '9.3 / 10'],
      [{ value: 18 }, '18'], [{ display: null, value: 0 }, '0'], [{ display: 0, value: 33 }, '0'],
      [0, '0'], [7, '7'], [null, 'Not published'], [undefined, 'Not published'],
      [{}, 'Not published'], [{ display: null, value: null }, 'Not published'],
      [{ display: '<img src=x onerror=bad>', value: 12 }, '&#60;img src=x onerror=bad&#62;'],
      [{ display: '', value: 12 }, ''],
    ];
    for (const [score, expected] of cases) {
      const output = profile.render([{ ...account, solutions: [{ ...account.solutions[0], score }] }], address);
      assert.equal(output.match(/<dt>Score<\/dt><dd>(.*?)<\/dd>/s)?.[1], expected);
    }
    const longHistory = { ...account, solutions: Array.from({ length: 27 }, (_, index) => ({
      ...account.solutions[0], title: 'Public work ' + index, score: index,
    })) };
    assert.equal(occurrences(profile.render([longHistory], address), '<dt>Score</dt>'), 25);
    assert.equal(occurrences(profile.render([longHistory], route('#/profile/tester?page=2')), '<dt>Score</dt>'), 2);
    for (const unsafe of [undefined, '', 'javascript:alert(1)', 'data:image/png;base64,AA']) assert.equal(shared.safeUrl(unsafe), '');
    const picture = profile.render([{ ...account, picture: { avatar: { url: '/public/avatar.webp' } } }], address);
    assert.ok(picture.includes('crossorigin="anonymous" src="https://make.fun/public/avatar.webp"'));
    let removed = false;
    documentEvents.get('error')({ target: { tagName: 'IMG', remove() { removed = true; } } });
    assert.ok(removed);
    const fixture = '/home/hatch/workspace/codex-ar-test/api-docs/profile-vivid-gecko-35.json';
    if (existsSync(fixture)) {
      const recorded = JSON.parse(readFileSync(fixture, 'utf8'));
      const output = profile.render([recorded], route('#/profile/' + recorded.handle));
      const scores = [...output.matchAll(/<dt>Score<\/dt><dd>(.*?)<\/dd>/g)].map(match => match[1]);
      assert.deepEqual(scores, recorded.solutions.map(solution => core.esc(solution.score.display)));
      assert.equal(scores.length, 3);
      console.log('REFERENCE: three saved public profile scores rendered as display text.');
    }
  });

  await group('Route races, cached refreshes and screenshot readiness', async () => {
    let finishBoard;
    respond = address => new URL(address).pathname === '/api/competitions'
      ? new Promise(resolve => { finishBoard = resolve; }) : reply({ handle: 'race-target', solutions: [] });
    location.hash = '#/'; const slow = core.render(); await settle();
    assert.equal(window.__shotReady, false); assert.equal(attributes.get('aria-busy'), 'true');
    location.hash = '#/profile/race-target'; await core.render();
    assert.equal(window.__shotReady, true); assert.ok(html.includes('@race-target'));
    assert.equal(document.title, 'race-target | make.fun');
    finishBoard(reply({ items: [bounty] })); await slow;
    assert.ok(html.includes('@race-target')); assert.equal(document.title, 'race-target | make.fun');
    const rendered = html, focusBefore = focuses;
    clock += 60001; respond = () => { throw new TypeError('offline fixture'); };
    await core.render();
    assert.equal(html, rendered); assert.equal(focuses, focusBefore); assert.ok(notice.textContent.includes('Showing cached data.'));
    location.hash = '#/unknown'; await core.render(); assert.equal(window.__shotReady, false);
    let finishRules;
    respond = address => address.endsWith('/requirements') ? new Promise(resolve => { finishRules = resolve; })
      : address.includes('/profiles/') ? reply({ handle: 'after-rules', solutions: [] })
      : reply({ ...bounty, slug: 'rules-race', rules: null, prizes: null });
    location.hash = '#/bounty/rules-race'; const pendingRules = core.render(); await settle();
    assert.equal(window.__shotReady, false); assert.equal(typeof finishRules, 'function');
    location.hash = '#/profile/after-rules'; await core.render();
    finishRules(reply({ rules: 'Supplemental rules', prizes: [] })); await pendingRules;
    assert.equal(window.__shotReady, true); assert.ok(html.includes('@after-rules'));
  });

  await group('Surface GET budgets, warm navigation and local controls', async () => {
    respond = address => {
      const path = new URL(address).pathname;
      if (path.includes('/profiles/')) return reply({ handle: path.split('/').at(-1), solutions: [] });
      if (path.endsWith('/leaderboard')) return reply({ phase: { key: 'dev' }, scores_visible: true, entries: [] });
      if (path.endsWith('/requirements')) return reply({ rules: 'Public extra rules', prizes: [] });
      if (path === '/api/competitions') return reply({ items: [bounty] });
      const slug = path.split('/').at(-1);
      return reply({ ...bounty, slug, ...(slug === 'counts-needs-rules' ? { rules: null, prizes: null } : {}) });
    };
    const journeys = [
      ['#/?cursor=budget-page', 1], ['#/bounty/counts-one', 1], ['#/bounty/counts-one/leaderboard', 1],
      ['#/bounty/counts-direct/leaderboard', 2], ['#/profile/counts-tester', 1], ['#/profile/counts-tester', 0],
      ['#/?cursor=budget-page&q=tool', 0], ['#/profile/counts-tester?page=2', 0],
      ['#/bounty/counts-one/leaderboard?phase=final', 1], ['#/bounty/counts-needs-rules', 2], ['#/bounty/counts-needs-rules', 0],
    ];
    for (const [address, budget] of journeys) {
      const before = reads.length; location.hash = address; await core.render();
      assert.equal(reads.length - before, budget, address); assert.equal(window.__shotReady, true, address);
      console.log(`GETS ${budget}: ${address}`);
    }
    const before = reads.length;
    document.hidden = true; windowEvents.get('focus')(); minuteTick(); await settle();
    document.hidden = false;
    const countdown = { dataset: { deadline: bounty.deadline }, textContent: '' };
    const status = { dataset: { state: 'open', end: bounty.deadline }, textContent: '', classList: {
      toggle(name, value) { assert.equal(name, 'accepting'); assert.equal(value, false); },
    } };
    selectedNodes.set('[data-deadline]', [countdown]); selectedNodes.set('[data-state]', [status]);
    minuteTick();
    assert.equal(countdown.textContent, 'Deadline passed'); assert.equal(status.textContent, 'Awaiting results');
    selectedNodes.clear(); assert.equal(reads.length, before);
    location.hash = '#/?cursor=budget-page&page=2'; await core.render();
    const originalFormData = globalThis.FormData;
    try {
      globalThis.FormData = class { *[Symbol.iterator]() { yield ['q', 'tool']; yield ['filter', 'awaiting']; yield ['sort', 'pot']; } };
      let prevented = false;
      appEvents.get('submit')({ target: { id: 'board-controls' }, preventDefault() { prevented = true; } });
      assert.ok(prevented); assert.ok(!location.hash.includes('page='));
      await windowEvents.get('hashchange')(); assert.equal(reads.length, before);
    } finally { globalThis.FormData = originalFormData; }
  });

  await group('Untagged caching, no-store, API failures and real Retry clicks', async () => {
    respond = () => reply({ items: [] }, { ETag: null, 'Cache-Control': 'public, max-age=120' });
    await core.resource('/checks/untagged').ready;
    let before = reads.length; await core.resource('/checks/untagged').ready; assert.equal(reads.length, before);
    clock += 121000;
    await core.resource('/checks/untagged').ready;
    assert.equal(reads.length - before, 1); assert.equal(reads.at(-1).options.headers['If-None-Match'], undefined);
    respond = () => reply({ items: [1] }, { 'Cache-Control': 'no-store' });
    await core.resource('/checks/untagged', true).ready;
    const uncached = core.resource('/checks/untagged'); assert.equal(uncached.record, undefined); await uncached.ready;
    respond = () => reply({ retained: true }); await core.resource('/checks/no-store-304').ready;
    respond = () => new Response(null, { status: 304, headers: { 'Cache-Control': 'no-store' } });
    await core.resource('/checks/no-store-304', true).ready;
    respond = () => reply({ retained: false });
    const discarded = core.resource('/checks/no-store-304'); assert.equal(discarded.record, undefined); await discarded.ready;
    respond = () => new Response(null, { status: 304 });
    await assert.rejects(core.resource('/checks/orphan-304').ready, /Cache validation failed/);
    respond = () => new Response('not valid JSON');
    await assert.rejects(core.resource('/checks/json-error').ready, /Unreadable API response/);
    respond = () => reply({ success: false }); await assert.rejects(core.resource('/checks/refused').ready, /refused/);
    respond = () => new Response('', { status: 404 });
    location.hash = '#/profile/not-found-tester'; await core.render();
    assert.equal(window.__shotReady, false); assert.ok(html.includes('Public page not found'));
    const failures = [() => { throw new TypeError('offline'); }, () => new Response('', { status: 500 })];
    for (const [index, failure] of failures.entries()) {
      const handle = 'retry-tester-' + index;
      respond = failure; location.hash = '#/profile/' + handle; await core.render();
      assert.equal(window.__shotReady, false);
      respond = () => reply({ handle, solutions: [] });
      before = reads.length; retryClick(); await settle();
      assert.equal(reads.length - before, 1); assert.equal(window.__shotReady, true); assert.ok(notice.textContent.startsWith('Last checked'));
      const paintBefore = paints;
      before = reads.length; retryClick(); await settle();
      assert.equal(reads.length - before, 1); assert.equal(paints, paintBefore, 'an unchanged 200 preserves the DOM');
    }
  });

  await group('Capture count preflight leaves output absent', () => {
    const work = mkdtempSync(join(tmpdir(), 'makefun-rebuild-preflight-'));
    const entry = join(work, 'entry'), captures = join(entry, 'screenshots');
    try {
      mkdirSync(captures, { recursive: true });
      copyFileSync(new URL('../main.ts', import.meta.url), join(entry, 'main.ts'));
      cpSync(new URL('../vendor/', import.meta.url), join(entry, 'vendor'), { recursive: true });
      const packageTo = output => spawnSync(process.execPath, [join(entry, 'main.ts')], {
        encoding: 'utf8', env: { ...process.env, MAKEFUN_OUTPUT_DIR: output },
      });
      for (const count of [0, 2, 4]) {
        for (const name of readdirSync(captures)) rmSync(join(captures, name));
        for (let index = 0; index < count; index++) writeFileSync(join(captures, `${index}.jpg`), 'invalid-count fixture');
        const output = join(work, 'output-' + count);
        const child = packageTo(output);
        assert.notEqual(child.status, 0); assert.ok(child.stderr.includes('Expected exactly three PNG/JPEG'));
        assert.equal(existsSync(output), false);
      }
      for (const name of readdirSync(captures)) rmSync(join(captures, name));
      for (let index = 0; index < 2; index++) writeFileSync(join(captures, `${index}.jpg`), 'preflight fixture');
      mkdirSync(join(captures, '2.jpg'));
      const nonFileOutput = join(work, 'non-file-output');
      assert.ok(packageTo(nonFileOutput).stderr.includes('Expected exactly three PNG/JPEG'));
      assert.equal(existsSync(nonFileOutput), false);
      // Replace the rejected directory fixture before checking output destinations.
      rmSync(join(captures, '2.jpg'), { recursive: true, force: true });
      writeFileSync(join(captures, '2.jpg'), 'preflight fixture');
      const inside = join(entry, 'output');
      assert.ok(packageTo(inside).stderr.includes('must be outside the repository'));
      assert.equal(existsSync(inside), false);
      const occupied = join(work, 'occupied'); mkdirSync(occupied);
      writeFileSync(join(occupied, 'keep.txt'), 'keep this output');
      assert.ok(packageTo(occupied).stderr.includes('is not empty'));
      assert.equal(readFileSync(join(occupied, 'keep.txt'), 'utf8'), 'keep this output');
      assert.deepEqual(readdirSync(occupied), ['keep.txt']);
    } finally { rmSync(work, { recursive: true, force: true }); }
  });
  assert.equal(passed, 13);
  console.log('13 offline groups passed. No browser, server or live HTTP was used.');
} finally {
  Date.now = originalNow;
  globalThis.setInterval = originalInterval;
}
