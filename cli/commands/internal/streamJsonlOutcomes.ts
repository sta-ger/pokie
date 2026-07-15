import fs from "fs";
import readline from "readline";
import {WeightedOutcomeInput} from "pokie";

// Streams "filePath" (one canonical-JSON `{"id": string, "weight": number, "artifact": object}` outcome per
// line, NOT wrapped in a WeightedOutcomeLibrary object) via Node's readline over a read stream — so
// "pokie outcomelibrary build" can feed a mode straight into OutcomeLibraryBundleWriter without ever holding
// more than one outcome in memory at once, the CLI counterpart to the writer's own end-to-end streaming (see
// docs/outcome-library-bundle.md). This is deliberately a plain JSONL file of outcomes, not a JSON array inside
// a wrapper object: parsing a streamed top-level JSON array without ever materializing it would need a real
// streaming JSON parser, which this project doesn't have — JSONL sidesteps that entirely, one line, one
// JSON.parse call, at a time (the exact same technique the bundle's own outcomes files already use).
export async function *streamJsonlOutcomes(filePath: string): AsyncGenerator<WeightedOutcomeInput> {
    const stream = fs.createReadStream(filePath, {encoding: "utf-8"});
    const rl = readline.createInterface({input: stream, crlfDelay: Infinity});
    try {
        let position = 0;
        for await (const line of rl) {
            if (line.length === 0) {
                continue;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch (error) {
                throw new Error(`"${filePath}": line ${position} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                typeof (parsed as {id?: unknown}).id !== "string" ||
                typeof (parsed as {weight?: unknown}).weight !== "number" ||
                typeof (parsed as {artifact?: unknown}).artifact !== "object" ||
                (parsed as {artifact?: unknown}).artifact === null
            ) {
                throw new Error(`"${filePath}": line ${position} is not {"id": string, "weight": number, "artifact": object}.`);
            }
            yield parsed as WeightedOutcomeInput;
            position++;
        }
    } finally {
        rl.close();
        stream.destroy();
    }
}
