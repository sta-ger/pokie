import {Command} from "commander";
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
import {CommanderErrorMessages, createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";
import {normalizeServerSeedFileContents} from "./internal/normalizeServerSeedFileContents.js";
import {parseCanonicalNonNegativeInteger} from "./internal/parseCanonicalNonNegativeInteger.js";

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

// The one place --nonce's usage message is composed, shared by the custom Commander option parser (invoked
// whenever a value token, even an empty string, follows --nonce) and the optionMissingArgument fallback for
// when --nonce is the very last token with no value at all (Commander never calls the custom parser in that
// case) -- the original hand-rolled loop built the exact same message either way, differing only in whether
// the offending value is displayed as "nothing" or as its JSON.stringify'd form.
function nonceUsageMessage(displayValue: string): string {
    return (
        `--nonce must be a canonical non-negative decimal integer (e.g. "0", "42" — no sign, decimal point, ` +
        `leading zero, or scientific/hex notation, and no larger than Number.MAX_SAFE_INTEGER), got ${displayValue}. ${COMMIT_USAGE}`
    );
}

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

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    // One parent Commander instance with four real subcommands ("seed-commit"/"commit"/"reveal"/"verify"),
    // the same shape CertificationCommand.run() already uses for its own two verbs -- Commander itself both
    // dispatches by exact verb name and validates each verb's own positional/options, in place of the former
    // hand-rolled switch+loop. The messages passed to translateCommanderError are picked per-verb (from
    // args[0], read before parsing) since a structural error caught at the shared parent.parseAsync() call
    // doesn't otherwise say which subcommand it came from; an empty/unrecognized/missing verb falls back to
    // the combined USAGE the original hand-rolled switch's own `default` case threw. Each verb's own required
    // options (--client-seed/--nonce/--source/--mode for "commit", --server-seed/--source for "reveal",
    // --commitment/--source for "verify") are declared as plain optional Commander options and checked by hand
    // inside the verb's own action, in the same order the original loop's own trailing `if (x === undefined)`
    // checks ran in, rather than via requiredOption() (whose own message text/ordering can't be steered to
    // match the original one flag at a time).
    public run(args: string[]): Promise<number> {
        // An empty argv has no verb for Commander to dispatch on at all; rather than lean on
        // Commander's own incidental "commander.help" throw for this (still handled below via
        // noCommand, e.g. for "pokie fairness help"), reject it explicitly up front with the same
        // combined usage text the original hand-rolled switch's own `default` case threw.
        if (args.length === 0) {
            return Promise.reject(new Error(USAGE));
        }

        const exitCodeRef = {value: 0};
        const parent = this.buildCommand(exitCodeRef);
        const verb = args[0];
        let verbMessages: CommanderErrorMessages = {};
        if (verb === "seed-commit") {
            verbMessages = {
                missingArgument: SEED_COMMIT_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${SEED_COMMIT_USAGE}`,
                optionMissingArgument: (flag) =>
                    flag === "--out" ? `--out requires a file path. ${SEED_COMMIT_USAGE}` : `Unknown option "${flag}". ${SEED_COMMIT_USAGE}`,
            };
        } else if (verb === "commit") {
            verbMessages = {
                missingArgument: COMMIT_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${COMMIT_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--client-seed") return `--client-seed requires a value. ${COMMIT_USAGE}`;
                    if (flag === "--nonce") return nonceUsageMessage("nothing");
                    if (flag === "--source") return `--source requires a directory path. ${COMMIT_USAGE}`;
                    if (flag === "--mode") return `--mode requires a mode name. ${COMMIT_USAGE}`;
                    if (flag === "--out") return `--out requires a file path. ${COMMIT_USAGE}`;
                    return `Unknown option "${flag}". ${COMMIT_USAGE}`;
                },
            };
        } else if (verb === "reveal") {
            verbMessages = {
                missingArgument: REVEAL_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${REVEAL_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--server-seed") return `--server-seed requires a file path. ${REVEAL_USAGE}`;
                    if (flag === "--source") return `--source requires a directory path. ${REVEAL_USAGE}`;
                    if (flag === "--out") return `--out requires a file path. ${REVEAL_USAGE}`;
                    return `Unknown option "${flag}". ${REVEAL_USAGE}`;
                },
            };
        } else if (verb === "verify") {
            verbMessages = {
                missingArgument: VERIFY_USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${VERIFY_USAGE}`,
                optionMissingArgument: (flag) => {
                    if (flag === "--commitment") return `--commitment requires a file path. ${VERIFY_USAGE}`;
                    if (flag === "--source") return `--source requires a directory path. ${VERIFY_USAGE}`;
                    return `Unknown option "${flag}". ${VERIFY_USAGE}`;
                },
            };
        }

        return parent
            .parseAsync(args, {from: "user"})
            .then(() => exitCodeRef.value)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    ...verbMessages,
                    unknownCommand: USAGE,
                    noCommand: USAGE,
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `exitCodeRef` is written by whichever verb's action actually runs;
    // run() supplies its own real box and reads it back once parsing resolves, while
    // getCommanderCommand() never parses this tree at all, so its own default box is never read.
    private buildCommand(exitCodeRef: {value: number} = {value: 0}): Command {
        const parent = createCommanderCliCommand("fairness").description(this.getDescription());

        parent
            .command("seed-commit")
            .description("Publish a server-seed commitment (the first step of the commit-reveal scheme).")
            .argument("<serverSeedPath>", "a text file containing the secret server seed")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--out <file>", "write the commitment JSON to this path (default: print only)")
            .option("--overwrite", "allow --out to replace an existing file")
            .action((serverSeedPath: string, excess: string[], options: {out?: string; overwrite?: boolean}) => {
                // An empty-string positional is a legal PRESENT argument as far as Commander's own required-
                // argument check is concerned, but the pre-Commander behavior this preserves treated it the
                // same as an entirely missing one (`!serverSeedPath`).
                if (!serverSeedPath) {
                    throw new Error(SEED_COMMIT_USAGE);
                }
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${SEED_COMMIT_USAGE}`);
                }
                exitCodeRef.value = this.runSeedCommit({serverSeedPath, out: options.out, overwrite: options.overwrite ?? false});
            });

        parent
            .command("commit")
            .description("Publish a round commitment against a live outcome-library bundle.")
            .argument("<serverSeedCommitmentPath>", "the JSON commitment published by \"pokie fairness seed-commit\"")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--client-seed <seed>", "the player-supplied seed for this round (required)")
            .option("--nonce <n>", "a canonical non-negative decimal integer, unique per client seed (required)", (value: string) => {
                const parsed = parseCanonicalNonNegativeInteger(value);
                if (parsed === undefined) {
                    throw new Error(nonceUsageMessage(JSON.stringify(value)));
                }
                return parsed;
            })
            .option("--source <bundleDir>", "the outcome-library bundle this round will be drawn from (required)")
            .option("--mode <modeName>", "the bet mode this round will be drawn from (required)")
            .option("--out <file>", "write the commitment JSON to this path (default: print only)")
            .option("--overwrite", "allow --out to replace an existing file")
            .action(
                async (
                    serverSeedCommitmentPath: string,
                    excess: string[],
                    options: {clientSeed?: string; nonce?: number; source?: string; mode?: string; out?: string; overwrite?: boolean},
                ) => {
                    if (!serverSeedCommitmentPath) {
                        throw new Error(COMMIT_USAGE);
                    }
                    if (excess.length > 0) {
                        throw new Error(`Unknown option "${excess[0]}". ${COMMIT_USAGE}`);
                    }
                    if (options.clientSeed === undefined) {
                        throw new Error(`--client-seed <seed> is required. ${COMMIT_USAGE}`);
                    }
                    if (options.nonce === undefined) {
                        throw new Error(`--nonce <number> is required. ${COMMIT_USAGE}`);
                    }
                    if (options.source === undefined) {
                        throw new Error(`--source <bundleDir> is required. ${COMMIT_USAGE}`);
                    }
                    if (options.mode === undefined) {
                        throw new Error(`--mode <modeName> is required. ${COMMIT_USAGE}`);
                    }
                    exitCodeRef.value = await this.runCommit({
                        serverSeedCommitmentPath,
                        clientSeed: options.clientSeed,
                        nonce: options.nonce,
                        sourceBundleDir: options.source,
                        modeName: options.mode,
                        out: options.out,
                        overwrite: options.overwrite ?? false,
                    });
                },
            );

        parent
            .command("reveal")
            .description("Reveal the round proof once a committed round has settled.")
            .argument("<commitmentPath>", "the JSON round commitment published by \"pokie fairness commit\"")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--server-seed <file>", "a text file containing the secret server seed (required)")
            .option("--source <bundleDir>", "the outcome-library bundle this round was drawn from (required)")
            .option("--out <file>", "write the proof JSON to this path (default: print only)")
            .option("--overwrite", "allow --out to replace an existing file")
            .action(async (commitmentPath: string, excess: string[], options: {serverSeed?: string; source?: string; out?: string; overwrite?: boolean}) => {
                if (!commitmentPath) {
                    throw new Error(REVEAL_USAGE);
                }
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${REVEAL_USAGE}`);
                }
                if (options.serverSeed === undefined) {
                    throw new Error(`--server-seed <file> is required. ${REVEAL_USAGE}`);
                }
                if (options.source === undefined) {
                    throw new Error(`--source <bundleDir> is required. ${REVEAL_USAGE}`);
                }
                exitCodeRef.value = await this.runReveal({
                    commitmentPath,
                    serverSeedPath: options.serverSeed,
                    sourceBundleDir: options.source,
                    out: options.out,
                    overwrite: options.overwrite ?? false,
                });
            });

        parent
            .command("verify")
            .description("Independently verify a round proof against its commitment and a live source bundle.")
            .argument("<proofPath>", "the JSON round proof produced by \"pokie fairness reveal\"")
            .argument("[excess...]", "rejected if present -- this verb takes no further positionals")
            .option("--commitment <file>", "the JSON round commitment this proof claims to reveal (required)")
            .option("--source <bundleDir>", "the outcome-library bundle this round was drawn from (required)")
            .action(async (proofPath: string, excess: string[], options: {commitment?: string; source?: string}) => {
                if (!proofPath) {
                    throw new Error(VERIFY_USAGE);
                }
                if (excess.length > 0) {
                    throw new Error(`Unknown option "${excess[0]}". ${VERIFY_USAGE}`);
                }
                if (options.commitment === undefined) {
                    throw new Error(`--commitment <commitment.json> is required. ${VERIFY_USAGE}`);
                }
                if (options.source === undefined) {
                    throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
                }
                exitCodeRef.value = await this.runVerify({proofPath, commitmentPath: options.commitment, sourceBundleDir: options.source});
            });

        return parent;
    }

    private runSeedCommit(options: SeedCommitOptions): number {
        const serverSeed = this.readServerSeedFile(options.serverSeedPath);

        const commitment = this.computeServerSeedCommitment({serverSeed});

        return this.emit(commitment, "Server-seed commitment", options.out, options.overwrite);
    }

    private async runCommit(options: CommitOptions): Promise<number> {
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

    private async runReveal(options: RevealOptions): Promise<number> {
        const commitment = this.loadJson(options.commitmentPath) as FairnessCommitment;
        const serverSeed = this.readServerSeedFile(options.serverSeedPath);

        const proof = await this.proofBuilder.build(commitment, serverSeed, options.sourceBundleDir);

        return this.emit(proof, "Round proof", options.out, options.overwrite);
    }

    private async runVerify(options: VerifyOptions): Promise<number> {
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

    // Shared by seed-commit/reveal: reads the raw file via the injected readTextFile, then applies the one
    // normalization rule normalizeServerSeedFileContents defines (strip at most one terminal line ending,
    // preserve everything else) — never a plain `.trim()`, which would also silently strip a leading space or
    // intentional trailing spaces the caller meant as part of the secret. Wraps normalizeServerSeedFileContents'
    // own error with this file's own path, the same "prefix the path in quotes" convention every other file-
    // reading error in this class already follows (e.g. the "could not read mode" wrap in runCommit).
    private readServerSeedFile(filePath: string): string {
        try {
            return normalizeServerSeedFileContents(this.readTextFile(filePath));
        } catch (error) {
            throw new Error(`"${filePath}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }
}
