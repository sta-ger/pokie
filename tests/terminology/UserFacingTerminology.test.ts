import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// Words that belong to the internal build/audit vocabulary. They are allowed in the API reference
// where they have a precise meaning, but not on the front door or in the main Studio path.
const banned = [
    "artifact",
    "dossier",
    "provenance",
    "materialize",
    "materialization",
    "projection",
    "binding",
    "capability",
    "lifecycle",
    "preflight",
    "retained",
    "canonical",
];

// Exact labels that used to leak the internal vocabulary into the main Studio path. Keeping the
// denylist explicit avoids false positives from JSX expressions and local variable names.
const removedStudioLabels = [
    "Artifact ABI",
    "Artifact byte count",
    "Artifact format",
    "Artifact SHA-256",
    "Canonical symbol/line/scatter hits unavailable.",
    "Continue to Preview canonical model",
    "Preview canonical model",
    "Choose canonical symbol",
    "analytics provenance",
    "Analytics provenance",
    "Issues & provenance",
    "building artifacts",
    "canonical hits and components",
    "Round artifact unavailable",
    "Replay Artifact",
    "The pasted artifact",
    "Provenance / source",
    "Canonical hit rates",
    "Lifecycle unavailable",
    "Validating artifact",
    "Preflight diagnostic",
    "Declared capabilities",
    "Download index.json",
    "Feature lifecycle",
    "Full evidence and provenance",
    "Generation preflight",
    "Inspect provenance",
    "Inspect round artifact",
    "No canonical components observed.",
    "No configured features support lifecycle observations.",
    "PAR evidence eligibility is verified from explicit import facts and Meta/hash provenance.",
    "RNG host binding",
    "Snapshot captured for this round",
];

// Exact CLI output fragments that used to expose internal build vocabulary. The CLI tests assert the
// replacement wording; this list keeps the old phrases from creeping back in.
const removedCliStrings = [
    "<artifact.wasm>",
    "Cancelling artifact build",
    "Artifact build cancelled",
    "Build preflight:",
    "Conversion plan: materialize",
    "outcome-library artifact at",
    "Materialized ",
    "Materialization boundary",
    "Declared component manifest",
    "canonical ABI",
    "capabilities     ",
];

function read(file: string): string {
    return fs.readFileSync(path.join(root, file), "utf8");
}

function prose(file: string): string {
    return read(file)
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`\n]*`/g, "");
}

describe("user-facing terminology", () => {
    it.each(["README.md", "docs/README.md", "docs/getting-started.md"])(
        "%s avoids internal architecture words",
        (file) => {
            const text = prose(file).toLowerCase();
            for (const word of banned) {
                expect(text).not.toContain(word);
            }
        },
    );

    it("keeps the glossary's avoid table explicit", () => {
        const text = read("docs/glossary.md");
        expect(text).toContain("Words we avoid in the main UI");
        for (const word of ["artifact", "dossier", "provenance", "materialize", "projection", "binding", "capability", "lifecycle", "preflight"]) {
            expect(text).toContain(`| ${word}`);
        }
    });

    it.each([
        "cli/commands/BuildCommand.ts",
        "cli/commands/ReplayCommand.ts",
        "cli/commands/SimCommand.ts",
        "cli/commands/RunWasmCommand.ts",
        "cli/commands/ImportCommand.ts",
        "cli/commands/ValidateCommand.ts",
        "cli/commands/InspectCommand.ts",
        "cli/commands/ReelCommand.ts",
        "cli/commands/ParCommand.ts",
    ])("%s no longer prints removed CLI wording", (file) => {
        const text = read(file);
        for (const label of removedCliStrings) {
            expect(text).not.toContain(label);
        }
    });

    it.each([
        "cli/studio-client/src/components/project/ExportDeployTab.tsx",
        "cli/studio-client/src/components/project/CertificationTab.tsx",
        "cli/studio-client/src/components/project/ProjectDashboardPage.tsx",
        "cli/studio-client/src/components/common/SimulationAnalyticsDisplay.tsx",
        "cli/studio-client/src/components/common/JobResultCard.tsx",
        "cli/studio-client/src/components/common/AdvancedValidationPanel.tsx",
        "cli/studio-client/src/components/project/OptimizationPanel.tsx",
        "cli/studio-client/src/components/blueprintEditor/ParSheetImportExportPanel.tsx",
        "cli/studio-client/src/components/blueprintEditor/ReelStripsEditor.tsx",
        "cli/studio-client/src/components/blueprintEditor/ReelStripGenerationEditor.tsx",
        "cli/studio-client/src/components/project/ReplayTab.tsx",
    ])("%s no longer renders the removed Studio labels", (file) => {
        const text = read(file);
        for (const label of removedStudioLabels) {
            expect(text).not.toContain(label);
        }
    });
});
