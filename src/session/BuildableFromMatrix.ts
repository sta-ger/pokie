export interface BuildableFromMatrix<T = string> {
    fromMatrix(value: T[][], transposed?: boolean): this;
}
