// Optional local development server. There is no frontend build step.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(fileURLToPath(new URL('./app/', import.meta.url)));
const argumentsList = process.argv.slice(2);
const flag = argumentsList.indexOf('--port');
const requestedPort = flag < 0 ? 8080 : Number(argumentsList[flag + 1]);
const port = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535 ? requestedPort : 8080;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function insideApp(path) {
  return path === appDirectory || path.startsWith(appDirectory + sep);
}

function staticFile(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filename = resolve(appDirectory, '.' + pathname);
  if (!insideApp(filename)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size, diskPath;
  try {
    diskPath = realpathSync(filename);
    if (!insideApp(diskPath)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const info = statSync(diskPath);
    if (!info.isFile()) throw new Error('not a regular file');
    size = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  const stream = createReadStream(diskPath);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

createServer(staticFile).listen(port, '127.0.0.1', () => {
  console.log(`app/ is on http://localhost:${port}`);
});
