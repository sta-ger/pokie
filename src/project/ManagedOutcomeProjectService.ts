import crypto from "crypto";
import fs from "fs";
import path from "path";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {PokieProject} from "./PokieProject.js";
import type {ProjectResolving} from "./ProjectResolving.js";
import {ProjectTargetResolver} from "./ProjectTargetResolver.js";

// The immutable identity a generated Outcome Project must retain.  This is intentionally narrower
// than a source path: a Blueprint may move, whereas game id/version/configuration are what make an
// Outcome bundle safe to use for a Stake export.
export type OutcomeProjectCompatibility = {
    readonly gameId: string;
    readonly gameVersion: string;
    readonly configHash: string;
    readonly pokieVersion: string;
    // Exact and direct sampled libraries describe different distributions even when they come from the
    // same game configuration.  They must therefore never be silently reused for one another.
    readonly generation?: string;
};

// The authoritative lifecycle boundary for a Blueprint's managed Outcome Project.  ArtifactBuilderRegistry
// owns the conversion, while this service owns discovery, registration and reopening.  CLI and Studio inject
// the same service contract; neither surface is allowed to maintain a private "generated outcome" index.
export interface ManagedOutcomeProjectServicing {
    findCompatible(sourceRootPath: string, compatibility: OutcomeProjectCompatibility): Promise<PokieProject | undefined>;
    allocateRoot(sourceRootPath: string, compatibility: OutcomeProjectCompatibility): string;
    registerAndOpen(sourceRootPath: string, rootPath: string, compatibility: OutcomeProjectCompatibility): Promise<PokieProject>;
}

export type ManagedOutcomeInspection = {
    readonly project?: PokieProject;
    readonly staleReason?: string;
};

type RegisteredOutcomeProject = OutcomeProjectCompatibility & {readonly rootPath: string};
type RegistryDocument = {readonly projects: readonly RegisteredOutcomeProject[]};

// Kept injectable solely at this atomic filesystem boundary. It makes write/rename failures testable without
// monkey-patching Node's process-wide fs module, while production retains fs.promises.
export type ManagedOutcomeProjectFileOperations = {
    readonly mkdir: (directory: string, options: {readonly recursive: true}) => Promise<unknown>;
    readonly writeFile: (filePath: string, data: string, encoding: "utf-8") => Promise<void>;
    readonly rename: (oldPath: string, newPath: string) => Promise<void>;
    readonly remove: (filePath: string, options: {readonly force: true}) => Promise<void>;
    readonly readFile: (filePath: string, encoding: "utf-8") => Promise<string>;
};

const DEFAULT_FILE_OPERATIONS: ManagedOutcomeProjectFileOperations = {
    mkdir: (directory, options) => fs.promises.mkdir(directory, options),
    writeFile: (filePath, data, encoding) => fs.promises.writeFile(filePath, data, encoding),
    rename: (oldPath, newPath) => fs.promises.rename(oldPath, newPath),
    remove: (filePath, options) => fs.promises.rm(filePath, options),
    readFile: (filePath, encoding) => fs.promises.readFile(filePath, encoding),
};

// A compact, source-adjacent managed-project registry.  Keeping it under .pokie makes a CLI invocation and a
// Studio invocation over the same Blueprint discover exactly the same authoritative records without requiring
// either UI process to be alive.  Older deterministic bundles are adopted only after their manifest has been
// verified and they are written into this registry; the workflow itself never treats a path as registered.
export class ManagedOutcomeProjectService implements ManagedOutcomeProjectServicing {
    private readonly reader = new OutcomeLibraryBundleReader();
    private readonly resolveProject: ProjectResolving;
    private readonly onRegistered: (project: PokieProject) => Promise<void>;
    private readonly files: ManagedOutcomeProjectFileOperations;

    constructor(
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        onRegistered: (project: PokieProject) => Promise<void> = () => Promise.resolve(),
        files: ManagedOutcomeProjectFileOperations = DEFAULT_FILE_OPERATIONS,
    ) {
        this.resolveProject = resolveProject;
        this.onRegistered = onRegistered;
        this.files = files;
    }

    public async findCompatible(sourceRootPath: string, compatibility: OutcomeProjectCompatibility): Promise<PokieProject | undefined> {
        const document = await this.readRegistry(sourceRootPath);
        for (const entry of document.projects) {
            if (!sameCompatibility(entry, compatibility)) continue;
            const project = await this.openIfCompatible(entry.rootPath, compatibility);
            if (project !== undefined) return project;
        }

        // One-time adoption for output created before managed-project registration existed.  This keeps an
        // upgrade from re-generating a valid library, but crucially promotes it into the registry first.
        const legacyRoot = this.allocateRoot(sourceRootPath, compatibility);
        const legacyProject = await this.openIfCompatible(legacyRoot, compatibility);
        if (legacyProject === undefined) return undefined;
        const rollback = await this.register(sourceRootPath, legacyRoot, compatibility);
        try {
            await this.onRegistered(legacyProject);
        } catch (error) {
            await rollback().catch(() => undefined);
            throw error;
        }
        return legacyProject;
    }

    // Planning needs to distinguish "nothing has been generated yet" from a
    // registered artifact that is no longer safe to reuse.  Do this read-only
    // before a planner advertises reuse; execution still uses the exact plan
    // and never re-runs this lookup to make a different choice.
    public async inspect(sourceRootPath: string, compatibility: OutcomeProjectCompatibility): Promise<ManagedOutcomeInspection> {
        const document = await this.readRegistry(sourceRootPath);
        if (document.projects.length === 0) return {};
        const matching = document.projects.find((entry) => sameCompatibility(entry, compatibility));
        if (matching === undefined) {
            return {staleReason: "the registered managed Outcome Library has different game, configuration, POKIE version, or generation provenance"};
        }
        const project = await this.openIfCompatible(matching.rootPath, compatibility);
        return project === undefined
            ? {staleReason: "the registered managed Outcome Library was moved, malformed, or no longer matches its manifest"}
            : {project};
    }

    public allocateRoot(sourceRootPath: string, compatibility: OutcomeProjectCompatibility): string {
        return path.join(
            path.dirname(sourceRootPath),
            ".pokie",
            "outcome-libraries",
            crypto.createHash("sha256").update(`${compatibility.configHash}:${compatibility.generation ?? "exact"}`).digest("hex"),
        );
    }

    public async registerAndOpen(sourceRootPath: string, rootPath: string, compatibility: OutcomeProjectCompatibility): Promise<PokieProject> {
        const project = await this.openIfCompatible(rootPath, compatibility);
        if (project === undefined) {
            throw new Error(`Generated Outcome Library at "${rootPath}" could not be opened as a compatible managed Outcome Project.`);
        }
        const rollback = await this.register(sourceRootPath, rootPath, compatibility);
        try {
            await this.onRegistered(project);
        } catch (error) {
            // Publishing the registry record is not the end of registration: an injected Studio/CLI
            // registration hook can still reject. Restore the exact prior document so a failed open never
            // leaves a discoverable but incomplete managed Project behind.
            await rollback().catch(() => undefined);
            throw error;
        }
        return project;
    }

    private async openIfCompatible(rootPath: string, compatibility: OutcomeProjectCompatibility): Promise<PokieProject | undefined> {
        try {
            const manifest = await this.reader.readManifest(rootPath);
            if (
                manifest.game.id !== compatibility.gameId ||
                manifest.game.version !== compatibility.gameVersion ||
                manifest.configHash !== compatibility.configHash ||
                manifest.artifactPokieVersion !== compatibility.pokieVersion
            ) return undefined;
            const project = await this.resolveProject.resolve(rootPath);
            if (project?.type !== "outcomeLibrary") return undefined;
            // A resolver's format-recognition provenance is intentionally not reuse evidence. Attach the
            // independently verified registry/manifest facts only after every compatibility field above
            // agrees, so planner consumers cannot mistake a moved or stale bundle for an exact match.
            return {
                ...project,
                configurationProvenance: {
                    configurationHash: compatibility.configHash,
                    pokieVersion: compatibility.pokieVersion,
                    generationSemantics: (compatibility.generation ?? "exact") === "exact" ? "exact" : "boundedSample",
                    gameId: compatibility.gameId,
                    gameVersion: compatibility.gameVersion,
                    manifestIdentity: `${compatibility.gameId}@${compatibility.gameVersion}`,
                    ...(generationProvenance(compatibility.generation)),
                },
            };
        } catch {
            return undefined;
        }
    }

    private async register(sourceRootPath: string, rootPath: string, compatibility: OutcomeProjectCompatibility): Promise<() => Promise<void>> {
        const document = await this.readRegistry(sourceRootPath);
        const canonicalRoot = path.resolve(rootPath);
        const projects = [...document.projects.filter((entry) => path.resolve(entry.rootPath) !== canonicalRoot), {...compatibility, rootPath: canonicalRoot}];
        const registryPath = this.registryPath(sourceRootPath);
        await this.writeRegistry(registryPath, {projects});
        return async () => {
            if (document.projects.length === 0) {
                await this.files.remove(registryPath, {force: true});
            } else {
                await this.writeRegistry(registryPath, document);
            }
        };
    }

    private async writeRegistry(registryPath: string, document: RegistryDocument): Promise<void> {
        await this.files.mkdir(path.dirname(registryPath), {recursive: true});
        const temporaryPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
        try {
            await this.files.writeFile(temporaryPath, JSON.stringify(document, undefined, 2), "utf-8");
            await this.files.rename(temporaryPath, registryPath);
        } finally {
            // A disk/permission failure before the rename must not leave a plausible registry fragment
            // beside the authoritative file for a later scan to mistake for a Project.
            await this.files.remove(temporaryPath, {force: true}).catch(() => undefined);
        }
    }

    private async readRegistry(sourceRootPath: string): Promise<RegistryDocument> {
        try {
            const parsed = JSON.parse(await this.files.readFile(this.registryPath(sourceRootPath), "utf-8")) as RegistryDocument;
            return Array.isArray(parsed.projects) ? parsed : {projects: []};
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return {projects: []};
            throw error;
        }
    }

    private registryPath(sourceRootPath: string): string {
        return path.join(path.dirname(sourceRootPath), ".pokie", "managed-outcome-projects.json");
    }
}

function generationProvenance(generation: string | undefined): Pick<NonNullable<PokieProject["configurationProvenance"]>, "generationSemantics" | "sampleCount" | "sampleSeed"> {
    if (generation === undefined || generation === "exact") return {generationSemantics: "exact"};
    const [, sampleCount, sampleSeed] = (/^sample:([^:]+):(.*)$/).exec(generation) ?? [];
    return sampleCount === undefined || sampleSeed === undefined
        ? {generationSemantics: "boundedSample"}
        : {generationSemantics: "boundedSample", sampleCount, sampleSeed};
}

function sameCompatibility(left: OutcomeProjectCompatibility, right: OutcomeProjectCompatibility): boolean {
    return (
        left.gameId === right.gameId &&
        left.gameVersion === right.gameVersion &&
        left.configHash === right.configHash &&
        left.pokieVersion === right.pokieVersion &&
        (left.generation ?? "exact") === (right.generation ?? "exact")
    );
}
