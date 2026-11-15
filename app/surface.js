// Deferred views share these helpers and a single deferred CSS request.
import { esc } from './main.js';
export { heading, pager } from './main.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./surfaces.css', import.meta.url).href;
export const styled = new Promise((resolve, reject) => {
  const release = () => { stylesheet.onload = null; stylesheet.onerror = null; };
  stylesheet.onload = () => { release(); resolve(); };
  stylesheet.onerror = () => { release(); reject(new Error('Could not load page styles. Reload to retry.')); };
});
document.head.append(stylesheet);
document.addEventListener('error', event => {
  if (event.target.tagName === 'IMG') event.target.remove();
}, true);

export const bountyPath = slug => `/competitions/${encodeURIComponent(slug)}?submissions=summary`;
export const profileLink = handle => `#/profile/${encodeURIComponent(handle)}`;

export function text(value) {
  if (value == null) return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function safeUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  try {
    const address = new URL(value, 'https://make.fun');
    return address.protocol === 'https:' || address.protocol === 'http:' ? address.href : '';
  } catch {
    return '';
  }
}

export function link(value, label) {
  const address = safeUrl(value);
  return address ? `<a target="_blank" rel="noopener noreferrer" href="${esc(address)}">${esc(label)} ↗</a>` : '';
}

export function crumb(label) {
  return `<nav aria-label="Breadcrumb" class="crumb"><a href="#/">Bounties</a><span aria-hidden="true">/</span><span>${esc(label)}</span></nav>`;
}
