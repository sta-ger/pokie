import os from "os";
import path from "path";
import {isUnsafeStartDirectory} from "../../../cli/paths/isUnsafeStartDirectory.js";

describe("isUnsafeStartDirectory", () => {
    it("rejects the process CWD", () => {
        expect(isUnsafeStartDirectory("/home/alice/projects", {cwd: "/home/alice/projects"})).toBe(true);
    });

    it("accepts a plain directory unrelated to CWD/installRoot/studioRoot", () => {
        expect(
            isUnsafeStartDirectory("/home/alice/Documents/POKIE/sample-slot", {
                cwd: "/some/other/dir",
                installRoot: "/opt/pokie",
                studioRoot: "/opt/pokie/dist/cli/studio-client",
            }),
        ).toBe(false);
    });

    it("rejects the OS temp directory and anything inside it", () => {
        expect(isUnsafeStartDirectory(os.tmpdir(), {cwd: "/elsewhere"})).toBe(true);
        expect(isUnsafeStartDirectory(path.join(os.tmpdir(), "pokie-scratch"), {cwd: "/elsewhere"})).toBe(true);
    });

    it("rejects the install root and paths inside it", () => {
        expect(
            isUnsafeStartDirectory("/opt/pokie/some/nested/dir", {cwd: "/elsewhere", installRoot: "/opt/pokie"}),
        ).toBe(true);
    });

    it("rejects Studio's own internal directory and paths inside it", () => {
        expect(
            isUnsafeStartDirectory("/opt/pokie/dist/cli/studio-client/assets", {
                cwd: "/elsewhere",
                studioRoot: "/opt/pokie/dist/cli/studio-client",
            }),
        ).toBe(true);
    });

    it("rejects any path containing a node_modules segment", () => {
        expect(isUnsafeStartDirectory("/home/alice/projects/node_modules/some-pkg", {cwd: "/elsewhere"})).toBe(true);
    });

    it("rejects any path containing a dist segment", () => {
        expect(isUnsafeStartDirectory("/home/alice/projects/my-app/dist", {cwd: "/elsewhere"})).toBe(true);
    });

    it("does not flag an unrelated directory that merely starts with the same prefix as an unsafe root", () => {
        expect(isUnsafeStartDirectory("/opt/pokie-other-app", {cwd: "/elsewhere", installRoot: "/opt/pokie"})).toBe(false);
    });

    describe("symlink-aware physical destination checks", () => {
        it("rejects a candidate whose real destination is the OS temp directory even though its own path text doesn't mention it", () => {
            const documents = path.resolve("/home/alice/Documents");
            const physicalTarget = path.join(os.tmpdir(), "actual-destination");
            const realpath = (target: string): string => (target === documents ? physicalTarget : target);

            expect(isUnsafeStartDirectory(documents, {cwd: "/elsewhere", realpath})).toBe(true);
        });

        it("rejects a candidate whose real destination is inside POKIE's own install root", () => {
            const documents = path.resolve("/home/alice/Documents");
            const physicalTarget = "/opt/pokie/vendored";
            const realpath = (target: string): string => (target === documents ? physicalTarget : target);

            expect(isUnsafeStartDirectory(documents, {cwd: "/elsewhere", installRoot: "/opt/pokie", realpath})).toBe(true);
        });

        it("rejects a candidate whose real destination is inside Studio's own internal directory", () => {
            const documents = path.resolve("/home/alice/Documents");
            const physicalTarget = "/opt/pokie/dist/cli/studio-client/assets";
            const realpath = (target: string): string => (target === documents ? physicalTarget : target);

            expect(
                isUnsafeStartDirectory(documents, {cwd: "/elsewhere", studioRoot: "/opt/pokie/dist/cli/studio-client", realpath}),
            ).toBe(true);
        });

        it("accepts a candidate whose real destination is a benign, unrelated directory", () => {
            const documents = path.resolve("/home/alice/Documents");
            const physicalTarget = "/mnt/data/real-documents";
            const realpath = (target: string): string => (target === documents ? physicalTarget : target);

            expect(
                isUnsafeStartDirectory(documents, {cwd: "/elsewhere", installRoot: "/opt/pokie", studioRoot: "/opt/pokie/studio", realpath}),
            ).toBe(false);
        });

        it("rejects a not-yet-created path whose nearest existing ancestor physically resolves into the OS temp directory", () => {
            const documents = path.resolve("/home/alice/Documents");
            const projectDir = path.join(documents, "POKIE", "sample-slot");
            const physicalDocuments = path.join(os.tmpdir(), "actual-documents");
            const realpath = (target: string): string => {
                if (target === projectDir || target === path.dirname(projectDir)) {
                    throw new Error("ENOENT");
                }
                return target === documents ? physicalDocuments : target;
            };

            expect(isUnsafeStartDirectory(projectDir, {cwd: "/elsewhere", realpath})).toBe(true);
        });
    });

    describe("target-platform path semantics", () => {
        it("rejects a win32 install-root descendant expressed with backslash separators, regardless of host platform", () => {
            expect(
                isUnsafeStartDirectory("C:\\Program Files\\Pokie\\bundled\\assets", {
                    cwd: "C:\\Users\\alice\\project",
                    installRoot: "C:\\Program Files\\Pokie",
                    platform: "win32",
                }),
            ).toBe(true);
        });

        it("rejects a UNC path containing a node_modules segment under win32 semantics", () => {
            expect(
                isUnsafeStartDirectory("\\\\build-server\\share\\node_modules\\pkg", {
                    cwd: "C:\\Users\\alice\\project",
                    platform: "win32",
                }),
            ).toBe(true);
        });

        it("does not flag a win32 path that merely shares a textual prefix with the install root", () => {
            expect(
                isUnsafeStartDirectory("C:\\Program Files\\PokieOtherApp", {
                    cwd: "C:\\Users\\alice\\project",
                    installRoot: "C:\\Program Files\\Pokie",
                    platform: "win32",
                }),
            ).toBe(false);
        });
    });
});
