import {Command} from "commander";
import {loadPokieWasmFileRuntime, SeededRandomNumberGenerator} from "pokie";
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
                optionMissingArgument: () => `--seed requires a value. ${USAGE}`,
            });
        });
    }

    private buildCommand(exitCode: {value: number} = {value: 0}): Command {
        return createCommanderCliCommand("run")
            .description(this.getDescription())
            .argument("<artifact.wasm>", "a canonical POKIE WASM artifact")
            .option("--seed <string>", "deterministic host RNG seed", "pokie-wasm-cli")
            .action(async (artifactPath: string, options: {seed: string}) => {
                if (!artifactPath) throw new Error(USAGE);
                const rng = new SeededRandomNumberGenerator(options.seed);
                const runtime = await loadPokieWasmFileRuntime(artifactPath, {nextRandom: () => rng.getRandomInt(0, 1_000_000_000) / 1_000_000_000});
                try {
                    const session = runtime.createSession(options.seed);
                    try {
                        const round = await session.play();
                        console.log(`POKIE WASM round ${round.sequence}: draw=${round.draw} seed=${options.seed}`);
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
