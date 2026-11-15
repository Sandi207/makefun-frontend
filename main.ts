// Standard-library-only, network-free packaging. Validate everything before copying.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const captures = join(here, 'screenshots');
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

const files = existsSync(captures) ? readdirSync(captures, { withFileTypes: true }).filter(file => !file.name.startsWith('.')) : [];
if (files.length !== 3 || files.some(file => !file.isFile() || !/\.(png|jpe?g)$/i.test(file.name))) {
  throw new Error(`Expected exactly three PNG/JPEG capture files in screenshots/; found ${files.length} visible entries. Capture the three routes in shots.json, remove extra files, and run main.ts again. No output has been copied.`);
}
if (out === resolve(here) || out.startsWith(resolve(here) + sep)) {
  throw new Error('MAKEFUN_OUTPUT_DIR must be outside the repository. Choose an empty directory under /tmp or use /output.');
}
if (existsSync(out) && readdirSync(out).length) {
  throw new Error(`Output directory ${out} is not empty. Choose a new MAKEFUN_OUTPUT_DIR to avoid mixing submissions. No output has been copied.`);
}

// The unchanged library verifies signatures, sizes, source limits and references.
// Building from the inputs first leaves output untouched on any validation error.
const dossier = buildDossier(here, caps);
mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'));
for (const file of files) cpSync(join(captures, file.name), join(out, 'screenshots', file.name));
writeFileSync(join(out, 'dossier.json'), dossier);
