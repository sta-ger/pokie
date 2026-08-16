import {Button, Collapse, Group, Text} from "@mantine/core";
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
    onReloadConflict,
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
    onReloadConflict: (path: string) => void;
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
    const [showConflictComparison, setShowConflictComparison] = useState(false);
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
                filePickerMode="save"
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

            {saveView.status === "conflict" &&
                (saveView.reason === "stale" ? (
                    <RecoveryNotice
                        title="Blueprint changed while you were editing"
                        message={saveView.message}
                        actionLabel="Reload"
                        onAction={() => onReloadConflict(saveView.path)}
                        secondaryActionLabel="Compare"
                        onSecondaryAction={() => setShowConflictComparison((shown) => !shown)}
                    />
                ) : (
                    <RecoveryNotice title={saveView.message} message={null} actionLabel="Overwrite" actionColor="red" onAction={() => onOverwrite(saveView.path)} />
                ))}
            {saveView.status === "conflict" && saveView.reason === "stale" && (
                <div>
                    {saveView.canSaveAs && (
                        <Group gap="xs" mb="sm">
                            <Button variant="default" onClick={() => onSave(savePath)}>
                                Save As
                            </Button>
                            <Text size="sm" c="dimmed">
                                Choose a different path above to preserve both versions.
                            </Text>
                        </Group>
                    )}
                    {showConflictComparison && (
                        <Text component="pre" size="xs" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>
                            {JSON.stringify(
                                {
                                    currentHash: saveView.currentHash,
                                    editedHash: saveView.editedHash,
                                    currentBlueprint: saveView.currentBlueprint,
                                    editedBlueprint: saveView.editedBlueprint,
                                },
                                null,
                                2,
                            )}
                        </Text>
                    )}
                </div>
            )}
            {(saveView.status === "error" || saveView.status === "failed") && (
                <ErrorState message={describePathActionError("The blueprint file", saveView.message)} />
            )}
            {saveView.status === "ok" && <SuccessResult message={`Saved to "${saveView.path}".`} />}
        </div>
    );
}
