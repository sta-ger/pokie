import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {escapeHtml as esc, renderMarkdown, parseMarkdown, plain} from './markdown.mjs';
import {build as bundle} from 'vite';
import {renderInteractiveContent} from './interactive.mjs';
import {renderNavigation} from './navigation.mjs';
import {builtinModules} from 'node:module';
import {checkSite, siteFiles} from './check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
}
const output = path.resolve(root, option('--out', 'site/.output'));
const base = option('--base', '/');
const siteUrl = route => `${base}${route.slice(1)}`;
const inventoryPath = path.resolve(root, option('--inventory', 'site/content.json'));
let staging;
function localFile(name) {
    const file = path.resolve(root, name);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error(`Missing or invalid source reference: ${name}`);
    return file;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
try {
    // Replace only the owned site output, installed help subtree, or a test-owned directory.
    if (output !== path.join(root, 'site/.output') && output !== path.join(root, 'dist/cli/studio-client/help') && !output.startsWith(path.join(root, 'node_modules/.cache/pokie-tmp/'))) throw new Error('Site output must be site/.output, dist/cli/studio-client/help or a test-owned pokie-tmp directory.');
    fs.mkdirSync(path.dirname(output), {recursive: true});
    // A failed fresh build cannot leave an old deployable manifest behind.
    fs.rmSync(path.join(output, 'build-manifest.json'), {force: true});
    if (base !== '/' && base !== '/help/') throw new Error('Site base must be / or /help/.');
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
        if (url.startsWith('#')) return url;
        if (url.startsWith('/')) return siteUrl(url);
        if (/^[a-z]+:/i.test(url) || url.includes('?')) throw new Error(`Invalid documentation URL ${url} in ${source}`);
        const [relative, fragment] = url.split('#');
        const file = path.posix.normalize(path.posix.join(path.posix.dirname(source), relative));
        const target = localFile(file);
        const suffix = fragment ? `#${fragment}` : '';
        if (downloads.has(file)) return siteUrl(downloads.get(file)) + suffix;
        if (sources.has(file)) return siteUrl(sources.get(file)) + suffix;
        // Site sources resolve above; explicit repository guides retain their maintained detail.
        // Do not alias them to summary pages, even when they share a topic or basename.
        if (fragment) {
            if (file.endsWith('.md')) {
                const rendered = renderMarkdown(fs.readFileSync(target, 'utf8'), value => value);
                if (!rendered.headings.some(heading => heading.id === fragment)) throw new Error(`Invalid source fragment ${url} in ${source}`);
            } else if (!(/^L\d+(?:-L\d+)?$/).test(fragment)) throw new Error(`Invalid source fragment ${url}`);
        }
        references.add(file);
        if (base === '/help/') return fs.statSync(target).isFile() ? siteUrl(`/sources/${file}`) : `${siteUrl('/sources/')}#${encodeURIComponent(file.replace(/\/$/, ''))}`;
        return `https://github.com/fromstan/pokie/${fs.statSync(target).isDirectory() ? 'tree' : 'blob'}/develop/${file}${suffix}`;
    };
    const contracts = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--loader', './site/source-loader.mjs', './site/contracts.mjs', inventoryPath, base], {cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: 'pipe'}));
    const commandMarkdown = (commands, prefix = '') => commands.map(command => `### pokie ${prefix}${command.name}\n\n\`\`\`text\n${command.help}\n\`\`\`\n${commandMarkdown(command.children, `${prefix}${command.name} `)}`).join('\n');
    const search = [], renderedPages = [];
    for (const page of inventory.pages) {
        let source = fs.readFileSync(localFile(page.source), 'utf8');
        if (base === '/help/') source = source.replace('[Source repository](https://github.com/fromstan/pokie)', '[Included source guides](/sources/)');
        source = source.replace(/\{\{example:([^}]+)\}\}/g, (_all, name) => {
            if (!downloads.has(name)) throw new Error(`Example not inventoried: ${name}`);
            const lang = name.endsWith('.ts') ? 'ts' : 'json';
            return `[Download complete source](${downloads.get(name)})\n\n\`\`\`${lang}\n${fs.readFileSync(localFile(name), 'utf8').trim()}\n\`\`\``;
        }).replace('{{commands}}', commandMarkdown(contracts.commands));
        const rendered = renderMarkdown(source, url => rewrite(url, page.source));
        const interactive = renderInteractiveContent(rendered.html, page.route, base, contracts);
        rendered.html = interactive.html;
        rendered.interactiveScript = interactive.script;
        if (page.route !== '/404.html') {
            search.push({title: page.title, url: siteUrl(page.route), excerpt: page.description, text: plain(parseMarkdown(source)).toLowerCase()});
            // One entry per actual section, with its following prose as a useful excerpt.
            const sections = source.split(/(?=^#{1,3} )/m);
            for (const heading of rendered.headings.filter(item => item.depth > 1 && item.depth <= 3)) {
                const section = sections.find(part => part.startsWith(`${'#'.repeat(heading.depth)} ${heading.title}\n`)) ?? heading.title;
                const excerpt = plain(parseMarkdown(section)).replace(/\s+/g, ' ').slice(0, 220);
                search.push({title: `${page.title} · ${heading.title}`, url: `${siteUrl(page.route)}#${heading.id}`, excerpt, text: excerpt.toLowerCase()});
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
        const navigation = renderNavigation(renderedPages, page.route, base);
        const toc = page.headings.filter(heading => heading.depth === 2).map(heading => `<a href="#${heading.id}">${esc(heading.title)}</a>`).join('');
        const index = renderedPages.indexOf(page), previous = renderedPages[index - 1], next = renderedPages[index + 1];
        const adjacent = [previous && previous.route !== '/404.html' ? `<a href="${siteUrl(previous.route)}">← ${esc(previous.title)}</a>` : '', next && next.route !== '/404.html' ? `<a href="${siteUrl(next.route)}">${esc(next.title)} →</a>` : ''].join('');
        write(page.route.endsWith('/') ? `${page.route.slice(1)}index.html` : page.route.slice(1), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(page.title)} — FromStan / POKIE</title><meta name="description" content="${esc(page.description)}"><link rel="canonical" href="${inventory.origin}${page.route}"><link rel="stylesheet" href="${siteUrl('/assets/site.css')}"><script type="module" src="${siteUrl('/assets/site.js')}"></script></head><body><a class="skip" href="#main">Skip to main content</a><header><a class="brand" href="${base}">FromStan <span>/ POKIE</span></a><span class="edition">Open source · Local tools</span></header><div class="layout">${navigation}<main id="main" tabindex="-1"><div class="search"><label for="docs-search">Search documentation</label><div class="search-controls"><input id="docs-search" type="search" autocomplete="off" placeholder="Try replay, weighted sequences…"><button id="clear-search" type="button">Clear</button></div><p id="search-status" role="status" aria-live="polite">Type to search this build.</p><ul id="search-results"></ul><noscript>Search requires JavaScript. All guides remain available in navigation.</noscript></div><nav class="toc" aria-label="On this page">${toc}</nav><article>${page.html}</article>${page.interactiveScript}<nav class="adjacent" aria-label="Previous and next guide">${adjacent}</nav><p class="source"><a href="${base === '/help/' ? siteUrl(`/sources/${page.source}`) : `https://github.com/fromstan/pokie/blob/develop/${page.source}`}">Read this guide's maintained source</a></p></main></div><footer>ISC · Copyright (c) 2018-2026, sta-ger · <a href="${siteUrl('/downloads/LICENSE')}">License</a> · Unpublished candidate · Deployment is separately controlled.</footer></body></html>`);
    }
    if (base === '/help/') {
        const directories = [...references].filter(source => fs.statSync(localFile(source)).isDirectory());
        const directoryFiles = new Map();
        for (const directory of directories) {
            const files = fs.readdirSync(localFile(directory), {withFileTypes: true}).filter(entry => entry.isFile()).map(entry => `${directory}${directory.endsWith('/') ? '' : '/'}${entry.name}`).sort();
            directoryFiles.set(directory, files);
            for (const file of files) references.add(file);
        }
        const files = [...new Set([...references, ...inventory.pages.map(page => page.source)])].filter(source => fs.statSync(localFile(source)).isFile()).sort();
        for (const source of files) write(`sources/${source}`, fs.readFileSync(localFile(source)));
        const links = names => `<ul>${names.map(name => `<li><a href="${esc(siteUrl(`/sources/${name}`))}">${esc(name)}</a></li>`).join('')}</ul>`;
        write('sources/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Included source references — FromStan / POKIE</title></head><body><main><h1>Included source references</h1><p>This candidate snapshot includes the public guides and source files referenced by the documentation. It is not a complete repository checkout.</p><a href="${siteUrl('/docs/')}">Browse documentation</a>${links(files)}${directories.map(directory => `<h2 id="${esc(directory.replace(/\/$/, ''))}">${esc(directory)}</h2>${links(directoryFiles.get(directory))}`).join('')}</main></body></html>`);
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
            lib: {entry: {playground: path.join(root, 'site/playground/bootstrap.ts'), worker: path.join(root, 'site/playground/worker.ts')}, formats: ['es'], fileName: (_format, entry) => `${entry}.js`}}});
    const sourceHashes = Object.fromEntries([...new Set([...browserSources, ...inventory.pages.map(page => page.source), ...downloads.keys(), ...references, path.relative(root, inventoryPath), 'site/build.mjs', 'site/markdown.mjs', 'site/interactive.mjs', 'site/navigation.mjs', 'site/check.mjs', 'site/preview.mjs', 'site/source-loader.mjs', 'site/contracts.mjs', 'site/site.js', 'site/site.css', 'package.json', 'package-lock.json'])].filter(name => fs.statSync(localFile(name)).isFile()).sort().map(name => [name, hash(fs.readFileSync(localFile(name)))]));
    const artifactHashes = Object.fromEntries(siteFiles(staging).sort().map(file => [path.relative(staging, file).split(path.sep).join('/'), hash(fs.readFileSync(file))]));
    write('build-manifest.json', JSON.stringify({origin: inventory.origin, base, candidate: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), routes: [...inventory.pages.map(page => siteUrl(page.route)), ...(base === '/help/' ? [siteUrl('/sources/')] : [])], sourceHashes, artifactHashes, contracts}, null, 2));
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
