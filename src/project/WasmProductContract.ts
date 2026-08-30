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

export function describeWasmUnsupportedOperation(operation: string): string {
    return `This ${WASM_PRODUCT_CONTRACT.kind} cannot ${operation}. ${WASM_PRODUCT_CONTRACT.inspectionBoundary} ` +
        `Next: inspect a compatible component with \`pokie inspect <path>\`, repair or add its compatible sidecar when needed, or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}

export function describeWasmConversionBoundary(): string {
    return `A ${WASM_PRODUCT_CONTRACT.kind} is inspection-only (metadata-only) and cannot be converted into a POKIE artifact. ` +
        `${WASM_PRODUCT_CONTRACT.inspectionBoundary} Next: inspect the compatible manifest or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}

export function describeWasmRuntimeBoundary(): string {
    return `A ${WASM_PRODUCT_CONTRACT.kind} cannot yield a runnable POKIE game. ${WASM_PRODUCT_CONTRACT.inspectionBoundary} ` +
        `Next: inspect the compatible manifest or ${WASM_PRODUCT_CONTRACT.originalSourceRecovery}`;
}
