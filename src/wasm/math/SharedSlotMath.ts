import {deepFreeze} from "../../internal/deepFreeze.js";
import {SHARED_MATH_KERNEL} from "./internal/SharedMathKernel.js";
export const SHARED_SLOT_MATH_VERSION = "pokie.math.v2";
export const SHARED_SLOT_MODEL_VERSION = "pokie.game.v2";
export const SHARED_SLOT_MAX_MEMORY_BYTES = 8 * 1024 * 1024;
export const SHARED_SLOT_DEFAULT_BETS = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100] as const;
export type SharedSlotMathModel = {
    readonly schemaVersion: "pokie.game.v2";
    readonly mathVersion: "pokie.math.v2";
    readonly reels: number;
    readonly rows: number;
    readonly symbols: readonly string[];
    readonly winModel: {
        readonly type: "lines" | "ways" | "clusters";
        readonly minimumClusterSize?: number;
    };
    readonly reelStrips: readonly (readonly string[])[];
    readonly paylines: readonly (readonly number[])[];
    readonly paytable: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly wilds?: readonly string[];
    readonly scatters?: readonly string[];
    readonly wildSubstitutions?: Readonly<Record<string, readonly string[]>>;
    readonly availableBets: readonly number[];
};
export function stableSlotMathJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableSlotMathJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSlotMathJson(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
/** Limits apply before allocating dense payout, result or scratch memory. */
export function assertSharedSlotMathModel(value: unknown): asserts value is SharedSlotMathModel {
    const fail = (): never => {
        throw new Error("Unsupported shared WASM math model. Limits: 64 reels, 64 rows, 1024 cells, 128 unique symbols, 1024 paylines, 65536 stops per reel, 262144 total stops and 8 MiB memory. Next: reduce the model or build a TypeScript package.");
    };
    if (!value || typeof value !== "object") fail();
    const model = value as SharedSlotMathModel;
    const supportedKeys = ["schemaVersion", "mathVersion", "reels", "rows", "symbols", "winModel", "reelStrips", "paylines", "paytable", "wilds", "scatters", "wildSubstitutions", "availableBets"];
    if (Object.keys(model).some(key => !supportedKeys.includes(key))) fail();
    const integer = (n: number, max: number): boolean => Number.isSafeInteger(n) && n > 0 && n <= max;
    if (model.schemaVersion !== SHARED_SLOT_MODEL_VERSION || model.mathVersion !== SHARED_SLOT_MATH_VERSION || "screenGeometry" in model ||
        !integer(model.reels, 64) || !integer(model.rows, 64) || model.reels * model.rows > 1024 ||
        !Array.isArray(model.symbols) || !integer(model.symbols.length, 128) || new Set(model.symbols).size !== model.symbols.length ||
        !model.symbols.every(s => typeof s === "string" && s.length > 0) ||
        !model.winModel || typeof model.winModel !== "object" || Array.isArray(model.winModel) ||
        Object.keys(model.winModel).some(key => !["type", "minimumClusterSize"].includes(key)) ||
        !["lines", "ways", "clusters"].includes(model.winModel.type) ||
        (model.winModel.minimumClusterSize !== undefined && model.winModel.type !== "clusters") ||
        (model.winModel.minimumClusterSize !== undefined && !integer(model.winModel.minimumClusterSize, 1024)) ||
        !Array.isArray(model.reelStrips) || model.reelStrips.length !== model.reels ||
        !model.reelStrips.every(strip => Array.isArray(strip) && integer(strip.length, 65536) && strip.every(s => model.symbols.includes(s))) ||
        model.reelStrips.reduce((n, strip) => n + strip.length, 0) > 262144 ||
        !Array.isArray(model.paylines) || model.paylines.length > 1024 || !model.paylines.every(line => Array.isArray(line) && line.length === model.reels && line.every(row => Number.isSafeInteger(row) && row >= 0 && row < model.rows)) ||
        !model.paytable || typeof model.paytable !== "object" || Array.isArray(model.paytable) ||
        !Object.entries(model.paytable).every(([symbol, entries]) => model.symbols.includes(symbol) && entries && typeof entries === "object" && !Array.isArray(entries) &&
            Object.entries(entries).every(([count, amount]) => Number.isSafeInteger(Number(count)) && Number(count) >= 0 && Number(count) <= model.reels * model.rows && typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) ||
        ![model.wilds, model.scatters].every(list => list === undefined || Array.isArray(list) && new Set(list).size === list.length && list.every(s => model.symbols.includes(s))) ||
        (model.wildSubstitutions !== undefined && (!model.wildSubstitutions || typeof model.wildSubstitutions !== "object" || Array.isArray(model.wildSubstitutions) ||
            !Object.entries(model.wildSubstitutions).every(([wild, targets]) => model.wilds?.includes(wild) && Array.isArray(targets) && targets.every(target => model.symbols.includes(target))))) ||
        !Array.isArray(model.availableBets) || !model.availableBets.length || !model.availableBets.every(bet => Number.isFinite(bet) && bet > 0)) fail();
}
/** Portable execution always validates; Node retains its pipeline diagnostics and opt-out. */
export function assertPlayableSharedSlotMathModel(value: unknown): asserts value is SharedSlotMathModel {
    assertSharedSlotMathModel(value);
    if (value.winModel.type === "clusters") {
        const minimum = value.winModel.minimumClusterSize ?? 5;
        const cells = value.reels * value.rows;
        if (minimum > cells) throw new Error(`cluster-grid-too-small: Cluster evaluator requires at least ${minimum} cells, but the grid has only ${cells}. Next: reduce winModel.minimumClusterSize or increase reels/rows.`);
    }
    if (value.winModel.type === "ways" && !value.symbols.some(symbol => !value.wilds?.includes(symbol) && !value.scatters?.includes(symbol))) {
        throw new Error("ways-no-payable-symbols: Ways evaluation is enabled, but the config has no payable non-wild non-scatter symbols. Next: add a non-wild non-scatter symbol to symbols or select another winModel.");
    }
}
export type SharedSlotMathLayout = {
    readonly data: Uint8Array<ArrayBuffer>;
    readonly pages: number;
    readonly stops: number;
    readonly screen: number;
    readonly results: number;
    readonly stride: number;
    readonly capacity: number;
};
/** A bounded, little-endian model image. Mutable output/scratch follows immutable data. */
export function lowerSharedSlotMath(model: SharedSlotMathModel): SharedSlotMathLayout {
    assertSharedSlotMathModel(model);
    const cells = model.reels * model.rows;
    let cursor = 120;
    const allocate = (bytes: number): number => {
        const offset = cursor;
        cursor = Math.ceil((cursor + bytes) / 8) * 8;
        return offset;
    };
    const reelTable = allocate(model.reels * 8);
    const strips = model.reelStrips.map(strip => allocate(strip.length * 4));
    const lines = allocate(model.paylines.length * model.reels * 4);
    const payouts = allocate(model.symbols.length * (cells + 1) * 8);
    const wilds = allocate(model.symbols.length * 4);
    const scatters = allocate(model.symbols.length * 4);
    const order = allocate(model.symbols.length * 4);
    const scatterOrder = allocate(model.symbols.length * 4);
    const bets = allocate(model.availableBets.length * 8);
    const substitutions = allocate(model.symbols.length * model.symbols.length * 4);
    const dataEnd = cursor;
    const stops = allocate(model.reels * 4);
    const screen = allocate(cells * 4);
    const stride = 32 + cells * 4;
    const capacity = model.paylines.length + model.symbols.length + cells;
    const results = allocate(stride * capacity);
    const positions = allocate(cells * 4);
    const visited = allocate(cells * 4);
    const stack = allocate(cells * 4);
    if (cursor > SHARED_SLOT_MAX_MEMORY_BYTES) throw new Error(`Shared WASM math needs ${cursor} bytes; the limit is 8 MiB. Next: reduce cells, paylines or symbol inventory, or build a TypeScript package.`);
    const data = new Uint8Array(dataEnd);
    const view = new DataView(data.buffer);
    const put = (offset: number, n: number): void => view.setUint32(offset, n, true);
    [model.reels, model.rows, model.symbols.length, ["lines", "ways", "clusters"].indexOf(model.winModel.type), model.winModel.minimumClusterSize ?? 5, model.paylines.length,
        reelTable, lines, payouts, wilds, scatters, stops, screen, results, stride, positions, visited, stack].forEach((n, i) => put(i * 4, n));
    put(88, capacity);
    put(92, cells);
    put(96, cursor);
    put(100, order);
    put(104, model.availableBets.length);
    put(108, bets);
    put(112, scatterOrder);
    put(116, substitutions);
    model.availableBets.forEach((bet, i) => view.setFloat64(bets + i * 8, bet, true));
    model.reelStrips.forEach((strip, reel) => {
        put(reelTable + reel * 8, strip.length);
        put(reelTable + reel * 8 + 4, strips[reel]);
        strip.forEach((symbol, i) => put(strips[reel] + i * 4, model.symbols.indexOf(symbol)));
    });
    model.paylines.flat().forEach((row, i) => put(lines + i * 4, row));
    model.symbols.forEach((symbol, i) => {
        put(wilds + i * 4, model.wilds?.includes(symbol) ? 1 : 0);
        put(scatters + i * 4, model.scatters?.includes(symbol) ? 1 : 0);
        model.symbols.forEach((target, j) => put(substitutions + (i * model.symbols.length + j) * 4,
            model.wilds?.includes(symbol) && (model.wildSubstitutions?.[symbol] === undefined || model.wildSubstitutions[symbol].includes(target)) ? 1 : 0));
        for (const [count, amount] of Object.entries(model.paytable[symbol] ?? {})) view.setFloat64(payouts + (i * (cells + 1) + Number(count)) * 8, amount, true);
    });
    // Object.values() in the existing component adapters enumerates integer keys first.
    Object.keys(Object.fromEntries(model.symbols.map(symbol => [symbol, true]))).forEach((symbol, i) => put(order + i * 4, model.symbols.indexOf(symbol)));
    const orderedScatters = Object.keys(Object.fromEntries((model.scatters ?? []).map(symbol => [symbol, true])));
    [...orderedScatters, ...model.symbols.filter(symbol => !orderedScatters.includes(symbol))].forEach((symbol, i) => put(scatterOrder + i * 4, model.symbols.indexOf(symbol)));
    return {data, pages: Math.ceil(cursor / 65536), stops, screen, results, stride, capacity};
}
function leb(value: number): number[] {
    const bytes: number[] = [];
    do {
        const byte = value % 128;
        value = Math.floor(value / 128);
        bytes.push(byte + (value ? 128 : 0));
    } while (value);
    return bytes;
}
function section(id: number, data: Uint8Array | readonly number[]): Uint8Array<ArrayBuffer> {
    return new Uint8Array([id, ...leb(data.length), ...data]);
}
export function sharedSlotCustomSection(name: string, value: string): Uint8Array<ArrayBuffer> {
    const nameBytes = new TextEncoder().encode(name);
    return section(0, [...leb(nameBytes.length), ...nameBytes, ...new TextEncoder().encode(value)]);
}
function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    parts.forEach(part => {
        out.set(part, offset);
        offset += part.length;
    });
    return out;
}
/** Exact code and memory image are reproducible from the versioned lowering contract. */
export function compileSharedSlotMath(model: SharedSlotMathModel): Uint8Array<ArrayBuffer> {
    const layout = lowerSharedSlotMath(model);
    const parts = [SHARED_MATH_KERNEL.slice(0, 8)];
    let cursor = 8;
    while (cursor < SHARED_MATH_KERNEL.length) {
        const start = cursor;
        const id = SHARED_MATH_KERNEL[cursor++];
        let size = 0,
            factor = 1,
            byte: number;
        do {
            byte = SHARED_MATH_KERNEL[cursor++];
            size += (byte & 127) * factor;
            factor *= 128;
        } while (byte & 128);
        cursor += size;
        parts.push(id === 5 ? section(5, [1, 1, ...leb(layout.pages), ...leb(layout.pages)]) : SHARED_MATH_KERNEL.slice(start, cursor));
    }
    parts.push(section(11, [1, 0, 0x41, 0, 0x0b, ...leb(layout.data.length), ...layout.data]));
    return concat(parts);
}
export function compileSharedSlotArtifact(model: SharedSlotMathModel, descriptor: unknown): Uint8Array<ArrayBuffer> {
    return concat([compileSharedSlotMath(model), sharedSlotCustomSection(SHARED_SLOT_MODEL_VERSION, stableSlotMathJson(model)), sharedSlotCustomSection("pokie.component.v2", stableSlotMathJson(descriptor))]);
}
export type SharedSlotMathComponent = {
    readonly kind: number;
    readonly symbol: string;
    readonly id: number;
    readonly positions: number[][];
    readonly ways: number;
    readonly amount: number;
};
export type SharedSlotMathResult = {
    readonly stops: readonly number[];
    readonly screen: readonly (readonly string[])[];
    readonly payout: number;
    readonly components: readonly SharedSlotMathComponent[];
};
/** Output validation is independent of caller input; no modulo repair or packed shifts. */
export function readSharedSlotMathResult(instance: WebAssembly.Instance, model: SharedSlotMathModel, payout: unknown, layout = lowerSharedSlotMath(model)): SharedSlotMathResult {
    const memory = instance.exports.memory;
    if (!(memory instanceof WebAssembly.Memory) || memory.buffer.byteLength !== layout.pages * 65536 || typeof payout !== "number" || !Number.isFinite(payout) || payout < 0) throw new Error("Malformed shared WASM math memory/result.");
    const view = new DataView(memory.buffer);
    const get = (p: number): number => view.getUint32(p, true);
    if (!layout.data.every((byte, i) => i >= 72 && i < 88 || byte === view.getUint8(i))) throw new Error("Shared WASM math modified its immutable model/layout.");
    const stops = model.reelStrips.map((strip, i) => {
        const stop = get(layout.stops + i * 4);
        if (stop >= strip.length) throw new Error("Shared WASM math returned an out-of-range reel stop.");
        return stop;
    });
    const screen = model.reelStrips.map((strip, reel) => Array.from({length: model.rows}, (_, row) => {
        const symbol = model.symbols[get(layout.screen + (reel * model.rows + row) * 4)];
        if (symbol === undefined) throw new Error("Shared WASM math returned an invalid screen symbol.");
        return symbol;
    }));
    const count = get(72);
    if (count > layout.capacity) throw new Error("Shared WASM math returned too many components.");
    const components = Array.from({length: count}, (_, i) => {
        const p = layout.results + i * layout.stride;
        const kind = get(p),
            symbol = model.symbols[get(p + 4)],
            id = get(p + 8),
            size = get(p + 12);
        const ways = view.getFloat64(p + 16, true),
            amount = view.getFloat64(p + 24, true);
        if (kind > 3 || symbol === undefined || size > model.reels * model.rows || !Number.isFinite(ways) || !Number.isFinite(amount) || amount <= 0) throw new Error("Malformed shared WASM math component.");
        const positions = Array.from({length: size}, (_, j) => {
            const cell = get(p + 32 + j * 4);
            if (cell >= model.reels * model.rows) throw new Error("Shared WASM math returned an invalid position.");
            return [Math.floor(cell / model.rows), cell % model.rows];
        });
        return {kind, symbol, id, positions, ways, amount};
    });
    if (components.reduce((sum, item) => sum + item.amount, 0) !== payout) throw new Error("Shared WASM math returned an inconsistent total.");
    return {stops, screen, payout, components};
}
export interface SharedSlotMathCalculating {
    readonly model: SharedSlotMathModel;
    evaluate(screen: readonly (readonly string[])[], bet: number): SharedSlotMathResult;
}

/** Synchronous public calculation boundary used by generated Node calculators. */
export class SharedSlotMath implements SharedSlotMathCalculating {
    public readonly model: SharedSlotMathModel;
    private readonly instance: WebAssembly.Instance;
    private readonly layout: SharedSlotMathLayout;
    private disposed = false;
    public constructor(model: SharedSlotMathModel) {
        this.model = deepFreeze(JSON.parse(JSON.stringify(model)) as SharedSlotMathModel);
        this.layout = lowerSharedSlotMath(this.model);
        this.instance = new WebAssembly.Instance(new WebAssembly.Module(compileSharedSlotMath(this.model)), {pokie: {"next_random": () => {
            throw new Error("Screen evaluation does not request RNG.");
        }}});
    }
    public dispose(): void {
        this.disposed = true;
        new Uint8Array((this.instance.exports.memory as WebAssembly.Memory).buffer).fill(0);
    }
    public evaluate(screen: readonly (readonly string[])[], bet: number): SharedSlotMathResult {
        if (this.disposed) throw new Error("Shared WASM math was disposed.");
        if (!this.model.availableBets.includes(bet) || screen.length !== this.model.reels || !screen.every(reel => reel.length === this.model.rows && reel.every(symbol => this.model.symbols.includes(symbol)))) throw new Error("Shared math requires an available bet and a reel-major screen matching its model.");
        const memory = this.instance.exports.memory as WebAssembly.Memory;
        const view = new DataView(memory.buffer);
        screen.flat().forEach((symbol, i) => view.setUint32(this.layout.screen + i * 4, this.model.symbols.indexOf(symbol), true));
        const payout = (this.instance.exports.evaluate as (bet: number) => number)(bet);
        return readSharedSlotMathResult(this.instance, this.model, payout, this.layout);
    }
}
