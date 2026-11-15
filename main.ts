// Package validated local inputs with the kit's unchanged dossier writer.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const destination = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const captureDirectory = join(repository, 'screenshots');
const limits = {
  app_max_files: 993,
  app_max_bytes: 16 * 1024 * 1024,
  text_max_bytes: 160 * 1024,
  screenshots: { max: 3, max_bytes: 256 * 1024 },
};

function captureNames() {
  const visible = existsSync(captureDirectory)
    ? readdirSync(captureDirectory, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.')) : [];
  const acceptable = visible.every(entry => entry.isFile() && /\.(?:png|jpe?g)$/i.test(entry.name));
  if (visible.length !== 3 || !acceptable) {
    throw new Error(`Expected exactly three PNG/JPEG captures in screenshots/. Found ${visible.length} visible entries. Use the three routes in shots.json and remove extra entries before packaging. Output is untouched.`);
  }
  return visible.map(entry => entry.name).sort();
}

function checkDestination() {
  const source = resolve(repository);
  if (destination === source || destination.startsWith(source + sep)) {
    throw new Error('MAKEFUN_OUTPUT_DIR must be outside the repository. Choose an empty directory under /tmp or /output.');
  }
  if (existsSync(destination) && readdirSync(destination).length !== 0) {
    throw new Error(`MAKEFUN_OUTPUT_DIR is not empty: ${destination}. Choose another directory; no files have been copied.`);
  }
}

const names = captureNames();
checkDestination();
// Source, image and reference checks finish before the first output write.
const dossier = buildDossier(repository, limits);
const dossierMaximum = 1536 * 1024;
if (dossier.byteLength > dossierMaximum) {
  throw new Error(`Dossier is ${dossier.byteLength} bytes; this bounty permits ${dossierMaximum}. Reduce app source or capture size before packaging. Output is untouched.`);
}
mkdirSync(destination, { recursive: true });
cpSync(join(repository, 'app'), join(destination, 'app'), { recursive: true });
mkdirSync(join(destination, 'screenshots'));
for (const name of names) {
  cpSync(join(captureDirectory, name), join(destination, 'screenshots', name));
}
writeFileSync(join(destination, 'dossier.json'), dossier);
