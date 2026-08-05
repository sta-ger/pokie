import {withLocalPokieDependency} from "pokie";

describe("withLocalPokieDependency", () => {
    it("overrides a semver-range pokie dependency with a file: spec bound to the given root", () => {
        const patched = withLocalPokieDependency({name: "starter-slot", version: "0.1.0", dependencies: {pokie: "^1.3.0"}}, "/opt/pokie-checkout");

        expect(patched.dependencies).toEqual({pokie: "file:/opt/pokie-checkout"});
    });

    it("preserves every other dependency, and works when a path contains spaces", () => {
        const patched = withLocalPokieDependency(
            {name: "starter-slot", dependencies: {pokie: "^1.3.0", commander: "^14.0.0"}},
            "/opt/pokie checkout with spaces",
        );

        expect(patched.dependencies).toEqual({pokie: "file:/opt/pokie checkout with spaces", commander: "^14.0.0"});
    });

    it("adds a pokie dependency even when the package had none declared yet", () => {
        const patched = withLocalPokieDependency({name: "starter-slot"}, "/opt/pokie-checkout");

        expect(patched.dependencies).toEqual({pokie: "file:/opt/pokie-checkout"});
    });

    it("never mutates the given package.json object", () => {
        const original = {name: "starter-slot", dependencies: {pokie: "^1.3.0"}};

        withLocalPokieDependency(original, "/opt/pokie-checkout");

        expect(original.dependencies).toEqual({pokie: "^1.3.0"});
    });

    it("leaves every non-dependency field untouched", () => {
        const patched = withLocalPokieDependency({name: "starter-slot", version: "0.1.0", main: "./dist/index.js"}, "/opt/pokie-checkout");

        expect(patched.name).toBe("starter-slot");
        expect(patched.version).toBe("0.1.0");
        expect(patched.main).toBe("./dist/index.js");
    });
});
