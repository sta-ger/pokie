import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
const directory = path.resolve(root, option('--dir', 'site/.output'));
const port = Number(option('--port', '4174'));
const mime = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ts': 'text/plain; charset=utf-8'};
if (!fs.existsSync(path.join(directory, 'build-manifest.json')) || !fs.existsSync(path.join(directory, '404.html'))) {
    console.error('Site preview requires a successful fresh build. Run npm run site:build, then npm run site:preview.');
    process.exitCode = 1;
} else if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('Site preview --port must be an integer from 0 to 65535 (0 selects an ephemeral port).');
    process.exitCode = 1;
} else {
    const server = http.createServer((request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            const pathname = decodeURIComponent(url.pathname);
            let file = path.resolve(directory, `.${pathname}`);
            if (!file.startsWith(`${directory}${path.sep}`) && file !== directory) throw new Error('Invalid path');
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
                if (!pathname.endsWith('/')) { response.writeHead(308, {Location: `${pathname}/${url.search}`}); response.end(); return; }
                file = path.join(file, 'index.html');
            }
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
                response.writeHead(404, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
                response.end(fs.readFileSync(path.join(directory, '404.html')));
                return;
            }
            response.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
            if (request.method === 'HEAD') response.end();
            else fs.createReadStream(file).pipe(response);
        } catch {
            response.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
            response.end('Invalid documentation path. Return to /docs/.');
        }
    });
    server.on('error', error => { console.error(`Site preview failed: ${error.message}. Choose an available --port.`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Site preview ready: http://127.0.0.1:${server.address().port}`));
    const close = () => { server.close(); server.closeAllConnections(); };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
}
