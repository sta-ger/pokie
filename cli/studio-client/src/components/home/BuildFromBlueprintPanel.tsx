import {Button, Stack} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useRef, useState} from "react";
import {buildProject, openOutputFolder, previewBuild} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, describeBuildResult, type BuildPreviewView, type BuildProjectView} from "../../domain/interpret/Home";
import {describePathActionError} from "../../domain/pathActionError";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";

type FormValues = {blueprintPath: string; outDir: string};

// StudioHomeService.previewBuild/buildProject's own loadAndValidateBlueprint step never touches outDir
// -- every "load-error" (and a plain apiClient-level "error", which only ever happens before that step
// gets a chance to fail some other way) is about `blueprintPath`. Only Build's own domain "error"/
// "failed" status -- from GamePackageGenerator writing the package -- is ever about `outDir`, same
// underlying service and same fixed subject as the Blueprint Editor's own Build panel.
const describeBlueprintPathFailure = (message: string): string => describePathActionError("The blueprint file", message);
const describeOutDirFailure = (message: string): string => describePathActionError("The output directory", message);
const withBlueprintPathPreviewError = (view: BuildPreviewView): BuildPreviewView =>
    view.status === "error" || view.status === "load-error" ? {...view, message: describeBlueprintPathFailure(view.message)} : view;
const withBuildResultError = (view: BuildProjectView): BuildProjectView => {
    if (view.status === "load-error") {
        return {...view, message: describeBlueprintPathFailure(view.message)};
    }
    if (view.status === "error" || view.status === "failed") {
        return {...view, message: describeOutDirFailure(view.message)};
    }
    return view;
};

export function BuildFromBlueprintPanel() {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const confirm = useConfirm();
    const [preview, setPreview] = useState<BuildPreviewView>({status: "idle"});
    const [result, setResult] = useState<BuildProjectView>({status: "idle"});
    const [lastProjectRoot, setLastProjectRoot] = useState<string>();
    // Remembers the outDir a build already succeeded against this session, so re-clicking Build with the
    // *same* outDir confirms before silently overwriting it -- never gates a first build against a given
    // outDir. Same pattern as the Blueprint Editor's own Build panel.
    const lastBuiltOutDir = useRef<string | undefined>(undefined);
    // The outDir a Build Preview's own "ok" result (above) actually describes -- used only to decide
    // whether that result's `destinationHasContent` is still trustworthy for the *current* outDir text
    // before a build (see runBuild below); a stale preview against a since-edited outDir must never be
    // read as if it described today's destination. Same pattern as the Blueprint Editor's own Build
    // panel, but state rather than a ref: `runPreview` below is passed straight into Mantine's
    // form.onSubmit, and a ref written from a function handed to another call made during render trips
    // react-hooks/refs (its value could, in principle, be read back during that same render).
    const [previewedOutDir, setPreviewedOutDir] = useState<string | undefined>(undefined);
    const previewGuard = useDoubleSubmitGuard();
    const buildGuard = useDoubleSubmitGuard();

    const form = useForm<FormValues>({
        mode: "uncontrolled",
        initialValues: {blueprintPath: "", outDir: ""},
    });

    const runPreview = (values: FormValues): void => {
        if (!previewGuard.begin()) {
            return;
        }
        const resolvedOutDir = values.outDir.trim() || undefined;
        setPreviewedOutDir(resolvedOutDir);
        setPreview({status: "loading"});
        previewBuild(fetchImpl, {blueprintPath: values.blueprintPath, outDir: resolvedOutDir})
            .then((view) => setPreview(withBlueprintPathPreviewError(describeBuildPreview(view))))
            .catch((error: unknown) => setPreview({status: "error", message: describeBlueprintPathFailure(errorMessage(error))}))
            .finally(() => previewGuard.end());
    };

    const runBuild = (): void => {
        const values = form.getValues();
        const outDir = values.outDir.trim() || undefined;
        const doBuild = (): void => {
            if (!buildGuard.begin()) {
                return;
            }
            setResult({status: "loading"});
            buildProject(fetchImpl, {blueprintPath: values.blueprintPath, outDir})
                .then((view) => {
                    setResult(withBuildResultError(describeBuildResult(view)));
                    if (view.status === "ok") {
                        setLastProjectRoot(view.projectRoot);
                        lastBuiltOutDir.current = outDir;
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: describeBlueprintPathFailure(errorMessage(error))}))
                .finally(() => buildGuard.end());
        };

        if (lastBuiltOutDir.current !== undefined && lastBuiltOutDir.current === outDir) {
            const target = outDir ?? "the default output directory";
            confirm(`A package was already built at "${target}" this session. Rebuild and overwrite it?`, doBuild);
            return;
        }

        // A Build Preview run against this exact outDir already told us the destination isn't empty --
        // confirm before writing there, same as the same-session-rebuild case above. A stale preview
        // (against a since-edited outDir) is deliberately never trusted for this -- see previewedOutDir's
        // own doc comment -- so an outDir change without a fresh Preview falls straight through to
        // doBuild(), unchanged from this panel's prior behavior.
        if (preview.status === "ok" && preview.destinationHasContent && previewedOutDir === outDir) {
            confirm(`"${preview.projectRoot}" already has content. Building will create/update files there. Continue?`, doBuild);
            return;
        }

        doBuild();
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

    return (
        <Stack gap="md" maw={560}>
            <form onSubmit={form.onSubmit(runPreview)}>
                <Stack gap="sm">
                    <PathInput
                        label="Blueprint JSON path"
                        required
                        kind="file"
                        browseTitle="Browse for a blueprint JSON file"
                        browseId="build-from-blueprint-path"
                        fileFilters={[{name: "JSON files", extensions: ["json"]}]}
                        {...form.getInputProps("blueprintPath")}
                        onPathSelected={(path) => form.setFieldValue("blueprintPath", path)}
                        key={form.key("blueprintPath")}
                    />
                    <PathInput
                        label="Output directory (optional)"
                        kind="directory"
                        browseTitle="Browse for an output directory"
                        browseId="build-from-blueprint-out-dir"
                        {...form.getInputProps("outDir")}
                        onPathSelected={(path) => form.setFieldValue("outDir", path)}
                        key={form.key("outDir")}
                    />
                    <QuickActions>
                        <Button type="submit" loading={preview.status === "loading"}>
                            Preview
                        </Button>
                        <Button variant="default" onClick={runBuild} loading={result.status === "loading"}>
                            Build
                        </Button>
                    </QuickActions>
                </Stack>
            </form>

            <BuildPreviewDisplay view={preview} />
            <BuildResultDisplay
                view={result}
                onOpen={() => {
                    if (lastProjectRoot !== undefined) {
                        openAndNavigate(lastProjectRoot).catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}));
                    }
                }}
                onOpenFolder={lastProjectRoot !== undefined ? () => handleOpenFolder(lastProjectRoot) : undefined}
            />
        </Stack>
    );
}
