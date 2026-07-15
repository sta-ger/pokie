import fs from "fs";
import {FairnessRoundProofVerifier, FairnessRoundProofVerifying, ValidationIssue} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";

const USAGE = "Usage: pokie fairness verify <proof.json> --source <bundleDir>";
const VERIFY_USAGE = USAGE;

type VerifyOptions = {proofPath: string; sourceBundleDir: string};

// One CLI verb today ("pokie fairness verify"), kept as its own subcommand switch — the same shape
// OutcomeLibraryCommand/CertificationCommand/StakeEngineCommand already use for their own noun-plus-verb
// commands — rather than folding "verify" directly into run(), so a future "pokie fairness commit"/"reveal" can
// be added without changing this command's own name or usage shape.
export class FairnessCommand implements CliCommandHandling {
    private readonly verifier: FairnessRoundProofVerifying;
    private readonly loadJson: (filePath: string) => unknown;

    constructor(
        verifier: FairnessRoundProofVerifying = new FairnessRoundProofVerifier(),
        loadJson: (filePath: string) => unknown = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8")),
    ) {
        this.verifier = verifier;
        this.loadJson = loadJson;
    }

    public getName(): string {
        return "fairness";
    }

    public getDescription(): string {
        return (
            "Verify a Provably Fair round proof against its live source outcome-library bundle " +
            '("pokie fairness verify <proof.json> --source <bundleDir>").'
        );
    }

    public run(args: string[]): Promise<number> {
        const [subcommand, ...rest] = args;
        switch (subcommand) {
            case "verify":
                return this.runVerify(rest);
            default:
                return Promise.reject(new Error(USAGE));
        }
    }

    private async runVerify(args: string[]): Promise<number> {
        const options = this.parseVerifyArgs(args);
        const candidate = this.loadJson(options.proofPath);
        const issues = await this.verifier.verify(candidate, {sourceBundleDir: options.sourceBundleDir});
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

    private printIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            console.error(`  - ${issue.code}: ${issue.message}`);
        }
    }

    private parseVerifyArgs(args: string[]): VerifyOptions {
        const [proofPath, ...rest] = args;
        if (!proofPath) {
            throw new Error(VERIFY_USAGE);
        }

        let sourceBundleDir: string | undefined;
        for (let i = 0; i < rest.length; i++) {
            const flag = rest[i];
            const value = rest[i + 1];
            switch (flag) {
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

        if (sourceBundleDir === undefined) {
            throw new Error(`--source <bundleDir> is required. ${VERIFY_USAGE}`);
        }

        return {proofPath, sourceBundleDir};
    }
}
