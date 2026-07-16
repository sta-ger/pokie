import {Alert, Button, TextInput} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import {useState} from "react";
import type {BlueprintLoadView, BlueprintSaveView} from "../../domain/interpret/BlueprintEditor";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";
import {SuccessResult} from "../common/SuccessResult";

export function BlueprintLoadSaveControls({
    onNew,
    onLoad,
    onSave,
    onOverwrite,
    loadView,
    saveView,
    initialLoadPath,
    initialSavePath,
}: {
    onNew: () => void;
    onLoad: (path: string) => void;
    onSave: (path: string) => void;
    onOverwrite: (path: string) => void;
    loadView: BlueprintLoadView;
    saveView: BlueprintSaveView;
    initialLoadPath: string;
    initialSavePath: string;
}) {
    const [loadPath, setLoadPath] = useState(initialLoadPath);
    const [savePath, setSavePath] = useState(initialSavePath);

    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={onNew}>
                    New Blueprint
                </Button>
                <TextInput label="Load from path" value={loadPath} onChange={(event) => setLoadPath(event.currentTarget.value)} />
                <Button variant="default" onClick={() => onLoad(loadPath)}>
                    Load
                </Button>
                <TextInput label="Save to path" value={savePath} onChange={(event) => setSavePath(event.currentTarget.value)} />
                <Button variant="default" onClick={() => onSave(savePath)}>
                    Save
                </Button>
            </QuickActions>

            {loadView.status === "error" || loadView.status === "load-error" ? <ErrorState message={loadView.message} /> : null}

            {saveView.status === "conflict" && (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title={saveView.message}>
                    <Button color="red" onClick={() => onOverwrite(saveView.path)}>
                        Overwrite
                    </Button>
                </Alert>
            )}
            {(saveView.status === "error" || saveView.status === "failed") && <ErrorState message={saveView.message} />}
            {saveView.status === "ok" && <SuccessResult message={`Saved to "${saveView.path}".`} />}
        </div>
    );
}
