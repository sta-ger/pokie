import type {StakeEngineBookLine} from "../StakeEngineBookLine.js";
import {compressZstdSync} from "./zstd.js";

// Renders a mode's book lines as JSONL (one JSON object per line, trailing newline) and zstd-compresses the
// result, matching Stake Engine's required "<name>.jsonl.zst" books format (see
// https://stakeengine.github.io/math-sdk/rgs_docs/data_format/). Native zstd is used where available;
// older Node runtimes write a standards-compliant raw-block frame instead.
export function compressStakeEngineBooksJsonl(bookLines: readonly StakeEngineBookLine[]): Buffer {
    const jsonl = bookLines.map((line) => JSON.stringify(line)).join("\n") + (bookLines.length > 0 ? "\n" : "");
    return compressZstdSync(Buffer.from(jsonl, "utf-8"));
}
