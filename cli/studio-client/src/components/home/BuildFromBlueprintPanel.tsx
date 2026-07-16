import {Button, Stack, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useRef, useState} from "react";
import {buildProject, previewBuild} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {BuildResultDisplay} from "../common/BuildResultDisplay";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, describeBuildResult, type BuildPreviewView, type BuildProjectView} from "../../domain/interpret/Home";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {QuickActions} from "../common/QuickActions";

type FormValues = {blueprintPath: string; outDir: string};

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
        setPreview({status: "loading"});
        previewBuild(fetchImpl, {blueprintPath: values.blueprintPath, outDir: values.outDir.trim() || undefined})
            .then((view) => setPreview(describeBuildPreview(view)))
            .catch((error: unknown) => setPreview({status: "error", message: errorMessage(error)}))
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
                    setResult(describeBuildResult(view));
                    if (view.status === "ok") {
                        setLastProjectRoot(view.projectRoot);
                        lastBuiltOutDir.current = outDir;
                    }
                })
                .catch((error: unknown) => setResult({status: "error", message: errorMessage(error)}))
                .finally(() => buildGuard.end());
        };

        if (lastBuiltOutDir.current !== undefined && lastBuiltOutDir.current === outDir) {
            const target = outDir ?? "the default output directory";
            confirm(`A package was already built at "${target}" this session. Rebuild and overwrite it?`, doBuild);
            return;
        }
        doBuild();
    };

    return (
        <Stack gap="md" maw={560}>
            <form onSubmit={form.onSubmit(runPreview)}>
                <Stack gap="sm">
                    <TextInput label="Blueprint JSON path" required {...form.getInputProps("blueprintPath")} key={form.key("blueprintPath")} />
                    <TextInput label="Output directory (optional)" {...form.getInputProps("outDir")} key={form.key("outDir")} />
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
            />
        </Stack>
    );
}
