import {Button, Stack, Text} from "@mantine/core";
import {useRef, useState} from "react";
import {buildBlueprint, previewBlueprintBuild} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {FileList} from "../common/FileList";
import {IssueList} from "../common/IssueList";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {errorMessage} from "../../domain/errorMessage";
import {formatTimestamp} from "../../domain/formatTimestamp";
import {diffBlueprintTopLevelFields, hasBlueprintChanged} from "../../domain/interpret/BlueprintEditor";
import {
    describeBuildPreview,
    describeBuildResult,
    type BuildPreviewView,
    type BuildProjectView,
    type BuiltBlueprintSnapshot,
} from "../../domain/interpret/Home";
import {describePathActionError} from "../../domain/pathActionError";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";

// Mirrors GamePackageGenerator.generate's own default -- an omitted outDir lands at
// "<studio root>/<manifest.id>", never Studio's browse root itself -- so a blank Output directory's
// "Auto resolved destination" hint (see PathInput's own autoDestinationPath) shows Build's real target
// instead. Returns undefined for a missing/blank id (still resolves to the root, unchanged behavior) --
// GameBlueprintValidator itself is what rejects an empty "manifest.id", not this hint.
function buildOutputAutoDestination(blueprint: Record<string, unknown>): string | undefined {
    const manifest = blueprint.manifest;
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
        return undefined;
    }
    const id = (manifest as Record<string, unknown>).id;
    return typeof id === "string" && id.trim().length > 0 ? id : undefined;
}

// The persistent "last successful build" block -- rendered from `builtSnapshot`, which the parent keeps
// alive across this panel's own key={`build-${formGeneration}`} remount and across a later failed
// rebuild (the transient `result` state going to "error"/"failed" never touches this). `changed` is a
// content comparison of the *current* draft against the exact blueprint that produced this build, never
// a revision-number one -- see hasBlueprintChanged's own doc comment for why "Restore built blueprint"
// itself would otherwise permanently defeat a revision-based check.
function BuiltBlueprintSummary({
    snapshot,
    blueprint,
    onOpen,
    onRestore,
}: {
    snapshot: BuiltBlueprintSnapshot;
    blueprint: Record<string, unknown>;
    onOpen: () => void;
    onRestore: () => void;
}) {
    const changed = hasBlueprintChanged(blueprint, snapshot.blueprint as Record<string, unknown>);
    const changedFields = changed ? diffBlueprintTopLevelFields(blueprint, snapshot.blueprint as Record<string, unknown>) : [];

    return (
        <Stack gap="sm">
            <Text style={{overflowWrap: "anywhere"}}>
                Last built &quot;{snapshot.manifest.name}&quot; (id: &quot;{snapshot.manifest.id}&quot;, v{snapshot.manifest.version}) at{" "}
                {formatTimestamp(snapshot.buildInfo.generatedAt)} in &quot;{snapshot.projectRoot}&quot;
                {snapshot.unchanged ? " (unchanged — deterministic rebuild)." : "."}
            </Text>
            <Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>
                Blueprint hash: {snapshot.buildInfo.blueprintHash}
            </Text>
            <IssueList title="Warnings" issues={snapshot.warnings} />
            <FileList title="Created files" files={snapshot.createdFiles} />
            <QuickActions>
                <Button onClick={onOpen}>Open in Studio</Button>
                {changed && (
                    <Button variant="default" onClick={onRestore}>
                        Restore built blueprint
                    </Button>
                )}
            </QuickActions>
            {changed ? (
                <RecoveryNotice
                    message={`Unbuilt changes — the draft has changed since this build (${changedFields.join(", ") || "top-level fields"} differ). Rebuild to include them, or discard them to go back to what was built.`}
                    actionLabel="Discard unbuilt changes"
                    onAction={onRestore}
                />
            ) : (
                <Text size="xs" c="dimmed">
                    Matches the last build — no unbuilt changes.
                </Text>
            )}
        </Stack>
    );
}

export function BlueprintBuildPanel({
    blueprint,
    sourcePath,
    builtSnapshot,
    onBuilt,
    onRestoreBuilt,
    blocked = false,
    blockedMessage = "Fix the validation errors above before building.",
}: {
    blueprint: Record<string, unknown>;
    sourcePath?: string;
    // The persistent last-successful-build record -- owned by BlueprintEditorPage, not this panel's own
    // local state (see BuiltBlueprintSummary's own doc comment for why).
    builtSnapshot?: BuiltBlueprintSnapshot;
    // Fired with the full record on a successful build. Deliberately NOT folded into the same
    // "mark clean" bookkeeping Save uses: building a package is not the same fact as the source blueprint
    // being saved to disk, and conflating the two used to make an unsaved draft silently read as "clean"
    // (no unsaved-changes warning) the moment it happened to build successfully -- see
    // BlueprintEditorPage's own cleanRevisionRef doc comment.
    onBuilt?: (snapshot: BuiltBlueprintSnapshot) => void;
    // Wholesale-replaces the draft with the exact blueprint that produced `builtSnapshot` -- both
    // "Restore built blueprint" and "Discard unbuilt changes" in BuiltBlueprintSummary call this same one
    // operation, gated behind the same confirm below.
    onRestoreBuilt?: (blueprint: unknown) => void;
    // Disables only "Build Package" (never the non-destructive "Build Preview") -- set when the blueprint
    // is known-invalid, so the happy path never lets a build be attempted that the server would reject
    // anyway. Warnings-only validation results never set this.
    blocked?: boolean;
    // Shown under the buttons whenever `blocked` is true. Defaults to the "known-invalid" wording, which
    // is exactly what raw/non-guided callers mean by `blocked`; the guided editor overrides this since it
    // also blocks on "not yet successfully validated" (idle/loading/error), where that default text would
    // be misleading -- there's no validation error to "fix" yet.
    blockedMessage?: string;
}) {
    // Unlike Home's Build-from-Blueprint tab (whose blueprint comes from a user-typed path, so a
    // "load-error" here can be about that path), this panel's blueprint is always the in-memory editor
    // model -- the only user-typed path involved anywhere in this panel's own preview/build request is
    // Output directory, so every error-carrying status below is safely describable with that one fixed
    // subject.
    const describeOutDirFailure = (message: string): string => describePathActionError("The output directory", message);
    const withOutDirPreviewError = (view: BuildPreviewView): BuildPreviewView =>
        view.status === "error" || view.status === "load-error" ? {...view, message: describeOutDirFailure(view.message)} : view;
    const withOutDirResultError = (view: BuildProjectView): BuildProjectView =>
        view.status === "error" || view.status === "load-error" || view.status === "failed"
            ? {...view, message: describeOutDirFailure(view.message)}
            : view;

    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const confirm = useConfirm();
    const [outDir, setOutDir] = useState("");
    const [preview, setPreview] = useState<BuildPreviewView>({status: "idle"});
    const [result, setResult] = useState<BuildProjectView>({status: "idle"});
    const lastBuiltOutDir = useRef<string | undefined>(undefined);
    const previewGuard = useDoubleSubmitGuard();
    const buildGuard = useDoubleSubmitGuard();

    const runPreview = (): void => {
        if (!previewGuard.begin()) {
            return;
        }
        setPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, blueprint, outDir.trim() || undefined, sourcePath)
            .then((view) => setPreview(withOutDirPreviewError(describeBuildPreview(view))))
            .catch((error: unknown) => setPreview({status: "error", message: describeOutDirFailure(errorMessage(error))}))
            .finally(() => previewGuard.end());
    };

    const runBuild = (): void => {
        const resolvedOutDir = outDir.trim() || undefined;
        const doBuild = (): void => {
            if (!buildGuard.begin()) {
                return;
            }
            setResult({status: "loading"});
            buildBlueprint(fetchImpl, blueprint, resolvedOutDir, sourcePath)
                .then((view) => {
                    setResult(withOutDirResultError(describeBuildResult(view)));
                    if (view.status === "ok") {
                        lastBuiltOutDir.current = resolvedOutDir;
                        // `blueprint` here is the exact value this closure was built with (this render's
                        // own prop, fixed for the lifetime of this specific request) -- a further edit
                        // made while the build is in flight changes a *later* render's `blueprint`, never
                        // this one, so the snapshot always describes what was actually sent.
                        onBuilt?.({
                            blueprint,
                            manifest: view.manifest,
                            projectRoot: view.projectRoot,
                            buildInfo: view.buildInfo,
                            unchanged: view.unchanged,
                            warnings: view.warnings,
                            createdFiles: view.createdFiles,
                        });
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: describeOutDirFailure(errorMessage(error))}))
                .finally(() => buildGuard.end());
        };

        if (lastBuiltOutDir.current !== undefined && lastBuiltOutDir.current === resolvedOutDir) {
            const target = resolvedOutDir ?? "the default output directory";
            confirm(`A package was already built at "${target}" this session. Rebuild and overwrite it?`, doBuild);
            return;
        }
        doBuild();
    };

    // Both "Restore built blueprint" and "Discard unbuilt changes" (BuiltBlueprintSummary below) call
    // this one operation -- a destructive wholesale replace of the current draft, gated behind the same
    // confirm every other destructive action in this codebase uses.
    const handleRestoreBuilt = (): void => {
        if (!builtSnapshot) {
            return;
        }
        confirm("Discard the changes made since the last build and restore the built blueprint?", () => onRestoreBuilt?.(builtSnapshot.blueprint));
    };

    // Suppressed to "idle" once a build reaches "ok" -- BuiltBlueprintSummary below (driven by the
    // persistent `builtSnapshot`, not this transient `result`) is the one place a successful build is
    // rendered, so the two never show the same success twice, and a later failed rebuild's "error"/
    // "failed" status here never hides that still-valid prior success.
    const transientResult: BuildProjectView = result.status === "ok" ? {status: "idle"} : result;

    return (
        <PageSection legend="Build">
            <QuickActions>
                <PathInput
                    label="Output directory (optional)"
                    kind="directory"
                    browseTitle="Browse for an output directory"
                    browseId="blueprint-build-out-dir"
                    autoDestinationPath={buildOutputAutoDestination(blueprint)}
                    value={outDir}
                    onChange={(event) => setOutDir(event.currentTarget.value)}
                    onPathSelected={setOutDir}
                />
                <Button variant="default" onClick={runPreview} loading={preview.status === "loading"}>
                    Build Preview
                </Button>
                <Button onClick={runBuild} loading={result.status === "loading"} disabled={blocked}>
                    Build Package
                </Button>
            </QuickActions>
            {blocked && (
                <Text size="sm" c="orange" mb="sm">
                    {blockedMessage}
                </Text>
            )}

            <BuildPreviewDisplay view={preview} />
            {/* onOpen is never actually invoked here -- "ok" is suppressed out of `transientResult` above,
                the callback only satisfies BuildResultDisplay's required prop. */}
            <BuildResultDisplay view={transientResult} onOpen={() => undefined} />

            {builtSnapshot && (
                <BuiltBlueprintSummary
                    snapshot={builtSnapshot}
                    blueprint={blueprint}
                    onOpen={() =>
                        openAndNavigate(builtSnapshot.projectRoot).catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}))
                    }
                    onRestore={handleRestoreBuilt}
                />
            )}
        </PageSection>
    );
}
