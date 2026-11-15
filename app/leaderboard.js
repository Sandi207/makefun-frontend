import { text, heading, crumb, pager, styled } from './surface.js';
export { styled };
import { bountyPath, esc, routeLink, profileLink } from './main.js';

export function paths(route) {
  const q = new URLSearchParams({ view: 'performance', ties: 'runs' });
  if (route.query.has('phase')) q.set('phase', route.query.get('phase'));
  return [bountyPath(route.segment), `/competitions/${encodeURIComponent(route.segment)}/leaderboard?${q}`];
}

export function render([b, board], route) {
  if (!Array.isArray(board.entries)) throw new Error('The leaderboard response has an unexpected shape. Please retry.');
  const phase = board.phase || {}, phaseKey = typeof phase === 'string' ? phase : phase.key || route.query.get('phase') || 'Current';
  const page = Number(route.query.get('page') || 1), start = (page - 1) * 25;
  const columns = Array.isArray(board.columns) ? board.columns : [];
  const primary = board.rank_key ?? board.rankKey ?? b.leaderboard?.rankKey;
  const key = typeof primary === 'object' ? primary?.key : primary;
  const ordered = [...columns].sort((a,c) => Number(c.key === key) - Number(a.key === key));
  const cols = ordered.length ? ordered : [{ key: key || 'score', title: 'Score / metric' }];
  const url = n => { const q = new URLSearchParams(route.query); q.set('page', n); return routeLink(route.segment, '/leaderboard?') + q; };
  const phases = (b.phases || []).filter(p => ['dev','final'].includes(p.key));
  const rows = board.entries.slice(start, start + 25);
  const hidden = board.scores_visible === false;
  const provisional = phase.placements_held === true || phaseKey === 'dev' || !phase.finalized;
  return `${crumb(b.title)}${heading('The leaderboard', b.title)}<nav class="tabs" aria-label="Bounty"><a href="${routeLink(route.segment)}">Overview</a><a aria-current="page" href="${routeLink(route.segment, '/leaderboard')}">Leaderboard</a></nav>
    <div class="section-head"><h2>${esc(phaseKey)} phase</h2><span class="status">${hidden ? 'Results withheld' : provisional ? 'Provisional standings' : 'Published standings'}</span></div>
    ${phases.length > 1 ? `<nav class="phase-links" aria-label="Leaderboard phase">${phases.map(p => `<a class="button secondary" ${p.key === phaseKey ? 'aria-current="page"' : ''} href="${routeLink(route.segment, '/leaderboard?phase=' + p.key)}">${esc(p.key)} phase</a>`).join('')}</nav>` : ''}
    <p class="muted">Performance order from make.fun. Equal ranks and ties are preserved.${provisional ? ' Places and prizes may change until final results publish.' : ''}${board.metrics_withheld ? ' Private build metrics are withheld.' : ''}</p>
    ${hidden ? '<div class="empty"><h2>Scores are not public yet</h2><p>This phase is withholding results. Entries may already be received and grading. Check again after publication.</p></div>' : !board.entries.length ? '<div class="empty"><h2>No ranked entries yet</h2><p>Entries may be waiting for grading. Refresh later for public standings.</p></div>' : `<div class="table-scroll standings" role="region" aria-label="Leaderboard table, scroll for all metrics" tabindex="0"><table><caption>${esc(b.title)} · ${esc(phaseKey)} · ${board.entries.length} public entries</caption><thead><tr><th scope="col">Rank</th><th scope="col">Entry / builder</th>${cols.map(c => `<th scope="col">${esc(c.title || c.key)}</th>`).join('')}<th scope="col">Grading / eligibility</th></tr></thead><tbody>${rows.map(e => `<tr><th scope="row" class="rank">${esc(e.rank ?? '—')}</th><td class="entry"><strong>${esc(e.title || 'Untitled entry')}</strong><br>${e.handle ? `<a href="${profileLink(e.handle)}">@${esc(e.handle)}</a>` : '<span class="muted">Identity withheld</span>'}${e.house || e.baseline ? `<span class="row-note">${e.baseline ? 'Baseline' : 'House entry'} · reference</span>` : ''}${e.source_withheld ? '<span class="row-note">Source private</span>' : ''}<span class="mobile-state row-note">${esc(e.status || 'Grading not published')}</span></td>${cols.map(c => `<td class="numeric">${esc(text(e.display?.[c.key] ?? e.values?.[c.key]))}${c.key === key && e.interval ? `<span class="row-note">Interval ${esc(text(e.interval))}</span>` : ''}</td>`).join('')}<td>${esc(e.status || 'Not published')}<span class="row-note">${e.prize_eligible === false ? 'No prize eligibility' : e.prize_eligible === true ? 'Prize eligible' : 'Eligibility not published'}</span>${e.reasons?.length ? `<span class="row-note">${esc(e.reasons.join(', '))}</span>` : ''}${e.tie_runs?.length || e.tie_with?.length ? '<span class="row-note">Statistical tie reported</span>' : ''}</td></tr>`).join('')}</tbody></table></div>${pager(page > 1 ? url(page - 1) : '', start + 25 < board.entries.length ? url(page + 1) : '', `Page ${page} · ${rows.length} of ${board.entries.length}`)}`}`;
}
