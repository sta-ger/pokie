import fs from "fs";
import path from "path";

export type StudioVolatilityBands = {
    readonly lowMax: number;
    readonly mediumMax: number;
};

export type StudioPreferencesView = {
    readonly volatilityBands?: StudioVolatilityBands;
};

type StoredPreferences = StudioPreferencesView & {readonly version: 1};

const FILE_VERSION = 1;

function parseBand(value: unknown): StudioVolatilityBands | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as {lowMax?: unknown; mediumMax?: unknown};
    if (typeof candidate.lowMax !== "number" || !Number.isFinite(candidate.lowMax) || candidate.lowMax < 0) return undefined;
    if (typeof candidate.mediumMax !== "number" || !Number.isFinite(candidate.mediumMax) || candidate.mediumMax < 0) return undefined;
    if (candidate.mediumMax <= candidate.lowMax) return undefined;
    return {lowMax: candidate.lowMax, mediumMax: candidate.mediumMax};
}

function parsePreferences(value: unknown): StudioPreferencesView {
    if (typeof value !== "object" || value === null) return {};
    const candidate = value as {volatilityBands?: unknown};
    const bands = parseBand(candidate.volatilityBands);
    return bands === undefined ? {} : {volatilityBands: bands};
}

/**
 * Studio-local authoring preferences that are not game math and must survive a browser change.
 * The file is small, atomically replaced, and deliberately separate from the project registry.
 */
export class StudioPreferencesService {
    private cached: StudioPreferencesView | undefined;

    public constructor(
        private readonly filePath?: string,
        private readonly writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf8"),
    ) {}

    public get(): StudioPreferencesView {
        if (this.cached !== undefined) return this.cached;
        if (this.filePath === undefined) {
            this.cached = {};
            return this.cached;
        }
        try {
            this.cached = parsePreferences(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
        } catch {
            this.cached = {};
        }
        return this.cached;
    }

    public saveVolatilityBands(value: unknown): StudioVolatilityBands {
        const bands = parseBand(value);
        if (bands === undefined) throw new Error("Enter two non-negative numbers with the medium boundary above the low boundary.");
        this.persist({version: FILE_VERSION, volatilityBands: bands});
        return bands;
    }

    public clearVolatilityBands(): void {
        this.persist({version: FILE_VERSION});
    }

    private persist(stored: StoredPreferences): void {
        this.cached = parsePreferences(stored);
        if (this.filePath === undefined) return;
        fs.mkdirSync(path.dirname(this.filePath), {recursive: true});
        const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        this.writeFile(temporary, JSON.stringify(stored));
        fs.renameSync(temporary, this.filePath);
    }
}
