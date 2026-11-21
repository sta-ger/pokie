import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import type {UserBaseDirectoryResult} from "../../../cli/paths/PlatformDirectories.js";

const HOME = "/home/valera";

function resolverFor(base: UserBaseDirectoryResult, cwd: string, extra: {installRoot?: string; realpath?: (target: string) => string} = {}): PokiePathResolver {
    return new PokiePathResolver(
        {cwd, ...(extra.installRoot === undefined ? {} : {installRoot: extra.installRoot}), realpath: extra.realpath ?? ((target) => target)},
        {platform: "linux", env: {}, homeDir: HOME},
        () => base,
    );
}

describe("PokiePathResolver.resolveIndependentProjectDirectory", () => {
    it("allows a managed project under HOME when Studio was started from HOME itself", () => {
        const resolver = resolverFor({status: "valid", directory: HOME, source: "home"}, HOME);

        expect(resolver.resolveIndependentProjectDirectory("demo")).toEqual({
            status: "valid",
            directory: "/home/valera/POKIE Projects/demo",
            source: "home",
        });
    });

    it("still rejects a destination that is the process working directory", () => {
        const resolver = resolverFor({status: "valid", directory: HOME, source: "home"}, "/home/valera/POKIE Projects/demo");

        expect(resolver.resolveIndependentProjectDirectory("demo")).toMatchObject({status: "unsafe-path"});
    });

    it("still rejects a base under node_modules", () => {
        const resolver = resolverFor({status: "valid", directory: "/home/valera/node_modules", source: "home"}, "/home/valera");

        expect(resolver.resolveIndependentProjectDirectory("demo")).toMatchObject({status: "unsafe-path"});
    });

    it("still rejects a destination inside POKIE's own install root", () => {
        const resolver = resolverFor(
            {status: "valid", directory: "/home/valera/Work/pokie", source: "home"},
            "/home/valera",
            {installRoot: "/home/valera/Work/pokie"},
        );

        expect(resolver.resolveIndependentProjectDirectory("demo")).toMatchObject({status: "unsafe-path"});
    });

    it("rejects a project name containing path separators before resolving anything", () => {
        const resolver = resolverFor({status: "valid", directory: HOME, source: "home"}, "/home/valera");

        expect(resolver.resolveIndependentProjectDirectory("../escape")).toMatchObject({
            status: "invalid-name",
            message: expect.stringContaining("not a valid project name"),
        });
    });
});
