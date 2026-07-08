export type CascadeResolverOptions = {
    maxCascadeSteps?: number;
    onMaxCascadeStepsExceeded?: "throw" | "stop";
};
