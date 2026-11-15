import { heading, crumb, link, safeUrl, pager, styled } from './surface.js';
export { styled };
import { esc, money, date, routeLink } from './main.js';

export const paths = route => [`/profiles/${encodeURIComponent(route.segment)}`];

function scoreText(score) {
  const value = typeof score === 'object' ? score?.display ?? score?.value : score;
  return String(value ?? 'Not published');
}

export function render([p], route) {
  if (!p?.handle) throw new Error('The profile response has no public handle. Please retry.');
  const record = p.record || {}, solutions = Array.isArray(p.solutions) ? p.solutions : [];
  const page = Number(route.query.get('page') || 1), start = (page - 1) * 25;
  const picture = safeUrl(p.avatar?.url || p.avatar || p.picture?.avatar?.url || p.picture?.avatar || p.picture?.image?.url || p.picture?.image || p.image || p.picture);
  const stats = [['competitions_entered','Bounties entered'],['competitions_won','Wins'],['competitions_placed','Bounties placed'],['podium_finishes','Podium finishes'],['other_placements','Other placements'],['best_placement','Best place'],['prize_usd','Prizes paid']];
  const url = n => '#/profile/' + encodeURIComponent(route.segment) + '?page=' + n;
  return `${crumb('Builder profile')}<section class="profile-head"><div class="avatar"><span aria-hidden="true">${esc(p.handle.slice(0,2).toUpperCase())}</span>${picture ? `<img crossorigin="anonymous" src="${esc(picture)}" width="88" height="88" alt="${esc(p.display_name || p.handle)}'s avatar" loading="lazy">` : ''}</div><div>${heading(p.display_name || p.handle, 'Builder profile')}<p class="handle">@${esc(p.handle)}</p>${p.demo ? '<p class="status">Demo account · record excludes demo entries</p>' : ''}<p class="bio">${esc(p.bio || 'This builder has not published a bio.')}</p><div class="card-links">${link('https://make.fun/u/' + encodeURIComponent(p.handle), 'make.fun profile')}${p.github_login ? link('https://github.com/' + encodeURIComponent(p.github_login), 'GitHub') : ''}${p.x?.url ? link(p.x.url,'X') : ''}${p.discord?.url ? link(p.discord.url,'Discord') : ''}</div></div></section>
    <dl class="profile-stats">${stats.filter(([k]) => record[k] != null).map(([k,label]) => `<div><dt>${label}</dt><dd>${k === 'prize_usd' ? money(record[k]) : esc(record[k])}</dd></div>`).join('')}</dl><p class="small muted">Public entries in published competitions. Places count after resolution; prize totals count money paid. Missing statistics are not treated as zero.</p>
    <section aria-labelledby="history-title"><div class="section-head"><h2 id="history-title">Public work</h2><span>${solutions.length} public entries</span></div><ul class="history">${solutions.slice(start,start + 25).map(s => `<li><div><h3>${esc(s.title || 'Untitled entry')}</h3>${s.competition?.slug ? `<a href="${routeLink(s.competition.slug)}">${esc(s.competition.title || s.competition.slug)}</a><div class="card-links"><a href="${routeLink(s.competition.slug, '/leaderboard')}">View standings →</a></div>` : '<p>Competition not published</p>'}</div><dl><div><dt>Place</dt><dd>${esc(s.place ?? 'Not placed')}</dd></div><div><dt>Score</dt><dd>${esc(scoreText(s.score))}</dd></div><div><dt>Prize awarded / paid</dt><dd>${s.prize_usd == null ? 'Not published' : money(s.prize_usd)}</dd></div></dl></li>`).join('') || '<li class="empty"><h3>No public entries yet</h3><p>Private and unpublished competition entries do not appear here.</p></li>'}</ul>${pager(page > 1 ? url(page - 1) : '', start + 25 < solutions.length ? url(page + 1) : '', `Page ${page}`)}</section>${p.created_at ? `<p class="muted small">Joined ${date(p.created_at)}</p>` : ''}`;
}
