import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {escapeHtml as esc, renderMarkdown, parseMarkdown, plain} from './markdown.mjs';
import {build as bundle} from 'vite';
import {builtinModules} from 'node:module';
import {checkSite, siteFiles} from './check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
}
const output = path.resolve(root, option('--out', 'site/.output'));
const inventoryPath = path.resolve(root, option('--inventory', 'site/content.json'));
let staging;
function localFile(name) {
    const file = path.resolve(root, name);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error(`Missing or invalid source reference: ${name}`);
    return file;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
try {
    // Only these owned output locations may be replaced. Never touch runtime dist or authored files.
    if (output !== path.join(root, 'site/.output') && !output.startsWith(path.join(root, 'node_modules/.cache/pokie-tmp/'))) throw new Error('Site output must be site/.output or a test-owned pokie-tmp directory.');
    fs.mkdirSync(path.dirname(output), {recursive: true});
    // A failed fresh build cannot leave an old deployable manifest behind.
    fs.rmSync(path.join(output, 'build-manifest.json'), {force: true});
    const inventory = JSON.parse(fs.readFileSync(localFile(path.relative(root, inventoryPath)), 'utf8'));
    if (inventory.origin !== 'https://pokie.fromstan.com') throw new Error('Unexpected public site origin.');
    const routes = new Map(), sources = new Map(), downloads = new Map();
    for (const page of inventory.pages) {
        if (!(/^\/(?:[a-z0-9-]+\/)*$|^\/404\.html$/).test(page.route) || routes.has(page.route)) throw new Error(`Invalid or duplicate route: ${page.route}`);
        if (sources.has(page.source)) throw new Error(`Ambiguous source route: ${page.source}`);
        localFile(page.source);
        routes.set(page.route, page);
        sources.set(page.source, page.route);
    }
    for (const route of ['/', '/docs/', '/404.html']) if (!routes.has(route)) throw new Error(`Missing required route ${route}`);
    for (const example of inventory.examples) {
        localFile(example.source);
        const destination = `/downloads/${path.basename(example.source)}`;
        if ([...downloads.values()].includes(destination)) throw new Error(`Duplicate download ${destination}`);
        downloads.set(example.source, destination);
    }
    downloads.set('LICENSE', '/downloads/LICENSE');
    const references = new Set();
    const rewrite = (url, source) => {
        if (/^https:\/\//.test(url)) return url;
        if (url.startsWith('#') || url.startsWith('/')) return url;
        if (/^[a-z]+:/i.test(url) || url.includes('?')) throw new Error(`Invalid documentation URL ${url} in ${source}`);
        const [relative, fragment] = url.split('#');
        const file = path.posix.normalize(path.posix.join(path.posix.dirname(source), relative));
        const target = localFile(file);
        const suffix = fragment ? `#${fragment}` : '';
        if (downloads.has(file)) return downloads.get(file) + suffix;
        if (sources.has(file)) return sources.get(file) + suffix;
        // Site sources resolve above; explicit repository guides retain their maintained detail.
        // Do not alias them to summary pages, even when they share a topic or basename.
        if (fragment) {
            if (file.endsWith('.md')) {
                const rendered = renderMarkdown(fs.readFileSync(target, 'utf8'), value => value);
                if (!rendered.headings.some(heading => heading.id === fragment)) throw new Error(`Invalid source fragment ${url} in ${source}`);
            } else if (!(/^L\d+(?:-L\d+)?$/).test(fragment)) throw new Error(`Invalid source fragment ${url}`);
        }
        references.add(file);
        return `https://github.com/fromstan/pokie/${fs.statSync(target).isDirectory() ? 'tree' : 'blob'}/develop/${file}${suffix}`;
    };
    const contracts = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--loader', './site/source-loader.mjs', './site/contracts.mjs', inventoryPath], {cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: 'pipe'}));
    const commandMarkdown = (commands, prefix = '') => commands.map(command => `### pokie ${prefix}${command.name}\n\n\`\`\`text\n${command.help}\n\`\`\`\n${commandMarkdown(command.children, `${prefix}${command.name} `)}`).join('\n');
    const search = [], renderedPages = [];
    for (const page of inventory.pages) {
        let source = fs.readFileSync(localFile(page.source), 'utf8');
        source = source.replace(/\{\{example:([^}]+)\}\}/g, (_all, name) => {
            if (!downloads.has(name)) throw new Error(`Example not inventoried: ${name}`);
            const lang = name.endsWith('.ts') ? 'ts' : 'json';
            return `[Download complete source](${downloads.get(name)})\n\n\`\`\`${lang}\n${fs.readFileSync(localFile(name), 'utf8').trim()}\n\`\`\``;
        }).replace('{{commands}}', commandMarkdown(contracts.commands));
        const rendered = renderMarkdown(source, url => rewrite(url, page.source));
        rendered.html = rendered.html.replace('<p>POKIEGALLERY</p>', '<div id="gallery"></div>').replace('<p>POKIEPLAYGROUND</p>', '<div id="playground"></div>');
        if (page.route !== '/404.html') {
            search.push({title: page.title, url: page.route, excerpt: page.description, text: plain(parseMarkdown(source)).toLowerCase()});
            // One entry per actual section, with its following prose as a useful excerpt.
            const sections = source.split(/(?=^#{1,3} )/m);
            for (const heading of rendered.headings.filter(item => item.depth > 1 && item.depth <= 3)) {
                const section = sections.find(part => part.startsWith(`${'#'.repeat(heading.depth)} ${heading.title}\n`)) ?? heading.title;
                const excerpt = plain(parseMarkdown(section)).replace(/\s+/g, ' ').slice(0, 220);
                search.push({title: `${page.title} · ${heading.title}`, url: `${page.route}#${heading.id}`, excerpt, text: excerpt.toLowerCase()});
            }
        }
        renderedPages.push({...page, ...rendered});
    }
    staging = fs.mkdtempSync(`${output}-staging-`);
    function write(name, content) {
        const file = path.join(staging, name);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, content);
    }
    for (const page of renderedPages) {
        const navigation = renderedPages.filter(item => item.route !== '/404.html').map(item => `<a href="${item.route}"${item.route === page.route ? ' aria-current="page"' : ''}>${esc(item.title)}</a>`).join('');
        const toc = page.headings.filter(heading => heading.depth === 2).map(heading => `<a href="#${heading.id}">${esc(heading.title)}</a>`).join('');
        const index = renderedPages.indexOf(page), previous = renderedPages[index - 1], next = renderedPages[index + 1];
        const adjacent = [previous && previous.route !== '/404.html' ? `<a href="${previous.route}">← ${esc(previous.title)}</a>` : '', next && next.route !== '/404.html' ? `<a href="${next.route}">${esc(next.title)} →</a>` : ''].join('');
        write(page.route.endsWith('/') ? `${page.route.slice(1)}index.html` : page.route.slice(1), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(page.title)} — FromStan / POKIE</title><meta name="description" content="${esc(page.description)}"><link rel="canonical" href="${inventory.origin}${page.route}"><link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/site.js"></script></head><body><a class="skip" href="#main">Skip to main content</a><header><a class="brand" href="/">FromStan <span>/ POKIE</span></a><span class="edition">Open source · Local tools</span></header><div class="layout"><aside><nav aria-label="Documentation">${navigation}</nav></aside><main id="main" tabindex="-1"><div class="search"><label for="docs-search">Search documentation</label><div class="search-controls"><input id="docs-search" type="search" autocomplete="off" placeholder="Try replay, weighted sequences…"><button id="clear-search" type="button">Clear</button></div><p id="search-status" role="status" aria-live="polite">Type to search this build.</p><ul id="search-results"></ul><noscript>Search requires JavaScript. All guides remain available in navigation.</noscript></div><nav class="toc" aria-label="On this page">${toc}</nav><article>${page.html}</article>${["/playground/", "/gallery/"].includes(page.route) ? '<script type="module" src="/assets/playground/playground.js"></script>' : ""}<nav class="adjacent" aria-label="Previous and next guide">${adjacent}</nav><p class="source"><a href="https://github.com/fromstan/pokie/blob/develop/${page.source}">Read this guide's maintained source</a></p></main></div><footer>ISC · Copyright (c) 2018-2026, sta-ger · <a href="/downloads/LICENSE">License</a> · Unpublished candidate · Deployment is separately controlled.</footer></body></html>`);
    }
    for (const [source, destination] of downloads) write(destination.slice(1), fs.readFileSync(localFile(source)));
    for (const model of contracts.gallery) {
        write(`assets/playground/models/${model.id}.wasm`, new Uint8Array(model.bytes));
        write(`assets/playground/models/${model.id}.wasm.pokie-wasm.json`, JSON.stringify(model.manifest));
        write(`assets/playground/models/${model.id}.blueprint.json`, JSON.stringify(model.blueprint));
    }
    write('search.json', JSON.stringify(search));
    for (const name of ['site.css', 'site.js']) write(`assets/${name}`, fs.readFileSync(path.join(root, 'site', name)));
    write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${inventory.origin}/sitemap.xml\n`);
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${inventory.pages.filter(page => page.route !== '/404.html').map(page => `<url><loc>${inventory.origin}${page.route}</loc></url>`).join('')}</urlset>`);
    const browserSources = new Set();
    // Publish a plain-Node runner using the same sources as the browser runtime.
    // A clean site checkout has no package distribution for a bare self-import.
    await bundle({configFile: false, logLevel: 'error', root,
        resolve: {alias: {'@fromstan/pokie/wasm': path.join(root, 'src/wasm/browser.ts')}},
        ssr: {noExternal: true},
        plugins: [{name: 'runner-source-inventory', moduleParsed(info) {
            if (info.id.startsWith(root + path.sep)) browserSources.add(path.relative(root, info.id));
        }}],
        build: {ssr: path.join(root, 'site/examples/reproduce.mjs'), target: 'node20',
            outDir: path.join(staging, 'downloads'), emptyOutDir: false, minify: false,
            rollupOptions: {output: {entryFileNames: 'reproduce.mjs', inlineDynamicImports: true}}}});
    await bundle({configFile: false, logLevel: 'error', root,
        plugins: [{name: 'local-browser-boundary', resolveId(id) {
            if (id.startsWith('node:') || builtinModules.includes(id)) throw new Error(`Node import in public playground: ${id}`);
        }, moduleParsed(info) { if (info.id.startsWith(root + path.sep)) browserSources.add(path.relative(root, info.id)); }}],
        build: {outDir: path.join(staging, 'assets/playground'), emptyOutDir: false, minify: false,
            lib: {entry: {playground: path.join(root, 'site/playground/app.ts'), worker: path.join(root, 'site/playground/worker.ts')}, formats: ['es'], fileName: (_format, entry) => `${entry}.js`}}});
    const sourceHashes = Object.fromEntries([...new Set([...browserSources, ...inventory.pages.map(page => page.source), ...downloads.keys(), ...references, path.relative(root, inventoryPath), 'site/build.mjs', 'site/markdown.mjs', 'site/check.mjs', 'site/preview.mjs', 'site/source-loader.mjs', 'site/contracts.mjs', 'site/site.js', 'site/site.css', 'package.json', 'package-lock.json'])].filter(name => fs.statSync(localFile(name)).isFile()).sort().map(name => [name, hash(fs.readFileSync(localFile(name)))]));
    const artifactHashes = Object.fromEntries(siteFiles(staging).sort().map(file => [path.relative(staging, file).split(path.sep).join('/'), hash(fs.readFileSync(file))]));
    write('build-manifest.json', JSON.stringify({origin: inventory.origin, candidate: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), routes: inventory.pages.map(page => page.route), sourceHashes, artifactHashes, contracts}, null, 2));
    checkSite(staging);
    fs.rmSync(output, {recursive: true, force: true});
    fs.renameSync(staging, output);
    staging = undefined;
    console.log(`Site built: ${path.relative(root, output)} (${renderedPages.length} pages, ${search.length} searchable entries). Static target: ${inventory.origin}. No deployment performed.`);
} catch (error) {
    console.error(`Site build failed: ${error.message}\nFix the inventoried source/reference/example, then rerun npm run site:build. No valid fresh deployment manifest was produced.`);
    process.exitCode = 1;
} finally {
    if (staging) fs.rmSync(staging, {recursive: true, force: true});
}
