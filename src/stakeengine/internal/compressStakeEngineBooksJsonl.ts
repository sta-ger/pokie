import zlib from "zlib";
import type {StakeEngineBookLine} from "../StakeEngineBookLine.js";

// Renders a mode's book lines as JSONL (one JSON object per line, trailing newline) and zstd-compresses the
// result, matching Stake Engine's required "<name>.jsonl.zst" books format (see
// https://stakeengine.github.io/math-sdk/rgs_docs/data_format/). Uses Node's native zlib zstd support
// (available since Node 22.15/23.8, and unconditionally in the Node 24 this project targets) rather than adding
// a third-party zstd dependency.
export function compressStakeEngineBooksJsonl(bookLines: readonly StakeEngineBookLine[]): Buffer {
    const jsonl = bookLines.map((line) => JSON.stringify(line)).join("\n") + (bookLines.length > 0 ? "\n" : "");
    return zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8"));
}
