import {Button, Stack, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import {createProject} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describeScaffoldResult, type ScaffoldActionView} from "../../domain/interpret/Home";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {PathInput} from "../common/PathInput";
import {ScaffoldResultDisplay} from "./ScaffoldResultDisplay";

// A concrete, deterministic starting point rather than an empty required field -- lets "Create" work
// with zero typing, while still being a name a user is expected to change for a real game. Stable for
// the lifetime of one mount (a plain literal, not regenerated per render), so switching Home tabs and
// back (Advanced Tools stays mounted -- see HomePage's own doc comment) never resets an in-progress edit.
const DEFAULT_PROJECT_NAME = "my-slot-game";

type CreateProjectFormValues = {
    destinationDir: string;
    name: string;
    gameId: string;
    gameName: string;
    version: string;
};

export function CreateProjectForm() {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const [view, setView] = useState<ScaffoldActionView>({status: "idle"});
    const [lastProjectRoot, setLastProjectRoot] = useState<string>();
    const submitGuard = useDoubleSubmitGuard();

    const form = useForm<CreateProjectFormValues>({
        mode: "uncontrolled",
        initialValues: {destinationDir: ".", name: DEFAULT_PROJECT_NAME, gameId: "", gameName: "", version: ""},
    });

    const handleSubmit = (values: CreateProjectFormValues): void => {
        if (!submitGuard.begin()) {
            return;
        }
        setView({status: "loading"});
        createProject(fetchImpl, {
            destinationDir: values.destinationDir,
            name: values.name,
            gameId: values.gameId.trim() || undefined,
            gameName: values.gameName.trim() || undefined,
            version: values.version.trim() || undefined,
        })
            .then((result) => {
                setView(describeScaffoldResult(result));
                if (result.status === "ok") {
                    setLastProjectRoot(result.projectRoot);
                }
            })
            .catch((error: unknown) => setView({status: "error", message: errorMessage(error)}))
            .finally(() => submitGuard.end());
    };

    return (
        <Stack gap="md" maw={480}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="sm">
                    <PathInput
                        label="Destination directory"
                        required
                        kind="directory"
                        browseTitle="Browse for a destination directory"
                        browseId="create-project-destination"
                        {...form.getInputProps("destinationDir")}
                        onPathSelected={(path) => form.setFieldValue("destinationDir", path)}
                        key={form.key("destinationDir")}
                    />
                    <TextInput label="Package name" required {...form.getInputProps("name")} key={form.key("name")} />
                    <TextInput label="Game id (optional)" {...form.getInputProps("gameId")} key={form.key("gameId")} />
                    <TextInput label="Game name (optional)" {...form.getInputProps("gameName")} key={form.key("gameName")} />
                    <TextInput label="Version (optional)" {...form.getInputProps("version")} key={form.key("version")} />
                    <Button type="submit" loading={view.status === "loading"} style={{alignSelf: "flex-start"}}>
                        Create
                    </Button>
                </Stack>
            </form>

            <ScaffoldResultDisplay
                view={view}
                onOpen={() => {
                    if (lastProjectRoot !== undefined) {
                        openAndNavigate(lastProjectRoot).catch((error: unknown) => setView({status: "error", message: errorMessage(error)}));
                    }
                }}
                nextStepsHint={
                    view.status === "ok" ? `Next: cd ${view.projectRoot} && npm install && npm run build` : undefined
                }
            />
        </Stack>
    );
}
