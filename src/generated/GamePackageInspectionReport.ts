// "valid" is about whether packageRoot/package.json could be read at all -- a package built via
// "pokie build"/"pokie init" carries no provenance metadata of its own (see GamePackageGenerator's own
// doc comment), so an inspection report never has anything more to say about a valid package than what
// package.json itself holds.
export type GamePackageInspectionReport = {
    packageRoot: string;
    valid: boolean;
    error?: string;
    packageJson?: {name?: string; version?: string; description?: string};
    // Present only for an inspection-only resolved WASM component.  This keeps
    // Studio's inspect route truthful without treating a component as a
    // package or asking any package reader to open its binary.
    wasmManifest?: {
        component: {id: string; version: string};
        schemaVersion: string;
        serialization: {session: string; play: string; state: string};
        host: {rng: string; services: string[]};
        capabilities: string[];
    };
};
