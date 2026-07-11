import {PassThrough} from "stream";
import {ReadlinePromptAdapter} from "../../../cli/wizard/ReadlinePromptAdapter.js";

// Exercises the real Node readline plumbing (as opposed to GameBlueprintWizard.test.ts, which uses a
// canned in-memory PromptAdapting) via PassThrough streams instead of a real TTY. SIGINT itself isn't
// simulated here — that's Node's own raw-mode key detection, outside this adapter's code — but SIGINT
// and stream-close share the exact same private cancel() path in ReadlinePromptAdapter, so exercising
// cancellation via the input stream ending covers that shared logic.
describe("ReadlinePromptAdapter", () => {
    function createAdapter(): {adapter: ReadlinePromptAdapter; input: PassThrough; output: PassThrough} {
        const input = new PassThrough();
        const output = new PassThrough();
        output.on("data", () => undefined); // drain, so writes (the printed question) never back up
        return {adapter: new ReadlinePromptAdapter(input, output), input, output};
    }

    it("resolves ask() with the next line typed on the input stream", async () => {
        const {adapter, input} = createAdapter();

        const answerPromise = adapter.ask("Game id: ");
        input.write("crazy-fruits\n");

        expect(await answerPromise).toBe("crazy-fruits");
        adapter.close();
    });

    it("supports asking multiple questions in sequence", async () => {
        const {adapter, input} = createAdapter();

        const first = adapter.ask("First: ");
        input.write("one\n");
        expect(await first).toBe("one");

        const second = adapter.ask("Second: ");
        input.write("two\n");
        expect(await second).toBe("two");

        adapter.close();
    });

    it("resolves the in-flight ask() with null when the input stream ends (EOF)", async () => {
        const {adapter, input} = createAdapter();

        const answerPromise = adapter.ask("Game id: ");
        input.end();

        expect(await answerPromise).toBeNull();
    });

    it("resolves every subsequent ask() with null once cancelled, without waiting on input", async () => {
        const {adapter, input} = createAdapter();

        const first = adapter.ask("Game id: ");
        input.end();
        expect(await first).toBeNull();

        expect(await adapter.ask("Anything else: ")).toBeNull();
    });

    it("close() ends the underlying readline interface", async () => {
        const {adapter, input} = createAdapter();
        const pending = adapter.ask("Game id: ");

        adapter.close();

        expect(await pending).toBeNull();
        expect(input.destroyed).toBe(false); // close() ends readline's interface, not the raw input stream
    });
});
