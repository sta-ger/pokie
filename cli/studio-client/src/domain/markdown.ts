// A deliberately small Markdown renderer for the bundled docs. It supports the constructs the POKIE
// guides actually use (headings, paragraphs, lists, blockquotes, fenced code, tables, bold, inline
// code and links) and escapes every piece of source text before adding its own tags. Documentation is
// bundled from this installation rather than fetched from a moving GitHub branch, so the page works
// offline and matches the installed version.

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function documentationHref(href: string): string {
    if (href.startsWith("#") || (/^[a-z][a-z0-9+.-]*:/i).test(href)) return href;
    const match = (/^(?:\.\.\/)*(?:docs\/)?([^/]+?)(?:\.md)?(?:#(.*))?$/).exec(href);
    if (match === null) return href;
    const doc = match[1] === "README" ? "README" : match[1];
    const anchor = match[2] === undefined ? "" : `#${match[2]}`;
    return `#/docs/${doc}${anchor}`;
}

export function renderInlineMarkdown(source: string): string {
    let text = escapeHtml(source);
    const links: string[] = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
        const token = `@@POKIE_LINK_${links.length}@@`;
        const url = escapeHtml(documentationHref(href));
        const external = (/^https?:/i).test(href);
        links.push(`<a href="${url}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`);
        return token;
    });
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    return text.replace(/@@POKIE_LINK_(\d+)@@/g, (_match, index: string) => links[Number(index)] ?? "");
}

function isTableSeparator(line: string): boolean {
    return (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/).test(line);
}

function tableCells(line: string): string[] {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function flushParagraph(paragraph: string[], output: string[]): void {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
}

export function renderMarkdownToHtml(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const output: string[] = [];
    const paragraph: string[] = [];
    let list: {kind: "ul" | "ol"; items: string[]} | undefined;
    let code: string[] | undefined;
    let quote: string[] | undefined;

    const flushList = (): void => {
        if (list === undefined) return;
        output.push(`<${list.kind}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.kind}>`);
        list = undefined;
    };
    const flushQuote = (): void => {
        if (quote === undefined) return;
        output.push(`<blockquote>${renderInlineMarkdown(quote.join(" "))}</blockquote>`);
        quote = undefined;
    };
    const flushAll = (): void => {
        flushParagraph(paragraph, output);
        flushList();
        flushQuote();
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trimStart().startsWith("```")) {
            if (code === undefined) {
                flushAll();
                code = [];
            } else {
                output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
                code = undefined;
            }
            continue;
        }
        if (code !== undefined) {
            code.push(line);
            continue;
        }
        if (line.trim().length === 0) {
            flushAll();
            continue;
        }
        const heading = (/^(#{1,6})\s+(.*)$/).exec(line);
        if (heading !== null) {
            flushAll();
            const level = heading[1].length;
            output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            continue;
        }
        if ((/^\s*---+$/).test(line) || (/^\s*\*\*\*+$/).test(line)) {
            flushAll();
            output.push("<hr>");
            continue;
        }
        const quoteLine = (/^\s*>\s?(.*)$/).exec(line);
        if (quoteLine !== null) {
            flushAll();
            quote = [quoteLine[1]];
            continue;
        }
        if (quote !== undefined) {
            quote.push(line.trim());
            continue;
        }
        if (line.trimStart().startsWith("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
            flushAll();
            const headers = tableCells(line);
            index += 1;
            const rows: string[][] = [];
            while (index + 1 < lines.length && lines[index + 1].trimStart().startsWith("|")) {
                index += 1;
                rows.push(tableCells(lines[index]));
            }
            output.push(
                `<table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>` +
                `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
            );
            continue;
        }
        const listItem = (/^\s*[-*+]\s+(.*)$/).exec(line);
        if (listItem !== null) {
            flushParagraph(paragraph, output);
            if (list?.kind !== "ul") {
                flushList();
                list = {kind: "ul", items: []};
            }
            list.items.push(listItem[1]);
            continue;
        }
        const orderedItem = (/^\s*\d+\.\s+(.*)$/).exec(line);
        if (orderedItem !== null) {
            flushParagraph(paragraph, output);
            if (list?.kind !== "ol") {
                flushList();
                list = {kind: "ol", items: []};
            }
            list.items.push(orderedItem[1]);
            continue;
        }
        if (list !== undefined) list.items[list.items.length - 1] += ` ${line.trim()}`;
        else paragraph.push(line.trim());
    }
    flushAll();
    if (code !== undefined) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    return output.join("\n");
}
