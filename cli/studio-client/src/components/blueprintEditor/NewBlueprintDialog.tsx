import {Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {generateRandomBlueprint} from "../../api/apiClient";
import type {StudioBlueprintRandomView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {describeProjectActionError} from "../../domain/projectActionError";
import type {BlueprintLoadView, BlueprintSaveView} from "../../domain/interpret/BlueprintEditor";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";

type RandomPreset = "default" | "variant";

type RandomFormState = {seed: string; preset: RandomPreset; name: string};

type RandomGenerationView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | {status: "ok"; result: StudioBlueprintRandomView};

type Step = "confirmDirty" | "choose" | "random" | "load";

function blueprintNameAndId(blueprint: unknown): {name: string; id: string} {
    const manifest = blueprint !== null && typeof blueprint === "object" ? (blueprint as Record<string, unknown>).manifest : undefined;
    const manifestRecord = manifest !== null && typeof manifest === "object" ? (manifest as Record<string, unknown>) : {};
    return {
        name: typeof manifestRecord.name === "string" ? manifestRecord.name : "(unnamed)",
        id: typeof manifestRecord.id === "string" ? manifestRecord.id : "(no id)",
    };
}

// The New flow's own entry point (see BlueprintEditorPage's own doc comment on `handleChooseBlank`/
// `handleUseRandomBlueprint`) -- a top-level lifecycle choice between Blank, Generate random, and Load
// existing, gated by an unsaved-changes ("dirty") confirmation ahead of any of the three. Blank/Load
// delegate their actual replace back to the caller (`onChooseBlank`/`onLoad` reuse BlueprintEditorPage's
// own existing handlers, so New/Load stay a single code path); "Generate random" is entirely
// self-contained here, calling the same RandomGameBlueprintGenerator "pokie build random"/
// "pokie create --random" use (see StudioBlueprintService.random()'s own doc comment) via
// POST /api/home/blueprints/random, with its own "Randomize again" (a fresh, unseeded regenerate) ahead
// of the one-way "Use this blueprint" commit that actually replaces the editor's draft.
export function NewBlueprintDialog({
    opened,
    onClose,
    isDirty,
    blueprintPath,
    saveView,
    onSave,
    onOverwrite,
    loadView,
    onLoad,
    onChooseRecommended,
    onChooseBlank,
    onUseRandomBlueprint,
}: {
    opened: boolean;
    onClose: () => void;
    isDirty: boolean;
    blueprintPath?: string;
    saveView: BlueprintSaveView;
    onSave: (path: string) => void;
    onOverwrite: (path: string) => void;
    loadView: BlueprintLoadView;
    onLoad: (path: string) => void;
    onChooseRecommended: () => void;
    onChooseBlank: () => void;
    onUseRandomBlueprint: (blueprint: unknown) => void;
}) {
    const fetchImpl = useStudioApi();
    const [step, setStep] = useState<Step>("choose");
    const [savingToProceed, setSavingToProceed] = useState(false);
    const [saveAsPath, setSaveAsPath] = useState("");
    const [loadPath, setLoadPath] = useState("");
    const [randomForm, setRandomForm] = useState<RandomFormState>({seed: "", preset: "default", name: ""});
    const [randomView, setRandomView] = useState<RandomGenerationView>({status: "idle"});
    const cancelRef = useRef<HTMLButtonElement>(null);
    const choiceRef = useRef<HTMLButtonElement>(null);
    const seedRef = useRef<HTMLInputElement>(null);
    const loadBackRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (opened) {
            setStep(isDirty ? "confirmDirty" : "choose");
            setSavingToProceed(false);
            setSaveAsPath("");
            setLoadPath("");
            // A visible seed makes Random reproducible. A creator can deliberately choose another,
            // but the default never produces an unrepeatable project by accident.
            setRandomForm({seed: "20260815", preset: "default", name: ""});
            setRandomView({status: "idle"});
        }
        // Only re-seeds this dialog's own steps/forms the moment it actually opens -- `isDirty` moving
        // afterward (a Save this same dialog just triggered) must not re-run this and clobber the step
        // the save-success effect below is about to advance to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    // Mantine initially focused the dialog's close button in the rendered Studio audit. Each step
    // has a useful first control instead: cancelling preserves a dirty draft, the starter is the
    // recommended first-use choice, and the form steps start at their primary input.  This also makes
    // an in-dialog step transition deterministic instead of leaving keyboard focus on a removed node.
    useEffect(() => {
        if (!opened) {
            return;
        }
        if (step === "confirmDirty") {
            cancelRef.current?.focus();
        } else if (step === "choose") {
            choiceRef.current?.focus();
        } else if (step === "random") {
            seedRef.current?.focus();
        } else {
            loadBackRef.current?.focus();
        }
    }, [opened, step]);

    // Advances past the dirty-confirm gate once a Save this dialog itself triggered actually lands —
    // `savingToProceed` scopes this to a save this dialog started (never one from the always-visible
    // advanced Save controls behind it, which never touches this flag).
    useEffect(() => {
        if (savingToProceed && saveView.status === "ok") {
            setSavingToProceed(false);
            setStep("choose");
        }
    }, [savingToProceed, saveView]);

    // A Load this dialog's own "Load existing" step triggered succeeding closes the dialog entirely —
    // handleLoad's own success branch already committed the wholesale replace.
    useEffect(() => {
        if (step === "load" && loadView.status === "ok") {
            onClose();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, loadView]);

    const runGenerate = (mintFreshSeed: boolean): void => {
        const seedText = mintFreshSeed ? "" : randomForm.seed.trim();
        const seed = seedText.length > 0 ? Number(seedText) : undefined;
        setRandomView({status: "loading"});
        generateRandomBlueprint(fetchImpl, {seed, preset: randomForm.preset, name: randomForm.name.trim() || undefined})
            .then((result) => {
                setRandomView({status: "ok", result});
                setRandomForm((prev) => ({...prev, seed: String(result.seed)}));
            })
            .catch((error: unknown) => setRandomView({status: "error", message: errorMessage(error)}));
    };

    const handleSaveToProceed = (path: string): void => {
        if (path.trim().length === 0) {
            return;
        }
        setSavingToProceed(true);
        onSave(path);
    };

    const handleUseRandom = (): void => {
        if (randomView.status !== "ok") {
            return;
        }
        onUseRandomBlueprint(randomView.result.blueprint);
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Start a new game" size="md">
            <Stack gap="sm">
                {step === "confirmDirty" && (
                    <Stack gap="sm">
                        <Text size="sm">You have unsaved changes to this game design. Save them, discard them, or cancel.</Text>
                        {blueprintPath === undefined && (
                            <PathInput
                                label="Save this game design"
                                kind="file"
                                browseTitle="Choose a game design file"
                                browseId="new-blueprint-dialog-save-path"
                                fileFilters={[{name: "Game design files", extensions: ["json"]}]}
                                filePickerMode="save"
                                value={saveAsPath}
                                onChange={(event) => setSaveAsPath(event.currentTarget.value)}
                                onPathSelected={setSaveAsPath}
                            />
                        )}
                        {saveView.status === "conflict" && (
                            <RecoveryNotice
                                title={saveView.message}
                                message={null}
                                actionLabel="Overwrite and continue"
                                actionColor="red"
                                onAction={() => onOverwrite(saveView.path)}
                            />
                        )}
                        {(saveView.status === "error" || saveView.status === "failed") && (
                            <ErrorState message={describePathActionError("The saved game design", saveView.message)} />
                        )}
                        <Group justify="flex-end">
                            <Button ref={cancelRef} variant="default" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button variant="default" color="red" onClick={() => setStep("choose")}>
                                Discard
                            </Button>
                            <Button
                                loading={savingToProceed && saveView.status === "loading"}
                                disabled={blueprintPath === undefined && saveAsPath.trim().length === 0}
                                onClick={() => handleSaveToProceed(blueprintPath ?? saveAsPath)}
                            >
                                Save and continue
                            </Button>
                        </Group>
                    </Stack>
                )}

                {step === "choose" && (
                    <Stack gap="sm">
                        <Text size="sm">Choose how to begin. Each choice stays editable, and you can save it as a game when you are ready.</Text>
                        <Stack gap="xs">
                            <Button
                                ref={choiceRef}
                                onClick={() => {
                                    onChooseRecommended();
                                    onClose();
                                }}
                            >
                                Use the starter game
                            </Button>
                            <Text size="xs" c="dimmed">A ready-to-edit slot game with a working layout, symbols, reels, prizes, and bets.</Text>
                            <Button
                                variant="default"
                                onClick={() => {
                                    onChooseBlank();
                                    onClose();
                                }}
                            >
                                Start with a blank game
                            </Button>
                            <Text size="xs" c="dimmed">Build every part yourself, beginning with an empty game design.</Text>
                            <Button variant="default" aria-label="Generate random" onClick={() => setStep("random")}>
                                Generate a game idea
                            </Button>
                            <Text size="xs" c="dimmed">Create an editable sample game automatically. You can regenerate it until you like the direction.</Text>
                            <Button variant="default" onClick={() => setStep("load")}>
                                Open a saved game design
                            </Button>
                            <Text size="xs" c="dimmed">Continue from a game design file you saved earlier.</Text>
                        </Stack>
                    </Stack>
                )}

                {step === "random" && (
                    <Stack gap="sm">
                        <QuickActions>
                            <NumberInput
                                ref={seedRef}
                                label="Seed (optional)"
                                placeholder="Random"
                                allowDecimal={false}
                                allowNegative={false}
                                value={randomForm.seed}
                                onChange={(value) => setRandomForm((prev) => ({...prev, seed: value === "" ? "" : String(value)}))}
                            />
                            <SegmentedControl
                                aria-label="Generated game style"
                                value={randomForm.preset}
                                onChange={(value) => setRandomForm((prev) => ({...prev, preset: value as RandomPreset}))}
                                data={[
                                    {label: "Classic", value: "default"},
                                    {label: "Variation", value: "variant"},
                                ]}
                            />
                            <TextInput
                                label="Name (optional)"
                                value={randomForm.name}
                                onChange={(event) => {
                                    const name = event.currentTarget.value;
                                    setRandomForm((prev) => ({...prev, name}));
                                }}
                            />
                            <Button onClick={() => runGenerate(false)} loading={randomView.status === "loading"}>
                                Generate
                            </Button>
                        </QuickActions>

                        {randomView.status === "error" && <ErrorState message={describeProjectActionError("Generating this game idea", randomView.message)} />}
                        {randomView.status === "ok" &&
                            (() => {
                                const {name} = blueprintNameAndId(randomView.result.blueprint);
                                return (
                                    <Stack gap={4}>
                                        <Text size="sm">
                                            Generated &quot;{name}&quot; from seed {randomView.result.seed}.
                                        </Text>
                                    </Stack>
                                );
                            })()}

                        <Group justify="space-between">
                            <Button variant="default" onClick={() => setStep("choose")}>
                                Back
                            </Button>
                            <Group>
                                {randomView.status === "ok" && (
                                    <Button variant="default" onClick={() => runGenerate(true)}>
                                        Randomize again
                                    </Button>
                                )}
                                <Button disabled={randomView.status !== "ok"} onClick={handleUseRandom}>
                                    Use this game idea
                                </Button>
                            </Group>
                        </Group>
                    </Stack>
                )}

                {step === "load" && (
                    <Stack gap="sm">
                        <PathInput
                            label="Saved game design"
                            kind="file"
                            browseTitle="Choose a game design file"
                            browseId="new-blueprint-dialog-load-path"
                            fileFilters={[{name: "Game design files", extensions: ["json"]}]}
                            value={loadPath}
                            onChange={(event) => setLoadPath(event.currentTarget.value)}
                            onPathSelected={setLoadPath}
                        />
                        {loadView.status === "loading" && <LoadingState label="Opening your saved game design…" />}
                        {(loadView.status === "error" || loadView.status === "load-error") && (
                            <ErrorState message={describePathActionError("The saved game design", loadView.message)} />
                        )}
                        <Group justify="space-between">
                            <Button ref={loadBackRef} variant="default" onClick={() => setStep("choose")}>
                                Back
                            </Button>
                            <Button onClick={() => onLoad(loadPath)} loading={loadView.status === "loading"} disabled={loadPath.trim().length === 0}>
                                Open saved game design
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Stack>
        </Modal>
    );
}
