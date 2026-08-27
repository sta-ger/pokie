import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {App} from "../../../../cli/studio-client/src/App";

describe("App", () => {
    it("renders a recoverable first-launch action when the startup request is unavailable", async () => {
        render(
            <MantineProvider>
                <App />
            </MantineProvider>,
        );
        expect(await screen.findByRole("button", {name: "Choose or create a game"})).toBeInTheDocument();
    });
});
