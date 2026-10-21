import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {DocumentationLinks} from "../../../../../../cli/studio-client/src/components/home/DocumentationLinks";

it("renders the local Home documentation destinations without deployment dependencies", () => {
    render(
        <MantineProvider>
            <DocumentationLinks />
        </MantineProvider>,
    );
    const expected = [
        ["Public docs (included locally)", "/help/docs/"],
        ["Getting started", "/help/docs/getting-started/"],
        ["CLI reference", "/help/docs/cli-api/"],
        [
            "FromStan / POKIE — examples and boundaries",
            "/help/",
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
