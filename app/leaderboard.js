import { bountyPath, crumb, heading, pager, profileLink, text } from './surface.js';
import { esc, routeLink } from './main.js';
export { styled } from './surface.js';

export function paths(route) {
  const params = new URLSearchParams({ view: 'performance', ties: 'runs' });
  if (route.query.has('phase')) params.set('phase', route.query.get('phase'));
  return [bountyPath(route.segment), `/competitions/${encodeURIComponent(route.segment)}/leaderboard?${params}`];
}

function metricColumns(bounty, standings) {
  const primary = standings.rank_key ?? standings.rankKey ?? bounty.leaderboard?.rankKey;
  const key = typeof primary === 'object' ? primary?.key : primary;
  const columns = Array.isArray(standings.columns) ? standings.columns : [];
  return {
    key,
    columns: columns.length
      ? [...columns.filter(column => column.key === key), ...columns.filter(column => column.key !== key)]
      : [{ key: key || 'score', title: 'Score / metric' }],
  };
}

function builder(entry) {
  const identity = entry.handle ? `<a href="${profileLink(entry.handle)}">@${esc(entry.handle)}</a>` : '<span class="muted">Identity withheld</span>';
  const reference = entry.house || entry.baseline ? `<span class="row-note">${entry.baseline ? 'Baseline' : 'House entry'} · reference</span>` : '';
  const source = entry.source_withheld ? '<span class="row-note">Source private</span>' : '';
  return `<td class="entry"><strong>${esc(entry.title || 'Untitled entry')}</strong><br>${identity}${reference}${source}<span class="mobile-state row-note">${esc(entry.status || 'Grading not published')}</span></td>`;
}

function grading(entry) {
  const eligible = entry.prize_eligible === true ? 'Prize eligible' : entry.prize_eligible === false ? 'No prize eligibility' : 'Eligibility not published';
  const reasons = Array.isArray(entry.reasons) && entry.reasons.length ? `<span class="row-note">${esc(entry.reasons.join(', '))}</span>` : '';
  const ties = entry.tie_runs?.length || entry.tie_with?.length ? '<span class="row-note">Statistical tie reported</span>' : '';
  return `<td>${esc(entry.status || 'Not published')}<span class="row-note">${eligible}</span>${reasons}${ties}</td>`;
}

function standingRow(entry, columns, primary) {
  const values = columns.map(column => {
    const display = text(entry.display?.[column.key] ?? entry.values?.[column.key]);
    const interval = column.key === primary && entry.interval ? `<span class="row-note">Interval ${esc(text(entry.interval))}</span>` : '';
    return `<td class="numeric">${esc(display)}${interval}</td>`;
  }).join('');
  return `<tr><th scope="row" class="rank">${esc(entry.rank ?? '—')}</th>${builder(entry)}${values}${grading(entry)}</tr>`;
}

function phaseLinks(bounty, slug, selected) {
  const phases = (Array.isArray(bounty.phases) ? bounty.phases : []).filter(phase => ['dev', 'final'].includes(phase.key));
  if (phases.length < 2) return '';
  return `<nav class="phase-links" aria-label="Leaderboard phase">${phases.map(phase => `<a class="button secondary" href="${routeLink(slug, '/leaderboard?phase=' + phase.key)}"${phase.key === selected ? ' aria-current="page"' : ''}>${esc(phase.key)} phase</a>`).join('')}</nav>`;
}

export function render([bounty, standings], route) {
  if (!Array.isArray(standings?.entries)) throw new Error('The leaderboard has an unexpected shape. Please retry.');
  if (!bounty?.title) throw new Error('The bounty context is missing. Please retry.');
  const phase = standings.phase || {};
  const phaseName = typeof phase === 'string' ? phase : phase.key || route.query.get('phase') || 'Current';
  const withheld = standings.scores_visible === false;
  const provisional = phase.placements_held === true || phaseName === 'dev' || !phase.finalized;
  const label = withheld ? 'Results withheld' : provisional ? 'Provisional standings' : 'Published standings';
  const page = Number(route.query.get('page') || 1), offset = (page - 1) * 25;
  const rows = standings.entries.slice(offset, offset + 25);
  const address = number => {
    const params = new URLSearchParams(route.query);
    params.set('page', number);
    return routeLink(route.segment, '/leaderboard?') + params;
  };
  const { key, columns } = metricColumns(bounty, standings);
  let content;
  if (withheld) {
    content = '<div class="empty"><h2>Scores are not public yet</h2><p>This phase is withholding results. Entries may already be received and grading. Check again after publication.</p></div>';
  } else if (!standings.entries.length) {
    content = '<div class="empty"><h2>No ranked entries yet</h2><p>Entries may be waiting for grading. Refresh later for public standings.</p></div>';
  } else {
    const headers = columns.map(column => `<th scope="col">${esc(column.title || column.key)}</th>`).join('');
    content = `<div class="table-scroll standings" role="region" tabindex="0" aria-label="Leaderboard table, scroll for all metrics"><table><caption>${esc(bounty.title)} · ${esc(phaseName)} · ${standings.entries.length} public entries</caption><thead><tr><th scope="col">Rank</th><th scope="col">Entry / builder</th>${headers}<th scope="col">Grading / eligibility</th></tr></thead><tbody>${rows.map(entry => standingRow(entry, columns, key)).join('')}</tbody></table></div>`
      + pager(page > 1 ? address(page - 1) : '', offset + 25 < standings.entries.length ? address(page + 1) : '', `Page ${page} · ${rows.length} of ${standings.entries.length}`);
  }
  return `${crumb(bounty.title)}${heading('The leaderboard', bounty.title)}<nav class="tabs" aria-label="Bounty"><a href="${routeLink(route.segment)}">Overview</a><a href="${routeLink(route.segment, '/leaderboard')}" aria-current="page">Leaderboard</a></nav><div class="section-head"><h2>${esc(phaseName)} phase</h2><span class="status">${label}</span></div>${phaseLinks(bounty, route.segment, phaseName)}<p class="muted">Performance order from make.fun. Equal ranks and ties are preserved.${provisional ? ' Places and prizes may change until final results publish.' : ''}${standings.metrics_withheld ? ' Private build metrics are withheld.' : ''}</p>${content}`;
}
