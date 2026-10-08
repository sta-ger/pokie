import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import type {StakeEngineOutcomeSourceReadResult} from "pokie";

export const UINT64_MAX = BigInt("18446744073709551615");
export const RARE_PROBABILITY = 2 ** -64;

export function rareStakeSource(): StakeEngineOutcomeSourceReadResult {
    return {stakeDir: "/rare-stake", issues: [], modes: [{modeName: "base", cost: 1, outcomes: [
        {id: 0, weight: UINT64_MAX, payoutMultiplier: 0, ratio: 0, events: []},
        {id: 1, weight: 1, payoutMultiplier: 200, ratio: 2, events: [{index: 0, type: "bonus"}, {index: 1, type: "bonus"}]},
    ]}]};
}

// A real manifest-less third-party directory. Payouts/IDs are safe numbers; only weights use UInt64.
export function writeRareStakeDirectory(dir: string, winPayout = 200): void {
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes: [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]}));
    fs.writeFileSync(path.join(dir, "lookup.csv"), `0,18446744073709551615,0\n1,1,${winPayout}\n`);
    const books = [{id: 0, payoutMultiplier: 0, events: []}, {id: 1, payoutMultiplier: winPayout, events: [{index: 0, type: "bonus"}, {index: 1, type: "bonus"}]}];
    fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(books.map((book) => JSON.stringify(book)).join("\n") + "\n")));
}

export function expectRelative(actual: number, expected: number): void {
    expect(Number.isFinite(actual)).toBe(true);
    expect(actual).toBeGreaterThan(0);
    expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(1e-12);
}

export function expectRareMetrics(metrics: {rtp: number; hitFrequency: number; maxWinProbability: number; variance: number; standardDeviation: number}): void {
    expectRelative(metrics.hitFrequency, RARE_PROBABILITY);
    expectRelative(metrics.maxWinProbability, RARE_PROBABILITY);
    expectRelative(metrics.rtp, 2 * RARE_PROBABILITY);
    expectRelative(metrics.variance, 4 * RARE_PROBABILITY * (1 - RARE_PROBABILITY));
    expectRelative(metrics.standardDeviation, 2 ** -31);
    expectRelative(metrics.standardDeviation ** 2, metrics.variance);
}

export async function withRareStakeDirectory(run: (dir: string) => Promise<void>): Promise<void> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p9-03-"));
    const dir = path.join(root, "stake");
    try {
        writeRareStakeDirectory(dir);
        await run(dir);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
}

// Project resolution intentionally requires recognized POKIE provenance; standalone readers do not.
export function markRecognizedStakeProject(dir: string): void {
    fs.writeFileSync(path.join(dir, "pokie-manifest.json"), JSON.stringify({generatedBy: "pokie stakeengine export", generatedAt: new Date(0).toISOString()}));
}
