import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {render, type RenderResult} from "@testing-library/react";
import type {ReactElement} from "react";
import {MemoryRouter} from "react-router-dom";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";

// Every studio-client component under test needs Mantine context (styling/hooks), modal context
// (useConfirm), router context (useNavigate/useLocation), and the fake-fetch-injecting API context --
// one place to assemble all four instead of repeating the wrapper in every test file.
export function renderWithProviders(ui: ReactElement, options?: {fetchImpl?: FetchLike; initialEntries?: string[]}): RenderResult {
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={options?.initialEntries ?? ["/"]}>
                <StudioApiProvider fetchImpl={options?.fetchImpl}>
                    <ModalsProvider>{ui}</ModalsProvider>
                </StudioApiProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
}
