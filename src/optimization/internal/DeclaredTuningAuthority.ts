import {computeGameBlueprintHash} from "../../generated/computeGameBlueprintHash.js";
import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {DeclaredPackageTuningContract} from "../DeclaredTuningContract.js";
import {inventory, jsonHash, writeJson} from "./optimizationData.js";
export function refreshPackageTuning(
    root: string,
    contract: DeclaredPackageTuningContract,
    blueprint: GameBlueprint,
): void {
    writeJson(`${root}/pokie-tuning.json`, {...contract, modelHash: computeGameBlueprintHash(blueprint)});
}
export function verifyPackageSourceHashes(root: string, contract: DeclaredPackageTuningContract): void {
    const files = inventory(root);
    Reflect.deleteProperty(files, contract.parameterFile);
    Reflect.deleteProperty(files, "pokie-tuning.json");
    if (jsonHash(files) !== jsonHash(contract.sourceHashes)) throw new Error("Declared package source identity is stale or tampered.");
}
