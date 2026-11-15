// No server or network: authored fixtures test cache contracts and route rendering.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const app = { innerHTML: '', setAttribute() {}, querySelector() { return { focus() {} }; }, querySelectorAll() { return []; }, addEventListener() {}, focus() {} };
const notice = { textContent: '' }, listeners = {};
globalThis.document = {
  getElementById: id => id === 'app' ? app : notice,
  head: { append(sheet) { queueMicrotask(() => sheet.onload()); } },
  createElement: () => ({}), addEventListener() {}, hidden: false,
};
globalThis.window = { addEventListener(type, callback) { listeners[type] = callback; }, scrollTo() {} };
globalThis.location = { hash: '#/invalid' };
const realInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
let now = Date.parse('2026-11-15T09:00:10Z'), handler, calls = [];
const realNow = Date.now;
Date.now = () => now;
globalThis.fetch = async (url, options) => { calls.push({ url, options }); return handler(url, options); };
const core = await import('../app/main.js');
const detail = await import('../app/detail.js'), leaderboard = await import('../app/leaderboard.js'), profile = await import('../app/profile.js');
const surface = await import('../app/surface.js');
const json = (data, etag = '"test"') => new Response(JSON.stringify(data), { headers: { ETag: etag, Date: new Date(now).toUTCString(), 'Cache-Control': 'public, max-age=60' } });
let groups = 0;
async function check(name, run) { await run(); groups++; console.log('PASS', name); }

await check('Strict route matching and decoded segments', () => {
  assert.equal(core.parseRoute('#/bounty/demo/leaderboard?phase=dev').kind, 'leaderboard');
  assert.equal(core.parseRoute('#/profile/%40builder').segment, '@builder');
  assert.equal(core.parseRoute('').kind, 'board');
  for (const route of ['#/bounty/x/other', '#/bounty/x/', '#/profile/%2F', '#/bounty/%E0%A4%A', '#/?q=%GG', '#/?page=0', '#/?page=1&page=2', '#/bounty/x/leaderboard?phase=unknown', '#/bounty/x?extra=1']) assert.throws(() => core.parseRoute(route));
});
await check('Canonical URL deduplication and fresh reuse', async () => {
  handler = () => json({ items: [1] });
  const a = core.resource('/test?b=2&a=1'), b = core.resource('/test?a=1&b=2');
  assert.equal(a.ready, b.ready);
  const record = await a.ready, before = calls.length;
  assert.equal((await core.resource('/test?a=1&b=2').ready).data, record.data);
  assert.equal(calls.length, before);
});
await check('304 before JSON and unchanged 200 at a minute rollover', async () => {
  const old = core.resource('/test?a=1&b=2').record;
  handler = () => new Response(null, { status: 304, headers: { Date: new Date(now).toUTCString() } });
  assert.equal((await core.resource('/test?a=1&b=2', true).ready).data, old.data);
  assert.equal(calls.at(-1).options.headers['If-None-Match'], '"test"');
  now += 60000;
  handler = () => json({ items: [1] }, '"new-minute"');
  const updated = await core.resource('/test?a=1&b=2').ready;
  assert.equal(updated.data, old.data);
  assert.equal(updated.etag, '"new-minute"');
});
await check('Failed refresh retains payload and respects Retry-After', async () => {
  handler = () => new Response('', { status: 429, headers: { 'Retry-After': '20' } });
  await assert.rejects(core.resource('/test?a=1&b=2', true).ready, error => error.status === 429);
  assert.deepEqual(core.resource('/test?a=1&b=2').record.data, { items: [1] });
  const before = calls.length;
  await assert.rejects(core.resource('/test?a=1&b=2', true).ready);
  assert.equal(calls.length, before);
  now += 21000; handler = () => json({ items: [2] });
  await core.resource('/test?a=1&b=2', true).ready;
});
await check('LRU count, UTF-8 byte bound, and oversized payloads', async () => {
  handler = () => json({ tiny: 1 });
  for (let i = 0; i < 33; i++) await core.resource('/lru/' + i).ready;
  assert.equal(core.resource('/lru/0').record, undefined);
  await core.resource('/lru/0').ready;
  handler = () => json({ large: 'é'.repeat(300000) });
  await core.resource('/large/one').ready; await core.resource('/large/two').ready;
  const a = core.resource('/large/one'); assert.equal(a.record, undefined); await a.ready;
  handler = () => json({ large: 'x'.repeat(1048577) });
  await core.resource('/oversize').ready;
  const b = core.resource('/oversize'); assert.equal(b.record, undefined); await b.ready;
});
const bounty = { slug:'fixture', title:'Build a good thing', summary:'A public brief', description:'Readable description', rules:'# Rules\n\nBe original.', status:'open', deadline:'2026-11-14T12:00:00Z', rewardAmount:'500', potUsd:'520', entryFeeUsd:'2', submissionCount:0, prizes:[{place:1,amount_usd:'100'}], phases:[{key:'dev'}, {key:'final',finalized:false}] };
await check('Board preserves overdue entries, bounded rows and cursor links', () => {
  const items = Array.from({length:26}, (_,i) => ({...bounty,slug:'fixture-'+i,title:i === 0 ? '<script>bad</script>' : 'Build '+i}));
  const html = core.boardView([{items,next_cursor:'opaque + cursor'}],core.parseRoute('#/'));
  assert.equal((html.match(/class="bounty-copy"/g) || []).length,25);
  assert.ok(html.includes('Awaiting results')); assert.ok(!html.includes('<script>bad'));
  const page2 = core.boardView([{items,next_cursor:'opaque + cursor'}],core.parseRoute('#/?page=2'));
  assert.ok(page2.includes('cursor=opaque+%2B+cursor'));
  assert.equal(core.lifecycle(bounty),'Awaiting results'); assert.equal(core.money(null),'Not published');
});
await check('Bounty renders rules, base reward and live pot separately', () => {
  const html=detail.render([bounty],core.parseRoute('#/bounty/fixture'));
  assert.ok(html.includes('$520'));assert.ok(html.includes('Base reward $500'));assert.ok(html.includes('$100'));assert.ok(html.includes('Be original.'));
  assert.ok(html.indexOf('id="rewards"') < html.indexOf('id="description-title"'));
  assert.equal(detail.extra([bounty]),'');
  assert.equal(detail.extra([{...bounty, rules:null}]),'/competitions/fixture/requirements');
});
await check('Leaderboard preserves rank, missing scores, phases and withheld states', () => {
  const board={phase:{key:'dev',placements_held:true},scores_visible:true,rank_key:'points',columns:[{key:'points',title:'Points'}],entries:[{rank:1,title:'Entry',handle:'builder',status:'grading',values:{points:null},prize_eligible:false,source_withheld:true}]};
  const html=leaderboard.render([bounty,board],core.parseRoute('#/bounty/fixture/leaderboard'));
  assert.ok(html.includes('#/profile/builder'));assert.ok(html.includes('Provisional standings'));assert.ok(html.includes('grading'));assert.ok(html.includes('>—<'));assert.ok(html.includes('No prize eligibility'));
  assert.ok(leaderboard.render([bounty,{...board,scores_visible:false,entries:[]}],core.parseRoute('#/bounty/fixture/leaderboard')).includes('Scores are not public yet'));
});
await check('Profile public history, absent statistics and safe avatar URLs', () => {
  const p={handle:'builder',bio:'<img onerror=bad>',record:{competitions_won:2},solutions:[{title:'My work',competition:{slug:'fixture',title:bounty.title},place:1,score:null}]};
  const html=profile.render([p],core.parseRoute('#/profile/builder'));
  assert.ok(html.includes('>2</dd>'));assert.ok(!html.includes('>0</dd>'));assert.ok(html.includes('#/bounty/fixture/leaderboard'));assert.ok(!html.includes('<img onerror'));
  assert.equal(surface.safeUrl(undefined),'');assert.equal(surface.safeUrl('javascript:alert(1)'),'');
  const avatar=profile.render([{...p,image:'https://make.fun/avatar.webp'}],core.parseRoute('#/profile/builder'));
  assert.ok(avatar.includes('crossorigin="anonymous" src="https://make.fun/avatar.webp"'));
});
await check('Route races and shot readiness use only the current response', async () => {
  let release;
  handler = url => url.includes('/competitions?') ? new Promise(resolve => {release=resolve;}) : Promise.resolve(json({handle:'racebuilder',solutions:[]}));
  location.hash='#/';const slow=core.render();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__shotReady,false);
  location.hash='#/profile/racebuilder';await core.render();assert.equal(window.__shotReady,true);assert.ok(app.innerHTML.includes('@racebuilder'));
  release(json({items:[bounty]}));await slow;assert.ok(app.innerHTML.includes('@racebuilder'));
  location.hash='#/unknown';await core.render();assert.equal(window.__shotReady,false);
});

await check('Measured surface GET budgets and warm reuse', async () => {
  const standing={phase:{key:'dev'},scores_visible:true,entries:[],columns:[]};
  handler = url => json(url.includes('/profiles/') ? {handle:'countbuilder',solutions:[]} : url.includes('/leaderboard?') ? standing : url.includes('/competitions?') ? {items:[bounty]} : bounty);
  for (const [hash,expected] of [['#/?cursor=count-page',1],['#/bounty/count-fixture',1],['#/bounty/count-fixture/leaderboard',1],['#/bounty/standalone-count/leaderboard',2],['#/profile/countbuilder',1],['#/profile/countbuilder',0],['#/?cursor=count-page&q=Build',0]]) {
    const before=calls.length;location.hash=hash;await core.render();
    assert.equal(calls.length-before,expected,hash);assert.equal(window.__shotReady,true);
    console.log('GETS',hash,expected);
  }
});
await check('No ETag, no-store, malformed JSON and account 404', async () => {
  handler=() => new Response('{"items":[]}',{headers:{'Cache-Control':'public, max-age=120'}});
  await core.resource('/untagged').ready;
  const before=calls.length;await core.resource('/untagged').ready;assert.equal(calls.length,before);
  handler=() => new Response('{"items":[1]}',{headers:{'Cache-Control':'no-store'}});
  await core.resource('/untagged',true).ready;
  const uncached=core.resource('/untagged');assert.equal(uncached.record,undefined);await uncached.ready;
  handler=() => new Response('this is not JSON');
  await assert.rejects(core.resource('/bad-json').ready,/Unreadable API/);
  handler=() => new Response('',{status:404});
  location.hash='#/profile/missing-builder';await core.render();
  assert.equal(window.__shotReady,false);assert.ok(app.innerHTML.includes('Public page not found'));
});
await check('Capture preflight fails before any output is created', () => {
  const root=mkdtempSync(join(tmpdir(),'makefun-preflight-'));
  try {
    cpSync(new URL('../main.ts',import.meta.url),join(root,'main.ts'));cpSync(new URL('../vendor',import.meta.url),join(root,'vendor'),{recursive:true});
    mkdirSync(join(root,'screenshots'));
    for (const count of [0,2,4]) {
      for (const name of readdirSync(join(root,'screenshots'))) rmSync(join(root,'screenshots',name));
      for(let i=0;i<count;i++) writeFileSync(join(root,'screenshots',i+'.jpg'),'placeholder');
      const out=join(root,'output-'+count);
      const result=spawnSync(process.execPath,[join(root,'main.ts')],{env:{...process.env,MAKEFUN_OUTPUT_DIR:out},encoding:'utf8'});
      assert.notEqual(result.status,0);assert.ok(result.stderr.includes('Expected exactly three PNG/JPEG'));assert.equal(existsSync(out),false);
    }
  } finally { rmSync(root,{recursive:true,force:true}); }
});
Date.now=realNow;globalThis.setInterval=realInterval;
console.log(`${groups} offline groups passed. No browser or live HTTP was used.`);
