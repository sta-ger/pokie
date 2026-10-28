// Reuse the installed Prettier Markdown parser (CommonMark + GFM tables); no network/CDN renderer.
import markdown from 'prettier/parser-markdown.js';

export const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const plain = node => node.value ?? (node.children ?? []).map(plain).join('');
export function slug(value) {
    return value.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-');
}
export function parseMarkdown(source) {
    return markdown.parsers.markdown.parse(source);
}
export function renderMarkdown(source, link) {
    const tree = parseMarkdown(source);
    const headings = [], used = new Map();
    const render = node => {
        const children = () => (node.children ?? []).map(render).join('');
        switch (node.type) {
            case 'root': return children();
            case 'text': return escapeHtml(node.value);
            case 'paragraph': return `<p>${children()}</p>`;
            case 'heading': {
                const title = plain(node), base = slug(title), count = used.get(base) ?? 0;
                used.set(base, count + 1);
                const id = count ? `${base}-${count}` : base;
                headings.push({title, id, depth: node.depth});
                return `<h${node.depth} id="${id}" tabindex="-1">${children()} <a class="permalink" aria-label="Link to ${escapeHtml(title)}" href="#${id}"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></svg></a></h${node.depth}>`;
            }
            case 'link': return `<a href="${escapeHtml(link(node.url))}">${children()}</a>`;
            case 'inlineCode': return `<code>${escapeHtml(node.value)}</code>`;
            case 'code': return `<pre tabindex="0" aria-label="${escapeHtml(node.lang ?? 'text')} example"><code>${escapeHtml(node.value)}</code></pre>`;
            case 'strong': return `<strong>${children()}</strong>`;
            case 'emphasis': return `<em>${children()}</em>`;
            case 'delete': return `<del>${children()}</del>`;
            case 'list': return node.ordered ? `<ol start="${node.start ?? 1}">${children()}</ol>` : `<ul>${children()}</ul>`;
            case 'listItem': return `<li>${children()}</li>`;
            case 'blockquote': return `<blockquote>${children()}</blockquote>`;
            case 'break': return '<br>';
            case 'thematicBreak': return '<hr>';
            case 'table': return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable reference table"><table><thead>${row(node.children[0], 'th')}</thead><tbody>${node.children.slice(1).map(child => row(child, 'td')).join('')}</tbody></table></div>`;
            default: throw new Error(`Unsupported Markdown node ${node.type}; use maintained Markdown without raw HTML or reference-style links.`);
        }
    };
    const row = (node, tag) => `<tr>${node.children.map(cell => `<${tag}>${cell.children.map(render).join('')}</${tag}>`).join('')}</tr>`;
    return {html: render(tree), headings};
}
