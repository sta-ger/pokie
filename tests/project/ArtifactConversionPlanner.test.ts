import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactConversionPlanner, computeArtifactInputBindingHash, describeArtifactConversionPlanDiagnostic, resolveArtifactIdentity, type PokieProject} from "../../src/index.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/projects/${type}`, provenance: `${type} manifest`, capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("ArtifactConversionPlanner", () => {
    const planner = new ArtifactConversionPlanner();

    it("binds descriptor preparation to every referenced file and directory", () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-input-binding-"));
        const descriptor = path.join(directory, "descriptor.json");
        const nested = path.join(directory, "bundle", "mode.json");
        try {
            fs.mkdirSync(path.dirname(nested));
            fs.writeFileSync(descriptor, '{"mode":"base"}');
            fs.writeFileSync(nested, '{"outcomes":1}');
            const prepared = computeArtifactInputBindingHash([descriptor, path.dirname(nested)]);
            fs.writeFileSync(nested, '{"outcomes":2}');
            expect(computeArtifactInputBindingHash([descriptor, path.dirname(nested)])).not.toBe(prepared);
            fs.unlinkSync(nested);
            expect(computeArtifactInputBindingHash([descriptor, path.dirname(nested)])).not.toBe(prepared);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("models raw generated JSON as a non-bundle file publication", () => {
        const source = resolveArtifactIdentity(project("tsPackage"));
        const plan = planner.planRawOutcomeLibraryJsonPublication(source, "/exports/generated-outcomes.json");

        expect(plan).toMatchObject({
            status: "planned",
            target: {
                kind: "rawOutcomeLibraryJson",
                canonicalLocation: "/exports/generated-outcomes.json",
                recognitionProvenance: expect.stringMatching(/not a native bundle/i),
            },
            preflight: {
                destinationKind: "file",
                estimatedWork: "publish",
                losses: [expect.stringMatching(/not a canonical Outcome Library bundle/i)],
            },
            steps: [{kind: "publish", output: {kind: "rawOutcomeLibraryJson"}}],
        });
    });

    it("plans a destinationless runnable runtime for Blueprint and PAR without publishing a package", () => {
        const blueprint = planner.planRuntime(project("blueprint"));
        const par = planner.planRuntime(project("parWorkbook"));
        const outcome = planner.planRuntime(project("outcomeLibrary"));

        expect(blueprint).toMatchObject({
            status: "planned",
            target: {kind: "tsPackage"},
            steps: [{kind: "materializeRuntime", choice: "materialize"}],
        });
        expect(par).toMatchObject({
            status: "planned",
            target: {kind: "tsPackage"},
            steps: [{kind: "importParWorkbook"}, {kind: "materializeRuntime"}],
        });
        expect(outcome).toMatchObject({
            status: "unavailable",
            diagnostic: {
                failedEdge: {from: "outcomeLibrary", to: "tsPackage"},
                message: expect.stringMatching(/native sampling and exact replay/i),
            },
        });
    });

    it("plans the non-circular Blueprint to Stake path through a canonical Outcome Library", () => {
        const plan = planner.plan(project("blueprint"), "stakeAdapter", {destinationPath: "/exports/stake"});

        expect(plan.status).toBe("planned");
        expect(plan.steps.map((step) => step.kind)).toEqual(["materializeRuntime", "generateOutcomeLibrary", "publish"]);
        expect(plan.steps.map((step) => step.choice)).toEqual(["materialize", "materialize", "publish"]);
        expect(plan.target.canonicalLocation).toBe("/exports/stake");
        expect(plan.preflight.losses).toEqual(["Stake export does not retain a game model or runtime."]);
    });

    it("keeps verified managed outcome reuse distinct from an ineligible stale candidate", () => {
        const reused = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: true, identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });
        const stale = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: false, staleReason: "configuration hash changed", identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });

        expect(reused.status).toBe("planned");
        expect(reused.steps).toHaveLength(1);
        expect(reused.steps[0].kind).toBe("reuseManagedOutcomeLibrary");
        expect(stale).toMatchObject({
            status: "planned",
            managedOutcome: {disposition: "ineligible", reason: "configuration hash changed"},
            steps: [{kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}],
        });
    });

    it("reports selected reuse work rather than generation work for a Stake prerequisite", () => {
        const source = {
            ...project("tsPackage"),
            configurationProvenance: {
                configurationHash: "source-hash",
                gameId: "slot",
                gameVersion: "1.0.0",
                manifestIdentity: "slot@1.0.0",
                pokieVersion: "1.3.0",
                generationSemantics: "exact" as const,
            },
        };
        const plan = planner.plan(source, "stakeAdapter", {
            managedOutcome: {
                verified: true,
                identity: {
                    kind: "outcomeLibrary",
                    canonicalLocation: "/managed/outcomes",
                    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                    configurationProvenance: source.configurationProvenance,
                },
            },
        });

        expect(plan).toMatchObject({
            status: "planned",
            managedOutcome: {disposition: "reused"},
            steps: [{kind: "reuseManagedOutcomeLibrary"}, {kind: "publish"}],
            preflight: {estimatedWork: "publish"},
        });
    });

    it("publishes a selected managed reuse to the requested Outcome destination", () => {
        const reusable = planner.plan(project("tsPackage"), "outcomeLibrary", {
            destinationPath: "/exports/outcomes",
            managedOutcome: {
                verified: true,
                identity: {
                    kind: "outcomeLibrary",
                    canonicalLocation: "/managed/outcomes",
                    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                },
            },
        });

        expect(reusable).toMatchObject({
            status: "planned",
            target: {canonicalLocation: "/exports/outcomes"},
            steps: [
                {kind: "reuseManagedOutcomeLibrary", choice: "reuse"},
                {kind: "publish", choice: "publish", output: {canonicalLocation: "/exports/outcomes"}},
            ],
        });
    });

    it("does not trust a managed candidate flag when its persisted sampled provenance differs", () => {
        const source = {
            ...project("tsPackage"),
            configurationProvenance: {
                configurationHash: "source-hash",
                gameId: "slot",
                gameVersion: "1.0.0",
                manifestIdentity: "slot@1.0.0",
                pokieVersion: "1.3.0",
                generationSemantics: "boundedSample" as const,
                sampleCount: "100",
                sampleSeed: "seed-a",
            },
        };
        const plan = planner.plan(source, "outcomeLibrary", {
            managedOutcome: {
                verified: true,
                identity: {
                    kind: "outcomeLibrary",
                    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                    configurationProvenance: {...source.configurationProvenance, sampleSeed: "seed-b"},
                },
            },
        });

        expect(plan).toMatchObject({
            status: "planned",
            managedOutcome: {disposition: "ineligible", reason: expect.stringContaining("sample seed")},
            steps: [{kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}],
        });
    });

    it("binds bounded sample count and seed into the requested output identity", () => {
        const plan = planner.plan(project("blueprint"), "outcomeLibrary", {
            destinationPath: "/exports/bounded-outcomes",
            generationSemantics: "boundedSample",
            sampleCount: BigInt(100),
            sampleSeed: "seed-a",
        });

        expect(plan.target.configurationProvenance).toEqual({
            generationSemantics: "boundedSample",
            sampleCount: "100",
            sampleSeed: "seed-a",
        });
    });

    it("reports the exact unsupported boundary rather than a generic source matrix", () => {
        const outcomeToPackage = planner.plan(project("outcomeLibrary"), "tsPackage");
        const wasm = planner.plan(project("wasm"), "outcomeLibrary");
        const par = planner.plan(project("parWorkbook"), "stakeAdapter");

        expect(outcomeToPackage).toMatchObject({status: "unavailable", diagnostic: {code: "missing-data", failedEdge: {from: "outcomeLibrary", to: "tsPackage"}}});
        expect(outcomeToPackage.diagnostic?.message).toContain("does not preserve the game model");
        expect(wasm.diagnostic?.message).toContain("metadata-only");
        expect(par).toMatchObject({status: "planned", steps: [{kind: "importParWorkbook"}, {kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}, {kind: "publish"}]});
    });

    it("rejects an external Studio selector without fabricating Outcome Library capabilities", () => {
        const plan = planner.planIdentity(
            {
                kind: "outcomeLibrary",
                canonicalLocation: "/projects/base.json",
                recognitionProvenance: "external Studio selector",
                capabilities: [],
            },
            "stakeAdapter",
        );

        expect(plan).toMatchObject({
            status: "unavailable",
            diagnostic: {code: "unrecognized-source", failedEdge: {from: "outcomeLibrary", to: "stakeAdapter"}},
        });
        expect(plan.diagnostic?.recovery).toContain("recognized POKIE Outcome Library bundle");
        expect(describeArtifactConversionPlanDiagnostic(plan)).toBe(plan.diagnostic?.message);
    });

    it("rejects an unresolved Studio runtime without fabricating package capabilities", () => {
        const plan = planner.planIdentity(
            {
                kind: "tsPackage",
                canonicalLocation: "/projects/unresolved-runtime",
                recognitionProvenance: "unresolved Studio project runtime",
                capabilities: [],
            },
            "outcomeLibrary",
        );

        expect(plan).toMatchObject({
            status: "unavailable",
            steps: [],
            diagnostic: {code: "unrecognized-source", failedEdge: {from: "tsPackage", to: "outcomeLibrary"}},
        });
    });

    it("prepares durable PAR and Stake import outputs without adding reverse conversion edges", () => {
        const parImport = planner.planImportOutput(project("parWorkbook"), "blueprint", "/imports/slot.blueprint.json");
        const stakeImport = planner.planImportOutput(project("stakeAdapter"), "outcomeLibrary", "/imports/outcomes");

        expect(parImport).toMatchObject({
            status: "planned",
            operation: "importParWorkbook",
            output: {kind: "blueprint", canonicalLocation: "/imports/slot.blueprint.json"},
            preflight: {destinationKind: "file", oneWay: true},
        });
        expect(parImport.preflight.losses.join(" ")).toContain("does not establish a reverse or lossless conversion edge");
        expect(stakeImport).toMatchObject({
            status: "planned",
            operation: "importStakeAdapter",
            output: {kind: "outcomeLibrary", canonicalLocation: "/imports/outcomes"},
            preflight: {destinationKind: "directory", oneWay: true},
        });
        expect(stakeImport.preflight.losses.join(" ")).toContain("does not recover a game model");
        expect(planner.plan(project("parWorkbook"), "outcomeLibrary")).toMatchObject({
            status: "planned",
            steps: [{kind: "importParWorkbook"}, {kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}],
        });
        expect(planner.plan(project("stakeAdapter"), "outcomeLibrary").status).toBe("unavailable");
    });

    it("advertises Blueprint as the PAR workbook's model-preserving terminal target", () => {
        const plan = planner.plan(project("parWorkbook"), "blueprint", {destinationPath: "/imports/slot.blueprint.json"});

        expect(plan).toMatchObject({
            status: "planned",
            source: {kind: "parWorkbook"},
            target: {kind: "blueprint", canonicalLocation: "/imports/slot.blueprint.json"},
            steps: [{kind: "importParWorkbook", output: {kind: "blueprint", canonicalLocation: "/imports/slot.blueprint.json"}}],
            preflight: {destinationKind: "file"},
        });
    });

    it("names the durable generated PAR-to-Stake prerequisite in the prepared preview", () => {
        const plan = planner.plan(project("parWorkbook"), "stakeAdapter", {destinationPath: "/exports/stake"});

        expect(plan).toMatchObject({
            status: "planned",
            steps: [
                {kind: "importParWorkbook", output: {canonicalLocation: "/exports/stake/.pokie/par-import/imported.blueprint.json"}},
                {kind: "materializeRuntime"},
                {kind: "generateOutcomeLibrary", output: {canonicalLocation: "/exports/stake/.pokie/par-import/outcome-library"}},
                {kind: "publish"},
            ],
        });
    });

    it("rejects a changed source or destination at import execution", () => {
        const source = project("parWorkbook");
        const plan = planner.planImportOutput(source, "blueprint", "/imports/slot.blueprint.json");

        expect(() => planner.assertImportOutputPlanCurrent(plan, source, "/imports/other.blueprint.json"))
            .toThrow(/destination changed/i);
        expect(() => planner.assertImportOutputPlanCurrent(plan, {...source, rootPath: "/moved/source.par.xlsx"}, "/imports/slot.blueprint.json"))
            .toThrow(/source changed/i);
    });

    it("owns the durable import publication boundary after a successful reader result", async () => {
        const source = project("parWorkbook");
        const plan = planner.planImportOutput(source, "blueprint", "/imports/slot.blueprint.json");
        const events: string[] = [];

        const result = await planner.executeImportOutputPlan(plan, source, "/imports/slot.blueprint.json", {
            read: () => {
                events.push("read");
                return {valid: true};
            },
            canPublish: (read) => read.valid,
            beforePublish: () => {
                events.push("destination");
            },
            publish: () => {
                events.push("publish");
                return "published";
            },
        });

        expect(events).toEqual(["read", "destination", "publish"]);
        expect(result).toEqual({read: {valid: true}, published: true, publication: "published"});
    });

    it("suppresses import publication when the exchange reader reports a blocking result", async () => {
        const source = project("stakeAdapter");
        const plan = planner.planImportOutput(source, "outcomeLibrary", "/imports/outcomes");
        const publish = jest.fn();

        const result = await planner.executeImportOutputPlan(plan, source, "/imports/outcomes", {
            read: () => ({valid: false}),
            canPublish: (read) => read.valid,
            beforePublish: jest.fn(),
            publish,
        });

        expect(result).toEqual({read: {valid: false}, published: false});
        expect(publish).not.toHaveBeenCalled();
    });

    it("rolls back a published import when planner-owned registration fails", async () => {
        const source = project("stakeAdapter");
        const plan = planner.planImportOutput(source, "outcomeLibrary", "/imports/outcomes");
        const events: string[] = [];

        await expect(planner.executeImportOutputPlan(plan, source, "/imports/outcomes", {
            read: () => ({valid: true}),
            canPublish: (read) => read.valid,
            assertDestinationAvailable: () => {
                events.push("destination");
            },
            publish: () => {
                events.push("publish");
                return "published";
            },
            register: () => {
                events.push("register");
                throw new Error("registration failed");
            },
            rollback: (published) => {
                events.push(`rollback:${published}`);
            },
        })).rejects.toThrow("registration failed");

        expect(events).toEqual(["destination", "publish", "register", "rollback:published"]);
    });

    it("rolls back publication when cancellation arrives during registration", async () => {
        const source = project("stakeAdapter");
        const plan = planner.planImportOutput(source, "outcomeLibrary", "/imports/outcomes");
        const controller = new AbortController();
        const events: string[] = [];

        await expect(planner.executeImportOutputPlan(plan, source, "/imports/outcomes", {
            read: () => ({valid: true}),
            canPublish: (read) => read.valid,
            publish: () => {
                events.push("publish");
                return "published";
            },
            register: () => {
                events.push("register");
                controller.abort();
            },
            rollback: (published) => {
                events.push(`rollback:${published}`);
            },
            signal: controller.signal,
        })).rejects.toThrow(/cancelled/i);

        expect(events).toEqual(["publish", "register", "rollback:published"]);
    });

    it("does not read or publish a cancelled prepared import", async () => {
        const source = project("parWorkbook");
        const plan = planner.planImportOutput(source, "blueprint", "/imports/slot.blueprint.json");
        const controller = new AbortController();
        const read = jest.fn();
        controller.abort();

        await expect(planner.executeImportOutputPlan(plan, source, "/imports/slot.blueprint.json", {
            read,
            canPublish: () => true,
            publish: jest.fn(),
            signal: controller.signal,
        })).rejects.toThrow(/cancelled/i);
        expect(read).not.toHaveBeenCalled();
    });

    it("rejects descriptor provenance drift before its durable conversion publication", async () => {
        const source = {
            ...project("outcomeLibrary"),
            configurationProvenance: {configurationHash: "sha256:prepared", manifestIdentity: "descriptor-v1"},
        };
        const plan = planner.plan(source, "stakeAdapter", {destinationPath: "/exports/stake"});
        const publish = jest.fn();

        await expect(planner.executeConversionPlan(plan, {
            currentSource: () => ({
                ...plan.source,
                configurationProvenance: {configurationHash: "sha256:changed", manifestIdentity: "descriptor-v1"},
            }),
            read: () => ({valid: true}),
            canPublish: () => true,
            publish,
        })).rejects.toThrow(/source changed/i);

        expect(publish).not.toHaveBeenCalled();
    });

    it("rejects a manifest identity change even when the configuration hash is unchanged", async () => {
        const source = {
            ...project("outcomeLibrary"),
            configurationProvenance: {configurationHash: "sha256:same", manifestIdentity: "descriptor-v1"},
        };
        const plan = planner.plan(source, "stakeAdapter", {destinationPath: "/exports/stake"});

        await expect(planner.executeConversionPlan(plan, {
            currentSource: () => ({
                ...plan.source,
                configurationProvenance: {configurationHash: "sha256:same", manifestIdentity: "descriptor-v2"},
            }),
            read: () => ({valid: true}),
            canPublish: () => true,
            publish: () => "published",
        })).rejects.toThrow(/source changed/i);
    });

    it("owns cleanup and one terminal diagnostic when import registration fails", async () => {
        const source = project("stakeAdapter");
        const plan = planner.planImportOutput(source, "outcomeLibrary", "/imports/outcomes");
        const events: string[] = [];

        await expect(planner.executeImportOutputPlan(plan, source, "/imports/outcomes", {
            read: () => ({valid: true}),
            canPublish: (read) => read.valid,
            publish: () => "published",
            register: () => {
                throw new Error("registration failed");
            },
            rollback: () => {
                events.push("rollback");
            },
            cleanup: ({publication, error}) => {
                events.push(`cleanup:${publication}:${error instanceof Error ? error.message : "none"}`);
            },
            onTerminalFailure: (error) => {
                events.push(`diagnostic:${error instanceof Error ? error.message : "none"}`);
            },
        })).rejects.toThrow("registration failed");

        expect(events).toEqual(["rollback", "cleanup:published:registration failed", "diagnostic:registration failed"]);
    });
});
