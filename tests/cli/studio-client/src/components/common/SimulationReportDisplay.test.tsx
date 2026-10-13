import {MantineProvider} from "@mantine/core";
import {render, within} from "@testing-library/react";
import {SimulationReportDisplay} from "../../../../../../cli/studio-client/src/components/common/SimulationReportDisplay";
import type {SimulationReportView} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";

it("renders weighted configuration, actual counts and distinct uncovered/zero-weight states", () => {
    const view: SimulationReportView = {
        game: {id: "tiny", name: "Tiny", version: "1"}, rounds: 1, requestedRounds: 1, seed: "1", totalBet: 1, totalWin: 4,
        rtp: 4, hitFrequency: 1, maxWin: 4, durationMs: 1, spinsPerSecond: 1, workers: 1, warnings: [], recommendations: [],
        reelSequences: [{reelIndex: 0, context: "logical-round", model: "tiny", selections: 1, variants: [
            {id: "a", weight: 1, probability: 0.25, count: 1, frequency: 1, uncovered: false},
            {id: "b", weight: 3, probability: 0.75, count: 0, frequency: 0, uncovered: true},
            {id: "zero", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false},
        ]}],
    };
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    expect(result.getByText("logical-round: 1 selections")).toBeInTheDocument();
    const row = result.getByText("b").closest("tr")!;
    expect(within(row).getByText("0.75")).toBeInTheDocument();
    expect(within(row).getByText("uncovered")).toBeInTheDocument();
    expect(result.getByText("zero weight")).toBeInTheDocument();
});
