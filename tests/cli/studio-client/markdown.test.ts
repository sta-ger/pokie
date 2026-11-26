import {renderInlineMarkdown, renderMarkdownToHtml} from "../../../cli/studio-client/src/domain/markdown.js";

describe("bundled documentation Markdown", () => {
    it("renders headings, lists, tables and inline emphasis", () => {
        const html = renderMarkdownToHtml([
            "# Glossary",
            "",
            "- **RTP** is a return",
            "- A [payline](paylines-and-patterns.md) is a path",
            "",
            "| Avoid | Use |",
            "| --- | --- |",
            "| artifact | build output |",
        ].join("\n"));

        expect(html).toContain("<h1>Glossary</h1>");
        expect(html).toContain("<ul><li><strong>RTP</strong> is a return</li>");
        expect(html).toContain('<a href="#/docs/paylines-and-patterns">payline</a>');
        expect(html).toContain("<table><thead><tr><th>Avoid</th><th>Use</th></tr></thead>");
        expect(html).toContain("<td>artifact</td><td>build output</td>");
    });

    it("escapes source HTML and leaves absolute links external", () => {
        expect(renderInlineMarkdown('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(renderInlineMarkdown("[docs](https://example.test/docs)")).toBe(
            '<a href="https://example.test/docs" target="_blank" rel="noreferrer">docs</a>',
        );
    });

    it("maps the docs index link to the local viewer", () => {
        expect(renderInlineMarkdown("[back](README.md)")).toBe('<a href="#/docs/README">back</a>');
        expect(renderInlineMarkdown("[glossary](docs/glossary.md#slot-terms)")).toBe(
            '<a href="#/docs/glossary#slot-terms">glossary</a>',
        );
    });
});
