import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// The guided Design & Build flow shows a read-only StepProgressList (Configure -> Validate -> Build)
// instead of a Mantine Stepper -- there is nothing to click ahead to, since `stepIndex`/status is purely
// derived from `validationView` (see BlueprintEditorPage.tsx's own doc comment and
// StepProgressList.tsx's). This covers the state transitions and the aria-current/aria-disabled
// semantics that replace Mantine's own (button-only, non-existent-for-a-non-interactive-flow) affordance.

function fetchWithValidateResult(validateJson: unknown): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        const method = init?.method ?? "GET";
        if (path === "/api/home/recent-projects") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        }
        if (path === "/api/home/blueprints/validate" && method === "POST") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(validateJson)});
        }
        return Promise.reject(new Error(`no fake route for ${method} ${url}`));
    };
}

function progressItem(label: string): HTMLElement {
    const list = screen.getByRole("list", {name: "Progress"});
    return within(list).getByText(label, {exact: false}).closest("li") as HTMLElement;
}

describe("Guided Design & Build: read-only progress list", () => {
    it("has no clickable step buttons -- unlike the interactive Steppers elsewhere in Studio", () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});
        // The progress list's items are plain <li>s, not <button>s (Mantine's Stepper.Step always
        // renders a <button>, even with no onStepClick) -- the only buttons on the page are real actions
        // (New/Load/Save/Validate/Build/...).
        expect(within(screen.getByRole("list", {name: "Progress"})).queryAllByRole("button")).toHaveLength(0);
    });

    it("starts idle: Configure is current, Validate is available, Build is blocked", () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});
        expect(progressItem("Configure")).toHaveAttribute("aria-current", "step");
        expect(progressItem("Validate")).not.toHaveAttribute("aria-current");
        expect(progressItem("Validate")).not.toHaveAttribute("aria-disabled");
        expect(progressItem("Build")).toHaveAttribute("aria-disabled", "true");
    });

    it("after an invalid validation: Configure completed, Validate is current and failed, Build stays blocked", async () => {
        const user = userEvent.setup();
        renderRoutedApp({
            fetchImpl: fetchWithValidateResult({
                status: "invalid",
                errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: '"manifest.id" must be a non-empty string.'}],
                warnings: [],
            }),
            initialEntries: ["/home/design"],
        });

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());

        expect(progressItem("Configure")).not.toHaveAttribute("aria-current");
        expect(progressItem("Configure").textContent).toContain("completed");
        expect(progressItem("Validate")).toHaveAttribute("aria-current", "step");
        expect(progressItem("Validate").textContent).toContain("failed");
        expect(progressItem("Build")).toHaveAttribute("aria-disabled", "true");
    });

    it("after a successful validation: Configure and Validate are completed, Build becomes current and unblocked", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        expect(progressItem("Configure").textContent).toContain("completed");
        expect(progressItem("Validate").textContent).toContain("completed");
        expect(progressItem("Build")).toHaveAttribute("aria-current", "step");
        expect(progressItem("Build")).not.toHaveAttribute("aria-disabled");
    });
});
