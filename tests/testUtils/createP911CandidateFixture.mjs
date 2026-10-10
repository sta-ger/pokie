/** Synthetic archive/install for handoff contracts, never acceptance evidence. */
import {execFileSync} from "node:child_process";
import {cp, mkdir, readFile, symlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {P911_CAMPAIGN, sha256} from "../../scripts/p9-11-candidate.mjs";
import {archiveExecutableManifest} from "../../scripts/p8-05-candidate-package-verifier.mjs";
const json = (file, value) => writeFile(file, `${JSON.stringify(value)}\n`);

export async function candidateFixture(directory) {
    const repository = path.join(directory, "repository"), pack = path.join(directory, "pack"), installationRoot = path.join(directory, "installation");
    await mkdir(repository); await mkdir(path.join(pack, "package"), {recursive:true});
    const declaration = {name:"pokie", version:"1.3.0", type:"module", exports:{".":{import:"./dist/esm/index.js", require:"./dist/cjs/index.cjs"}, "./browser":"./dist/esm/browser.js", "./wasm":"./dist/esm/wasm.js", "./client/player":"./dist/cli/player.js"}, bin:{pokie:"./dist/cli/pokie.js"}};
    await json(path.join(repository, "package.json"), declaration);
    execFileSync("git", ["init", "--quiet"], {cwd:repository});
    execFileSync("git", ["add", "package.json"], {cwd:repository});
    execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "test fixture"], {cwd:repository});
    const candidateId = execFileSync("git", ["rev-parse", "HEAD"], {cwd:repository, encoding:"utf8"}).trim();
    const candidateTreeId = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {cwd:repository, encoding:"utf8"}).trim();
    await json(path.join(pack, "package/package.json"), declaration);
    for (const file of ["dist/cjs/index.cjs", "dist/esm/index.js", "dist/esm/browser.js", "dist/esm/wasm.js", "dist/cli/player.js", "dist/cli/pokie.js", "dist/cli/studio-client/index.html"]) {
        await mkdir(path.dirname(path.join(pack, "package", file)), {recursive:true});
        await writeFile(path.join(pack, "package", file), `fixture:${file}`);
    }
    const archivePath = path.join(directory, "fixture.tgz");
    execFileSync("tar", ["-czf", archivePath, "-C", pack, "package"], {timeout:5000});
    const projection = await archiveExecutableManifest(await readFile(archivePath));
    await mkdir(path.join(installationRoot, "node_modules/.bin"), {recursive:true});
    await cp(path.join(pack, "package"), path.join(installationRoot, "node_modules/pokie"), {recursive:true});
    await symlink("../pokie/dist/cli/pokie.js", path.join(installationRoot, "node_modules/.bin/pokie"));
    const binding = {candidateId, candidateTreeId, archiveSha256:sha256(await readFile(archivePath)), executableSha256:projection.sha256, exitCode:0, resourcesDrained:true, issuer:"fixture-controller", receiptId:"fixture"};
    const buildPath = path.join(directory, "build.json"), installPath = path.join(directory, "install.json");
    const driverPath = path.join(directory, "fixture-driver.mjs");
    await writeFile(driverPath, "// Synthetic contract driver; never acceptance evidence.\n");
    await json(buildPath, {...binding, kind:"p9-11-normal-build-pack", buildCommand:"npm run build", packCommand:"npm pack --ignore-scripts", environment:{NODE_ENV:"production"}});
    await json(installPath, {...binding, kind:"p9-11-npm-install", command:"npm install <archive>", installationRoot});
    const handoff = {schemaVersion:1, kind:"p9-11-candidate-handoff", campaignId:P911_CAMPAIGN, ...binding, packageName:"pokie", packageVersion:"1.3.0", archivePath, installationRoot,
        buildReceipt:{path:buildPath, sha256:sha256(await readFile(buildPath))}, installReceipt:{path:installPath, sha256:sha256(await readFile(installPath))},
        browserDriver:{path:driverPath, sha256:sha256(await readFile(driverPath))}};
    const handoffPath = path.join(directory, "handoff.json"); await json(handoffPath, handoff);
    return {reference:{path:handoffPath, sha256:sha256(await readFile(handoffPath))}, repository, handoff};
}
