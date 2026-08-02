import fs from "fs";
import path from "path";
import {BlueprintProjectTargetAdapter} from "./BlueprintProjectTargetAdapter.js";
import {OutcomeLibraryProjectTargetAdapter} from "./OutcomeLibraryProjectTargetAdapter.js";
import {ParWorkbookProjectTargetAdapter} from "./ParWorkbookProjectTargetAdapter.js";
import type {PokieProject} from "./PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import {ProjectTargetAmbiguousError} from "./ProjectTargetAmbiguousError.js";
import type {ProjectResolving} from "./ProjectResolving.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "./ProjectTargetUnsupportedError.js";
import {StakeAdapterProjectTargetAdapter} from "./StakeAdapterProjectTargetAdapter.js";
import {TsPackageProjectTargetAdapter} from "./TsPackageProjectTargetAdapter.js";

// The one file extension resolve() explicitly rejects rather than silently reporting undefined for — see its
// ProjectTargetUnsupportedError usage below.
const WASM_FILE_EXTENSION = ".wasm";

// The default, fixed set of per-ProjectType adapters ProjectTargetResolver registers when constructed without
// an explicit list — one per resolvable ProjectType. Deliberately excludes "wasm": recognizing an ordinary
// .wasm file today would mean trusting its file extension alone (the same shortcut the prototype this module
// replaces took), and POKIE has no versioned WASM export contract yet (no manifest/signature identifying a
// .wasm file as its own) to recognize instead — see ProjectType.ts's own "wasm" doc comment. Until that
// contract exists, an ordinary .wasm file is simply not recognized by any adapter here — but unlike a
// genuinely unrelated unrecognized path, resolve() special-cases that one extension to throw
// ProjectTargetUnsupportedError instead of quietly returning `undefined`, so a caller pointing POKIE at a
// .wasm file learns *why* it was rejected rather than mistaking it for "not a POKIE target at all".
const DEFAULT_PROJECT_TARGET_ADAPTERS: readonly ProjectTargetTypeAdapter[] = [
    new TsPackageProjectTargetAdapter(),
    new StakeAdapterProjectTargetAdapter(),
    new OutcomeLibraryProjectTargetAdapter(),
    new BlueprintProjectTargetAdapter(),
    new ParWorkbookProjectTargetAdapter(),
];

type ProjectTargetMatch = {readonly adapter: ProjectTargetTypeAdapter; readonly provenance: string};

// The concrete ProjectResolving: resolves a single given path by checking it against every registered
// per-type adapter matching its own file/directory kind, and stamping the one adapter that recognizes it (see
// PokieProject's own "capabilities"/"provenance" fields) — the only format-detection entry point migrated
// POKIE operations should use, rather than each command/service re-deriving its own "what kind of thing is
// this path" answer (see ProjectResolving's own doc comment). Deliberately resolves exactly `targetPath` — it
// does not walk up looking for an ancestor project root the way findPokieProjectRoot does; that remains
// findPokieProjectRoot's own, narrower job, layered on top of this resolver rather than duplicated into it.
//
// Registration order is fixed (see DEFAULT_PROJECT_TARGET_ADAPTERS) but doesn't affect which type a target
// resolves to: every adapter matching a target's own kind (file/directory) is checked, deterministically, and
// resolution depends only on how many of them recognize the target — zero (undefined), exactly one (that
// type), or more than one (ProjectTargetAmbiguousError; see that class's own doc comment). Two adapters can
// only collide in the first place if the underlying on-disk shapes themselves genuinely overlap — a real
// recognition conflict, not a matter of which adapter happened to run first. An adapter's own recognize() can
// also throw ProjectTargetMalformedError when a target's manifest already signals intent to be that adapter's
// type but fails a deeper read (see that class's own doc comment) — recognizeAll() below lets that propagate
// rather than swallowing it the way an ordinary non-match is swallowed.
export class ProjectTargetResolver implements ProjectResolving {
    private readonly directoryAdapters: readonly ProjectTargetTypeAdapter[];
    private readonly fileAdapters: readonly ProjectTargetTypeAdapter[];

    constructor(adapters: readonly ProjectTargetTypeAdapter[] = DEFAULT_PROJECT_TARGET_ADAPTERS) {
        const seenTypes = new Set<string>();
        for (const adapter of adapters) {
            if (seenTypes.has(adapter.type)) {
                throw new Error(`ProjectTargetResolver was given more than one adapter for project type "${adapter.type}".`);
            }
            seenTypes.add(adapter.type);
        }

        this.directoryAdapters = adapters.filter((adapter) => adapter.targetKind === "directory");
        this.fileAdapters = adapters.filter((adapter) => adapter.targetKind === "file");
    }

    public async resolve(targetPath: string): Promise<PokieProject | undefined> {
        const resolvedPath = path.resolve(targetPath);

        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(resolvedPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                return undefined;
            }
            throw error;
        }

        let candidateAdapters: readonly ProjectTargetTypeAdapter[] = [];
        if (stat.isDirectory()) {
            candidateAdapters = this.directoryAdapters;
        } else if (stat.isFile()) {
            candidateAdapters = this.fileAdapters;
        }
        const matches = await this.recognizeAll(candidateAdapters, resolvedPath);

        if (matches.length === 0) {
            if (stat.isFile() && path.extname(resolvedPath).toLowerCase() === WASM_FILE_EXTENSION) {
                throw new ProjectTargetUnsupportedError(
                    `"${resolvedPath}" is a WASM build target, but POKIE has no versioned WASM export contract yet ` +
                        `(see the "wasm" ProjectType doc comment) — this is not a supported POKIE project, and does not ` +
                        `mean WASM execution is supported.`,
                );
            }
            return undefined;
        }
        if (matches.length > 1) {
            const matchedTypes = matches.map((match) => match.adapter.type).join(", ");
            throw new ProjectTargetAmbiguousError(
                `"${resolvedPath}" matches more than one project type (${matchedTypes}); refusing to guess which one it is.`,
            );
        }

        const [{adapter, provenance}] = matches;
        return {
            type: adapter.type,
            rootPath: resolvedPath,
            capabilities: PROJECT_TYPE_CAPABILITIES[adapter.type],
            provenance,
        } as PokieProject;
    }

    private async recognizeAll(
        adapters: readonly ProjectTargetTypeAdapter[],
        resolvedPath: string,
    ): Promise<readonly ProjectTargetMatch[]> {
        const results = await Promise.all(
            adapters.map(async (adapter): Promise<ProjectTargetMatch | undefined> => {
                const provenance = await adapter.recognize(resolvedPath);
                return provenance === undefined ? undefined : {adapter, provenance};
            }),
        );
        return results.filter((match): match is ProjectTargetMatch => match !== undefined);
    }
}
