import {WASM_MANIFEST_READ_CAPABILITY, type ProjectCapability} from "./ProjectCapability.js";

// The one production-readable statement of POKIE's WASM product boundary. A
// compatible sidecar makes a component inspectable; it never makes its binary
// an input to a runtime, converter, builder, or Studio export flow.
export const WASM_PRODUCT_CONTRACT = {
    kind: "POKIE WASM component",
    studioLabel: "WASM component (inspection-only)",
    capabilities: [WASM_MANIFEST_READ_CAPABILITY] as readonly ProjectCapability[],
    inspectionPurpose: "A compatible WebAssembly component whose declared manifest identity, serialization identifiers, host bindings, and capabilities POKIE can inspect.",
    inspectionBoundary: "POKIE reads the compatible sidecar manifest only; it never loads or executes the WASM binary.",
    inspectAction: {label: "Inspect this component", command: "pokie inspect <path>"},
    originalSourceRecovery: "Use the original Blueprint or POKIE game package where runnable or convertible source is required.",
} as const;

export type WasmSidecarFailure = "missing" | "malformed" | "incompatible";

// Every public entry point which encounters a WASM component before it can be
// resolved uses this wording.  Keeping the cause here is important: a missing
// sidecar is repaired differently from a malformed declaration or an older
// contract, but none of those states authorizes loading the binary.
export function describeWasmSidecarFailure(
    wasmPath: string,
    sidecarPath: string,
    failure: WasmSidecarFailure,
    detail?: string,
): string {
    const prefix = `"${wasmPath}" is a ${WASM_PRODUCT_CONTRACT.kind}`;
    const repair = wasmSidecarRepair(sidecarPath, failure);
    const cause = wasmSidecarCause(sidecarPath, failure, detail);
    return `${prefix} ${cause} ${repair} ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`;
}

function wasmSidecarRepair(sidecarPath: string, failure: WasmSidecarFailure): string {
    switch (failure) {
        case "missing":
            return `Add a valid compatible sidecar at "${sidecarPath}", then inspect its declared metadata.`;
        case "malformed":
            return `Repair the malformed sidecar at "${sidecarPath}", then inspect its declared metadata.`;
        case "incompatible":
            return `Update the incompatible sidecar at "${sidecarPath}" to this POKIE contract, then inspect its declared metadata.`;
        default:
            throw new Error(`Unknown WASM sidecar failure: ${failure}`);
    }
}

function wasmSidecarCause(sidecarPath: string, failure: WasmSidecarFailure, detail: string | undefined): string {
    const detailSuffix = detail === undefined ? "." : `: ${detail}`;
    switch (failure) {
        case "missing":
            return `but no compatible PokieWasmComponentManifest sidecar was found at "${sidecarPath}".`;
        case "malformed":
            return `but its PokieWasmComponentManifest sidecar at "${sidecarPath}" is malformed${detailSuffix}`;
        case "incompatible":
            return `but its PokieWasmComponentManifest sidecar at "${sidecarPath}" is not compatible with this POKIE build${detailSuffix}`;
        default:
            throw new Error(`Unknown WASM sidecar failure: ${failure}`);
    }
}

// This deliberately small DTO is safe to send across Studio's independently
// compiled client boundary.  It is produced here rather than recreated in a
// React label map, so a Studio row and dashboard always describe the same
// product boundary as CLI/direct-library callers.
export type WasmProductContractView = {
    readonly label: string;
    readonly manifestCapability: ProjectCapability;
    readonly manifestCapabilityLabel: string;
    readonly inspectActionLabel: string;
    readonly inspectionSummary: string;
};

export function wasmProductContractView(): WasmProductContractView {
    return {
        label: WASM_PRODUCT_CONTRACT.studioLabel,
        manifestCapability: WASM_MANIFEST_READ_CAPABILITY,
        manifestCapabilityLabel: "Inspect declared WASM component metadata",
        inspectActionLabel: WASM_PRODUCT_CONTRACT.inspectAction.label,
        inspectionSummary: `${WASM_PRODUCT_CONTRACT.inspectionPurpose} ${WASM_PRODUCT_CONTRACT.inspectionBoundary} ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`,
    };
}

export function describeUnavailableWasmComponent(): string {
    return `This ${WASM_PRODUCT_CONTRACT.kind} is unavailable for inspection because its compatible sidecar could not be resolved. Repair or add the compatible sidecar, then inspect it again. ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`;
}

export function describeWasmGameModelBoundary(): string {
    return `This project is a ${WASM_PRODUCT_CONTRACT.kind} -- only its declared manifest identity is exposed here. ${WASM_PRODUCT_CONTRACT.inspectionBoundary}`;
}

export function describeWasmPackagingPreflightNote(): string {
    return `This direct-library advisory scan does not provide a WASM build or export route. ${WASM_PRODUCT_CONTRACT.inspectionBoundary} Next: inspect a compatible component with \`pokie inspect <path>\` instead.`;
}

export function describeWasmUnsupportedOperation(operation: string): string {
    return `This ${WASM_PRODUCT_CONTRACT.kind} cannot ${operation}. ${WASM_PRODUCT_CONTRACT.inspectionBoundary} ` +
        `Next: inspect a compatible component with \`pokie inspect <path>\`, repair or add its compatible sidecar when needed, or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}

export function describeWasmConversionBoundary(): string {
    return `A ${WASM_PRODUCT_CONTRACT.kind} is inspection-only (metadata-only) and cannot be converted into a POKIE artifact. ` +
        `${WASM_PRODUCT_CONTRACT.inspectionBoundary} Next: inspect the compatible manifest or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}

export function describeWasmRecovery(): string {
    return `Inspect the compatible manifest or use the original Blueprint or POKIE game package where runnable or convertible source is required.`;
}

export function describeWasmRuntimeBoundary(): string {
    return `A ${WASM_PRODUCT_CONTRACT.kind} cannot yield a runnable POKIE game. ${WASM_PRODUCT_CONTRACT.inspectionBoundary} ` +
        `Next: inspect the compatible manifest or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}
