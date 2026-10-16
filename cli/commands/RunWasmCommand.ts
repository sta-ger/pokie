import {Command} from "commander";
import {loadPokieWasmFileRuntime, SeededPokieWasmHost} from "@fromstan/pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie run <artifact.wasm> [--seed <string>]";

/** Starts one portable round directly from a canonical artifact, with no project package or compiler. */
export class RunWasmCommand implements CliCommandHandling {
    public getName(): string {
        return "run";
    }

    public getDescription(): string {
        return "Run one deterministic round from a canonical POKIE WASM artifact.";
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const exitCode = {value: 0};
        return this.buildCommand(exitCode).parseAsync(args, {from: "user"}).then(() => exitCode.value).catch((error: unknown) => {
            if (isCommanderHelpDisplay(error)) return 0;
            throw translateCommanderError(error, {
                missingArgument: USAGE,
                unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                optionMissingArgument: (flag) => `${flag} requires a value. ${USAGE}`,
            });
        });
    }

    private buildCommand(exitCode: {value: number} = {value: 0}): Command {
        return createCommanderCliCommand("run")
            .description(this.getDescription())
            .argument("<artifact.wasm>", "a canonical POKIE WASM artifact")
            .option("--seed <string>", "deterministic host RNG seed", "pokie-wasm-cli")
            .option("--bet <number>", "available entry denomination", (value: string) => {
                const bet = Number(value);
                if (!Number.isFinite(bet) || bet <= 0) throw new Error("--bet must be a finite positive number.");
                return bet;
            })
            .option("--mode <id>", "declared feature entry mode")
            .option("--delivery <policy>", "declared feature delivery: stepwise or composite", (value: string) => {
                if (value !== "stepwise" && value !== "composite") throw new Error("--delivery must be stepwise or composite.");
                return value;
            })
            .option("--round-id <id>", "explicit logical entry identity")
            .option("--format <format>", "text or JSON result/checkpoint", (value: string) => {
                if (value !== "text" && value !== "json") throw new Error("--format must be text or json.");
                return value;
            }, "text")
            .action(async (artifactPath: string, options: {seed: string; bet?: number; mode?: string; delivery?: "stepwise" | "composite"; roundId?: string; format: string}) => {
                if (!artifactPath) throw new Error(USAGE);
                const runtime = await loadPokieWasmFileRuntime(artifactPath, new SeededPokieWasmHost(options.seed));
                try {
                    const session = runtime.createSession(options.seed);
                    try {
                        const command = {...(options.bet === undefined ? {} : {bet: options.bet}), ...(options.mode === undefined ? {} : {mode: options.mode}),
                            ...(options.roundId ? {roundId: options.roundId} : {}), ...(options.delivery ? {delivery: options.delivery, roundId: options.roundId ?? `run:${options.seed}`} : {})};
                        const round = await session.play(command);
                        if (options.format === "json") console.log(JSON.stringify({round, ...(runtime.manifest.capabilities.includes("runtime.serialize") ? {state: session.serialize()} : {})}, null, 2));
                        else console.log(`POKIE WASM round ${round.sequence}: draw=${round.draw} seed=${options.seed}`);
                    } finally {
                        session.dispose();
                    }
                } finally {
                    runtime.dispose();
                }
                exitCode.value = 0;
            });
    }
}
