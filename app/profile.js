import { crumb, heading, link, pager, safeUrl } from './surface.js';
import { date, esc, money, routeLink } from './main.js';
export { styled } from './surface.js';

const statistics = [
  ['competitions_entered', 'Bounties entered'], ['competitions_won', 'Wins'],
  ['competitions_placed', 'Bounties placed'], ['podium_finishes', 'Podium finishes'],
  ['other_placements', 'Other placements'], ['best_placement', 'Best place'],
  ['prize_usd', 'Prizes paid'],
];

export function paths(route) {
  return [`/profiles/${encodeURIComponent(route.segment)}`];
}

function scoreLabel(score) {
  // Keep server formatting and preserve numeric zero as a published score.
  if (score !== null && typeof score === 'object') score = score.display ?? score.value;
  return String(score ?? 'Not published');
}

function avatar(profile) {
  const candidate = [profile.avatar, profile.picture?.avatar, profile.picture?.image,
    profile.image, profile.picture].find(Boolean);
  const address = safeUrl(candidate?.url || candidate);
  const initials = esc(profile.handle.slice(0, 2).toUpperCase());
  const picture = address ? `<img crossorigin="anonymous" src="${esc(address)}" width="88" height="88" loading="lazy" alt="${esc(profile.display_name || profile.handle)}'s avatar">` : '';
  return `<div class="avatar"><span aria-hidden="true">${initials}</span>${picture}</div>`;
}

function publicLinks(profile) {
  const links = [link('https://make.fun/u/' + encodeURIComponent(profile.handle), 'make.fun profile')];
  if (profile.github_login) links.push(link('https://github.com/' + encodeURIComponent(profile.github_login), 'GitHub'));
  if (profile.x?.url) links.push(link(profile.x.url, 'X'));
  if (profile.discord?.url) links.push(link(profile.discord.url, 'Discord'));
  return `<div class="card-links">${links.join('')}</div>`;
}

function historyItem(solution) {
  const competition = solution.competition;
  const context = competition?.slug
    ? `<a href="${routeLink(competition.slug)}">${esc(competition.title || competition.slug)}</a><div class="card-links"><a href="${routeLink(competition.slug, '/leaderboard')}">View standings →</a></div>`
    : '<p>Competition not published</p>';
  return `<li><div><h3>${esc(solution.title || 'Untitled entry')}</h3>${context}</div><dl><div><dt>Place</dt><dd>${esc(solution.place ?? 'Not placed')}</dd></div><div><dt>Score</dt><dd>${esc(scoreLabel(solution.score))}</dd></div><div><dt>Prize awarded / paid</dt><dd>${solution.prize_usd == null ? 'Not published' : money(solution.prize_usd)}</dd></div></dl></li>`;
}

export function render([profile], route) {
  if (!profile?.handle) throw new Error('The profile response is missing its public handle. Please retry.');
  const record = profile.record || {};
  const solutions = Array.isArray(profile.solutions) ? profile.solutions : [];
  const page = Number(route.query.get('page') || 1), offset = (page - 1) * 25;
  const address = number => `#/profile/${encodeURIComponent(route.segment)}?page=${number}`;
  const totals = statistics.filter(([key]) => record[key] != null).map(([key, label]) =>
    `<div><dt>${label}</dt><dd>${key === 'prize_usd' ? money(record[key]) : esc(record[key])}</dd></div>`).join('');
  const demo = profile.demo ? '<p class="status">Demo account · record excludes demo entries</p>' : '';
  const intro = `<section class="profile-head">${avatar(profile)}<div>${heading(profile.display_name || profile.handle, 'Builder profile')}<p class="handle">@${esc(profile.handle)}</p>${demo}<p class="bio">${esc(profile.bio || 'This builder has not published a bio.')}</p>${publicLinks(profile)}</div></section>`;
  const empty = '<li class="empty"><h3>No public entries yet</h3><p>Private and unpublished competition entries do not appear here.</p></li>';
  const history = `<section aria-labelledby="history-title"><div class="section-head"><h2 id="history-title">Public work</h2><span>${solutions.length} public entries</span></div><ul class="history">${solutions.slice(offset, offset + 25).map(historyItem).join('') || empty}</ul>${pager(page > 1 ? address(page - 1) : '', offset + 25 < solutions.length ? address(page + 1) : '', `Page ${page}`)}</section>`;
  return `${crumb('Builder profile')}${intro}<dl class="profile-stats">${totals}</dl><p class="small muted">Public entries in published competitions. Places count after resolution; prize totals count money paid. Missing statistics are not treated as zero.</p>${history}${profile.created_at ? `<p class="muted small">Joined ${date(profile.created_at)}</p>` : ''}`;
}
