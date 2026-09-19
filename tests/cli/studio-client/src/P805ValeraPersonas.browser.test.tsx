import fs from "fs";
import path from "path";

describe("P8-05 rendered Valera persona evidence", () => {
    it("keeps real rendered recovery, lifecycle, accessibility, and narrow-viewport checks in the blind audit contract", () => {
        const contract = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "scripts", "p8-05-valera-browser-audit.mjs"), "utf8");
        expect(contract).toContain("public-launcher-rendered-controls");
        expect(contract).toContain("documentOverflow !== false");
        expect(contract).toContain("reloadReconnect !== true");
        expect(contract).toContain("cooperativeCancellation !== true");
    });
});
