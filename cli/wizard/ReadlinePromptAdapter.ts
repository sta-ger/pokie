import readline from "readline";
import type {PromptAdapting} from "./PromptAdapting.js";

// Terminal-backed PromptAdapting on top of Node's built-in readline — no extra dependency needed.
//
// Deliberately doesn't use readline's own rl.question(): question() only attaches its one-shot "line"
// listener once called, and when input isn't a live TTY (e.g. piped/scripted answers, common for
// exercising the wizard non-interactively), readline can emit several buffered "line" events
// synchronously before the next question() call has a listener attached — those lines are lost, and
// the input stream then ends and fires "close" almost immediately after, which reads as a spurious
// cancellation instead of "ran out of scripted answers". Keeping a single permanent "line" listener
// and buffering unconsumed lines (drained by ask() before ever consulting "cancelled") avoids losing
// input regardless of how many lines arrive before they're asked for.
export class ReadlinePromptAdapter implements PromptAdapting {
    private readonly rl: readline.Interface;
    private readonly output: NodeJS.WritableStream;
    private readonly bufferedLines: string[] = [];
    private cancelled = false;
    private pendingResolve: ((value: string | null) => void) | null = null;

    constructor(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout) {
        this.output = output;
        this.rl = readline.createInterface({input, output});
        this.rl.on("line", (line) => this.handleLine(line));
        this.rl.on("SIGINT", () => this.cancel());
        this.rl.on("close", () => this.cancel());
    }

    public ask(question: string): Promise<string | null> {
        this.output.write(question);

        const bufferedLine = this.bufferedLines.shift();
        if (bufferedLine !== undefined) {
            return Promise.resolve(bufferedLine);
        }
        if (this.cancelled) {
            return Promise.resolve(null);
        }

        return new Promise<string | null>((resolve) => {
            this.pendingResolve = resolve;
        });
    }

    public close(): void {
        this.rl.close();
    }

    private handleLine(line: string): void {
        if (this.pendingResolve) {
            const resolve = this.pendingResolve;
            this.pendingResolve = null;
            resolve(line);
        } else {
            this.bufferedLines.push(line);
        }
    }

    private cancel(): void {
        this.cancelled = true;
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        resolve?.(null);
    }
}
