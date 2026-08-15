import {Command} from "commander";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {StudioCommand} from "./StudioCommand.js";

// Studio owns the implicit CLI entry, but the concrete launcher remains separately testable. This
// adapter is intentionally the only registered path to it, so `pokie studio` is not a public alias.
export const INTERNAL_STUDIO_COMMAND_NAME = "__studio";

export class InternalStudioCommand implements CliCommandHandling {
    private readonly studio: StudioCommand;

    constructor(studio: StudioCommand) {
        this.studio = studio;
    }

    public getName(): string {
        return INTERNAL_STUDIO_COMMAND_NAME;
    }

    public getDescription(): string {
        return this.studio.getDescription();
    }

    public getCommanderCommand(): Command {
        return this.studio.getCommanderCommand();
    }

    public run(args: string[]): Promise<void> {
        return this.studio.run(args);
    }
}
