import {Button, Collapse} from "@mantine/core";
import {useState} from "react";
import type {BlueprintLoadView, BlueprintSaveView} from "../../domain/interpret/BlueprintEditor";
import {describePathActionError} from "../../domain/pathActionError";
import {ErrorState} from "../common/ErrorState";
import {PathInput} from "../common/PathInput";
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
    // When omitted, Load/Save are always shown (BlueprintEditorPage's own non-guided mode). When
    // provided, Load/Save fields are only shown while `advancedOptionsOpened` is true -- the guided flow
    // tucks them behind its own "Show advanced options" disclosure, since Build works directly off the
    // in-memory blueprint and never strictly needs an explicit Load-by-path/Save.
    advancedOptionsOpened?: boolean;
}) {
    const [loadPath, setLoadPath] = useState(initialLoadPath);
    const [savePath, setSavePath] = useState(initialSavePath);
    const loadSaveFields = (
        <QuickActions>
            <PathInput
                label="Load from path"
                kind="file"
                browseTitle="Browse for a blueprint JSON file"
                browseId="blueprint-load-path"
                fileFilters={[{name: "JSON files", extensions: ["json"]}]}
                value={loadPath}
                onChange={(event) => setLoadPath(event.currentTarget.value)}
                onPathSelected={setLoadPath}
            />
            <Button variant="default" onClick={() => onLoad(loadPath)} loading={loadView.status === "loading"}>
                Load
            </Button>
            <PathInput
                label="Save to path"
                kind="file"
                browseTitle="Browse for a blueprint JSON file"
                browseId="blueprint-save-path"
                fileFilters={[{name: "JSON files", extensions: ["json"]}]}
                value={savePath}
                onChange={(event) => setSavePath(event.currentTarget.value)}
                onPathSelected={setSavePath}
            />
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

            {(loadView.status === "error" || loadView.status === "load-error") && (
                <ErrorState message={describePathActionError("The blueprint file", loadView.message)} />
            )}

            {saveView.status === "conflict" && (
                <RecoveryNotice title={saveView.message} message={null} actionLabel="Overwrite" actionColor="red" onAction={() => onOverwrite(saveView.path)} />
            )}
            {(saveView.status === "error" || saveView.status === "failed") && (
                <ErrorState message={describePathActionError("The blueprint file", saveView.message)} />
            )}
            {saveView.status === "ok" && <SuccessResult message={`Saved to "${saveView.path}".`} />}
        </div>
    );
}
