import fs from "fs";
import {
    computeFairnessCommitment,
    computeFairnessServerSeedCommitment,
    FairnessCommitment,
    FairnessCommitmentInput,
    FairnessRoundProof,
    FairnessRoundProofBuilder,
    FairnessRoundProofBuilding,
    FairnessRoundProofVerifier,
    FairnessRoundProofVerifying,
    FairnessServerSeedCommitment,
    FairnessServerSeedCommitmentInput,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    ValidationIssue,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const VERIFY_USAGE = "Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>";
const SEED_COMMIT_USAGE = "Usage: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]";
const COMMIT_USAGE =
    "Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> " +
    "--mode <modeName> [--out <file>] [--overwrite]";
const REVEAL_USAGE = "Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]";
const USAGE =
    `${VERIFY_USAGE}\n` +
    "   or: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]\n" +
    "   or: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]\n" +
    "   or: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]";

type VerifyOptions = {proofPath: string; commitmentPath: string; sourceBundleDir: string};
type SeedCommitOptions = {serverSeedPath: string; out?: string; overwrite: boolean};
type CommitOptions = {
    serverSeedCommitmentPath: string;
    clientSeed: string;
    nonce: number;
    sourceBundleDir: string;
    modeName: string;
    out?: string;
    overwrite: boolean;
};
type RevealOptions = {commitmentPath: string; serverSeedPath: string; sourceBundleDir: string; out?: string; overwrite: boolean};

// Four CLI verbs over the two-stage commit-reveal scheme (see docs/provably-fair.md): "seed-commit"/"commit"
// publish the two commitments a round needs before it's played, "reveal" builds the FairnessRoundProof once it's
// settled, and "verify" (the original, unchanged subcommand) independently checks a proof against its commitment
// and a live source bundle. Kept as one command's own subcommand switch — the same shape
// OutcomeLibraryCommand/CertificationCommand/StakeEngineCommand already use for their own noun-plus-verb
// commands — since cli/pokie.ts dispatches by exact name match and two separate classes could never both
// return getName() === "fairness".
//
// Never introduces a second calculation path: "seed-commit"/"commit" call straight through to
// computeFairnessServerSeedCommitment/computeFairnessCommitment (the one place either artifact is built, and the
// one place their own input validation lives), "commit" derives libraryId/libraryHash from the live bundle via
// OutcomeLibraryBundleReading.readModeIndex — the same reader FairnessRoundProofBuilder itself uses — rather than
// ever accepting a caller-supplied hash as an alternative source of truth, and "reveal" calls straight through to
// FairnessRoundProofBuilding.build (the one place a FairnessRoundProof is built, already validating the given
// commitment and cross-checking the revealed serverSeed against it).
export class FairnessCommand implements CliCommandHandling {
    private readonly verifier: FairnessRoundProofVerifying;
    private readonly loadJson: (filePath: string) => unknown;
    private readonly reader: OutcomeLibraryBundleReading;
    private readonly proofBuilder: FairnessRoundProofBuilding;
    private readonly computeServerSeedCommitment: (input: FairnessServerSeedCommitmentInput) => FairnessServerSeedCommitment;
    private readonly computeCommitment: (input: FairnessCommitmentInput) => FairnessCommitment;
    private readonly readTextFile: (filePath: string) => string;
    private readonly fileExists: (filePath: string) => boolean;
    private readonly writeFile: (filePath: string, contents: string) => void;

    constructor(
        verifier: FairnessRoundProofVerifying = new FairnessRoundProofVerifier(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        proofBuilder: FairnessRoundProofBuilding = new FairnessRoundProofBuilder(),
        computeServerSeedCommitment: (input: FairnessServerSeedCommitmentInput) => FairnessServerSeedCommitment = computeFairnessServerSeedCommitment,
        computeCommitment: (input: FairnessCommitmentInput) => FairnessCommitment = computeFairnessCommitment,
        readTextFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, "utf-8"),
        fileExists: (filePath: string) => boolean = (filePath) => fs.existsSync(filePath),
        writeFile: (filePath: string, contents: string) => void = (filePath, contents) => fs.writeFileSync(filePath, contents, "utf-8"),
    ) {
        this.verifier = verifier;
        this.loadJson = loadJson;
        this.reader = reader;
        this.proofBuilder = proofBuilder;
        this.computeServerSeedCommitment = computeServerSeedCommitment;
        this.computeCommitment = computeCommitment;
        this.readTextFile = readTextFile;
        this.fileExists = fileExists;
        this.writeFile = writeFile;
    }

    public getName(): string {
        return "fairness";
    }

    public getDescription(): string {
        return (
            "Provably Fair commit-reveal workflow: publish a server-seed commitment, publish a round commitment " +
            "against a live outcome-library bundle, reveal the round proof, and verify a proof against its " +
            'commitment/bundle ("pokie fairness seed-commit|commit|reveal|verify").'
        );
    }

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        // "seed-commit" has no genuinely asynchronous step (no bundle read, no builder call), so its own
        // handler stays a plain synchronous method — but a synchronous throw from it (a usage error, an
        // unreadable seed file, an invalid seed, the overwrite-safety check inside emit()) still needs to
        // surface as a REJECTED promise, never an exception thrown out of run() itself, hence the try/catch
        // here (the same shape BuildCommand.run() already uses around its own synchronous handlers).
        try {
            switch (subcommand) {
                case "seed-commit":
                    return Promise.resolve(this.runSeedCommit(rest));
                case "commit":
                    return this.runCommit(rest);
                case "reveal":
                    return this.runReveal(rest);
                case "verify":
                    return this.runVerify(rest);
                default:
                    return Promise.reject(new Error(USAGE));
            }
        } catch (error) {
            return Promise.reject(error);
        }
    }

    private runSeedCommit(args: string[]): number {
        const options = this.parseSeedCommitArgs(args);
        const serverSeed = this.readTextFile(options.serverSeedPath).trim();

        const commitment = this.computeServerSeedCommitment({serverSeed});

        return this.emit(commitment, "Server-seed commitment", options.out, options.overwrite);
    }

    private async runCommit(args: string[]): Promise<number> {
        const options = this.parseCommitArgs(args);
        const serverSeedCommitment = this.loadJson(options.serverSeedCommitmentPath) as FairnessServerSeedCommitment;

        let libraryId: string;
        let libraryHash: string;
        try {
            const index = await this.reader.readModeIndex(options.sourceBundleDir, options.modeName);
            libraryId = index.libraryId;
            libraryHash = index.libraryHash;
        } catch (error) {
            throw new Error(
                `could not read mode "${options.modeName}"'s own index in "${options.sourceBundleDir}": ${
                    error instanceof Error ? error.message : String(error)
                }.`,
            );
        }

        const commitment = this.computeCommitment({
            serverSeedCommitment,
            clientSeed: options.clientSeed,
            nonce: options.nonce,
            libraryId,
            libraryHash,
            modeName: options.modeName,
        });

        return this.emit(commitment, "Round commitment", options.out, options.overwrite);
    }

    private async runReveal(args: string[]): Promise<number> {
        const options = this.parseRevealArgs(args);
        const commitment = this.loadJson(options.commitmentPath) as FairnessCommitment;
        const serverSeed = this.readTextFile(options.serverSeedPath).trim();

        const proof = await this.proofBuilder.build(commitment, serverSeed, options.sourceBundleDir);

        return this.emit(proof, "Round proof", options.out, options.overwrite);
    }

    private async runVerify(args: string[]): Promise<number> {
        const options = this.parseVerifyArgs(args);
        const proofCandidate = this.loadJson(options.proofPath);
        const commitmentCandidate = this.loadJson(options.commitmentPath);
        const issues = await this.verifier.verify(proofCandidate, {commitment: commitmentCandidate, sourceBundleDir: options.sourceBundleDir});
        const errors = issues.filter((issue) => issue.severity === "error");
        const rest = issues.filter((issue) => issue.severity !== "error");

        if (errors.length > 0) {
            console.error(`"${options.proofPath}" did not verify as a valid Provably Fair round proof (${errors.length} error(s)):`);
            this.printIssues(errors);
            return 1;
        }

        console.log(`"${options.proofPath}" verified successfully as a Provably Fair round proof.`);
        for (const issue of rest) {
            console.log(`  ${issue.severity}  ${issue.code}: ${issue.message}`);
        }

        return 0;
    }

    // Shared by seed-commit/commit/reveal: refuses to silently replace an existing --out file (same
    // "explicit override, never a silent overwrite" convention StudioBlueprintService.save()/
    // exportParSheet() already enforce via their own `overwrite` flag, just spelled as a CLI flag here),
    // writes deterministic pretty-printed JSON (stable key order — every fairness artifact is built as a
    // frozen object literal with a fixed key order, never reordered here), and always echoes it to stdout
    // too, the same "print now, note the file after" order ReplayCommand already uses for its own single-
    // artifact --out.
    private emit(artifact: FairnessServerSeedCommitment | FairnessCommitment | FairnessRoundProof, label: string, out: string | undefined, overwrite: boolean): number {
        const json = `${JSON.stringify(artifact, null, 4)}\n`;

        if (out !== undefined) {
            if (!overwrite && this.fileExists(out)) {
                throw new Error(`"${out}" already exists. Rerun with --overwrite to replace it.`);
            }
            this.writeFile(out, json);
        }

        console.log(json);
        if (out !== undefined) {
            console.log(`${label} written to "${out}".`);
        }

        return 0;
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private parseSeedCommitArgs(args: string[]): SeedCommitOptions {
        const [serverSeedPath, ...rest] = args;
        if (!serverSeedPath) {
            throw new Error(SEED_COMMIT_USAGE);
        }

        let out: string | undefined;
        let overwrite = false;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${SEED_COMMIT_USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                case "--overwrite": {
                    overwrite = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${SEED_COMMIT_USAGE}`);
            }
        }

        return {serverSeedPath, out, overwrite};
    }

    private parseCommitArgs(args: string[]): CommitOptions {
        const [serverSeedCommitmentPath, ...rest] = args;
        if (!serverSeedCommitmentPath) {
            throw new Error(COMMIT_USAGE);
        }

        let clientSeed: string | undefined;
        let nonce: number | undefined;
        let sourceBundleDir: string | undefined;
        let modeName: string | undefined;
        let out: string | undefined;
        let overwrite = false;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--client-seed": {
                    if (value === undefined) {
                        throw new Error(`--client-seed requires a value. ${COMMIT_USAGE}`);
                    }
                    clientSeed = value;
                    i++;
                    break;
                }
                case "--nonce": {
                    const parsed = Number(value);
                    if (value === undefined || !Number.isInteger(parsed) || parsed < 0) {
                        throw new Error(`--nonce must be a non-negative integer. ${COMMIT_USAGE}`);
                    }
                    nonce = parsed;
                    i++;
                    break;
                }
                case "--source": {
                    if (value === undefined) {
                        throw new Error(`--source requires a directory path. ${COMMIT_USAGE}`);
                    }
                    sourceBundleDir = value;
                    i++;
                    break;
                }
                case "--mode": {
                    if (value === undefined) {
                        throw new Error(`--mode requires a mode name. ${COMMIT_USAGE}`);
                    }
                    modeName = value;
                    i++;
                    break;
                }
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${COMMIT_USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                case "--overwrite": {
                    overwrite = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${COMMIT_USAGE}`);
            }
        }

        if (clientSeed === undefined) {
            throw new Error(`--client-seed <seed> is required. ${COMMIT_USAGE}`);
        }
        if (nonce === undefined) {
            throw new Error(`--nonce <number> is required. ${COMMIT_USAGE}`);
        }
        if (sourceBundleDir === undefined) {
            throw new Error(`--source <bundleDir> is required. ${COMMIT_USAGE}`);
        }
        if (modeName === undefined) {
            throw new Error(`--mode <modeName> is required. ${COMMIT_USAGE}`);
        }

        return {serverSeedCommitmentPath, clientSeed, nonce, sourceBundleDir, modeName, out, overwrite};
    }

    private parseRevealArgs(args: string[]): RevealOptions {
        const [commitmentPath, ...rest] = args;
        if (!commitmentPath) {
            throw new Error(REVEAL_USAGE);
        }

        let serverSeedPath: string | undefined;
        let sourceBundleDir: string | undefined;
        let out: string | undefined;
        let overwrite = false;

        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--server-seed": {
                    if (value === undefined) {
                        throw new Error(`--server-seed requires a file path. ${REVEAL_USAGE}`);
                    }
                    serverSeedPath = value;
                    i++;
                    break;
                }
                case "--source": {
                    if (value === undefined) {
                        throw new Error(`--source requires a directory path. ${REVEAL_USAGE}`);
                    }
                    sourceBundleDir = value;
                    i++;
                    break;
                }
                case "--out": {
                    if (value === undefined) {
                        throw new Error(`--out requires a file path. ${REVEAL_USAGE}`);
                    }
                    out = value;
                    i++;
                    break;
                }
                case "--overwrite": {
                    overwrite = true;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${REVEAL_USAGE}`);
            }
        }

        if (serverSeedPath === undefined) {
            throw new Error(`--server-seed <file> is required. ${REVEAL_USAGE}`);
        }
        if (sourceBundleDir === undefined) {
            throw new Error(`--source <bundleDir> is required. ${REVEAL_USAGE}`);
        }

        return {commitmentPath, serverSeedPath, sourceBundleDir, out, overwrite};
    }

    private parseVerifyArgs(args: string[]): VerifyOptions {
        const [proofPath, ...rest] = args;
        if (!proofPath) {
            throw new Error(VERIFY_USAGE);
        }

        let commitmentPath: string | undefined;
        let sourceBundleDir: string | undefined;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
                case "--commitment": {
                    if (value === undefined) {
                        throw new Error(`--commitment requires a file path. ${VERIFY_USAGE}`);
                    }
                    commitmentPath = value;
                    i++;
                    break;
                }
                case "--source": {
                    if (value === undefined) {
                        throw new Error(`--source requires a directory path. ${VERIFY_USAGE}`);
                    }
                    sourceBundleDir = value;
                    i++;
                    break;
                }
                default:
                    throw new Error(`Unknown option "${flag}". ${VERIFY_USAGE}`);
            }
        }

        if (commitmentPath === undefined) {
            throw new Error(`--commitment <commitment.json> is required. ${VERIFY_USAGE}`);
        }
        if (sourceBundleDir === undefined) {
            throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
        }

        return {proofPath, commitmentPath, sourceBundleDir};
    }
}
