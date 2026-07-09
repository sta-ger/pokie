import {buildPackageJsonPatch} from "../../../cli/scaffold/buildPackageJsonPatch";

describe("buildPackageJsonPatch", () => {
    it("sets pokie.entry, and fills in the build script and dependencies on a bare package.json", () => {
        const patched = buildPackageJsonPatch({name: "crazy-fruits", version: "1.0.0"}, "1.2.1");

        expect(patched.pokie).toEqual({entry: "./dist/index.js"});
        expect(patched.scripts).toEqual({build: "tsc"});
        expect(patched.dependencies).toEqual({pokie: "^1.2.1"});
        expect(patched.devDependencies).toEqual({typescript: "^5.0.4"});
        expect(patched.name).toBe("crazy-fruits");
        expect(patched.version).toBe("1.0.0");
    });

    it("does not clobber existing scripts, dependency versions, or pokie config sub-fields", () => {
        const patched = buildPackageJsonPatch(
            {
                name: "crazy-fruits",
                scripts: {build: "webpack", test: "jest"},
                dependencies: {pokie: "^1.0.0"},
                devDependencies: {typescript: "^4.9.0"},
                pokie: {entry: "./custom/entry.js"},
            },
            "1.2.1",
        );

        expect(patched.scripts).toEqual({build: "webpack", test: "jest"});
        expect(patched.dependencies).toEqual({pokie: "^1.0.0"});
        expect(patched.devDependencies).toEqual({typescript: "^4.9.0"});
        // pokie.entry is always managed/overwritten by init, unlike the other fields above.
        expect(patched.pokie).toEqual({entry: "./dist/index.js"});
    });
});
