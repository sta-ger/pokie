import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {PathInput} from "../../../../../../cli/studio-client/src/components/common/PathInput";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// A minimal controlled harness -- PathInput is normally driven by a Mantine uncontrolled form's
// getInputProps()/setFieldValue (see CreateProjectForm/InitProjectForm/BuildFromBlueprintPanel), but its
// own on-focus resolved-path hint and Browse wiring don't depend on that at all, so a plain useState
// harness exercises them directly without needing a whole form around it.
function Harness({kind = "directory" as const, initial = "."}: {kind?: "directory" | "file"; initial?: string}) {
    const [value, setValue] = useState(initial);
    return <PathInput label="Path" value={value} onChange={(event) => setValue(event.currentTarget.value)} onPathSelected={setValue} kind={kind} />;
}

describe("PathInput", () => {
    it("shows a permission-denied hint (not a crash) when focused", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "error", error: 'Permission denied reading ".".', resolvedPath: "/root"}}),
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("textbox", {name: "Path"}));

        expect(await screen.findByText('Permission denied reading ".".')).toBeInTheDocument();
    });

    it("passes the field's current value as the modal's initial browse location", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: []}}),
        });

        renderWithProviders(<Harness initial="./games" />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("Current location: ./games")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=.%2Fgames")).toBe(true);
    });
});
