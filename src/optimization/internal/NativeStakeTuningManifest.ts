import fs from "fs";
import path from "path";
import {inventory, jsonHash, readJson, writeJson} from "./optimizationData.js";
const FILE = "pokie-native-weights.json";
/** Native weight candidates cannot retain an old reconstructed-library hash as current provenance. */
export function writeNativeStakeTuningManifest(directory: string): void {
    const files = inventory(directory);
    Reflect.deleteProperty(files, FILE);
    writeJson(path.join(directory, FILE), {version: "pokie.native-weights.v1", files});
}
export function recognizesNativeStakeTuningManifest(directory: string): boolean {
    const file = path.join(directory, FILE);
    if (!fs.existsSync(file)) return false;
    try {
        const manifest = readJson(file) as {version?: string; files?: Record<string, string>};
        if (manifest.version !== "pokie.native-weights.v1" || !manifest.files?.["index.json"]) return false;
        const files = inventory(directory);
        Reflect.deleteProperty(files, FILE);
        return jsonHash(files) === jsonHash(manifest.files);
    } catch {
        return false;
    }
}
