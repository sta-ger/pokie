import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";
import {constants as fsConstants} from "node:fs";

type ProductionStudioCandidate = {packageRoot: string; bin: string; authenticated: boolean};

/** The unpinned standalone lane uses already-built production bytes, without
 * making every game snapshot copy the development checkout's docs and tests.
 * This is disposable test setup, never an authenticated archive/install receipt.
 * Pinned installations must keep their original paths and byte authentication. */
export async function stageProductionStudioTestHost(candidate: ProductionStudioCandidate, cache: string): Promise<ProductionStudioCandidate> {
    if (candidate.authenticated) return candidate;
    const packageRoot = path.join(cache, "compiled-host");
    await fs.mkdir(packageRoot);
    await fs.copyFile(path.join(candidate.packageRoot, "package.json"), path.join(packageRoot, "package.json"), fsConstants.COPYFILE_FICLONE);
    await fs.cp(path.join(candidate.packageRoot, "dist"), path.join(packageRoot, "dist"), {
        recursive: true, preserveTimestamps: true, mode: fsConstants.COPYFILE_FICLONE,
    });
    // Cache lives below the checkout's node_modules, so Node and the production
    // dependency resolver still find the real declared transitive dependencies.
    return {packageRoot, bin: path.join(packageRoot, "dist/cli/pokie.js"), authenticated: false};
}

/** Managed projects cannot live under node_modules, but volatile browser and
 * runtime state must: the standalone CLI snapshots its enclosing installation. */
export async function createProductionStudioTestStorage(repository: string, prefix: string) {
    const parent = path.join(repository, "node_modules/.cache/pokie-tmp");
    await fs.mkdir(parent, {recursive: true});
    const cache = await fs.mkdtemp(path.join(parent, `${prefix}-runtime-`));
    let root: string;
    try {
        root = await fs.mkdtemp(path.join(repository, `.${prefix}-`));
    } catch (error) {
        await fs.rm(cache, {recursive: true, force: true});
        throw error;
    }
    return {
        root,
        cache,
        profile: path.join(cache, "browser-profile"),
        async dispose(): Promise<void> {
            try {
                await fs.rm(root, {recursive: true, force: true});
            } finally {
                await fs.rm(cache, {recursive: true, force: true});
            }
        },
    };
}

/** Reuse the controller's normal installation, never compile or copy dist into
 * the source checkout. A partial/stale pin must fail, without local fallback. */
export async function productionStudioCandidate(environment: NodeJS.ProcessEnv, repository: string): Promise<{packageRoot: string; bin: string; authenticated: boolean}> {
    const url = pathToFileURL(path.join(process.cwd(), "scripts/p9-11-candidate.mjs")).href;
    const {readP911CandidateFromEnvironment} = await runInThisContext(`import(${JSON.stringify(url)})`, {
        importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }) as {readP911CandidateFromEnvironment: (environment: NodeJS.ProcessEnv, options: {repository: string}) => Promise<{packageRoot: string; bin: string} | undefined>};
    const shared = await readP911CandidateFromEnvironment(environment, {repository});
    const candidate = shared === undefined
        ? {packageRoot: repository, bin: path.join(repository, "dist/cli/pokie.js"), authenticated: false}
        : {packageRoot: shared.packageRoot, bin: shared.bin, authenticated: true};
    await fs.access(candidate.bin);
    await fs.access(path.join(candidate.packageRoot, "dist/cli/studio-client/index.html"));
    return candidate;
}
