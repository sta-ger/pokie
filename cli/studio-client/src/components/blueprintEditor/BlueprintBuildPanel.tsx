import {Button, TextInput} from "@mantine/core";
import {useRef, useState} from "react";
import {buildBlueprint, previewBlueprintBuild} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, describeBuildResult, type BuildPreviewView, type BuildProjectView} from "../../domain/interpret/Home";
import {useConfirm} from "../../hooks/useConfirm";
import {useOpenProject} from "../../hooks/useOpenProject";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

export function BlueprintBuildPanel({blueprint, sourcePath}: {blueprint: Record<string, unknown>; sourcePath?: string}) {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const confirm = useConfirm();
    const [outDir, setOutDir] = useState("");
    const [preview, setPreview] = useState<BuildPreviewView>({status: "idle"});
    const [result, setResult] = useState<BuildProjectView>({status: "idle"});
    const [lastProjectRoot, setLastProjectRoot] = useState<string>();
    const lastBuiltOutDir = useRef<string | undefined>(undefined);

    const runPreview = (): void => {
        setPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, blueprint, outDir.trim() || undefined, sourcePath)
            .then((view) => setPreview(describeBuildPreview(view)))
            .catch((error: unknown) => setPreview({status: "error", message: errorMessage(error)}));
    };

    const runBuild = (): void => {
        const resolvedOutDir = outDir.trim() || undefined;
        const doBuild = (): void => {
            setResult({status: "loading"});
            buildBlueprint(fetchImpl, blueprint, resolvedOutDir, sourcePath)
                .then((view) => {
                    setResult(describeBuildResult(view));
                    if (view.status === "ok") {
                        setLastProjectRoot(view.projectRoot);
                        lastBuiltOutDir.current = resolvedOutDir;
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}));
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
                <Button variant="default" onClick={runPreview}>
                    Build Preview
                </Button>
                <Button onClick={runBuild}>Build Package</Button>
            </QuickActions>

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
