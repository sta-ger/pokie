import fs from 'node:fs';
import path from 'node:path';

const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export function siteFiles(directory) {
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? siteFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
// Checks the emitted site, not a source-only route map. Used by the build and focused negative tests.
export function checkSite(directory) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'build-manifest.json'), 'utf8'));
    const base = manifest.base === undefined ? '/' : manifest.base;
    if (base !== '/' && base !== '/help/') throw new Error('Invalid site base');
    const files = siteFiles(directory), pages = new Map();
    for (const file of files.filter(name => name.endsWith('.html'))) {
        const relative = `/${path.relative(directory, file).split(path.sep).join('/')}`;
        const route = `${base}${relative.slice(1)}`.replace(/index\.html$/, '');
        const html = fs.readFileSync(file, 'utf8');
        if (pages.has(route)) throw new Error(`Duplicate route identity: ${route}`);
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => decode(match[1]));
        if (new Set(ids).size !== ids.length) throw new Error(`Duplicate heading/element identity: ${route}`);
        pages.set(route, {html, ids: new Set(ids)});
    }
    function checkReference(value, from) {
        if (/^https:\/\//.test(value)) return;
        const url = new URL(value, `https://pokie.fromstan.com${from}`);
        if (url.origin !== 'https://pokie.fromstan.com') throw new Error(`Invalid URL scheme: ${value}`);
        const target = decodeURIComponent(url.pathname);
        if (!target.startsWith(base)) throw new Error(`Reference outside site base: ${value}`);
        const page = pages.get(target);
        if (!page) {
            const file = path.resolve(directory, target.slice(base.length));
            if (!file.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Broken route/asset/download ${value} from ${from}`);
        }
        if (url.hash && (!page || !page.ids.has(decodeURIComponent(url.hash.slice(1))))) throw new Error(`Invalid fragment ${value} from ${from}`);
    }
    for (const [route, page] of pages) {
        for (const match of page.html.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkReference(decode(match[1]), route);
    }
    const index = JSON.parse(fs.readFileSync(path.join(directory, 'search.json'), 'utf8'));
    if (!Array.isArray(index) || index.length === 0) throw new Error('Missing search entries');
    for (const entry of index) {
        if (!entry.title || !entry.excerpt || typeof entry.text !== 'string' || !entry.url?.startsWith('/')) throw new Error('Malformed search entry');
        checkReference(entry.url, '/');
    }
    if (new Set(manifest.routes).size !== manifest.routes.length || manifest.routes.length !== pages.size) throw new Error('Duplicate or missing route in build manifest');
    for (const route of manifest.routes) if (!pages.has(route)) throw new Error(`Missing rendered route ${route}`);
    return {pages: pages.size, files: files.length, searchEntries: index.length};
}
