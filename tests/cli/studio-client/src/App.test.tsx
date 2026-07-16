import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {App} from "../../../../cli/studio-client/src/App";

describe("App", () => {
    it("renders the Studio shell", () => {
        render(
            <MantineProvider>
                <App />
            </MantineProvider>,
        );
        expect(screen.getByRole("heading", {name: "POKIE Studio"})).toBeInTheDocument();
    });
});
