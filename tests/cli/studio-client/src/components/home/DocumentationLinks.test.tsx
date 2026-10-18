import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {DocumentationLinks} from "../../../../../../cli/studio-client/src/components/home/DocumentationLinks";

it("renders the real Home documentation destinations with an honest source fallback", () => {
    render(
        <MantineProvider>
            <DocumentationLinks />
        </MantineProvider>,
    );
    const expected = [
        ["Public docs (deployment target)", "https://pokie.fromstan.com/docs/"],
        ["Getting started", "https://pokie.fromstan.com/docs/getting-started/"],
        ["CLI reference", "https://pokie.fromstan.com/docs/cli-api/"],
        [
            "Source guides (available before site deployment)",
            "https://github.com/fromstan/pokie/blob/develop/docs/README.md",
        ],
    ];
    for (const [name, href] of expected) {
        const link = screen.getByRole("link", {name});
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
    }
    expect(screen.getAllByRole("link")).toHaveLength(expected.length);
});
