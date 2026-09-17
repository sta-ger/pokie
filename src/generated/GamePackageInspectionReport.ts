// "valid" is about whether packageRoot/package.json could be read at all -- a package built via
// "pokie build"/"pokie init" carries no provenance metadata of its own (see GamePackageGenerator's own
// doc comment), so an inspection report never has anything more to say about a valid package than what
// package.json itself holds.
export type GamePackageInspectionReport = {
    packageRoot: string;
    valid: boolean;
    error?: string;
    packageJson?: {name?: string; version?: string; description?: string};
    // Present for a resolved WASM component. Canonical artifacts include their
    // integrity-bound declaration; legacy sidecar-only components expose only
    // metadata without treating a component as a package.
    wasmManifest?: {
        component: {id: string; version: string};
        schemaVersion: string;
        serialization: {session: string; play: string; state: string};
        host: {rng: string; services: string[]};
        capabilities: string[];
        minPokieVersion?: string;
        artifact?: {
            format: "pokie.wasm.v1";
            sha256: string;
            bytes: number;
            abiVersion: string;
            adapter: "pokie/wasm";
            configurationHash: string;
        };
    };
};
