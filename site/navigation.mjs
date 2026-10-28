import {escapeHtml} from './markdown.mjs';

// Native disclosure keeps every guide available even without JavaScript.
export function renderNavigation(pages, route, base) {
    const links = pages.filter(page => page.route !== '/404.html').map(page =>
        `<a href="${base}${page.route.slice(1)}"${page.route === route ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a>`).join('');
    return `<aside class="site-navigation"><details id="docs-navigation"><summary>Browse guides</summary><nav aria-label="Documentation">${links}</nav><button id="close-navigation" type="button" hidden>Close navigation</button></details></aside>`;
}
