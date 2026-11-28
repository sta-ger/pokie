import {dispatch} from "../../cli/dispatch.js";
import type {CliCommandHandling} from "../../cli/CliCommandHandling.js";

function failingCommand(error: unknown): CliCommandHandling {
    return {getName: () => "build", run: () => Promise.reject(error)} as unknown as CliCommandHandling;
}

describe("dispatch error diagnostics", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("names a destination whose parent is a file instead of printing raw ENOTDIR", async () => {
        const error = Object.assign(new Error("ENOTDIR: not a directory, lstat '/tmp/parent.json/child'"), {
            code: "ENOTDIR",
            path: "/tmp/parent.json/child",
        });
        const printed: string[] = [];
        jest.spyOn(console, "error").mockImplementation((message: unknown) => {
            printed.push(String(message));
        });

        expect(await dispatch([failingCommand(error)], ["node", "pokie", "build"])).toBe(1);
        expect(printed).toEqual(['"/tmp/parent.json/child" is inside a file, not a folder. Choose a different file name or folder.']);
    });

    it("keeps an unrelated command failure unchanged", async () => {
        const printed: string[] = [];
        jest.spyOn(console, "error").mockImplementation((message: unknown) => {
            printed.push(String(message));
        });

        expect(await dispatch([failingCommand(new Error("This build cannot be planned."))], ["node", "pokie", "build"])).toBe(1);
        expect(printed).toEqual(["This build cannot be planned."]);
    });
});
