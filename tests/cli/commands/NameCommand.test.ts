import {SlotGameNameGenerating, SlotGameNameRequest, SlotGameNameResult} from "pokie";
import {NameCommand} from "../../../cli/commands/NameCommand.js";

function createStubGenerator(): SlotGameNameGenerating & {calledWith?: {count: number; request?: SlotGameNameRequest}} {
    return {
        generate(request?: SlotGameNameRequest): SlotGameNameResult {
            this.calledWith = {count: 1, request};
            return {title: "Blazing Riches", slug: "blazing-riches-4821", packageName: "blazing-riches", seed: request?.seed ?? 1};
        },
        generateUnique(count: number, request?: SlotGameNameRequest): SlotGameNameResult[] {
            this.calledWith = {count, request};
            const seed = request?.seed ?? 1;
            return Array.from({length: count}, (_, i) => ({
                title: `Name ${i}`,
                slug: `name-${i}-1234`,
                packageName: `name-${i}`,
                seed,
            }));
        },
    };
}

describe("NameCommand", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("has the expected name and description", () => {
        const command = new NameCommand(createStubGenerator());

        expect(command.getName()).toBe("name");
        expect(command.getDescription().length).toBeGreaterThan(0);
    });

    it("defaults to a single name via generateUnique(1, {})", async () => {
        const generator = createStubGenerator();
        const command = new NameCommand(generator);

        const exitCode = await command.run([]);

        expect(exitCode).toBe(0);
        expect(generator.calledWith).toEqual({count: 1, request: {seed: undefined, theme: undefined, wordCount: undefined}});
        expect(logSpy.mock.calls.map((call) => call[0]).join("\n")).toContain("Name 0");
    });

    it("passes --count through to generateUnique", async () => {
        const generator = createStubGenerator();
        const command = new NameCommand(generator);

        await command.run(["--count", "3"]);

        expect(generator.calledWith?.count).toBe(3);
        const printed = logSpy.mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("Name 0");
        expect(printed).toContain("Name 1");
        expect(printed).toContain("Name 2");
        expect(printed).toContain("--count 3");
    });

    it("passes --theme, --words, and --seed through as a SlotGameNameRequest", async () => {
        const generator = createStubGenerator();
        const command = new NameCommand(generator);

        await command.run(["--theme", "cosmic", "--words", "3", "--seed", "42"]);

        expect(generator.calledWith?.request).toEqual({seed: 42, theme: "cosmic", wordCount: 3});
    });

    it("--json prints the machine-readable result array and nothing else", async () => {
        const generator = createStubGenerator();
        const command = new NameCommand(generator);

        await command.run(["--seed", "42", "--json"]);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(parsed).toEqual([{title: "Name 0", slug: "name-0-1234", packageName: "name-0", seed: 42}]);
    });

    it("default human output is deterministic for a given seed", async () => {
        const generator = createStubGenerator();

        await new NameCommand(generator).run(["--seed", "42"]);
        const first = logSpy.mock.calls.map((call) => call[0]).join("\n");
        logSpy.mockClear();

        await new NameCommand(generator).run(["--seed", "42"]);
        const second = logSpy.mock.calls.map((call) => call[0]).join("\n");

        expect(second).toBe(first);
    });

    it("rejects a non-integer --count", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--count", "abc"])).rejects.toThrow(/--count requires a positive integer/);
    });

    it("rejects a zero --count", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--count", "0"])).rejects.toThrow(/--count requires a positive integer/);
    });

    it("rejects an invalid --theme", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--theme", "bogus"])).rejects.toThrow(/--theme must be one of/);
    });

    it("rejects an invalid --words", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--words", "4"])).rejects.toThrow(/--words must be 2 or 3/);
    });

    it("rejects a non-integer --seed", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--seed", "abc"])).rejects.toThrow(/--seed requires an integer value/);
    });

    it("rejects an unknown option", async () => {
        const command = new NameCommand(createStubGenerator());

        await expect(command.run(["--bogus"])).rejects.toThrow(/Unknown option "--bogus"/);
    });

    it("propagates SlotGameNameExhaustedError from the generator", async () => {
        const generator: SlotGameNameGenerating = {
            generate: () => {
                throw new Error("should not be called");
            },
            generateUnique: () => {
                throw new Error("exhausted");
            },
        };
        const command = new NameCommand(generator);

        await expect(command.run([])).rejects.toThrow(/exhausted/);
    });
});
