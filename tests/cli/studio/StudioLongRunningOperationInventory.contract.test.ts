import fs from "fs";
import path from "path";

const root = process.cwd();
const inventoryPath = path.join(root, "docs", "studio-long-running-jobs.md");
const serverPath = path.join(root, "cli", "studio", "StudioServer.ts");

type InventoryClassification = "Common job" | "Synchronous" | "Extension contract";

const inventoryRows = (inventory: string): readonly {readonly actions: readonly string[]; readonly classification: string; readonly reason: string}[] =>
    inventory
        .split("\n")
        .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
        .map((line) => line.split(" | "))
        .filter((cells) => cells.length === 3 && cells[0] !== "| Studio API action")
        .map(([actions, classification, reason]) => ({
            actions: [...actions.matchAll(/(?:GET|POST|DELETE) `([^`]+)`/g)].map((match) => match[1]),
            classification,
            reason,
        }))
        .filter((row) => row.actions.length > 0);

const classificationFor = (rows: readonly {readonly actions: readonly string[]; readonly classification: string}[], route: string): string | undefined =>
    rows.find((row) => row.actions.includes(route))?.classification;

describe("Studio long-running operation inventory", () => {
    const inventory = fs.readFileSync(inventoryPath, "utf-8");
    const server = fs.readFileSync(serverPath, "utf-8");
    const rows = inventoryRows(inventory);

    it("classifies every static Studio API action and every parameterised route family", () => {
        const staticActions = [...server.matchAll(/if \(method === "(GET|POST|DELETE)" && url\.pathname === "(\/api\/[^"]+)"\)/g)]
            .map((match) => `${match[1]} \`${match[2]}\``);

        expect(staticActions).not.toHaveLength(0);
        for (const action of staticActions) expect(inventory).toContain(action);

        for (const action of [
            "GET `/api/project/jobs/:id`", "POST `/api/project/jobs/:id/cancel`", "POST `/api/project/jobs/:id/recover`",
            "GET `/api/project/simulations/:id`", "DELETE `/api/project/simulations/:id`",
            "GET `/api/project/reports/:id`", "GET `/api/project/reports/:id/download`",
            "GET `/api/project/replays/:id`", "DELETE `/api/project/replays/:id`", "GET `/api/project/replays/:id/download`",
            "POST `/api/project/play/sessions/:id/spin`", "POST `/api/project/play/sessions/:id/find-any-win`",
            "POST `/api/project/play/sessions/:id/find-symbol-win`", "POST `/api/project/play/sessions/:id/find-free-games`",
            "GET `/api/project/outcome-libraries/generate/jobs/:id`", "POST `/api/project/outcome-libraries/generate/jobs/:id/cancel`",
            "POST `/api/project/outcome-libraries/generate/jobs/:id/resume`", "GET `/api/project/artifacts/build/:id`",
            "POST `/api/project/artifacts/build/:id/cancel`", "`/api/tools/:toolId/...`",
        ]) expect(inventory).toContain(action);
    });

    it("keeps every specified potentially noticeable operation visible with a lifecycle decision", () => {
        for (const operation of [
            "Common job: simulation", "Common job: replay", "Common job: Outcome Library generation",
            "every `ArtifactBuilderRegistry` target", "Common job: certification deep validation",
            "Common job: certification evidence build", "Common job: deployment check/publish",
            "Common job: Play scenario search", "Common job: project opening/runtime materialization",
            "Common job: Design package build/reel-strip materialization", "Common job: PAR import",
            "Common job: PAR export",
        ]) expect(inventory).toContain(operation);
    });

    it("requires concrete synchronous reasons instead of treating asynchronous implementation as a bound", () => {
        expect(inventory).toContain("Synchronous bounded preview");
        expect(inventory).toContain("Synchronous constant-size fairness action");
        expect(inventory).toContain("settles exactly one spin/draw");
        expect(inventory).toContain("not excused merely because the current implementation awaits I/O");
    });

    it("binds every route family to a lifecycle classification and concrete reason in the inventory table", () => {
        const classifications: readonly InventoryClassification[] = ["Common job", "Synchronous", "Extension contract"];
        expect(rows).not.toHaveLength(0);
        for (const row of rows) {
            expect(row.actions).not.toHaveLength(0);
            expect(classifications.some((classification) => row.classification.startsWith(classification))).toBe(true);
            expect(row.reason.trim().length).toBeGreaterThan(20);
        }

        for (const [route, classification] of [
            ["/api/project/jobs/:id", "Common job"],
            ["/api/project/simulations/:id", "Common job"],
            ["/api/project/reports/:id", "Common job"],
            ["/api/project/replays/:id", "Common job"],
            ["/api/project/play/sessions/:id/spin", "Synchronous"],
            ["/api/project/play/sessions/:id/find-any-win", "Common job"],
            ["/api/project/play/sessions/:id/find-symbol-win", "Common job"],
            ["/api/project/play/sessions/:id/find-free-games", "Common job"],
            ["/api/project/outcome-libraries/generate/jobs/:id", "Common job"],
            ["/api/project/artifacts/build/:id", "Common job"],
        ] as const) {
            expect(classificationFor(rows, route)).toContain(classification);
        }
    });
});
