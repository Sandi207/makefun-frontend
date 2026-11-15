import { esc } from './main.js';

// Shared presentation and CSS are loaded only for non-board routes.
const sheet = document.createElement('link');
sheet.rel = 'stylesheet';
sheet.href = new URL('./surfaces.css', import.meta.url).href;
export const styled = new Promise((resolve, reject) => { sheet.onload = resolve; sheet.onerror = () => reject(new Error('Could not load page styles. Reload to retry.')); });
document.head.append(sheet);

export const text = value => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const url = new URL(value, 'https://make.fun'); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export const link = (url, label) => safeUrl(url) ? `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
export const crumb = title => `<nav class="crumb" aria-label="Breadcrumb"><a href="#/">Bounties</a><span aria-hidden="true">/</span><span>${esc(title)}</span></nav>`;
export { heading, pager } from './main.js';
