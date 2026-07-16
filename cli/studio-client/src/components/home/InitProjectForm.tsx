import {Button, Stack, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import {initProject} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describeScaffoldResult, type ScaffoldActionView} from "../../domain/interpret/Home";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {ScaffoldResultDisplay} from "./ScaffoldResultDisplay";

export function InitProjectForm() {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const [view, setView] = useState<ScaffoldActionView>({status: "idle"});
    const [lastProjectRoot, setLastProjectRoot] = useState<string>();
    const submitGuard = useDoubleSubmitGuard();

    const form = useForm<{directory: string}>({
        mode: "uncontrolled",
        initialValues: {directory: "."},
    });

    const handleSubmit = (values: {directory: string}): void => {
        if (!submitGuard.begin()) {
            return;
        }
        setView({status: "loading"});
        initProject(fetchImpl, {directory: values.directory})
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
                    <TextInput label="Existing project directory" required {...form.getInputProps("directory")} key={form.key("directory")} />
                    <Button type="submit" loading={view.status === "loading"} style={{alignSelf: "flex-start"}}>
                        Initialize
                    </Button>
                </Stack>
            </form>

            <ScaffoldResultDisplay
                view={view}
                showUpdatedAndSkipped
                onOpen={() => {
                    if (lastProjectRoot !== undefined) {
                        openAndNavigate(lastProjectRoot).catch((error: unknown) => setView({status: "error", message: errorMessage(error)}));
                    }
                }}
            />
        </Stack>
    );
}
