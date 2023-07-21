export interface BuildableFromArray<T = string> {
    fromArray(value: T[]): this;
}
