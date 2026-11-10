import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

/** Share preparation, never mutable installations or test/session state. */
export function preparePackedTestCandidate(repository = process.cwd()): {archive: string; receipt: string; candidateId: string} {
    const git = (args: string[]): string => execFileSync("git", args, {cwd: repository, encoding: "utf8"}).trim();
    const candidateId = git(["rev-parse", "HEAD"]);
    if (git(["status", "--porcelain", "--untracked-files=all"])) throw new Error("Packed test candidate must be clean");
    const digest = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
    const key = digest(JSON.stringify({candidateId, node: process.version,
        lock: digest(fs.readFileSync(path.join(repository, "package-lock.json"))),
        compiler: fs.readFileSync(path.join(repository, "node_modules/typescript/package.json"), "utf8")}));
    const directory = path.join(repository, "node_modules/.cache/pokie-test-packages", key);
    const archive = path.join(directory, "candidate-package.tgz");
    const receipt = path.join(directory, "candidate-executable-receipt.json");
    const complete = path.join(directory, "complete.json");
    ensureCompiledTestOutput({
        repositoryRoot: repository,
        lockName: "verified-test-package", outputPaths: [complete, archive, receipt], executionTimeoutMs: 660_000,
        validateOutputs: () => {
            // A corrupt cache is a real failure. Never silently re-bless bytes
            // by updating its marker or skipping the independent verifier.
            const record = JSON.parse(fs.readFileSync(complete, "utf8")) as {candidateId: string; archiveSha256: string; receiptSha256: string};
            const proof = JSON.parse(fs.readFileSync(receipt, "utf8")) as {
                kind: string; candidateId: string; candidatePackageSha256: string;
                verifiedBuild: {candidateId: string; environment: {NODE_ENV: string}};
                authentication: {scheme: string; verifierExecutableSha256: string};
            };
            if (record.candidateId !== candidateId || proof.candidateId !== candidateId ||
                proof.kind !== "p8-05-candidate-executable-receipt" ||
                proof.verifiedBuild?.candidateId !== candidateId || proof.verifiedBuild?.environment?.NODE_ENV !== "production" ||
                proof.authentication?.scheme !== "verifier-owned-candidate-tree" ||
                proof.authentication?.verifierExecutableSha256 !== digest(fs.readFileSync(path.join(repository, "scripts/p8-05-candidate-package-verifier.mjs"))) ||
                record.archiveSha256 !== digest(fs.readFileSync(archive)) ||
                record.receiptSha256 !== digest(fs.readFileSync(receipt)) ||
                proof.candidatePackageSha256 !== record.archiveSha256) throw new Error("Corrupt prepared test package");
            return true;
        },
        command: [process.execPath, path.join(repository, "scripts/prepare-test-package.mjs"), repository, directory, candidateId],
    });
    if (git(["rev-parse", "HEAD"]) !== candidateId || git(["status", "--porcelain", "--untracked-files=all"])) throw new Error("Prepared test candidate changed");
    return {archive, receipt, candidateId};
}
