import {SegmentedControl} from "@mantine/core";
import {useRef, useState} from "react";
import {loadBlueprint, saveBlueprint, validateBlueprint} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeLoadResult,
    describeSaveResult,
    describeValidation,
    type BlueprintLoadView,
    type BlueprintSaveView,
    type BlueprintValidationView,
} from "../../domain/interpret/BlueprintEditor";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {BetsList} from "./BetsList";
import {BlueprintBuildPanel} from "./BlueprintBuildPanel";
import {BlueprintJsonPanel} from "./BlueprintJsonPanel";
import {BlueprintLoadSaveControls} from "./BlueprintLoadSaveControls";
import {BlueprintValidationPanel} from "./BlueprintValidationPanel";
import {MetadataFieldset} from "./MetadataFieldset";
import {PaylinesEditor} from "./PaylinesEditor";
import {PaytableEditor} from "./PaytableEditor";
import {ReelGenerationModeSelector} from "./ReelGenerationModeSelector";
import {SymbolsTable} from "./SymbolsTable";

type BlueprintMode = "form" | "json";

export function BlueprintEditorPage() {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [mode, setMode] = useState<BlueprintMode>("form");
    const [blueprintPath, setBlueprintPath] = useState<string>();
    const overwriteConfirmedForPath = useRef<string>();
    const [loadView, setLoadView] = useState<BlueprintLoadView>({status: "idle"});
    const [saveView, setSaveView] = useState<BlueprintSaveView>({status: "idle"});
    const [validationView, setValidationView] = useState<BlueprintValidationView>({status: "idle"});

    const handleNew = (): void => {
        editor.newBlueprint();
        setBlueprintPath(undefined);
        overwriteConfirmedForPath.current = undefined;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setValidationView({status: "idle"});
    };

    const handleLoad = (path: string): void => {
        loadBlueprint(fetchImpl, path)
            .then((result) => {
                setLoadView(describeLoadResult(result));
                if (result.status === "ok") {
                    editor.loadFrom(result.blueprint);
                    setBlueprintPath(result.path);
                    overwriteConfirmedForPath.current = result.path;
                }
            })
            .catch((error: unknown) => setLoadView({status: "error", message: errorMessage(error)}));
    };

    const runSave = (path: string, overwrite: boolean): void => {
        saveBlueprint(fetchImpl, path, editor.state.blueprint, overwrite)
            .then((result) => {
                setSaveView(describeSaveResult(result));
                if (result.status === "ok") {
                    setBlueprintPath(result.path);
                    overwriteConfirmedForPath.current = result.path;
                }
            })
            .catch((error: unknown) => setSaveView({status: "error", message: errorMessage(error)}));
    };

    const handleSave = (path: string): void => {
        runSave(path, overwriteConfirmedForPath.current === path);
    };

    const handleOverwrite = (path: string): void => {
        confirm(`Overwrite the blueprint at "${path}"?`, () => runSave(path, true));
    };

    const handleValidate = (): void => {
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, editor.state.blueprint)
            .then((result) => setValidationView(describeValidation(result)))
            .catch((error: unknown) => setValidationView({status: "error", message: errorMessage(error)}));
    };

    const {blueprint, revision} = editor.state;

    return (
        <div>
            <BlueprintLoadSaveControls
                onNew={handleNew}
                onLoad={handleLoad}
                onSave={handleSave}
                onOverwrite={handleOverwrite}
                loadView={loadView}
                saveView={saveView}
                initialLoadPath=""
                initialSavePath=""
            />

            <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as BlueprintMode)}
                data={[
                    {label: "Form", value: "form"},
                    {label: "JSON", value: "json"},
                ]}
                mb="md"
                aria-label="Blueprint editor mode"
            />

            {mode === "form" ? (
                <div key={editor.formGeneration}>
                    <MetadataFieldset blueprint={blueprint} mutate={editor.mutate} />
                    <SymbolsTable blueprint={blueprint} mutate={editor.mutate} />
                    <BetsList blueprint={blueprint} mutate={editor.mutate} />
                    <PaylinesEditor blueprint={blueprint} mutate={editor.mutate} />
                    <PaytableEditor blueprint={blueprint} mutate={editor.mutate} />
                    <ReelGenerationModeSelector blueprint={blueprint} mutate={editor.mutate} drafts={editor.drafts} revision={revision} />
                </div>
            ) : (
                <BlueprintJsonPanel jsonText={editor.state.jsonText} jsonError={editor.state.jsonError} onApply={editor.applyJson} />
            )}

            <BlueprintValidationPanel view={validationView} onValidate={handleValidate} />
            <BlueprintBuildPanel blueprint={blueprint} sourcePath={blueprintPath} />
        </div>
    );
}
