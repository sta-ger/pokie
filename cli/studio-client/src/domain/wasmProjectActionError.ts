import {describePathActionError} from "./pathActionError";
import {describeProjectActionError} from "./projectActionError";

// These resolver failures already name the rejected artifact, its cause and
// recovery. Recognition can fail before a typed Project exists, so do not use
// a pathname or stale preview's type as authority for preserving the diagnostic.
export function isWasmProjectDiagnostic(message: string): boolean {
    return (/\b(?:WASM (?:target|component|artifact|manifest|module|sidecar|runtime|Project)|PokieWasmComponentManifest)\b/i).test(message)
        || (/\bPOKIE \S+ cannot run "[^"]+\.wasm": it requires POKIE\b/i).test(message);
}

// Scoped to Project resolution actions. Shared path/project helpers also serve
// Blueprint, certification and fairness workflows and retain their existing copy.
export function describeWasmProjectPathError(subject: string, message: string): string {
    return isWasmProjectDiagnostic(message) ? message : describePathActionError(subject, message);
}

export function describeWasmProjectRegistrationError(message: string): string {
    return isWasmProjectDiagnostic(message) ? message : describeProjectActionError("Adding this game", message);
}
