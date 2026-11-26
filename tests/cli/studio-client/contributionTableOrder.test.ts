import {orderContributionEntries} from "../../../cli/studio-client/src/domain/contributionTableOrder.js";

describe("orderContributionEntries", () => {
    it("orders by displayed contribution and breaks ties by label", () => {
        const ordered = orderContributionEntries([
            {label: "Line 3 · A", rtpContribution: 0.08192000000000001},
            {label: "Line 1 · A", rtpContribution: 0.08192},
            {label: "Line 2 · A", rtpContribution: 0.08192000000000002},
            {label: "Line 1 · K", rtpContribution: 0.064},
        ]);
        expect(ordered.map((entry) => entry.label)).toEqual(["Line 1 · A", "Line 2 · A", "Line 3 · A", "Line 1 · K"]);
    });

    it("does not reorder genuinely different contributions", () => {
        const ordered = orderContributionEntries([
            {label: "B", rtpContribution: 0.1},
            {label: "A", rtpContribution: 0.2},
        ]);
        expect(ordered.map((entry) => entry.label)).toEqual(["A", "B"]);
    });
});
