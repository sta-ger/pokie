import {Button, Stack, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import {createProject} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describeScaffoldResult, type ScaffoldActionView} from "../../domain/interpret/Home";
import {useOpenProject} from "../../hooks/useOpenProject";
import {ScaffoldResultDisplay} from "./ScaffoldResultDisplay";

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

    const form = useForm<CreateProjectFormValues>({
        mode: "uncontrolled",
        initialValues: {destinationDir: ".", name: "", gameId: "", gameName: "", version: ""},
    });

    const handleSubmit = (values: CreateProjectFormValues): void => {
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
            .catch((error: unknown) => setView({status: "error", message: errorMessage(error)}));
    };

    return (
        <Stack gap="md" maw={480}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="sm">
                    <TextInput label="Destination directory" required {...form.getInputProps("destinationDir")} key={form.key("destinationDir")} />
                    <TextInput label="Package name" required {...form.getInputProps("name")} key={form.key("name")} />
                    <TextInput label="Game id (optional)" {...form.getInputProps("gameId")} key={form.key("gameId")} />
                    <TextInput label="Game name (optional)" {...form.getInputProps("gameName")} key={form.key("gameName")} />
                    <TextInput label="Version (optional)" {...form.getInputProps("version")} key={form.key("version")} />
                    <Button type="submit" style={{alignSelf: "flex-start"}}>
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
