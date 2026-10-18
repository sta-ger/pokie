import {CERTIFICATION_PREPARATION_NOTICE, type CertificationDossierTemplate} from "../CertificationDossier.js";
import type {DossierTable} from "../CertificationDossierRenderer.js";
import {CertificationEvidenceBundleBuildCancelledError} from "../CertificationEvidenceBundleBuildOptions.js";

// Small local PDF 1.4 text writer. Uses standard Courier (embedded font assets or a browser are not
// required). Non-ASCII scalars use lossless U+ notation rather than silently missing font glyphs.
// Fixed-width measured columns, explicit page breaks, repeated section/column context and selectable
// uncompressed text make this bounded launch format inspectable in ordinary PDF readers.
function ascii(text: string): string {
    return Array.from(text).map(c => {
        if (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126) return c;
        if (c === "\n") return " ";
        return `[U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]`;
    }).join("");
}
function wrap(text: string, width: number): string[] {
    text = ascii(text);
    const lines: string[] = [];
    while (text.length > width) {
        const space = text.lastIndexOf(" ", width);
        const split = space > width / 2 ? space : width;
        lines.push(text.slice(0, split));
        text = text.slice(split).replace(/^ /, "");
    }
    lines.push(text);
    return lines;
}
function literal(text: string): string {
    return text.replace(/([\\()])/g, "\\$1");
}
export async function renderLocalDossierPdf(template: CertificationDossierTemplate, tables: readonly DossierTable[], signal?: AbortSignal): Promise<Buffer> {
    const pages: string[][] = [];
    let page: string[] = [];
    let section = "Preparation";
    const nextPage = (): void => {
        page = [...wrap(template.title, 102), ...wrap(`Page ${pages.length + 1} | ${section}`, 102), "Field                           Evidence", "-".repeat(102)];
        pages.push(page);
    };
    const line = (text: string): void => {
        if (page.length >= 63) nextPage();
        page.push(text);

    };
    nextPage();
    for (const text of [template.introduction, CERTIFICATION_PREPARATION_NOTICE, "PDF font boundary: non-ASCII scalars appear in lossless [U+XXXX] notation. JSON/HTML retain Unicode glyphs."]) for (const part of wrap(text, 102)) line(part);
    for (const table of tables) {
        if (signal?.aborted) throw new CertificationEvidenceBundleBuildCancelledError();
        section = table.title;
        line("");
        for (const part of wrap(table.title, 102)) line(part);
        for (const [key, value] of table.rows) {
            const keys = wrap(key, 30),
                values = wrap(value, 69);
            for (let index = 0; index < Math.max(keys.length, values.length); index++) line(`${(keys[index] ?? "").padEnd(30)} | ${values[index] ?? ""}`);
        }
        // Yield between tables so a host can deliver cancellation before publication.
        await new Promise<void>(resolve => {
            setImmediate(resolve);
        });
    }
    if (signal?.aborted) throw new CertificationEvidenceBundleBuildCancelledError();
    const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"];
    const ids: number[] = [];
    for (const lines of pages) {
        const pageId = objects.length + 1,
            streamId = pageId + 1;
        ids.push(pageId);
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
        const content = `BT /F1 8 Tf 12 TL 36 804 Td ${lines.map((text, index) => `${index ? "T* " : ""}(${literal(text)}) Tj`).join("\n")} ET\n`;
        objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
    }
    objects[1] = `<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] >>`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}
