import {Button, Collapse, TextInput} from "@mantine/core";
import {useState} from "react";
import type {BlueprintLoadView, BlueprintSaveView} from "../../domain/interpret/BlueprintEditor";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
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
    advancedOptionsOpened,
}: {
    onNew: () => void;
    onLoad: (path: string) => void;
    onSave: (path: string) => void;
    onOverwrite: (path: string) => void;
    loadView: BlueprintLoadView;
    saveView: BlueprintSaveView;
    initialLoadPath: string;
    initialSavePath: string;
    // When omitted, Load/Save are always shown (today's exact behavior, used by the raw/advanced
    // editor). When provided, Load/Save fields are only shown while `advancedOptionsOpened` is true --
    // the guided flow tucks them behind its own "Show advanced options" disclosure, since Build works
    // directly off the in-memory blueprint and never strictly needs an explicit Load-by-path/Save.
    advancedOptionsOpened?: boolean;
}) {
    const [loadPath, setLoadPath] = useState(initialLoadPath);
    const [savePath, setSavePath] = useState(initialSavePath);
    const loadSaveFields = (
        <QuickActions>
            <TextInput label="Load from path" value={loadPath} onChange={(event) => setLoadPath(event.currentTarget.value)} />
            <Button variant="default" onClick={() => onLoad(loadPath)} loading={loadView.status === "loading"}>
                Load
            </Button>
            <TextInput label="Save to path" value={savePath} onChange={(event) => setSavePath(event.currentTarget.value)} />
            <Button variant="default" onClick={() => onSave(savePath)} loading={saveView.status === "loading"}>
                Save
            </Button>
        </QuickActions>
    );

    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={onNew}>
                    New Blueprint
                </Button>
            </QuickActions>
            {advancedOptionsOpened === undefined ? loadSaveFields : <Collapse expanded={advancedOptionsOpened}>{loadSaveFields}</Collapse>}

            {loadView.status === "error" || loadView.status === "load-error" ? <ErrorState message={loadView.message} /> : null}

            {saveView.status === "conflict" && (
                <RecoveryNotice title={saveView.message} message={null} actionLabel="Overwrite" actionColor="red" onAction={() => onOverwrite(saveView.path)} />
            )}
            {(saveView.status === "error" || saveView.status === "failed") && <ErrorState message={saveView.message} />}
            {saveView.status === "ok" && <SuccessResult message={`Saved to "${saveView.path}".`} />}
        </div>
    );
}
