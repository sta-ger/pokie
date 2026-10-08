import {Button, Stack, Text} from "@mantine/core";
import {useEffect, useId, useRef, useState} from "react";
import {buildBlueprint, openOutputFolder, previewBlueprintBuild, ProjectOpenError} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {CodeBlock} from "../common/CodeBlock";
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
import {useRequestSequence} from "../../hooks/useRequestSequence";
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

// A field present in only one of the two blueprints renders as JSON `undefined`, which
// JSON.stringify silently drops -- spelled out explicitly here instead, so a field that was added or
// removed since the build doesn't blank out and read as if nothing had changed at all.
function formatBlueprintFieldValue(value: unknown): string {
    return value === undefined ? "(not present)" : JSON.stringify(value, null, 2);
}

// The "Compare built blueprint" control's own revealed content -- one row per differing top-level field
// (from diffBlueprintTopLevelFields), each showing the exact value the last build used side by side with
// the current draft's own value. Purely a rendering of the two already-known objects passed in --
// reads `current`/`built`, never writes either, so opening/closing this view can never itself change the
// draft or the built snapshot.
function BuiltBlueprintCompareView({fields, current, built}: {fields: string[]; current: Record<string, unknown>; built: Record<string, unknown>}) {
    return (
        <Stack gap="md">
            {fields.map((field) => (
                <div key={field}>
                    <Text fw={600} size="sm" mb={4}>
                        {field}
                    </Text>
                    <Text size="xs" c="dimmed">
                        Built
                    </Text>
                    <CodeBlock>{formatBlueprintFieldValue(built[field])}</CodeBlock>
                    <Text size="xs" c="dimmed" mt={4}>
                        Current draft
                    </Text>
                    <CodeBlock>{formatBlueprintFieldValue(current[field])}</CodeBlock>
                </div>
            ))}
        </Stack>
    );
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
    onOpenFolder,
    onRestore,
}: {
    snapshot: BuiltBlueprintSnapshot;
    blueprint: Record<string, unknown>;
    onOpen: () => void;
    onOpenFolder: () => void;
    onRestore: () => void;
}) {
    const changed = hasBlueprintChanged(blueprint, snapshot.blueprint as Record<string, unknown>);
    const changedFields = changed ? diffBlueprintTopLevelFields(blueprint, snapshot.blueprint as Record<string, unknown>) : [];
    // Local to this summary, not lifted to BlueprintEditorPage like `builtSnapshot` itself -- purely a
    // "is the comparison panel open" UI toggle, nothing about it needs to survive this component's own
    // remount (a New/Random/Load already discards the whole built snapshot along with it).
    const [compareOpened, setCompareOpened] = useState(false);
    const compareId = useId();

    return (
        <Stack gap="sm">
            <Text style={{overflowWrap: "anywhere"}}>
                Last built &quot;{snapshot.manifest.name}&quot; (id: &quot;{snapshot.manifest.id}&quot;, v{snapshot.manifest.version}) at{" "}
                {formatTimestamp(snapshot.buildInfo.generatedAt)} in &quot;{snapshot.projectRoot}&quot;.
            </Text>
            <Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>
                Blueprint hash: {snapshot.buildInfo.blueprintHash}
            </Text>
            <IssueList title="Warnings" issues={snapshot.warnings} />
            <FileList title="Created files" files={snapshot.createdFiles} />
            <QuickActions>
                <Button onClick={onOpen}>Open in Studio</Button>
                <Button variant="default" onClick={onOpenFolder}>
                    Open output folder
                </Button>
                {changed && (
                    <Button
                        variant="default"
                        aria-expanded={compareOpened}
                        aria-controls={compareId}
                        onClick={() => setCompareOpened((opened) => !opened)}
                    >
                        Compare built blueprint
                    </Button>
                )}
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
            {changed && (
                // Always mounted (toggled via `hidden`, not conditional rendering) so `aria-controls`
                // above never names an element absent from the DOM -- same convention as
                // AdvancedDisclosure's own controlled region.
                <PageSection id={compareId} legend="Comparison against the last build" hidden={!compareOpened}>
                    <BuiltBlueprintCompareView
                        fields={changedFields}
                        current={blueprint}
                        built={snapshot.blueprint as Record<string, unknown>}
                    />
                </PageSection>
            )}
        </Stack>
    );
}

export function BlueprintBuildPanel({
    blueprint,
    sourcePath,
    initialOutDir,
    builtSnapshot,
    onBuilt,
    onRestoreBuilt,
    blocked = false,
    blockedMessage = "Fix the validation errors above before building.",
}: {
    blueprint: Record<string, unknown>;
    sourcePath?: string;
    /** A retained Design recovery reconstructs its destination but still requires an explicit build. */
    initialOutDir?: string;
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
    const describeOutDirFailure = (message: string): string =>
        (/already exists|source itself|inside source|internal directory|cleanup|rollback|cancelled/i).test(message)
            ? message
            : describePathActionError("The output directory", message);
    const withOutDirPreviewError = (view: BuildPreviewView): BuildPreviewView =>
        view.status === "error" || view.status === "load-error" ? {...view, message: describeOutDirFailure(view.message)} : view;
    const withOutDirResultError = (view: BuildProjectView): BuildProjectView =>
        view.status === "error" || view.status === "load-error" || view.status === "failed"
            ? {...view, message: describeOutDirFailure(view.message)}
            : view;

    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const confirm = useConfirm();
    const [outDir, setOutDir] = useState(initialOutDir ?? "");
    useEffect(() => {
        if (initialOutDir !== undefined) setOutDir(initialOutDir);
    }, [initialOutDir]);
    const [preview, setPreview] = useState<BuildPreviewView>({status: "idle"});
    const [result, setResult] = useState<BuildProjectView>({status: "idle"});
    // The exact request (blueprint content, sourcePath, and outDir) a Build Preview's own "ok" result
    // (above) actually describes -- used only to decide whether that result's `destinationHasContent` is
    // still trustworthy for the *current* request before a build (see runBuild below); a stale preview
    // against a since-edited blueprint, sourcePath, or outDir must never be read as if it described
    // today's destination. Compared by JSON identity, same as hasBlueprintChanged's own field-by-field
    // comparisons elsewhere in this panel -- `blueprint` is a plain data object with no stable identity of
    // its own across renders.
    const previewedRequest = useRef<{blueprintJson: string; sourcePath: string | undefined; outDir: string | undefined} | undefined>(undefined);
    // Tags every in-flight destination-check request (from either runPreview or runBuild's own fallback
    // check below) with the order it was issued in -- see useRequestSequence's own doc comment for why
    // an identity comparison alone can't tell apart two concurrent requests sharing the exact same
    // identity (e.g. Build Preview clicked, then Build Package clicked before it settles).
    const requestSeq = useRequestSequence();
    // The live {blueprint, sourcePath, outDir} this render actually holds -- kept in a ref (rather than
    // read fresh from props/state inside an old response's callback) because that callback closure was
    // captured at the render where its request was issued, so its own `blueprint`/`sourcePath`/`outDir`
    // variables are frozen to that moment; this ref is the one thing a stale closure can still read to
    // learn "what does the form/editor show right now". Mirrored from props/state in an effect (writing a
    // ref straight from the render body itself is against the rules of hooks) -- responses only ever
    // resolve on a later tick, well after this effect has already run, so it's never stale by the time
    // it's read.
    const currentIdentityRef = useRef<{blueprintJson: string; sourcePath: string | undefined; outDir: string | undefined}>({
        blueprintJson: JSON.stringify(blueprint),
        sourcePath,
        outDir: outDir.trim() || undefined,
    });
    useEffect(() => {
        const identity = {blueprintJson: JSON.stringify(blueprint), sourcePath, outDir: outDir.trim() || undefined};
        const current = currentIdentityRef.current;
        if (current.blueprintJson !== identity.blueprintJson || current.sourcePath !== identity.sourcePath || current.outDir !== identity.outDir) {
            previewedRequest.current = undefined;
            setPreview({status: "idle"});
        }
        currentIdentityRef.current = identity;
    }, [blueprint, sourcePath, outDir]);
    const previewGuard = useDoubleSubmitGuard();
    const buildGuard = useDoubleSubmitGuard();
    // Validation or source drift can block the editor while an advisory preview is in flight,
    // even without changing the request's blueprint/path identity.
    const currentBlockedRef = useRef(blocked);
    useEffect(() => {
        currentBlockedRef.current = blocked;
    }, [blocked]);

    const isCurrentIdentity = (identity: {blueprintJson: string; sourcePath: string | undefined; outDir: string | undefined}): boolean => {
        const current = currentIdentityRef.current;
        return current.blueprintJson === identity.blueprintJson && current.sourcePath === identity.sourcePath && current.outDir === identity.outDir;
    };

    // A response is only trustworthy for rendering or authorizing a build if BOTH: no
    // later request (of either kind) has since been issued (`seq`, see requestSeq's own doc comment),
    // AND the editor/form still holds the exact values this response describes (isCurrentIdentity) --
    // either one alone misses a real staleness case the other catches.
    const isFreshResponse = (seq: number, identity: {blueprintJson: string; sourcePath: string | undefined; outDir: string | undefined}): boolean =>
        requestSeq.isLatest(seq) && isCurrentIdentity(identity);

    const runPreview = (): void => {
        if (!previewGuard.begin()) {
            return;
        }
        const resolvedOutDir = outDir.trim() || undefined;
        const identity = {blueprintJson: JSON.stringify(blueprint), sourcePath, outDir: resolvedOutDir};
        const seq = requestSeq.next();
        setPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, blueprint, resolvedOutDir, sourcePath)
            .then((view) => {
                if (!isFreshResponse(seq, identity)) {
                    return;
                }
                setPreview(withOutDirPreviewError(describeBuildPreview(view)));
                previewedRequest.current = identity;
            })
            .catch((error: unknown) => {
                if (!isFreshResponse(seq, identity)) {
                    return;
                }
                setPreview({status: "error", message: describeOutDirFailure(errorMessage(error))});
            })
            .finally(() => previewGuard.end());
    };

    const runBuild = (): void => {
        if (blocked || buildGuard.isBlocked()) return;
        const resolvedOutDir = outDir.trim() || undefined;
        const identity = {blueprintJson: JSON.stringify(blueprint), sourcePath, outDir: resolvedOutDir};
        const doBuild = (): void => {
            if (!buildGuard.begin()) {
                return;
            }
            setResult({status: "loading"});
            buildBlueprint(fetchImpl, blueprint, resolvedOutDir, sourcePath)
                .then((view) => {
                    setResult(withOutDirResultError(describeBuildResult(view)));
                    if (view.status === "ok") {
                        previewedRequest.current = undefined;
                        setPreview({status: "idle"});
                        // `blueprint` here is the exact value this closure was built with (this render's
                        // own prop, fixed for the lifetime of this specific request) -- a further edit
                        // made while the build is in flight changes a *later* render's `blueprint`, never
                        // this one, so the snapshot always describes what was actually sent.
                        onBuilt?.({
                            blueprint,
                            manifest: view.manifest,
                            projectRoot: view.projectRoot,
                            buildInfo: view.buildInfo,
                            warnings: view.warnings,
                            createdFiles: view.createdFiles,
                        });
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: describeOutDirFailure(errorMessage(error))}))
                .finally(() => buildGuard.end());
        };

        const buildIfAvailable = (view: BuildPreviewView): void => {
            if (!currentBlockedRef.current && view.status === "ok" && !view.destinationHasContent && view.destinationError === undefined) {
                doBuild();
            }
        };

        // A Build Preview run against this exact blueprint, sourcePath, and outDir already told us whether
        // the destination is empty -- reuse that answer instead of asking again. A stale preview (against
        // a since-edited blueprint or outDir) is deliberately never trusted for this -- see
        // previewedRequest's own doc comment -- so it falls through to the read-only check below instead.
        if (
            preview.status === "ok" &&
            previewedRequest.current !== undefined &&
            previewedRequest.current.blueprintJson === identity.blueprintJson &&
            previewedRequest.current.sourcePath === identity.sourcePath &&
            previewedRequest.current.outDir === identity.outDir
        ) {
            buildIfAvailable(preview);
            return;
        }

        // A fresh read-only check must succeed before publication. Both request
        // sequence and current identity are checked before rendering or building;
        // invalid/error/conflict results leave publication unstarted.
        if (!buildGuard.begin()) {
            return;
        }
        const seq = requestSeq.next();
        previewBlueprintBuild(fetchImpl, blueprint, resolvedOutDir, sourcePath)
            .then((view) => {
                const described = withOutDirPreviewError(describeBuildPreview(view));
                buildGuard.end();
                if (!isFreshResponse(seq, identity)) {
                    return;
                }
                setPreview(described);
                previewedRequest.current = identity;
                buildIfAvailable(described);
            })
            .catch((error: unknown) => {
                buildGuard.end();
                if (!isFreshResponse(seq, identity)) {
                    return;
                }
                setPreview({status: "error", message: describeOutDirFailure(errorMessage(error))});
            });
    };

    const handleOpenFolder = (folderPath: string): void => {
        openOutputFolder(fetchImpl, folderPath)
            .then((view) => {
                if (view.status === "unavailable") {
                    setResult({status: "error", message: view.reason});
                } else if (view.status === "error") {
                    setResult({status: "error", message: view.message});
                }
            })
            .catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}));
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
                    description="Use a new or empty directory. Existing files will not be overwritten."
                    kind="directory"
                    pathPurpose="destination"
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
            <Text size="xs" c="dimmed" mb="sm">
                Build creates a new package in a new or empty directory. Choose another output directory to rebuild; previous artifacts stay unchanged.
            </Text>

            <BuildPreviewDisplay view={preview} />
            {/* onOpen is never actually invoked here -- "ok" is suppressed out of `transientResult` above,
                the callback only satisfies BuildResultDisplay's required prop. */}
            <BuildResultDisplay view={transientResult} onOpen={() => undefined} />

            {builtSnapshot && (
                <BuiltBlueprintSummary
                    snapshot={builtSnapshot}
                    blueprint={blueprint}
                    onOpen={() =>
                        openAndNavigate(builtSnapshot.projectRoot).catch((error: unknown) =>
                            setResult({
                                status: "error",
                                message: errorMessage(error),
                                detail: error instanceof ProjectOpenError ? error.detail : undefined,
                            }),
                        )
                    }
                    onOpenFolder={() => handleOpenFolder(builtSnapshot.projectRoot)}
                    onRestore={handleRestoreBuilt}
                />
            )}
        </PageSection>
    );
}
