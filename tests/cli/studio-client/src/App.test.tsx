import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {App} from "../../../../cli/studio-client/src/App";

describe("App", () => {
    // "/" no longer renders a page synchronously: it resolves the server's mode first (see
    // StudioLanding) and only then lands on Home or the project dashboard. With no fake fetch injected
    // here that lookup fails, which is exactly the Home fallback — so the shell still appears, just a
    // tick later. studioLanding.test.tsx covers the mode-resolution behaviour itself.
    it("renders the Studio shell", async () => {
        render(
            <MantineProvider>
                <App />
            </MantineProvider>,
        );
        expect(await screen.findByRole("heading", {name: "POKIE Studio"})).toBeInTheDocument();
    });
});
