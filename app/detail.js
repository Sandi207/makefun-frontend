import { bountyPath, crumb, heading, link, text } from './surface.js';
import { date, esc, lifecycle, metrics, money, routeLink } from './main.js';
export { styled } from './surface.js';

const publishedPrizes = bounty => bounty.prizes ?? bounty.bundle?.prizes;
export function paths(route) {
  return [bountyPath(route.segment)];
}
export function extra([bounty]) {
  if (!bounty?.title || !bounty.slug) return '';
  if (bounty.rules && Array.isArray(publishedPrizes(bounty))) return '';
  return `/competitions/${encodeURIComponent(bounty.slug)}/requirements`;
}

function prose(value) {
  if (value == null || value === '') return '<p class="muted">Not published in this public response.</p>';
  return text(value).split(/\n\s*\n/).map(block => {
    const prefix = /^#{1,6} /.exec(block);
    return prefix ? `<h3>${esc(block.slice(prefix[0].length))}</h3>` : `<p>${esc(block)}</p>`;
  }).join('');
}

function rewardTable(prizes) {
  if (!Array.isArray(prizes) || !prizes.length) {
    return '<p>No public reward schedule returned. Read the official rules for the payout terms.</p>';
  }
  const rows = prizes.map(prize => {
    const label = prize.place == null ? prize.kind || 'Prize' : `#${prize.place}`;
    return `<tr><th scope="row">${esc(label)}</th><td>${money(prize.amount_usd)}</td></tr>`;
  }).join('');
  return `<div class="table-scroll" role="region" tabindex="0" aria-label="Reward places"><table><caption>Published reward schedule · USD</caption><thead><tr><th scope="col">Place / prize</th><th scope="col">Base prize</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function dateFacts(bounty) {
  let result = `<dt>${bounty.openAt ? 'Opened' : 'Created'}</dt><dd>${date(bounty.openAt ?? bounty.createdAt)}</dd><dt>Entry deadline</dt><dd>${date(bounty.deadline)}</dd>`;
  if (bounty.resolvedAt) result += `<dt>Results published</dt><dd>${date(bounty.resolvedAt)}</dd>`;
  const phases = Array.isArray(bounty.phases) ? bounty.phases : [];
  result += phases.map(phase => {
    const state = phase.finalized ? 'Finalized' : phase.status || 'Not finalized';
    return `<dt>${esc(phase.key || phase.name || 'Phase')} phase</dt><dd>${esc(state)}${phase.deadline ? `<br>${date(phase.deadline)}` : ''}</dd>`;
  }).join('');
  return `<dl class="dates">${result}</dl>`;
}

function facts(bounty, slug, official) {
  return `<aside aria-label="Bounty facts"><section class="panel facts"><h2>At a glance</h2>${metrics(bounty)}${dateFacts(bounty)}<a class="button" href="${routeLink(slug, '/leaderboard')}">View standings →</a><p class="small muted">Read-only public data. Check the official bounty before entering.</p>${link(official, 'Open on make.fun')}</section></aside>`;
}

export function render([bounty, requirements], route) {
  if (!bounty?.title) throw new Error('The bounty response is missing its title. Please retry.');
  const prizes = publishedPrizes(bounty) ?? requirements?.payout_curve ?? requirements?.prizes ?? [];
  const rules = bounty.rules || requirements?.rules || requirements?.checks;
  const official = 'https://make.fun/c/' + encodeURIComponent(route.segment);
  const status = `<span class="status" data-state="${esc(bounty.demo ? 'demo' : bounty.status)}" data-end="${esc(bounty.deadline)}">${lifecycle(bounty)}</span>`;
  const lead = `${crumb(bounty.title)}<section class="detail-head">${heading(bounty.title, bounty.category || 'Bounty')}<p class="intro">${esc(bounty.summary || 'Summary not published.')}</p><p>${status}</p><nav class="tabs" aria-label="Bounty"><a href="${routeLink(route.segment)}" aria-current="page">Overview</a><a href="${routeLink(route.segment, '/leaderboard')}">Leaderboard →</a></nav></section>`;
  const rewards = `<section class="panel" id="rewards" aria-labelledby="rewards-title"><p class="eyebrow">The upside</p><h2 id="rewards-title">Rewards</h2><div class="reward-total"><strong>${money(bounty.potUsd ?? bounty.rewardAmount)}</strong><span>live pot</span></div><p class="muted">Base reward ${money(bounty.rewardAmount)}. Entry fees may increase the pot. The table shows published base prizes; no live per-place distribution is inferred.</p>${rewardTable(prizes)}</section>`;
  const description = `<section class="panel" aria-labelledby="description-title"><p class="eyebrow">The challenge</p><h2 id="description-title">What to build</h2><div class="prose">${prose(bounty.description)}</div></section>`;
  const notice = bounty.rulesNote ? `<div class="notice">${prose(bounty.rulesNote.text || bounty.rulesNote)}</div>` : '';
  const resolution = bounty.resolution ? `<h3>How results are decided</h3><div class="prose">${prose(bounty.resolution)}</div>` : '';
  const judging = `<section class="panel" aria-labelledby="rules-title"><p class="eyebrow">Read before you build</p><h2 id="rules-title">Rules & judging</h2>${notice}<div class="prose">${prose(rules)}</div>${resolution}${link(official, 'Complete rules on make.fun')}</section>`;
  return `${lead}<div class="detail-grid"><article>${rewards}${description}${judging}</article>${facts(bounty, route.segment, official)}</div>`;
}
