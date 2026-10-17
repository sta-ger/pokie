import {projectRevision} from "../../src/optimization/internal/optimizationData.js";
import {OptimizationCancelledError} from "../../src/optimization/internal/ProjectOptimizationAdapter.js";
import {ArtifactBuildCancelledError} from "../../src/project/ArtifactBuildOptions.js";
import fs from "fs";
import {Command} from "commander";
import type {CliCommandHandling} from "../CliCommandHandling.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {
    ProjectOptimizationService,
    OPTIMIZATION_EXIT_CODES,
} from "../../src/optimization/ProjectOptimizationService.js";
import {
    OptimizationInputError,
    validateOptimizationRequest,
} from "../../src/optimization/validateOptimizationRequest.js";
import type {OptimizationResult} from "../../src/optimization/OptimizationPolicy.js";
import {createCommanderCliCommand, isCommanderHelpDisplay} from "./internal/CommanderCliAdapter.js";

/** Conversion remains `build SOURCE --target TARGET`; this command returns only same-type math candidates. */
export class OptimizeCommand implements CliCommandHandling {
    private readonly service: ProjectOptimizationService;
    public constructor(service = new ProjectOptimizationService()) {
        this.service = service;
    }
    public getName(): string {
        return "optimize";
    }
    public getDescription(): string {
        return "Search a declared finite math domain and review or save a same-type candidate.";
    }
    public getCommanderCommand(): Command {
        return this.command();
    }
    public async run(args: string[]): Promise<number> {
        const command = this.command();
        let result: OptimizationResult = {status: "failure", diagnostics: []};
        let request: unknown;
        const controller = new AbortController();
        const cancel = (): void => controller.abort();
        process.on("SIGINT", cancel);
        try {
            try {
                await command.parseAsync(args, {from: "user"});
            } catch (error) {
                if (isCommanderHelpDisplay(error)) return 0;
                throw error;
            }
            const options = command.opts<{policy: string; out?: string; format: string; progress?: boolean}>();
            if (options.format !== "json") throw new OptimizationInputError([{path: "format", message: "Only json is supported."}]);
            try {
                request = validateOptimizationRequest(JSON.parse(fs.readFileSync(options.policy, "utf8")));
            } catch (error) {
                if (error instanceof OptimizationInputError) throw error;
                throw new OptimizationInputError([{path: "policy", message: (error as Error).message}]);
            }
            const project = await new ProjectTargetResolver().resolve(command.args[0]);
            if (!project) result = {
                status: "unsupported",
                diagnostics: [{path: "source", message: "Not a recognized POKIE project."}],
            };
            else {
                result = await this.service.optimize(project, request, {
                    signal: controller.signal,
                    onProgress: options.progress
                        ? (evidence) => console.error(JSON.stringify({type: "progress", evidence}))
                        : undefined,
                });
                if (result.candidate) {
                    const candidate = result.candidate;
                    try {
                        if (options.out) {
                            const output = await this.service.publish(candidate, request, options.out, {
                                signal: controller.signal,
                            });
                            result = {...result, candidate: undefined, output: {path: output, revision: projectRevision({type: candidate.type, rootPath: output}), type: candidate.type}};
                        } else {
                            // A CLI review exposes evidence/diff; only explicit --out retains an artifact.
                            result = {...result, candidate: undefined};
                        }
                    } finally {
                        await this.service.discard(candidate);
                    }
                }
            }
        } catch (error) {
            result = {
                ...result,
                candidate: undefined,
                status: classifyCommandError(error),
                diagnostics:
                    error instanceof OptimizationInputError
                        ? error.diagnostics
                        : [{path: "$", message: (error as Error).message}],
                evidence: result.evidence,
            };
        } finally {
            process.off("SIGINT", cancel);
        }
        console.log(JSON.stringify(result));
        return OPTIMIZATION_EXIT_CODES[result.status];
    }
    private command(): Command {
        return createCommanderCliCommand("optimize")
            .description(this.getDescription())
            .argument("<source>", "existing project")
            .requiredOption("--policy <file>", "JSON {targets, policy} request")
            .option("--out <path>", "explicitly save candidate to a new/empty destination")
            .option("--format <format>", "structured output (json)", "json")
            .option("--progress", "write JSON progress to stderr");
    }
}

function classifyCommandError(error: unknown): OptimizationResult["status"] {
    if (error instanceof OptimizationInputError || (error as {code?: string}).code?.startsWith("commander.")) return "invalid";
    if (error instanceof OptimizationCancelledError || error instanceof ArtifactBuildCancelledError) return "cancelled";
    return "failure";
}
