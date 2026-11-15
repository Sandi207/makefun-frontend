// One initial module owns public reads, navigation and the bounty board.
const apiRoot = 'https://make.fun/api';
const saved = new Map();
const flights = new Map();
const pauses = new Map();
const byteLimit = 1024 * 1024, urlLimit = 32, pageSize = 25;
const utf8 = new TextEncoder();
let savedBytes = 0;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

function canonical(path) {
  const address = new URL(apiRoot + path);
  address.searchParams.sort();
  return address.href;
}

function retain(address, entry) {
  savedBytes -= saved.get(address)?.size ?? 0;
  saved.delete(address);
  if (entry && entry.size <= byteLimit) {
    saved.set(address, entry);
    savedBytes += entry.size;
  }
  while (saved.size > urlLimit || savedBytes > byteLimit) {
    const oldest = saved.keys().next().value;
    savedBytes -= saved.get(oldest).size;
    saved.delete(oldest);
  }
}

function validateRecord(address, response, entry) {
  const checked = Date.now();
  const control = response.headers.get('Cache-Control') || '';
  const serverTime = Date.parse(response.headers.get('Date'));
  const ageMs = (Number(response.headers.get('Age')) || 0) * 1000;
  const maxMs = Number(control.match(/max-age=(\d+)/)?.[1] ?? 60) * 1000;
  const minuteMs = 60000 - (Number.isFinite(serverTime) ? serverTime : checked) % 60000;
  const lifetime = entry.etag ? Math.min(minuteMs, maxMs) : maxMs;
  entry.checked = checked;
  entry.until = checked + Math.max(0, lifetime - ageMs);
  if (/no-cache|no-store/.test(control)) entry.until = checked;
  retain(address, /no-store/.test(control) ? null : entry);
  return entry;
}

function httpProblem(response, address) {
  const status = response.status;
  const retry = response.headers.get('Retry-After');
  let message = `make.fun returned HTTP ${status}. Please try again.`;
  if (status === 404) message = 'This public page was not found.';
  if (status === 429 || status === 503) {
    message = `make.fun is busy. Try again${retry ? ` after ${retry} (Retry-After)` : ' in a moment'}.`;
  }
  const problem = new ApiError(message, status);
  if (status === 429 || status === 503) {
    const delay = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    pauses.set(address, { until: Date.now() + (Math.max(0, delay) || 10000), problem });
    if (pauses.size > urlLimit) pauses.delete(pauses.keys().next().value);
  }
  return problem;
}

async function fetchRecord(address, previous) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    const headers = { Accept: 'application/json' };
    if (previous?.etag && previous.data !== undefined) headers['If-None-Match'] = previous.etag;
    const response = await fetch(address, {
      headers, signal: abort.signal, credentials: 'omit', cache: 'no-store',
    });
    // A conditional success has no JSON body and precedes the HTTP error check.
    if (response.status === 304) {
      if (!previous || previous.data === undefined) throw new ApiError('Cache validation failed. Refresh to try again.');
      return validateRecord(address, response, previous);
    }
    if (!response.ok) throw httpProblem(response, address);
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new ApiError('Unreadable API response. Please retry.'); }
    if (payload?.success === false) throw new ApiError('make.fun refused this request. Please retry.');
    const entry = {
      raw, data: previous?.data !== undefined && previous?.raw === raw ? previous.data : payload,
      size: utf8.encode(raw).length, etag: response.headers.get('ETag'),
    };
    return validateRecord(address, response, entry);
  } catch (problem) {
    if (problem instanceof ApiError) throw problem;
    throw new ApiError(problem?.name === 'AbortError'
      ? 'Request timed out. Please retry.' : 'Could not reach make.fun. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

export function resource(path, force = false) {
  const address = canonical(path);
  const record = saved.get(address);
  if (record) { saved.delete(address); saved.set(address, record); }
  if (record && !force && record.until > Date.now()) return { record, ready: Promise.resolve(record) };
  const pause = pauses.get(address);
  if (pause?.until > Date.now()) return { record, ready: Promise.reject(pause.problem) };
  pauses.delete(address);
  if (!flights.has(address)) {
    flights.set(address, fetchRecord(address, record).finally(() => flights.delete(address)));
  }
  return { record, ready: flights.get(address) };
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => `&#${char.codePointAt(0)};`);
}
export function money(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not published';
  const amount = Number(value);
  return amount.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}
export function date(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not published';
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
  }) + ' UTC';
}
export function timeLeft(deadline) {
  const remaining = Date.parse(deadline) - Date.now();
  if (!Number.isFinite(remaining)) return 'Deadline not published';
  if (remaining <= 0) return 'Deadline passed';
  const minutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  if (days) return `${days}d ${hours % 24}h left`;
  return hours ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`;
}
export function lifecycle(bounty) {
  switch (bounty.demo ? 'demo' : bounty.status) {
    case 'demo': return 'Demo · no entries';
    case 'resolved': return 'Results published';
    case 'closed': return 'Awaiting results';
    case 'draft': return 'Not open yet';
    case 'open': {
      const end = Date.parse(bounty.deadline);
      if (end <= Date.now()) return 'Awaiting results';
      return Number.isFinite(end) ? 'Accepting entries' : 'Deadline unavailable';
    }
    default: return 'Status unavailable';
  }
}
export const routeLink = (slug, suffix = '') => `#/bounty/${encodeURIComponent(slug)}${suffix}`;
export const fee = bounty => bounty.entryFeeUsd == null || Number(bounty.entryFeeUsd) === 0
  ? 'Free entry' : `${money(bounty.entryFeeUsd)} entry fee`;

export function metrics(bounty) {
  const cells = [
    ['Live pot', money(bounty.potUsd ?? bounty.rewardAmount), ' class="pot"'],
    ['Entry', fee(bounty), ''],
    ['Time left', timeLeft(bounty.deadline), ` data-deadline="${esc(bounty.deadline)}"`],
    ['Entries', esc(bounty.submissionCount ?? 'Not published'), ''],
  ];
  return `<dl class="metrics">${cells.map(([label, value, attrs]) => `<div><dt>${label}</dt><dd${attrs}>${value}</dd></div>`).join('')}</dl>`;
}
export const heading = (title, eyebrow = '') => `<p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(title)}</h1>`;
export function pager(previous, next, label) {
  const button = (target, caption) => target ? `<a class="button secondary" href="${esc(target)}">${caption}</a>` : '<span></span>';
  return `<nav class="pager" aria-label="Pagination">${button(previous, '← Previous')}<span>${esc(label)}</span>${button(next, 'Next →')}</nav>`;
}

export function boardPaths(route) {
  const params = new URLSearchParams({ status: 'open', activity: 'times', limit: String(pageSize) });
  const cursor = route.query.get('cursor');
  if (cursor) params.set('cursor', cursor);
  return [`/competitions?${params}`];
}

function boardCard(bounty) {
  const state = lifecycle(bounty);
  return `<li><div class="bounty-copy"><div class="card-meta"><span>${esc(bounty.category || 'Bounty')}</span><span class="status ${state === 'Accepting entries' ? 'accepting' : ''}" data-state="${esc(bounty.demo ? 'demo' : bounty.status)}" data-end="${esc(bounty.deadline)}">${state}</span></div><h3><a href="${routeLink(bounty.slug)}">${esc(bounty.title)}</a></h3><p>${esc(bounty.summary || 'Read the brief for details.')}</p><div class="card-links"><a href="${routeLink(bounty.slug)}">Read the brief →</a><a href="${routeLink(bounty.slug, '/leaderboard')}">Leaderboard</a></div></div><div>${metrics(bounty)}<p class="deadline">Deadline ${date(bounty.deadline)}</p></div></li>`;
}

export function boardView([data], route) {
  if (!Array.isArray(data?.items)) throw new Error('The bounty list has an unexpected shape. Please retry.');
  const term = route.query.get('q') || '', filter = route.query.get('filter') || 'all';
  const order = route.query.get('sort') || 'deadline';
  const items = data.items.filter(bounty => {
    const matches = `${bounty.title} ${bounty.summary}`.toLowerCase().includes(term.toLowerCase());
    return matches && (filter === 'all' || lifecycle(bounty) === (filter === 'accepting' ? 'Accepting entries' : 'Awaiting results'));
  });
  items.sort(order === 'pot'
    ? (a, b) => Number(b.potUsd ?? b.rewardAmount ?? 0) - Number(a.potUsd ?? a.rewardAmount ?? 0)
    : (a, b) => (Date.parse(a.deadline) || Infinity) - (Date.parse(b.deadline) || Infinity));
  const page = Number(route.query.get('page') || 1), offset = (page - 1) * pageSize;
  const visible = items.slice(offset, offset + pageSize);
  const address = changes => {
    const params = new URLSearchParams(route.query);
    for (const [name, value] of Object.entries(changes)) value == null ? params.delete(name) : params.set(name, value);
    return '#/?' + params;
  };
  const previous = page > 1 ? address({ page: page - 1 }) : route.query.has('cursor') ? address({ cursor: null, page: null }) : '';
  const next = offset + pageSize < items.length ? address({ page: page + 1 })
    : data.next_cursor ? address({ cursor: data.next_cursor, page: null }) : '';
  const empty = '<li class="empty"><h3>No matches on this API page</h3><p>Clear filters or try the next page.</p><a href="#/">Clear filters</a></li>';
  return `<section class="hero">${heading('Good ideas. Real rewards.', 'Make something that matters')}<p class="intro">Open problems for ambitious builders.</p></section>
<section aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">The bounty board</h2><span>Live from make.fun</span></div>
<form class="controls" id="board-controls"><label class="search">Search this API page<input type="search" name="q" maxlength="200" value="${esc(term)}" placeholder="Search titles and summaries…"></label><label>Status<select name="filter"><option value="all">All live bounties</option><option value="accepting"${filter === 'accepting' ? ' selected' : ''}>Accepting entries</option><option value="awaiting"${filter === 'awaiting' ? ' selected' : ''}>Awaiting results</option></select></label><label>Sort this page<select name="sort"><option value="deadline">Deadline</option><option value="pot"${order === 'pot' ? ' selected' : ''}>Largest live pot</option></select></label><button>Apply</button></form>
<p class="muted small">${visible.length} shown · Filters cover this API page only${data.total == null ? '' : ` · ${esc(data.total)} bounties in total`}. Overdue bounties await results.</p><ul class="board">${visible.map(boardCard).join('') || empty}</ul>
${pager(previous, next, page > 1 ? `Local page ${page}` : 'API page · 25 per request')}</section>`;
}

export function parseRoute(hash) {
  const address = hash || '#/';
  decodeURIComponent(address);
  const invalid = () => { throw new Error('Invalid address. Return to the bounty board.'); };
  const parts = address.slice(1).split('?');
  const matched = /^\/(?:(bounty|profile)\/([^/]+)(\/leaderboard)?)?$/.exec(parts[0]);
  if (address[0] !== '#' || parts.length > 2 || !matched || matched[1] === 'profile' && matched[3]) invalid();
  const kind = matched[1] === 'profile' ? 'profile' : matched[3] ? 'leaderboard' : matched[1] ? 'detail' : 'board';
  const segment = decodeURIComponent(matched[2] || '');
  if (segment && !(kind === 'profile' ? /^[\w@.-]{1,100}$/ : /^[\w-]{1,64}$/).test(segment)) invalid();
  const query = new URLSearchParams(parts[1] || '');
  const permitted = { board: ['cursor', 'q', 'filter', 'sort', 'page'], leaderboard: ['phase', 'page'], profile: ['page'], detail: [] };
  const choices = { phase: ['dev', 'final'], filter: ['all', 'accepting', 'awaiting'], sort: ['deadline', 'pot'] };
  for (const [name, value] of query) {
    if (!permitted[kind].includes(name) || query.getAll(name).length !== 1 || value.length > (name === 'cursor' ? 1024 : 200)) invalid();
    if (name === 'page' && !/^[1-9]\d{0,5}$/.test(value)) invalid();
    if (choices[name] && !choices[name].includes(value)) invalid();
  }
  return { kind, segment, query };
}

const root = document.getElementById('app'), notice = document.getElementById('notice');
let revision = 0, activeHash = '', markup = '', moveFocus = true;
window.__shotReady = false;

function loadView(kind) {
  if (kind === 'detail') return import('./detail.js');
  if (kind === 'leaderboard') return import('./leaderboard.js');
  if (kind === 'profile') return import('./profile.js');
  return { paths: boardPaths, render: boardView };
}

function paint(view, entries, route, ticket) {
  if (ticket !== revision) return;
  const nextMarkup = view.render(entries.map(entry => entry.data), route);
  if (nextMarkup !== markup) {
    root.innerHTML = nextMarkup;
    markup = nextMarkup;
  }
  const data = entries[0].data;
  const title = route.kind === 'board' ? 'Bounties' : route.kind === 'profile' ? data.display_name || data.handle : data.title;
  document.title = `${title}${route.kind === 'leaderboard' ? ' · Leaderboard' : ''} | make.fun`;
  root.setAttribute('aria-busy', 'false');
  window.__shotReady = true;
  if (moveFocus) {
    root.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    moveFocus = false;
  }
}

export async function render(force = false) {
  const ticket = ++revision, hash = location.hash || '#/';
  const navigated = hash !== activeHash;
  if (navigated) {
    activeHash = hash; markup = ''; moveFocus = true;
    root.innerHTML = '<p class="loading">Loading public data…</p>';
  }
  window.__shotReady = false;
  root.setAttribute('aria-busy', 'true');
  notice.textContent = 'Checking make.fun…';
  let displayed = !navigated && Boolean(markup);
  try {
    const route = parseRoute(hash);
    const view = await loadView(route.kind);
    if (view.styled) await view.styled;
    if (ticket !== revision) return;
    const reads = view.paths(route).map(path => resource(path, force));
    if (reads.every(read => read.record)) {
      const cached = reads.map(read => read.record);
      paint(view, cached, route, ticket);
      displayed = true;
      if (view.extra?.(cached.map(entry => entry.data))) window.__shotReady = false;
      notice.textContent = 'Cached data · checking…';
    }
    const entries = await Promise.all(reads.map(read => read.ready));
    if (ticket !== revision) return;
    let warning = '';
    const supplemental = view.extra?.(entries.map(entry => entry.data));
    if (supplemental) {
      try { entries.push(await resource(supplemental, force).ready); }
      catch (problem) { warning = ' Extra rules or reward data could not load. ' + problem.message; }
    }
    if (ticket !== revision) return;
    paint(view, entries, route, ticket);
    const checked = Math.min(...entries.map(entry => entry.checked));
    notice.textContent = 'Last checked ' + new Date(checked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' + warning;
  } catch (problem) {
    if (ticket !== revision) return;
    root.setAttribute('aria-busy', 'false');
    if (!displayed) {
      root.innerHTML = heading(problem.status === 404 ? 'Public page not found' : 'Could not open this page', 'Try again')
        + `<p>${esc(problem.message)}</p><p><button data-retry>Retry</button> <a class="button secondary" href="#/">Back to bounties</a></p>`;
      markup = ''; window.__shotReady = false;
      if (moveFocus) root.querySelector('h1')?.focus();
    }
    notice.textContent = (displayed ? 'Showing cached data. Refresh failed: ' : '') + problem.message;
  }
}

root.addEventListener('submit', event => {
  if (event.target.id !== 'board-controls') return;
  event.preventDefault();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  for (const [name, value] of new FormData(event.target)) value ? params.set(name, value) : params.delete(name);
  params.delete('page');
  location.hash = '/?' + params;
});
document.addEventListener('click', event => {
  if (event.target.closest?.('.skip')) { event.preventDefault(); root.focus(); }
  if (event.target.closest?.('[data-retry]')) render(true);
});
window.addEventListener('hashchange', () => render());
window.addEventListener('focus', () => { if (!document.hidden && window.__shotReady) render(); });
setInterval(() => {
  if (document.hidden) return;
  root.querySelectorAll('[data-deadline]').forEach(node => { node.textContent = timeLeft(node.dataset.deadline); });
  root.querySelectorAll('[data-state]').forEach(node => {
    node.textContent = lifecycle({ status: node.dataset.state, deadline: node.dataset.end });
    node.classList.toggle('accepting', node.textContent === 'Accepting entries');
  });
}, 60000);
render();
