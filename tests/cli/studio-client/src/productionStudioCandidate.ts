import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";

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
