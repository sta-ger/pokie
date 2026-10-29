// The same insertion boundary serves the standalone site and installed /help/.
// Refuse a page that advertises interaction without its static controls.
export function renderInteractiveContent(html, route, base, contracts) {
    const kind = route === '/playground/' ? 'playground' : route === '/gallery/' ? 'gallery' : undefined;
    if (!kind) return {html, script: ''};
    const marker = `<p>POKIE${kind.toUpperCase()}</p>`;
    if (!html.includes(marker)) throw new Error(`Missing interactive mount marker: ${route}`);
    const controls = contracts[`${kind}Html`];
    if (typeof controls !== 'string' || !controls.length) throw new Error(`Missing interactive controls: ${route}`);
    return {
        html: html.replace(marker, `<div id="${kind}">${controls}</div>`),
        script: `<script type="module" src="${base}assets/playground/playground.js"></script>`,
    };
}
