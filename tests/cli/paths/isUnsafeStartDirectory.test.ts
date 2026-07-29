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
});
