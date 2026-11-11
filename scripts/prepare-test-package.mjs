// Test preparation only. Reuse the existing independent candidate verifier;
// this module does not issue an acceptance or skip a consumer workflow.
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile} from "node:fs/promises";
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
    await mkdir(directory, {recursive: true});
    // The caller holds the serialized preparation lock. Never erase a completed
    // cache (including a corrupt one); its validation belongs to the caller.
    try {
        await lstat(path.join(directory, "complete.json"));
        throw new Error("Test package preparation requires an incomplete cache");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    // A fresh namespace avoids exclusive-write collisions even after a killed
    // attempt. Retain failed attempts for diagnostics, never as cache inputs.
    const attempt = await mkdtemp(path.join(directory, "attempt-"));
    let stage = "canonical-build";
    const npm = async (args, timeout) => {
        const output = execFileSync(process.execPath, [npmCli, ...args], {cwd: repository, env, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024});
        await writeFile(path.join(attempt, `${stage}.stdout.log`), output);
        return output;
    };
    try {
        // Includes prebuild lint as well as all Node, browser and help builds.
        // The independent verifier retains its separate 300s build boundary.
        await npm(["run", "build"], 600_000);
        const source = path.join(attempt, "source");
        stage = "source-creation";
        await mkdir(source);
        stage = "canonical-pack";
        const packed = JSON.parse(await npm(["pack", "--ignore-scripts", "--json", "--pack-destination", source], 30_000));
        if (packed.length !== 1) throw new Error("Expected one canonical package");
        const archive = path.join(attempt, "candidate-package.tgz");
        const receipt = path.join(attempt, "candidate-executable-receipt.json");
        stage = "independent-verification";
        await verifyP805CandidatePackage({repositoryRoot: repository, candidateId,
            sourceArchive: path.join(source, packed[0].filename), candidateArchive: archive, receipt});
        if (git(["rev-parse", "HEAD"]) !== candidateId || git(["status", "--porcelain", "--untracked-files=all"])) {
            throw new Error("Candidate changed during package preparation");
        }
        const value = {candidateId, archiveSha256: digest(await readFile(archive)), receiptSha256: digest(await readFile(receipt))};
        const marker = path.join(attempt, "complete.tmp");
        await writeFile(marker, JSON.stringify(value), {flag: "wx"});
        stage = "publication";
        // Only replace incomplete legacy/publication outputs after verification.
        // Private consumers and earlier attempt diagnostics are never erased.
        for (const name of ["source", "candidate-package.tgz", "candidate-executable-receipt.json", "complete.tmp"]) {
            await rm(path.join(directory, name), {recursive: true, force: true});
        }
        await rename(archive, path.join(directory, "candidate-package.tgz"));
        await rename(receipt, path.join(directory, "candidate-executable-receipt.json"));
        await rename(marker, path.join(directory, "complete.json"));
    } catch (error) {
        // Keep the actual failing command's output before rethrowing. The
        // verifier removes its temporary workspace, so stderr alone on a later
        // retry must not be the only record of a timeout or projection failure.
        const diagnostic = path.join(attempt, "failure.json");
        try {
            await writeFile(diagnostic, JSON.stringify({candidateId, stage, message: error.message,
                code: error.code, status: error.status, signal: error.signal,
                command: error.spawnargs, stdout: error.stdout?.toString(), stderr: error.stderr?.toString()}, null, 2));
            console.error(`Test package preparation failed during ${stage}; diagnostics: ${diagnostic}`);
        } catch (diagnosticError) {
            console.error(`Cannot retain test package diagnostics at ${diagnostic}: ${diagnosticError.message}`);
        }
        throw error;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [repository, directory, candidateId] = process.argv.slice(2);
    if (!repository || !directory || !(/^[a-f0-9]{40}$/).test(candidateId ?? "")) throw new Error("Expected repository, output and candidate SHA");
    await prepareTestPackage(repository, directory, candidateId);
}
