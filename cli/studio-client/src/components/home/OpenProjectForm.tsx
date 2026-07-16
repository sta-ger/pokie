import {Button, Stack, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import {errorMessage} from "../../domain/errorMessage";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";

export function OpenProjectForm() {
    const openAndNavigate = useOpenProject();
    const [state, setState] = useState<{status: "idle"} | {status: "loading"} | {status: "error"; message: string}>({status: "idle"});
    const submitGuard = useDoubleSubmitGuard();

    const form = useForm<{projectRoot: string}>({
        mode: "uncontrolled",
        initialValues: {projectRoot: ""},
    });

    const handleSubmit = (values: {projectRoot: string}): void => {
        if (!submitGuard.begin()) {
            return;
        }
        setState({status: "loading"});
        openAndNavigate(values.projectRoot)
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}))
            .finally(() => submitGuard.end());
    };

    return (
        <Stack gap="md" maw={480}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="sm">
                    <TextInput label="Project path" required {...form.getInputProps("projectRoot")} key={form.key("projectRoot")} />
                    <Button type="submit" loading={state.status === "loading"} style={{alignSelf: "flex-start"}}>
                        Open
                    </Button>
                </Stack>
            </form>
            {state.status === "loading" && <LoadingState label="Opening…" />}
            {state.status === "error" && <ErrorState message={state.message} />}
        </Stack>
    );
}
