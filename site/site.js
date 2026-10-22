const input = document.querySelector('#docs-search');
const results = document.querySelector('#search-results');
const status = document.querySelector('#search-status');
let generation = 0;
let indexPromise;
const siteBase = new URL('../', import.meta.url).pathname;
const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function index() {
    if (!indexPromise) {
        indexPromise = fetch(`${siteBase}search.json`).then(response => {
            if (!response.ok) throw new Error('Search unavailable');
            return response.json();
        }).then(entries => {
            if (!Array.isArray(entries) || !entries.length || !entries.every(entry => typeof entry.title === 'string' && typeof entry.excerpt === 'string' && typeof entry.text === 'string' && typeof entry.url === 'string' && /^\/(?:[a-z0-9-]+\/)*(?:#[a-z0-9_-]+)?$/.test(entry.url))) throw new Error('Invalid search index');
            return entries;
        }).catch(error => { indexPromise = undefined; throw error; });
    }
    return indexPromise;
}
async function search() {
    const current = ++generation;
    const query = normalized(input.value).slice(0, 200);
    results.replaceChildren();
    if (!query) { status.textContent = 'Type to search this build.'; return; }
    status.textContent = 'Searching…';
    try {
        const entries = await index();
        if (current !== generation) return;
        const terms = query.split(/\s+/);
        const score = entry => {
            const title = normalized(entry.title);
            return terms.filter(term => title.includes(term)).length * 20 + (title.includes(query) ? 80 : 0);
        };
        const matches = entries.filter(entry => terms.every(term => normalized(`${entry.title} ${entry.text}`).includes(term)))
            .sort((left, right) => score(right) - score(left)).slice(0, 24);
        status.textContent = matches.length ? `${matches.length} results. Follow a title to open its page or section.` : 'No matches. Try a command name or browse the guides.';
        for (const match of matches) {
            const item = document.createElement('li'), link = document.createElement('a'), excerpt = document.createElement('p');
            link.href = match.url;
            link.textContent = match.title;
            excerpt.textContent = match.excerpt;
            item.append(link, excerpt);
            results.append(item);
        }
    } catch {
        if (current === generation) status.textContent = 'Search is unavailable. Browse the guides or clear and retry your query.';
    }
}
input.addEventListener('input', search);
document.querySelector('#clear-search').addEventListener('click', () => { input.value = ''; search(); input.focus(); });
input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { input.value = ''; search(); }
});
