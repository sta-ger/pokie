import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {OutcomeSourceCommand} from "./OutcomeSourceCommand.js";

// A single outcome draw is a capability, not a source-format namespace. The delegated command is
// intentionally private to this facade, preserving its proven selector and seeded-draw behavior.
export class SampleCommand implements CliCommandHandling {
    private readonly outcomeSource: OutcomeSourceCommand = new OutcomeSourceCommand();

    public getName(): string {
        return "sample";
    }

    public getDescription(): string {
        return "Draw one outcome from a project that supports outcome sampling.";
    }

    public getCommanderCommand(): Command {
        return this.outcomeSource.getCommanderCommand().commands.find((command) => command.name() === "sample")!;
    }

    public run(args: string[]): Promise<number> {
        return this.outcomeSource.run(["sample", ...args]);
    }
}
