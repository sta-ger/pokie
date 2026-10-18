/** JSON.parse plus duplicate-key rejection, including escaped spellings of a required section. */
export function parseCertificationJson(text: string): unknown {
    const value: unknown = JSON.parse(text);
    const stack: {object: boolean; key: boolean; keys: Set<string>}[] = [];
    for (const token of text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]/g) ?? []) {
        if (token === "{" || token === "[") stack.push({object: token === "{", key: token === "{", keys: new Set()});
        else if (token === "}" || token === "]") stack.pop();
        else if (token === ",") {
            const top = stack[stack.length - 1];
            if (top?.object) top.key = true;

        } else if (token.startsWith('"')) {
            const top = stack[stack.length - 1];
            if (top?.object && top.key) {
                const name = JSON.parse(token) as string;
                if (top.keys.has(name)) throw new Error(`Duplicate JSON field/section: ${name}`);
                top.keys.add(name);
                top.key = false;
            }
        }
    }
    return value;
}
