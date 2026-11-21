import {activateArtifactBuild, cancelArtifactBuild, getArtifactBuild} from "../../../cli/studio-client/src/api/apiClient.js";
import {matchArtifactBuildJobRoute} from "../../../cli/studio/build/artifactBuildJobRoute.js";

// Regression guard for the Studio Build/Export job lifecycle: the browser client creates a
// `/api/project/build/build` job and then polls/activates/cancels it under the same prefix. The
// server's router must accept every URL the client actually emits -- a mismatch here leaves the job
// queued forever with no error, which is exactly what the 2.0 route cleanup introduced once.
describe("Studio artifact build job route", () => {
    it("serves every build-job URL the browser client emits", async () => {
        const calls: string[] = [];
        const fetchImpl = (url: string) => {
            calls.push(url);
            return Promise.resolve({ok: true, json: () => Promise.resolve({id: "job-1", status: "queued"})});
        };

        await getArtifactBuild(fetchImpl as never, "job-1");
        await activateArtifactBuild(fetchImpl as never, "job-1");
        await cancelArtifactBuild(fetchImpl as never, "job-1");

        const paths = calls.map((call) => new URL(call, "http://127.0.0.1:3200").pathname);
        expect(paths).toEqual([
            "/api/project/build/build/job-1",
            "/api/project/build/build/job-1/activate",
            "/api/project/build/build/job-1/cancel",
        ]);
        expect(paths.map((pathname) => matchArtifactBuildJobRoute(pathname))).toEqual([
            {id: "job-1"},
            {id: "job-1", action: "activate"},
            {id: "job-1", action: "cancel"},
        ]);
    });

    it("keeps the pre-2.0 artifact-build job route as an alias", () => {
        expect(matchArtifactBuildJobRoute("/api/project/artifacts/build/job-1")).toEqual({id: "job-1"});
        expect(matchArtifactBuildJobRoute("/api/project/artifacts/build/job-1/activate")).toEqual({id: "job-1", action: "activate"});
        expect(matchArtifactBuildJobRoute("/api/project/artifacts/build/job-1/cancel")).toEqual({id: "job-1", action: "cancel"});
    });

    it("does not claim unrelated project routes", () => {
        expect(matchArtifactBuildJobRoute("/api/project/build/build")).toBeUndefined();
        expect(matchArtifactBuildJobRoute("/api/project/build/preview")).toBeUndefined();
        expect(matchArtifactBuildJobRoute("/api/project/artifacts/build")).toBeUndefined();
        expect(matchArtifactBuildJobRoute("/api/project/build/build/job-1/other")).toBeUndefined();
    });
});
