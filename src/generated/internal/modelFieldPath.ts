/** Descriptor evidence accepts dotted paths, numeric/JSON-string brackets and RFC 6901 pointers. */
export function modelFieldPathSegments(path: string): string[] | undefined {
    if (path === "" || path === "$") return [];
    if (path.startsWith("/")) {
        if ((/~(?![01])/u).test(path)) return undefined;
        return path.slice(1).split("/").map(key => key.replace(/~1/g, "/").replace(/~0/g, "~"));
    }
    const text = path.replace(/^\$(?=[.[])/u, "").replace(/^\./, "");
    const keys: string[] = [];
    let position = 0;
    while (position < text.length) {
        if (text[position] === "[") {
            const match = (/^(?:\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\])/u).exec(text.slice(position));
            if (!match) return undefined;
            try {
                keys.push(match[1] ?? JSON.parse(match[2]) as string);
            } catch {
                return undefined;
            }
            position += match[0].length;
        } else {
            const match = (/^[^.[\]]+/u).exec(text.slice(position));
            if (!match) return undefined;
            keys.push(match[0]);
            position += match[0].length;
        }
        if (position === text.length) break;
        if (text[position] === ".") {
            position++;
            if (position === text.length || text[position] === "[") return undefined;
        } else if (text[position] !== "[") return undefined;
    }
    return keys.length ? keys : undefined;
}

export function modelFieldPathContains(parent: string[], child: string[]): boolean {
    return parent.length <= child.length && parent.every((key, index) => child[index] === key);
}

/** Keep existing simple extraction paths; quote literal keys that would otherwise be ambiguous. */
export function appendModelFieldPath(parent: string, key: string): string {
    if ((/^[A-Za-z0-9_-]+$/u).test(key)) return parent ? `${parent}.${key}` : key;
    return `${parent}[${JSON.stringify(key)}]`;
}
