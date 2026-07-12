export type StudioContext = {mode: "home"} | {mode: "project"; projectRoot: string};

export type RecentProjectEntry = {
    projectRoot: string;
    name: string;
    openedAt: string;
};

export type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

// The Project Dashboard's own read model — see cli/studio/ProjectDashboardContext.ts (the server's
// copy of this same type; kept as a separate client-side copy, same convention as every other type
// in this file, since the studio-client TS project compiles independently from cli/studio).
export type ProjectDashboardContext =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "loaded"; projectRoot: string; game: PokieGameManifest}
    | {status: "error"; projectRoot: string; error: string};

export type GameBuildInfo = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    blueprintHash: string;
    source?: string;
    files?: string[];
    game: {id: string; name: string; version: string};
};

export type GamePackageInspectionReport = {
    packageRoot: string;
    valid: boolean;
    error?: string;
    packageJson?: {name?: string; version?: string; description?: string};
    generated: boolean;
    buildInfo?: GameBuildInfo;
};

export type ValidationIssue = {
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
};

export type PokieGamePackageValidationReport = {
    packageRoot: string;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    suggestions: string[];
};
