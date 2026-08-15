import {GenerateCommand} from "../../../cli/commands/GenerateCommand.js";

describe("GenerateCommand", () => {
    it("promotes outcome generation to a top-level capability verb", () => {
        const command = new GenerateCommand("1.3.0");

        expect(command.getName()).toBe("generate");
        expect(command.getCommanderCommand().name()).toBe("generate");
    });
});
