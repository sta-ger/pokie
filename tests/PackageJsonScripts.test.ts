import fs from "fs";
import path from "path";

describe("package.json scripts", () => {
    it("rebuilds dist via prepack, so npm pack/publish never ships a stale or missing dist", () => {
        const packageJsonPath = path.join(__dirname, "..", "package.json");
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {scripts?: Record<string, string>};

        expect(pkg.scripts?.prepack).toBe("npm run build");
    });
});
