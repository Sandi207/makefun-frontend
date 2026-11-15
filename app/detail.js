import { text, heading, crumb, link, styled } from './surface.js';
export { styled };
import { bountyPath, esc, money, date, lifecycle, routeLink, metrics } from './main.js';

export const paths = route => [bountyPath(route.segment)];
const prizes = b => b.prizes ?? b.bundle?.prizes;
export const extra = ([b]) => !b.rules || !Array.isArray(prizes(b)) ? `/competitions/${encodeURIComponent(b.slug)}/requirements` : '';

function prose(value) {
  if (value == null || value === '') return '<p class="muted">Not published in this public response.</p>';
  return text(value).split(/\n\s*\n/).map(part => /^#{1,6} /.test(part) ? `<h3>${esc(part.replace(/^#{1,6} /, ''))}</h3>` : `<p>${esc(part)}</p>`).join('');
}

export function render([b, requirements], route) {
  if (!b?.title) throw new Error('The bounty response has no title. Please retry.');
  const rewards = prizes(b) ?? requirements?.payout_curve ?? requirements?.prizes ?? [];
  const rules = b.rules || requirements?.rules;
  return `${crumb(b.title)}<section class="detail-head">${heading(b.title, b.category || 'Bounty')}<p class="intro">${esc(b.summary || 'Summary not published.')}</p><p><span class="status" data-state="${esc(b.demo ? 'demo' : b.status)}" data-end="${esc(b.deadline)}">${lifecycle(b)}</span></p><nav class="tabs" aria-label="Bounty"><a aria-current="page" href="${routeLink(route.segment)}">Overview</a><a href="${routeLink(route.segment, '/leaderboard')}">Leaderboard →</a></nav></section>
    <div class="detail-grid"><article>
    <section class="panel" id="rewards" aria-labelledby="rewards-title"><p class="eyebrow">The upside</p><h2 id="rewards-title">Rewards</h2><div class="reward-total"><strong>${money(b.potUsd ?? b.rewardAmount)}</strong><span>live pot</span></div><p class="muted">Base reward ${money(b.rewardAmount)}. Entry fees may increase the pot. The table shows published base prizes; no live per-place distribution is inferred.</p>
    ${Array.isArray(rewards) && rewards.length ? `<div class="table-scroll" role="region" aria-label="Reward places" tabindex="0"><table><caption>Published reward schedule · USD</caption><thead><tr><th scope="col">Place / prize</th><th scope="col">Base prize</th></tr></thead><tbody>${rewards.map(p => `<tr><th scope="row">${esc(p.place == null ? p.kind || 'Prize' : '#' + p.place)}</th><td>${money(p.amount_usd)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No public reward schedule returned. Read the official rules for the payout terms.</p>'}</section>
    <section class="panel" aria-labelledby="description-title"><p class="eyebrow">The challenge</p><h2 id="description-title">What to build</h2><div class="prose">${prose(b.description)}</div></section>
    <section class="panel" aria-labelledby="rules-title"><p class="eyebrow">Read before you build</p><h2 id="rules-title">Rules & judging</h2>${b.rulesNote ? `<div class="notice">${prose(b.rulesNote.text || b.rulesNote)}</div>` : ''}<div class="prose">${prose(rules || requirements?.checks)}</div>${b.resolution ? `<h3>How results are decided</h3><div class="prose">${prose(b.resolution)}</div>` : ''}${link('https://make.fun/c/' + encodeURIComponent(route.segment), 'Complete rules on make.fun')}</section></article>
    <aside aria-label="Bounty facts"><section class="panel facts"><h2>At a glance</h2>${metrics(b)}<dl class="dates"><dt>${b.openAt ? 'Opened' : 'Created'}</dt><dd>${date(b.openAt ?? b.createdAt)}</dd><dt>Entry deadline</dt><dd>${date(b.deadline)}</dd>${b.resolvedAt ? `<dt>Results published</dt><dd>${date(b.resolvedAt)}</dd>` : ''}${(b.phases || []).map(p => `<dt>${esc(p.key || p.name || 'Phase')} phase</dt><dd>${esc(p.finalized ? 'Finalized' : p.status || 'Not finalized')}${p.deadline ? '<br>' + date(p.deadline) : ''}</dd>`).join('')}</dl><a class="button" href="${routeLink(route.segment, '/leaderboard')}">View standings →</a><p class="small muted">Read-only public data. Check the official bounty before entering.</p>${link('https://make.fun/c/' + encodeURIComponent(route.segment), 'Open on make.fun')}</section></aside></div>`;
}
