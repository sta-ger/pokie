import type {GameBlueprint} from "./GameBlueprint.js";

export const PACKAGE_MODEL_DESCRIPTOR_VERSION = 1;

/** A declaration of the effective model, not a proof about arbitrary executable code.
 * Reels must already be materialized. Unsupported custom collaborators must be declared.
 * Descriptor producers must return plain, accessor-free JSON data.
 */
export interface PackageModelDescriptor {
    descriptorVersion: 1;
    blueprintSchemaVersion: 1;
    sourceKind: "generated" | "custom";
    model: Partial<GameBlueprint>;
    maxWinPolicy?: import("../diff/MathDefinitionDiff.js").MathDefinitionMaxWinPolicy;
    unsupported?: {path: string; code: string; message: string}[];
}
