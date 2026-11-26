import {openProject, ProjectOpenInProgressError, ProjectTransitionConflict, type FetchLike} from "../../../cli/studio-client/src/api/apiClient.js";

function response(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    };
}

describe("project open conflict classification", () => {
    it("identifies an already-running opening and preserves its job id", async () => {
        const fetchImpl: FetchLike = () => Promise.resolve(response(409, {
            error: "Project opening is already in progress.",
            activeJobId: "job-42",
            reattached: true,
        }));
        await expect(openProject(fetchImpl, "/projects/game")).rejects.toMatchObject({
            name: "ProjectOpenInProgressError",
            jobId: "job-42",
            message: "Project opening is already in progress.",
        });
        const error = await openProject(fetchImpl, "/projects/game").catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ProjectOpenInProgressError);
    });

    it("keeps the active-jobs confirmation path distinct", async () => {
        const fetchImpl: FetchLike = () => Promise.resolve(response(409, {
            error: "Active Studio jobs require explicit confirmation before changing projects: simulation.",
            code: "active-jobs-require-confirmation",
            operations: ["simulation"],
        }));
        const error = await openProject(fetchImpl, "/projects/game").catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ProjectTransitionConflict);
        expect((error as ProjectTransitionConflict).operations).toEqual(["simulation"]);
    });
});
