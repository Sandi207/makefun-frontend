const API = 'https://make.fun/api';
const cache = new Map(), pending = new Map(), cooldowns = new Map();
const encoder = new TextEncoder();
const MAX_BYTES = 1048576, MAX_URLS = 32;
let bytes = 0;

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

function key(path) {
  const url = new URL(API + path);
  url.searchParams.sort();
  return url.href;
}

function remember(url, record) {
  bytes -= cache.get(url)?.size || 0;
  cache.delete(url);
  if (record.size <= MAX_BYTES) { cache.set(url, record); bytes += record.size; }
  while (cache.size > MAX_URLS || bytes > MAX_BYTES) {
    const first = cache.keys().next().value;
    bytes -= cache.get(first).size;
    cache.delete(first);
  }
}

function freshness(response, record) {
  const now = Date.now();
  const age = Number(response.headers.get('Age')) || 0;
  const server = Date.parse(response.headers.get('Date'));
  const control = response.headers.get('Cache-Control') || '';
  const maxAge = Number(control.match(/max-age=(\d+)/)?.[1] ?? 60);
  const ttl = record.etag ? 60000 - (Number.isFinite(server) ? server : now) % 60000 : maxAge * 1000;
  record.until = now + Math.max(0, Math.min(ttl, maxAge * 1000) - age * 1000);
  if (/no-cache|no-store/.test(control)) record.until = now;
  record.checked = now;
}

async function request(url, old) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { Accept: 'application/json' };
    if (old?.etag && old.data !== undefined) headers['If-None-Match'] = old.etag;
    const response = await fetch(url, { headers, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (response.status === 304) {
      if (!old) throw new ApiError('Cache validation failed. Refresh to try again.');
      freshness(response, old); remember(url, old); return old;
    }
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      const wait = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
      const error = new ApiError(response.status === 404 ? 'This public page was not found.' : response.status === 429 || response.status === 503
        ? `make.fun is busy. Try again${retry ? ` after ${retry} (Retry-After)` : ' in a moment'}.`
        : `make.fun returned HTTP ${response.status}. Please try again.`, response.status);
      if (response.status === 429 || response.status === 503) {
        cooldowns.set(url, { until: Date.now() + (wait || 10000), error });
        if (cooldowns.size > MAX_URLS) cooldowns.delete(cooldowns.keys().next().value);
      }
      throw error;
    }
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new ApiError('Unreadable API response. Please retry.'); }
    if (data?.success === false) throw new ApiError('make.fun refused this request. Please retry.');
    const record = { data: old?.raw === raw ? old.data : data, raw, size: encoder.encode(raw).length, etag: response.headers.get('ETag') };
    freshness(response, record);
    remember(url, /no-store/.test(response.headers.get('Cache-Control') || '') ? {size: MAX_BYTES + 1} : record);
    return record;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name === 'AbortError' ? 'Request timed out. Please retry.' : 'Could not reach make.fun. Check your connection.');
  } finally { clearTimeout(timeout); }
}

export function resource(path, force = false) {
  const url = key(path), record = cache.get(url);
  if (record) { cache.delete(url); cache.set(url, record); }
  if (!force && record && record.until > Date.now()) return { record, ready: Promise.resolve(record) };
  const blocked = cooldowns.get(url);
  if (blocked?.until > Date.now()) return { record, ready: Promise.reject(blocked.error) };
  cooldowns.delete(url);
  if (!pending.has(url)) pending.set(url, request(url, record).finally(() => pending.delete(url)));
  return { record, ready: pending.get(url) };
}

export const bountyPath = slug => `/competitions/${encodeURIComponent(slug)}?submissions=summary`;

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const money = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'Not published' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2 });
export const date = iso => !iso || !Number.isFinite(Date.parse(iso)) ? 'Not published' : new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
export function timeLeft(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return 'Deadline not published';
  if (ms <= 0) return 'Deadline passed';
  const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h left` : h ? `${h}h ${m % 60}m left` : `${m}m left`;
}
export function lifecycle(b) {
  if (b.demo || b.status === 'demo') return 'Demo · no entries';
  if (b.status === 'resolved') return 'Results published';
  if (b.status === 'closed' || b.status === 'open' && Date.parse(b.deadline) <= Date.now()) return 'Awaiting results';
  if (b.status === 'open') return Number.isFinite(Date.parse(b.deadline)) ? 'Accepting entries' : 'Deadline unavailable';
  return b.status === 'draft' ? 'Not open yet' : 'Status unavailable';
}
export const fee = b => b.entryFeeUsd == null || Number(b.entryFeeUsd) === 0 ? 'Free entry' : `${money(b.entryFeeUsd)} entry fee`;
export const routeLink = (slug, suffix = '') => `#/bounty/${encodeURIComponent(slug)}${suffix}`;
export const profileLink = handle => `#/profile/${encodeURIComponent(handle)}`;
export function metrics(b) {
  return `<dl class="metrics"><div><dt>Live pot</dt><dd class="pot">${money(b.potUsd ?? b.rewardAmount)}</dd></div><div><dt>Entry</dt><dd>${fee(b)}</dd></div><div><dt>Time left</dt><dd data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</dd></div><div><dt>Entries</dt><dd>${esc(b.submissionCount ?? 'Not published')}</dd></div></dl>`;
}

export const heading = (title, eyebrow = '') => `<p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(title)}</h1>`;
export function pager(previous, next, label) {
  return `<nav class="pager" aria-label="Pagination">${previous ? `<a class="button secondary" href="${esc(previous)}">← Previous</a>` : '<span></span>'}<span>${esc(label)}</span>${next ? `<a class="button secondary" href="${esc(next)}">Next →</a>` : '<span></span>'}</nav>`;
}

export function boardPaths(route) {
  const query = new URLSearchParams({ status: 'open', activity: 'times', limit: '25' });
  if (route.query.get('cursor')) query.set('cursor', route.query.get('cursor'));
  return ['/competitions?' + query];
}

export function boardView([data], route) {
  if (!Array.isArray(data.items)) throw new Error('The bounty list has an unexpected shape. Please retry.');
  const search = route.query.get('q') || '', filter = route.query.get('filter') || 'all';
  const sort = route.query.get('sort') || 'deadline';
  let items = data.items.filter(b => `${b.title} ${b.summary}`.toLowerCase().includes(search.toLowerCase()));
  if (filter !== 'all') items = items.filter(b => lifecycle(b) === (filter === 'accepting' ? 'Accepting entries' : 'Awaiting results'));
  items = [...items].sort(sort === 'pot' ? (a, b) => Number(b.potUsd ?? b.rewardAmount ?? 0) - Number(a.potUsd ?? a.rewardAmount ?? 0) : (a, b) => (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity));
  const page = Number(route.query.get('page') || 1), start = (page - 1) * 25;
  const shown = items.slice(start, start + 25);
  const url = changes => { const q = new URLSearchParams(route.query); for (const [k,v] of Object.entries(changes)) v == null ? q.delete(k) : q.set(k,v); return '#/?' + q; };
  const next = start + 25 < items.length ? url({ page: page + 1 }) : data.next_cursor ? url({ cursor: data.next_cursor, page: null }) : '';
  return `<section class="hero">${heading('Good ideas. Real rewards.', 'Make something that matters')}<p class="intro">Open problems for ambitious builders.</p></section>
    <section aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">The bounty board</h2><span>Live from make.fun</span></div>
    <form id="board-controls" class="controls"><label class="search">Search this API page<input name="q" type="search" placeholder="Search titles and summaries…" value="${esc(search)}" maxlength="200"></label><label>Status<select name="filter"><option value="all">All live bounties</option><option value="accepting" ${filter === 'accepting' ? 'selected' : ''}>Accepting entries</option><option value="awaiting" ${filter === 'awaiting' ? 'selected' : ''}>Awaiting results</option></select></label><label>Sort this page<select name="sort"><option value="deadline">Deadline</option><option value="pot" ${sort === 'pot' ? 'selected' : ''}>Largest live pot</option></select></label><button>Apply</button></form>
    <p class="muted small">${shown.length} shown · Filters cover this API page only${data.total == null ? '' : ` · ${esc(data.total)} bounties in total`}. Overdue bounties await results.</p>
    <ul class="board">${shown.map(b => `<li><div class="bounty-copy"><div class="card-meta"><span>${esc(b.category || 'Bounty')}</span><span class="status ${lifecycle(b) === 'Accepting entries' ? 'accepting' : ''}" data-state="${esc(b.demo ? 'demo' : b.status)}" data-end="${esc(b.deadline)}">${lifecycle(b)}</span></div><h3><a href="${routeLink(b.slug)}">${esc(b.title)}</a></h3><p>${esc(b.summary || 'Read the brief for details.')}</p><div class="card-links"><a href="${routeLink(b.slug)}">Read the brief →</a><a href="${routeLink(b.slug, '/leaderboard')}">Leaderboard</a></div></div><div>${metrics(b)}<p class="deadline">Deadline ${date(b.deadline)}</p></div></li>`).join('') || '<li class="empty"><h3>No matches on this API page</h3><p>Clear filters or try the next page.</p><a href="#/">Clear filters</a></li>'}</ul>
    ${pager(page > 1 ? url({page: page - 1}) : route.query.has('cursor') ? url({cursor:null,page:null}) : '', next, page > 1 ? `Local page ${page}` : 'API page · 25 per request')}</section>`;
}

const app = document.getElementById('app'), notice = document.getElementById('notice');
let generation = 0, current = '', lastHTML = '', navigating = true;
window.__shotReady = false;

export function parseRoute(hash) {
  decodeURIComponent(hash || '#/');
  const invalid = () => { throw new Error('Invalid address. Return to the bounty board.'); };
  const [path, search = ''] = (hash || '#/').slice(1).split('?');
  if ((hash.match(/\?/g) || []).length > 1) invalid();
  const match = path.match(/^\/$|^\/bounty\/([^/]+)(\/leaderboard)?$|^\/profile\/([^/]+)$/);
  if (!match) invalid();
  const kind = match[3] ? 'profile' : match[2] ? 'leaderboard' : match[1] ? 'detail' : 'board';
  const segment = decodeURIComponent(match[1] || match[3] || '');
  if (kind === 'profile' ? !/^[a-zA-Z0-9_@.-]{1,100}$/.test(segment) : kind !== 'board' && !/^[a-zA-Z0-9_-]{1,64}$/.test(segment)) invalid();
  const query = new URLSearchParams(search), allowed = kind === 'board' ? ['cursor','q','filter','sort','page'] : kind === 'leaderboard' ? ['phase','page'] : kind === 'profile' ? ['page'] : [];
  for (const [key,value] of query) {
    if (!allowed.includes(key) || query.getAll(key).length !== 1 || value.length > (key === 'cursor' ? 1024 : 200)) invalid();
    if (key === 'page' && !/^[1-9]\d{0,5}$/.test(value) || key === 'phase' && !['dev','final'].includes(value) || key === 'filter' && !['all','accepting','awaiting'].includes(value) || key === 'sort' && !['deadline','pot'].includes(value)) invalid();
  }
  return { kind, segment, query };
}

async function viewFor(kind) {
  if (kind === 'detail') return import('./detail.js');
  if (kind === 'leaderboard') return import('./leaderboard.js');
  if (kind === 'profile') return import('./profile.js');
  return { paths: boardPaths, render: boardView };
}

function draw(view, records, route, token) {
  if (token !== generation) return;
  const html = view.render(records.map(r => r.data), route);
  if (html !== lastHTML) { app.innerHTML = html; lastHTML = html; }
  const title = route.kind === 'board' ? 'Bounties' : route.kind === 'profile' ? records[0].data.display_name || records[0].data.handle : records[0].data.title;
  document.title = `${title}${route.kind === 'leaderboard' ? ' · Leaderboard' : ''} | make.fun`;
  app.setAttribute('aria-busy', 'false');
  window.__shotReady = true;
  if (navigating) { app.querySelector('h1')?.focus({ preventScroll: true }); window.scrollTo(0,0); navigating = false; }
  app.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
}

export async function render(force = false) {
  const token = ++generation, hash = location.hash || '#/', changed = hash !== current;
  if (changed) { current = hash; navigating = true; lastHTML = ''; app.innerHTML = '<p class="loading">Loading public data…</p>'; }
  window.__shotReady = false;
  app.setAttribute('aria-busy', 'true'); notice.textContent = 'Checking make.fun…';
  let displayed = !changed && !!lastHTML;
  try {
    const route = parseRoute(hash), view = await viewFor(route.kind);
    if (view.styled) await view.styled;
    if (token !== generation) return;
    const requests = view.paths(route).map(path => resource(path, force));
    if (requests.every(r => r.record)) {
      const cached = requests.map(r => r.record);
      const extra = view.extra?.(cached.map(r => r.data));
      draw(view, cached, route, token); displayed = true;
      if (extra) window.__shotReady = false;
      notice.textContent = 'Cached data · checking…';
    }
    const records = await Promise.all(requests.map(r => r.ready));
    if (token !== generation) return;
    let warning = '';
    if (view.extra) {
      const path = view.extra(records.map(r => r.data));
      if (path) {
        try { records.push(await resource(path, force).ready); }
        catch (error) { warning = ' Extra rules or reward data could not load. ' + error.message; }
      }
    }
    if (token !== generation) return;
    draw(view, records, route, token);
    notice.textContent = 'Last checked ' + new Date(Math.min(...records.map(r => r.checked))).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + '.' + warning;
  } catch (error) {
    if (token !== generation) return;
    app.setAttribute('aria-busy','false');
    if (!displayed) { app.innerHTML = `${heading(error.status === 404 ? 'Public page not found' : 'Could not open this page', 'Try again')}<p>${esc(error.message)}</p><p><button data-retry>Retry</button> <a class="button secondary" href="#/">Back to bounties</a></p>`; lastHTML = ''; window.__shotReady = false; if (navigating) app.querySelector('h1')?.focus(); }
    notice.textContent = (displayed ? 'Showing cached data. Refresh failed: ' : '') + error.message;
  }
}

app.addEventListener('submit', event => {
  if (event.target.id !== 'board-controls') return;
  event.preventDefault();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  for (const [key,value] of new FormData(event.target)) value ? q.set(key,value) : q.delete(key);
  q.delete('page'); location.hash = '/?' + q;
});
document.addEventListener('click', event => {
  if (event.target.closest('.skip')) { event.preventDefault(); app.focus(); }
  if (event.target.closest('[data-retry]')) render(true);
});
window.addEventListener('hashchange', () => render());
window.addEventListener('focus', () => { if (!document.hidden && window.__shotReady) render(); });
setInterval(() => {
  if (document.hidden) return;
  app.querySelectorAll('[data-deadline]').forEach(el => el.textContent = timeLeft(el.dataset.deadline));
  app.querySelectorAll('[data-state]').forEach(el => {
    el.textContent = lifecycle({status:el.dataset.state, deadline:el.dataset.end});
    el.classList.toggle('accepting', el.textContent === 'Accepting entries');
  });
}, 60000);
render();
