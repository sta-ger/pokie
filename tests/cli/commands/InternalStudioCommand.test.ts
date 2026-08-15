import {InternalStudioCommand, INTERNAL_STUDIO_COMMAND_NAME} from "../../../cli/commands/InternalStudioCommand.js";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";

describe("InternalStudioCommand", () => {
    it("keeps the Studio launcher out of the public command namespace", () => {
        const command = new InternalStudioCommand(new StudioCommand("1.3.0", "/fake/pokie/root"));

        expect(command.getName()).toBe(INTERNAL_STUDIO_COMMAND_NAME);
        expect(command.getCommanderCommand().name()).toBe("studio");
    });
});
