// User-saved, reusable payline sets for the Blueprint Editor's "Apply preset" flow (see
// PaylinesEditor.tsx) -- lets someone save the lines they've hand-built, give them a name, and re-apply
// (or Replace/Append) them on this or a later blueprint without retyping every cell. Persisted in
// localStorage, scoped per browser, same best-effort try/catch convention as
// rememberedBrowseLocation.ts -- Studio never persists per-user UI state server-side, and a private-
// browsing/storage-disabled browser must never break saving/loading a blueprint over this.

const STORAGE_KEY = "pokie-studio:custom-payline-sets";

export type CustomPaylineSet = {
    id: string;
    name: string;
    reels: number;
    rows: number;
    lines: number[][];
};

function isCustomPaylineSet(value: unknown): value is CustomPaylineSet {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const v = value as Record<string, unknown>;
    return (
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        typeof v.reels === "number" &&
        typeof v.rows === "number" &&
        Array.isArray(v.lines) &&
        v.lines.every((line) => Array.isArray(line) && line.every((cell) => typeof cell === "number"))
    );
}

export function listCustomPaylineSets(): CustomPaylineSet[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            return [];
        }
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isCustomPaylineSet) : [];
    } catch {
        return [];
    }
}

function writeCustomPaylineSets(sets: CustomPaylineSet[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
    } catch {
        // Best-effort only -- see the doc comment above.
    }
}

// Appends a new custom set with a fresh id -- never overwrites an existing one (use renameCustomPaylineSet
// to rename in place).
export function saveCustomPaylineSet(name: string, reels: number, rows: number, lines: number[][]): CustomPaylineSet {
    const set: CustomPaylineSet = {id: crypto.randomUUID(), name, reels, rows, lines: lines.map((line) => [...line])};
    writeCustomPaylineSets([...listCustomPaylineSets(), set]);
    return set;
}

export function renameCustomPaylineSet(id: string, name: string): void {
    writeCustomPaylineSets(listCustomPaylineSets().map((set) => (set.id === id ? {...set, name} : set)));
}

export function deleteCustomPaylineSet(id: string): void {
    writeCustomPaylineSets(listCustomPaylineSets().filter((set) => set.id !== id));
}
