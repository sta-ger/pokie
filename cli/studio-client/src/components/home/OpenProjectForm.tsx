import {Button, Stack} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useState} from "react";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PathInput} from "../common/PathInput";

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
            // A dirty-guard decline resolves without navigating (see useOpenProject) -- the form stays
            // mounted in that case, so it must fall back to "idle" itself rather than being stuck showing
            // a permanent loading spinner. A real success navigates away (unmounting this form) right
            // around the same time, so this is a harmless no-op there.
            .then(() => setState({status: "idle"}))
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}))
            .finally(() => submitGuard.end());
    };

    return (
        <Stack gap="md" maw={480}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="sm">
                    <PathInput
                        label="Project path"
                        required
                        kind="directory"
                        browseTitle="Browse for a project directory"
                        browseId="open-project-path"
                        {...form.getInputProps("projectRoot")}
                        onPathSelected={(path) => form.setFieldValue("projectRoot", path)}
                        key={form.key("projectRoot")}
                    />
                    <Button type="submit" loading={state.status === "loading"} style={{alignSelf: "flex-start"}}>
                        Open
                    </Button>
                </Stack>
            </form>
            {state.status === "loading" && <LoadingState label="Opening…" />}
            {state.status === "error" && <ErrorState message={describePathActionError("The project directory", state.message)} />}
        </Stack>
    );
}
