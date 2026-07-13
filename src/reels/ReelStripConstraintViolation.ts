export type ReelStripConstraintViolation = {
    constraintId: string;
    message: string;
    positions?: number[];
    details?: Record<string, unknown>;
};
