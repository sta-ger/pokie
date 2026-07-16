import {Button, Text, TextInput} from "@mantine/core";
import {useRef, useState} from "react";
import {buildBlueprint, previewBlueprintBuild} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, describeBuildResult, type BuildPreviewView, type BuildProjectView} from "../../domain/interpret/Home";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

export function BlueprintBuildPanel({
    blueprint,
    sourcePath,
    revision,
    onBuildSuccess,
    blocked = false,
}: {
    blueprint: Record<string, unknown>;
    sourcePath?: string;
    // The editor's own revision at the moment this exact blueprint snapshot was rendered -- captured at
    // build-request time (not response time) so a caller can tell "this specific edit was built" apart
    // from any further edits made while the build was in flight (see onBuildSuccess below).
    revision: number;
    // Fired with the revision that was actually built, right alongside the existing "Open in Studio"
    // success state -- lets BlueprintEditorPage treat a successful build as a clean/no-longer-dirty
    // checkpoint.
    onBuildSuccess?: (builtRevision: number) => void;
    // Disables only "Build Package" (never the non-destructive "Build Preview") -- set when the blueprint
    // is known-invalid, so the happy path never lets a build be attempted that the server would reject
    // anyway. Warnings-only validation results never set this.
    blocked?: boolean;
}) {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const confirm = useConfirm();
    const [outDir, setOutDir] = useState("");
    const [preview, setPreview] = useState<BuildPreviewView>({status: "idle"});
    const [result, setResult] = useState<BuildProjectView>({status: "idle"});
    const [lastProjectRoot, setLastProjectRoot] = useState<string>();
    const lastBuiltOutDir = useRef<string | undefined>(undefined);
    const previewGuard = useDoubleSubmitGuard();
    const buildGuard = useDoubleSubmitGuard();

    const runPreview = (): void => {
        if (!previewGuard.begin()) {
            return;
        }
        setPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, blueprint, outDir.trim() || undefined, sourcePath)
            .then((view) => setPreview(describeBuildPreview(view)))
            .catch((error: unknown) => setPreview({status: "error", message: errorMessage(error)}))
            .finally(() => previewGuard.end());
    };

    const runBuild = (): void => {
        const resolvedOutDir = outDir.trim() || undefined;
        // Captured now, at request-send time -- if the user keeps editing while this build is in flight,
        // the *built* revision must still be reported as whatever was actually sent, not whatever the
        // revision happens to be once the response arrives.
        const builtRevision = revision;
        const doBuild = (): void => {
            if (!buildGuard.begin()) {
                return;
            }
            setResult({status: "loading"});
            buildBlueprint(fetchImpl, blueprint, resolvedOutDir, sourcePath)
                .then((view) => {
                    setResult(describeBuildResult(view));
                    if (view.status === "ok") {
                        setLastProjectRoot(view.projectRoot);
                        lastBuiltOutDir.current = resolvedOutDir;
                        onBuildSuccess?.(builtRevision);
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}))
                .finally(() => buildGuard.end());
        };

        if (lastBuiltOutDir.current !== undefined && lastBuiltOutDir.current === resolvedOutDir) {
            const target = resolvedOutDir ?? "the default output directory";
            confirm(`A package was already built at "${target}" this session. Rebuild and overwrite it?`, doBuild);
            return;
        }
        doBuild();
    };

    return (
        <PageSection legend="Build">
            <QuickActions>
                <TextInput label="Output directory (optional)" value={outDir} onChange={(event) => setOutDir(event.currentTarget.value)} />
                <Button variant="default" onClick={runPreview} loading={preview.status === "loading"}>
                    Build Preview
                </Button>
                <Button onClick={runBuild} loading={result.status === "loading"} disabled={blocked}>
                    Build Package
                </Button>
            </QuickActions>
            {blocked && (
                <Text size="sm" c="orange" mb="sm">
                    Fix the validation errors above before building.
                </Text>
            )}

            <BuildPreviewDisplay view={preview} />
            <BuildResultDisplay
                view={result}
                onOpen={() => {
                    if (lastProjectRoot !== undefined) {
                        openAndNavigate(lastProjectRoot).catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}));
                    }
                }}
            />
        </PageSection>
    );
}
