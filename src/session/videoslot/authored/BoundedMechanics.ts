/** Finite data contracts. A collection is denominated in wallet currency, never the next bet. */
export type AuthoredCascade = {maxCascades: number};
export type AuthoredRespins = {
    trigger: {symbolId: string; minimumCount: number};
    grant: number;
    retrigger: "none" | "reset";
    maxRespins: number;
};
export type AuthoredCollection = {
    symbolId: string;
    contribution: number;
    threshold: number;
    cap: number;
    reset: "zero" | "subtract-threshold";
    payout: number;
};
export type BoundedMechanics = {cascade?: AuthoredCascade; respins?: AuthoredRespins; collection?: AuthoredCollection};
export type BoundedMechanicObservation = {
    collection?: {value: number; cap: number; threshold: number; contribution: number; triggered: boolean; reset: AuthoredCollection["reset"]; payout: number};
    respins?: {remaining: number; executed: number; granted: number; limit: number};
    cascade?: {winningCascades: number; evaluatedSteps: number};
};
export interface BoundedMechanicsProviding {
    getBoundedMechanicObservation(): BoundedMechanicObservation | undefined;
}
