import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {isValidSemverLite} from "./internal/compareSemverLite.js";
import type {PokieWasmComponentManifest} from "./PokieWasmComponentManifest.js";

// An PokieWasmComponentManifest's own static type guarantees nothing about a value that actually arrives at
// runtime -- always deserialized from a sidecar JSON file (see WasmProjectTargetAdapter) -- so every field is
// read through this loosened view, the same runtime-guard idiom RoundArtifactValidator/
// ExternalDeploymentTargetDescriptorValidator use for the identical reason.
type Loose<X> = {[K in keyof X]?: unknown};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

// Validates a PokieWasmComponentManifest's own shape only -- independent of whether it's actually compatible
// with this POKIE build's own contract version (see assessWasmComponentCompatibility for that, separate,
// step) -- the same "shape vs. compatibility are two different questions" split
// ExternalDeploymentTargetDescriptorValidator/ExternalDeploymentCompatibilityValidator draw for
// ExternalDeploymentTarget. Never throws.
export class PokieWasmComponentManifestValidator {
    public validate(manifest: unknown): ValidationIssue[] {
        try {
            return this.validateInternal((typeof manifest === "object" && manifest !== null ? manifest : {}) as Loose<PokieWasmComponentManifest>);
        } catch (error) {
            return [
                {
                    code: "wasm-component-manifest-malformed",
                    severity: "error",
                    message: `PokieWasmComponentManifest could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(manifest: Loose<PokieWasmComponentManifest>): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!isNonEmptyString(manifest.schemaVersion) || !isValidSemverLite(manifest.schemaVersion)) {
            issues.push({
                code: "wasm-component-manifest-schema-version-invalid",
                severity: "error",
                message: `"schemaVersion" must be a "major.minor.patch" version string, got ${JSON.stringify(manifest.schemaVersion)}.`,
                path: "schemaVersion",
            });
        }

        this.validateComponent(manifest.component as Loose<PokieWasmComponentManifest["component"]> | undefined, issues);

        if (
            manifest.minPokieVersion !== undefined &&
            (typeof manifest.minPokieVersion !== "string" || !isValidSemverLite(manifest.minPokieVersion))
        ) {
            issues.push({
                code: "wasm-component-manifest-min-pokie-version-invalid",
                severity: "error",
                message: `"minPokieVersion" (${JSON.stringify(manifest.minPokieVersion)}) must be a "major.minor.patch" version string when present.`,
                path: "minPokieVersion",
            });
        }

        this.validateSerialization(manifest.serialization as Loose<PokieWasmComponentManifest["serialization"]> | undefined, issues);
        this.validateHost(manifest.host as Loose<PokieWasmComponentManifest["host"]> | undefined, issues);

        if (!isNonEmptyStringArray(manifest.capabilities)) {
            issues.push({
                code: "wasm-component-manifest-capabilities-invalid",
                severity: "error",
                message: '"capabilities" must be an array of non-empty strings.',
                path: "capabilities",
            });
        }

        return issues;
    }

    private validateComponent(component: Loose<PokieWasmComponentManifest["component"]> | undefined, issues: ValidationIssue[]): void {
        if (typeof component !== "object" || component === null) {
            issues.push({
                code: "wasm-component-manifest-component-invalid",
                severity: "error",
                message: '"component" must be an object with "id" and "version".',
                path: "component",
            });
            return;
        }
        if (!isNonEmptyString(component.id)) {
            issues.push({
                code: "wasm-component-manifest-component-id-invalid",
                severity: "error",
                message: `"component.id" must be a non-empty string, got ${JSON.stringify(component.id)}.`,
                path: "component.id",
            });
        }
        if (!isNonEmptyString(component.version)) {
            issues.push({
                code: "wasm-component-manifest-component-version-invalid",
                severity: "error",
                message: `"component.version" must be a non-empty string, got ${JSON.stringify(component.version)}.`,
                path: "component.version",
            });
        }
    }

    private validateSerialization(serialization: Loose<PokieWasmComponentManifest["serialization"]> | undefined, issues: ValidationIssue[]): void {
        if (typeof serialization !== "object" || serialization === null) {
            issues.push({
                code: "wasm-component-manifest-serialization-invalid",
                severity: "error",
                message: '"serialization" must be an object with "session", "play", and "state" format ids.',
                path: "serialization",
            });
            return;
        }
        (["session", "play", "state"] as const).forEach((field) => {
            if (!isNonEmptyString(serialization[field])) {
                issues.push({
                    code: "wasm-component-manifest-serialization-field-invalid",
                    severity: "error",
                    message: `"serialization.${field}" must be a non-empty string, got ${JSON.stringify(serialization[field])}.`,
                    path: `serialization.${field}`,
                });
            }
        });
    }

    private validateHost(host: Loose<PokieWasmComponentManifest["host"]> | undefined, issues: ValidationIssue[]): void {
        if (typeof host !== "object" || host === null) {
            issues.push({
                code: "wasm-component-manifest-host-invalid",
                severity: "error",
                message: '"host" must be an object with "rng" and "services".',
                path: "host",
            });
            return;
        }
        if (!isNonEmptyString(host.rng)) {
            issues.push({
                code: "wasm-component-manifest-host-rng-invalid",
                severity: "error",
                message: `"host.rng" must be a non-empty string, got ${JSON.stringify(host.rng)}.`,
                path: "host.rng",
            });
        }
        if (!isNonEmptyStringArray(host.services)) {
            issues.push({
                code: "wasm-component-manifest-host-services-invalid",
                severity: "error",
                message: '"host.services" must be an array of non-empty strings.',
                path: "host.services",
            });
        }
    }
}
