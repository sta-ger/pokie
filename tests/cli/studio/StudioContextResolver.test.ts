import path from "path";
import {StudioContextResolver} from "../../../cli/studio/StudioContextResolver.js";

describe("StudioContextResolver", () => {
    it("resolves to home mode when no projectRoot is given", () => {
        const resolver = new StudioContextResolver();

        expect(resolver.resolve()).toEqual({mode: "home"});
    });

    it("resolves to project mode with an absolute projectRoot", () => {
        const resolver = new StudioContextResolver();

        expect(resolver.resolve("./my-game")).toEqual({
            mode: "project",
            projectRoot: path.resolve("./my-game"),
        });
    });

    it("leaves an already-absolute projectRoot unchanged", () => {
        const resolver = new StudioContextResolver();
        const absolute = path.resolve("/tmp/my-game");

        expect(resolver.resolve(absolute)).toEqual({mode: "project", projectRoot: absolute});
    });
});
