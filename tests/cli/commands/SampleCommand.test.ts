import {SampleCommand} from "../../../cli/commands/SampleCommand.js";

describe("SampleCommand", () => {
    it("promotes outcome sampling to a top-level capability verb", () => {
        const command = new SampleCommand();

        expect(command.getName()).toBe("sample");
        expect(command.getCommanderCommand().name()).toBe("sample");
    });
});
