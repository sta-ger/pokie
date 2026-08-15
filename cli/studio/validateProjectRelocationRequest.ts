export type ProjectRelocationRequestInput = {location?: unknown; newLocation?: unknown};

export function validateProjectRelocationRequest(input: ProjectRelocationRequestInput): {location: string; newLocation: string} {
    const location = validateLocation(input.location, "location");
    const newLocation = validateLocation(input.newLocation, "newLocation");
    return {location, newLocation};
}

function validateLocation(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Project relocation requires a non-empty ${field}.`);
    }
    return value.trim();
}
