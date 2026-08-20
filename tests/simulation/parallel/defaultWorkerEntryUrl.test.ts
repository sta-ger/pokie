import path from "path";
import {pathToFileURL} from "url";
import {getDefaultWorkerEntryUrl} from "../../../src/simulation/parallel/internal/defaultWorkerEntryUrl.js";

describe("getDefaultWorkerEntryUrl", () => {
    it("uses its CommonJS fallback when Jest's VM cannot perform the native dynamic import", async () => {
        await expect(getDefaultWorkerEntryUrl()).resolves.toEqual(
            pathToFileURL(path.join(__dirname, "..", "..", "..", "src", "simulation", "parallel", "internal", "simulationWorkerEntry.js")),
        );
    });
});
