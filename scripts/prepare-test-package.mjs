// Test preparation only. Reuse the existing independent candidate verifier;
// this module does not issue an acceptance or skip a consumer workflow.
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyP805CandidatePackage} from "./p8-05-candidate-package-verifier.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export async function prepareTestPackage(repository, directory, candidateId) {
    const git = args => execFileSync("git", args, {cwd: repository, encoding: "utf8"}).trim();
    if (git(["rev-parse", "HEAD"]) !== candidateId || git(["status", "--porcelain", "--untracked-files=all"])) {
        throw new Error("Test package preparation requires the exact clean committed candidate");
    }
    const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib/node_modules/npm/bin/npm-cli.js");
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("npm_package_") && !name.startsWith("npm_lifecycle_")));
    env.NODE_ENV = "production";
    env.PATH = (process.env.PATH ?? "").split(path.delimiter).filter(entry => !entry.includes("pokie-command-policy")).join(path.delimiter);
    const npm = args => execFileSync(process.execPath, [npmCli, ...args], {cwd: repository, env, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024});
    await mkdir(directory, {recursive: true});
    npm(["run", "build"]);
    const source = path.join(directory, "source");
    await mkdir(source);
    const packed = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", source]));
    if (packed.length !== 1) throw new Error("Expected one canonical package");
    const archive = path.join(directory, "candidate-package.tgz");
    const receipt = path.join(directory, "candidate-executable-receipt.json");
    await verifyP805CandidatePackage({repositoryRoot: repository, candidateId,
        sourceArchive: path.join(source, packed[0].filename), candidateArchive: archive, receipt});
    if (git(["rev-parse", "HEAD"]) !== candidateId || git(["status", "--porcelain", "--untracked-files=all"])) {
        throw new Error("Candidate changed during package preparation");
    }
    const value = {candidateId, archiveSha256: digest(await readFile(archive)), receiptSha256: digest(await readFile(receipt))};
    const marker = path.join(directory, "complete.tmp");
    await writeFile(marker, JSON.stringify(value), {flag: "wx"});
    await rename(marker, path.join(directory, "complete.json"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [repository, directory, candidateId] = process.argv.slice(2);
    if (!repository || !directory || !(/^[a-f0-9]{40}$/).test(candidateId ?? "")) throw new Error("Expected repository, output and candidate SHA");
    await prepareTestPackage(repository, directory, candidateId);
}
