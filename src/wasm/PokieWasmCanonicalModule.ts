import {assessWasmComponentCompatibility} from "../project/wasm/assessWasmComponentCompatibility.js";
import {satisfiesMinimumSemverLite} from "../project/wasm/internal/compareSemverLite.js";
import {POKIE_WASM_ABI_VERSION, POKIE_WASM_ADAPTER, type PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {POKIE_WASM_RUNTIME_VERSION} from "./PokieWasmRuntimeApi.js";

export const POKIE_WASM_IMPORT_MODULE = "pokie";
export const POKIE_WASM_RANDOM_IMPORT = "next_random";
export const POKIE_WASM_PLAY_EXPORT = "play";
export const POKIE_WASM_GAME_MODEL_SECTION = "pokie.game.v1";
export const POKIE_WASM_COMPONENT_DESCRIPTOR_SECTION = "pokie.component.v1";

export const POKIE_WASM_SESSION_SERIALIZATION = "pokie.session.v1";
export const POKIE_WASM_PLAY_SERIALIZATION = "pokie.play.v1";
export const POKIE_WASM_STATE_SERIALIZATION = "pokie.state.v1";
export const POKIE_WASM_RNG_PROTOCOL = "pokie.rng.v1";
export const POKIE_WASM_RUNTIME_PLAY_DECLARATION = "runtime.play";
export const POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION = "runtime.serialize";
export const POKIE_WASM_RUNTIME_REPLAY_DECLARATION = "runtime.replay";
export const POKIE_WASM_ARTIFACT_INSPECT_DECLARATION = "artifact.inspect";

/**
 * The byte-embedded half of a runnable component's contract.  The sidecar
 * retains the byte hash and byte count because either value would make a
 * self-referential WASM payload; every other runnable declaration is carried
 * in these exact bytes and must agree with the sidecar before use.
 */
export type CanonicalPokieWasmComponentDescriptor = {
    readonly schemaVersion: string;
    readonly component: {readonly id: string; readonly version: string};
    readonly minPokieVersion?: string;
    readonly serialization: {readonly session: string; readonly play: string; readonly state: string};
    readonly host: {readonly rng: string; readonly services: readonly string[]};
    readonly capabilities: readonly string[];
    readonly artifact: {
        readonly format: "pokie.wasm.v1";
        readonly abiVersion: string;
        readonly adapter: string;
        readonly configurationHash: string;
    };
};

export type PokieWasmGameModel = {
    readonly schemaVersion: "pokie.game.v1";
    readonly reels: number;
    readonly rows: number;
    readonly reelStrips: readonly (readonly string[])[];
    readonly paylines: readonly (readonly number[])[];
    readonly paytable: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly stopWidths: readonly number[];
    readonly wilds?: readonly string[];
    readonly scatters?: readonly string[];
    readonly availableBets?: readonly number[];
};

export type CanonicalPokieWasmModule = {
    readonly module: WebAssembly.Module;
    readonly model: PokieWasmGameModel;
    readonly modelBytes: Uint8Array<ArrayBuffer>;
    readonly descriptor: CanonicalPokieWasmComponentDescriptor;
    readonly descriptorBytes: Uint8Array<ArrayBuffer>;
};

/**
 * Checks the host and wire contract which this portable runtime actually
 * implements.  Manifest shape compatibility is deliberately not enough: an
 * artifact that asks for a different serializer, RNG protocol, or service
 * would otherwise be accepted and run with invented host behaviour.
 */
export function describeUnsupportedCanonicalWasmRuntimeContract(manifest: Pick<PokieWasmComponentManifest, "serialization" | "host">): string | undefined {
    if (manifest.serialization.session !== POKIE_WASM_SESSION_SERIALIZATION ||
        manifest.serialization.play !== POKIE_WASM_PLAY_SERIALIZATION ||
        manifest.serialization.state !== POKIE_WASM_STATE_SERIALIZATION) {
        return `unsupported serialization identifiers; canonical POKIE WASM requires session=${POKIE_WASM_SESSION_SERIALIZATION}, play=${POKIE_WASM_PLAY_SERIALIZATION}, and state=${POKIE_WASM_STATE_SERIALIZATION}`;
    }
    if (manifest.host.rng !== POKIE_WASM_RNG_PROTOCOL) {
        return `unsupported RNG protocol ${JSON.stringify(manifest.host.rng)}; canonical POKIE WASM requires ${POKIE_WASM_RNG_PROTOCOL}`;
    }
    if (manifest.host.services.length > 0) {
        return `unsupported required host service${manifest.host.services.length === 1 ? "" : "s"} ${manifest.host.services.map((service) => JSON.stringify(service)).join(", ")}; this portable runtime provides no services beyond ${POKIE_WASM_RNG_PROTOCOL}`;
    }
    return undefined;
}

export function assertSupportedCanonicalWasmRuntimeContract(manifest: Pick<PokieWasmComponentManifest, "serialization" | "host">): void {
    const reason = describeUnsupportedCanonicalWasmRuntimeContract(manifest);
    if (reason !== undefined) throw new Error(`POKIE WASM artifact cannot execute: ${reason}.`);
}

export function hasCanonicalWasmOperationDeclaration(manifest: Pick<PokieWasmComponentManifest, "capabilities">, declaration: string): boolean {
    return manifest.capabilities.includes(declaration);
}

/**
 * Narrows a BufferSource to precisely the caller-supplied view.  In
 * particular, a Uint8Array may be a window onto a larger backing buffer;
 * integrity checks must never include the bytes outside that window.
 */
export function canonicalWasmByteView(bytes: BufferSource): Uint8Array<ArrayBuffer> {
    return bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

/** Computes a browser-safe SHA-256 over exactly the supplied byte view. */
export async function sha256CanonicalWasmBytes(bytes: BufferSource): Promise<string> {
    const view = canonicalWasmByteView(bytes);
    // Copy the view so SubtleCrypto never observes unrelated bytes from an
    // oversized Buffer/typed-array backing store.
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(view));
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Ensures that all embedded declarations exactly bind to the sidecar. */
export function assertCanonicalWasmDescriptorMatchesManifest(descriptor: CanonicalPokieWasmComponentDescriptor, manifest: PokieWasmComponentManifest): void {
    const artifact = manifest.artifact;
    if (artifact === undefined || descriptor.schemaVersion !== manifest.schemaVersion || descriptor.component.id !== manifest.component.id ||
        descriptor.component.version !== manifest.component.version || descriptor.minPokieVersion !== manifest.minPokieVersion ||
        descriptor.serialization.session !== manifest.serialization.session || descriptor.serialization.play !== manifest.serialization.play ||
        descriptor.serialization.state !== manifest.serialization.state || descriptor.host.rng !== manifest.host.rng ||
        JSON.stringify(descriptor.host.services) !== JSON.stringify(manifest.host.services) || JSON.stringify(descriptor.capabilities) !== JSON.stringify(manifest.capabilities) ||
        descriptor.artifact.format !== artifact.format || descriptor.artifact.abiVersion !== artifact.abiVersion ||
        descriptor.artifact.adapter !== artifact.adapter || descriptor.artifact.configurationHash !== artifact.configurationHash) {
        throw new Error("the canonical component descriptor embedded in the WASM module does not agree with its manifest");
    }
}

function isPositiveSafeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isGameModel(value: unknown): value is PokieWasmGameModel {
    if (typeof value !== "object" || value === null) return false;
    const model = value as Partial<PokieWasmGameModel>;
    if (model.schemaVersion !== "pokie.game.v1" || !isPositiveSafeInteger(model.reels) || !isPositiveSafeInteger(model.rows) ||
        !Array.isArray(model.reelStrips) || model.reelStrips.length !== model.reels || !Array.isArray(model.paylines) ||
        !Array.isArray(model.stopWidths) || model.stopWidths.length !== model.reels) return false;
    if (!model.reelStrips.every((strip) => Array.isArray(strip) && strip.length > 0 && strip.every((symbol) => typeof symbol === "string" && symbol.length > 0))) return false;
    if (!model.stopWidths.every((width, index) => isPositiveSafeInteger(width) && width <= 30 && model.reelStrips![index].length <= (1 << width))) return false;
    if (!model.paylines.every((line) => Array.isArray(line) && line.length === model.reels && line.every((row) => Number.isSafeInteger(row) && row >= 0 && row < model.rows!))) return false;
    if (typeof model.paytable !== "object" || model.paytable === null) return false;
    if (!Object.values(model.paytable).every((wins) => typeof wins === "object" && wins !== null && Object.values(wins).every((multiplier) => typeof multiplier === "number" && Number.isFinite(multiplier)))) return false;
    if (model.wilds !== undefined && (!Array.isArray(model.wilds) || !model.wilds.every((symbol) => typeof symbol === "string" && symbol.length > 0))) return false;
    if (model.scatters !== undefined && (!Array.isArray(model.scatters) || !model.scatters.every((symbol) => typeof symbol === "string" && symbol.length > 0))) return false;
    return model.availableBets === undefined || (Array.isArray(model.availableBets) && model.availableBets.length > 0 && model.availableBets.every((bet) => typeof bet === "number" && Number.isFinite(bet) && bet > 0));
}

function isCanonicalDescriptor(value: unknown): value is CanonicalPokieWasmComponentDescriptor {
    if (typeof value !== "object" || value === null) return false;
    const descriptor = value as Partial<CanonicalPokieWasmComponentDescriptor>;
    return typeof descriptor.schemaVersion === "string" && typeof descriptor.component?.id === "string" && typeof descriptor.component.version === "string" &&
        (descriptor.minPokieVersion === undefined || typeof descriptor.minPokieVersion === "string") &&
        typeof descriptor.serialization?.session === "string" && typeof descriptor.serialization.play === "string" && typeof descriptor.serialization.state === "string" &&
        typeof descriptor.host?.rng === "string" && Array.isArray(descriptor.host.services) && descriptor.host.services.every((service) => typeof service === "string") &&
        Array.isArray(descriptor.capabilities) && descriptor.capabilities.every((capability) => typeof capability === "string") &&
        descriptor.artifact?.format === "pokie.wasm.v1" && typeof descriptor.artifact.abiVersion === "string" &&
        typeof descriptor.artifact.adapter === "string" && typeof descriptor.artifact.configurationHash === "string";
}

type FunctionSignature = {readonly parameters: readonly number[]; readonly results: readonly number[]};

function readUnsignedLeb(bytes: Uint8Array, cursor: {value: number}): number {
    let result = 0;
    let shift = 0;
    for (let count = 0; count < 5; count++) {
        const byte = bytes[cursor.value++];
        if (byte === undefined) throw new Error("POKIE WASM artifact has a truncated binary section.");
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return result >>> 0;
        shift += 7;
    }
    throw new Error("POKIE WASM artifact has an invalid unsigned integer.");
}

function readName(bytes: Uint8Array, cursor: {value: number}): string {
    const length = readUnsignedLeb(bytes, cursor);
    const end = cursor.value + length;
    if (end > bytes.length) throw new Error("POKIE WASM artifact has a truncated name.");
    const name = new TextDecoder().decode(bytes.slice(cursor.value, end));
    cursor.value = end;
    return name;
}

/** Reads enough of the binary type/index sections to reject ABI lookalikes. */
function readCanonicalFunctionSignatures(bytes: Uint8Array): {readonly nextRandom: FunctionSignature; readonly play: FunctionSignature} {
    const cursor = {value: 8};
    const types: FunctionSignature[] = [];
    const imports: {readonly module: string; readonly name: string; readonly typeIndex: number}[] = [];
    const functionTypeIndices: number[] = [];
    const exports: {readonly name: string; readonly index: number}[] = [];
    while (cursor.value < bytes.length) {
        const id = bytes[cursor.value++];
        if (id === undefined) break;
        const size = readUnsignedLeb(bytes, cursor);
        const end = cursor.value + size;
        if (end > bytes.length) throw new Error("POKIE WASM artifact has a truncated binary section.");
        const section = bytes.slice(cursor.value, end);
        cursor.value = end;
        const sectionCursor = {value: 0};
        if (id === 1) {
            const count = readUnsignedLeb(section, sectionCursor);
            for (let index = 0; index < count; index++) {
                if (section[sectionCursor.value++] !== 0x60) throw new Error("POKIE WASM artifact has an unsupported function type.");
                const parameterCount = readUnsignedLeb(section, sectionCursor);
                const parameters = Array.from({length: parameterCount}, () => {
                    const value = section[sectionCursor.value++];
                    if (value === undefined) throw new Error("POKIE WASM artifact has a truncated function type.");
                    return value;
                });
                const resultCount = readUnsignedLeb(section, sectionCursor);
                const results = Array.from({length: resultCount}, () => {
                    const value = section[sectionCursor.value++];
                    if (value === undefined) throw new Error("POKIE WASM artifact has a truncated function type.");
                    return value;
                });
                types.push({parameters, results});
            }
        } else if (id === 2) {
            const count = readUnsignedLeb(section, sectionCursor);
            for (let index = 0; index < count; index++) {
                const module = readName(section, sectionCursor);
                const name = readName(section, sectionCursor);
                const kind = section[sectionCursor.value++];
                if (kind !== 0x00) throw new Error("POKIE WASM artifact has unsupported non-function host imports.");
                imports.push({module, name, typeIndex: readUnsignedLeb(section, sectionCursor)});
            }
        } else if (id === 3) {
            const count = readUnsignedLeb(section, sectionCursor);
            for (let index = 0; index < count; index++) functionTypeIndices.push(readUnsignedLeb(section, sectionCursor));
        } else if (id === 7) {
            const count = readUnsignedLeb(section, sectionCursor);
            for (let index = 0; index < count; index++) {
                const name = readName(section, sectionCursor);
                const kind = section[sectionCursor.value++];
                const itemIndex = readUnsignedLeb(section, sectionCursor);
                if (kind === 0x00) exports.push({name, index: itemIndex});
            }
        }
        if (sectionCursor.value !== section.length && id !== 0 && id !== 4 && id !== 5 && id !== 6 && id !== 8 && id !== 9 && id !== 10 && id !== 11 && id !== 12) {
            throw new Error("POKIE WASM artifact has trailing bytes in a canonical ABI section.");
        }
    }
    const nextRandomImport = imports.find((entry) => entry.module === "pokie" && entry.name === "next_random");
    const playExport = exports.find((entry) => entry.name === "play");
    if (nextRandomImport === undefined || playExport === undefined) throw new Error("POKIE WASM artifact is missing its canonical ABI bindings.");
    const nextRandom = types[nextRandomImport.typeIndex];
    const playTypeIndex = functionTypeIndices[playExport.index - imports.length];
    const play = types[playTypeIndex];
    if (nextRandom === undefined || play === undefined) throw new Error("POKIE WASM artifact has an invalid canonical ABI type index.");
    return {nextRandom, play};
}

function hasSignature(signature: FunctionSignature, parameters: readonly number[], results: readonly number[]): boolean {
    return signature.parameters.length === parameters.length && signature.results.length === results.length &&
        signature.parameters.every((value, index) => value === parameters[index]) && signature.results.every((value, index) => value === results[index]);
}

/** Validates the executable ABI shared by resolution, readback, and runtime instantiation. */
export function readCanonicalPokieWasmModule(bytes: BufferSource): CanonicalPokieWasmModule {
    const binary = canonicalWasmByteView(bytes);
    if (!WebAssembly.validate(binary)) throw new Error("The WASM module is malformed or is not a WebAssembly binary.");
    const module = new WebAssembly.Module(binary);
    const imports = WebAssembly.Module.imports(module);
    if (imports.length !== 1 || imports[0].module !== POKIE_WASM_IMPORT_MODULE || imports[0].name !== POKIE_WASM_RANDOM_IMPORT || imports[0].kind !== "function") {
        throw new Error(`POKIE WASM artifact has unsupported host imports; canonical artifacts require ${POKIE_WASM_IMPORT_MODULE}.${POKIE_WASM_RANDOM_IMPORT} only.`);
    }
    if (!WebAssembly.Module.exports(module).some((entry) => entry.name === POKIE_WASM_PLAY_EXPORT && entry.kind === "function")) {
        throw new Error(`POKIE WASM artifact is missing its canonical ${POKIE_WASM_PLAY_EXPORT} export.`);
    }
    const signatures = readCanonicalFunctionSignatures(binary);
    if (!hasSignature(signatures.nextRandom, [], [0x7f])) {
        throw new Error(`POKIE WASM artifact has an invalid ${POKIE_WASM_IMPORT_MODULE}.${POKIE_WASM_RANDOM_IMPORT} signature; canonical artifacts require () -> i32.`);
    }
    if (!hasSignature(signatures.play, [], [0x7f])) {
        throw new Error(`POKIE WASM artifact has an invalid ${POKIE_WASM_PLAY_EXPORT} signature; canonical artifacts require () -> i32.`);
    }
    const sections = WebAssembly.Module.customSections(module, POKIE_WASM_GAME_MODEL_SECTION);
    if (sections.length !== 1) throw new Error(`POKIE WASM artifact must contain exactly one ${POKIE_WASM_GAME_MODEL_SECTION} game model section.`);
    const modelBytes = new Uint8Array(sections[0]);
    let model: unknown;
    try {
        model = JSON.parse(new TextDecoder().decode(modelBytes));
    } catch {
        throw new Error("POKIE WASM artifact has a malformed game model section.");
    }
    if (!isGameModel(model)) throw new Error("POKIE WASM artifact has an unsupported game model section.");
    const descriptorSections = WebAssembly.Module.customSections(module, POKIE_WASM_COMPONENT_DESCRIPTOR_SECTION);
    if (descriptorSections.length !== 1) throw new Error(`POKIE WASM artifact must contain exactly one ${POKIE_WASM_COMPONENT_DESCRIPTOR_SECTION} component descriptor section.`);
    const descriptorBytes = new Uint8Array(descriptorSections[0]);
    let descriptor: unknown;
    try {
        descriptor = JSON.parse(new TextDecoder().decode(descriptorBytes));
    } catch {
        throw new Error("POKIE WASM artifact has a malformed component descriptor section.");
    }
    if (!isCanonicalDescriptor(descriptor)) throw new Error("POKIE WASM artifact has an unsupported component descriptor section.");
    return {module, model, modelBytes, descriptor, descriptorBytes};
}

/**
 * Reads and validates the portable executable boundary used by file
 * resolution, manifest readback, and direct browser-safe instantiation.
 */
export async function readIntegrityBoundCanonicalPokieWasmArtifact(bytes: BufferSource, manifest: PokieWasmComponentManifest): Promise<CanonicalPokieWasmModule> {
    const compatibility = assessWasmComponentCompatibility(manifest);
    if (!compatibility.compatible) {
        throw new Error(`POKIE WASM manifest is incompatible: ${compatibility.issues.map((issue) => issue.message).join(" ")}`);
    }
    const artifact = manifest.artifact;
    if (artifact === undefined) throw new Error("This is a legacy sidecar-only WASM component and is inspection-only; build a canonical POKIE WASM artifact to run it.");
    if (manifest.minPokieVersion !== undefined && !satisfiesMinimumSemverLite(POKIE_WASM_RUNTIME_VERSION, manifest.minPokieVersion)) {
        throw new Error(`POKIE WASM runtime ${POKIE_WASM_RUNTIME_VERSION} cannot run this artifact because it requires POKIE ${manifest.minPokieVersion} or newer.`);
    }
    if (artifact.format !== "pokie.wasm.v1" || artifact.adapter !== POKIE_WASM_ADAPTER) throw new Error(`Unsupported POKIE WASM adapter "${artifact.adapter}".`);
    if (artifact.abiVersion !== POKIE_WASM_ABI_VERSION) {
        throw new Error(`Unsupported POKIE WASM ABI "${artifact.abiVersion}"; this runtime requires POKIE WASM ABI "${POKIE_WASM_ABI_VERSION}".`);
    }
    const view = canonicalWasmByteView(bytes);
    if (view.byteLength !== artifact.bytes) {
        throw new Error(`POKIE WASM artifact byte count ${view.byteLength} does not match manifest artifact.bytes ${artifact.bytes}.`);
    }
    if (await sha256CanonicalWasmBytes(view) !== artifact.sha256) {
        throw new Error("POKIE WASM artifact SHA-256 does not match its manifest.");
    }
    const canonical = readCanonicalPokieWasmModule(view);
    if (await sha256CanonicalWasmBytes(canonical.modelBytes) !== artifact.configurationHash) {
        throw new Error("POKIE WASM embedded game configuration hash does not match its manifest.");
    }
    assertCanonicalWasmDescriptorMatchesManifest(canonical.descriptor, manifest);
    // The immutable module declaration is the authoritative source for a
    // runnable artifact.  Bind the sidecar to it before rejecting a runtime
    // contract: otherwise an edited sidecar can obscure the useful integrity
    // diagnostic with a host-protocol or serialization error.
    assertSupportedCanonicalWasmRuntimeContract(manifest);
    return canonical;
}
