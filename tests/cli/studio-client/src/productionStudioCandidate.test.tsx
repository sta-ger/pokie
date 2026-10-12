/** @jest-environment node */
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";
import {productionStudioCandidate} from "./productionStudioCandidate";

type Fixture = {repository: string; reference: {path: string; sha256: string}; handoff: {installationRoot: string}};

it("uses the authenticated normal installation for both browser regressions with no checkout dist", async () => {
    // Beneath node_modules, Node does not treat the outer repository's package
    // as this fixture's self-reference. The temp directory stays in the clone.
    const root = await fs.mkdtemp(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/p911-studio-candidate-"));
    try {
        const url = pathToFileURL(path.join(process.cwd(), "tests/testUtils/createP911CandidateFixture.mjs")).href;
        const {candidateFixture} = await runInThisContext(`import(${JSON.stringify(url)})`, {
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        }) as {candidateFixture: (directory: string) => Promise<Fixture>};
        const fixture = await candidateFixture(root);
        const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
        await expect(fs.access(path.join(fixture.repository, "dist/cli/pokie.js"))).rejects.toThrow("ENOENT");
        const selected = await productionStudioCandidate(environment, fixture.repository);
        expect(selected).toEqual({packageRoot: path.join(fixture.handoff.installationRoot, "node_modules/@fromstan/pokie"),
            bin: path.join(fixture.handoff.installationRoot, "node_modules/@fromstan/pokie/dist/cli/pokie.js"), authenticated: true});
        await expect(fs.access(path.join(fixture.repository, "dist"))).rejects.toThrow("ENOENT");
        // A successful local access must never rescue a partial or corrupt pin.
        await fs.mkdir(path.join(fixture.repository, "dist/cli"), {recursive: true});
        await fs.writeFile(path.join(fixture.repository, "dist/cli/pokie.js"), "untrusted fallback");
        await expect(productionStudioCandidate({POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path}, fixture.repository)).rejects.toThrow("externally pinned digest");
        await expect(productionStudioCandidate({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "b".repeat(64)}, fixture.repository)).rejects.toThrow("digest mismatch");
        await fs.rm(path.join(fixture.repository, "dist"), {recursive: true});
        for (const relative of ["dist/cli/pokie.js", "dist/cli/studio-client/index.html"]) {
            const asset = path.join(selected.packageRoot, relative);
            const original = await fs.readFile(asset);
            await fs.writeFile(asset, "stale installed asset");
            await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("stale installed asset");
            await fs.writeFile(asset, original);
            await fs.rm(asset);
            await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("ENOENT");
            await fs.writeFile(asset, original);
        }
        await fs.writeFile(path.join(fixture.repository, "dirty.js"), "changed source");
        await expect(productionStudioCandidate(environment, fixture.repository)).rejects.toThrow("dirty");
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

it("requires real controller-built assets for standalone collection", async () => {
    const repository = await fs.mkdtemp(path.join(process.cwd(), ".p911-standalone-"));
    try {
        await expect(productionStudioCandidate({}, repository)).rejects.toThrow("ENOENT");
        const bin = path.join(repository, "dist/cli/pokie.js");
        await fs.mkdir(path.dirname(bin), {recursive: true});
        await fs.writeFile(bin, "fixture: CLI access only");
        await expect(productionStudioCandidate({}, repository)).rejects.toThrow("ENOENT");
        await fs.mkdir(path.join(repository, "dist/cli/studio-client"));
        await fs.writeFile(path.join(repository, "dist/cli/studio-client/index.html"), "fixture: asset access only");
        expect(await productionStudioCandidate({}, repository)).toEqual({packageRoot: repository, bin, authenticated: false});
    } finally {
        await fs.rm(repository, {recursive: true, force: true});
    }
});
