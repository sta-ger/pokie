import {SymbolsSequenceRepresenting} from "pokie";

export class SymbolsSequence<T extends string | number | symbol = string> implements SymbolsSequenceRepresenting<T> {
    private sequence: T[];

    constructor() {
        this.sequence = [];
    }

    public setSymbol(index: number, symbolId: T): this {
        if (this.sequence.length === 0) {
            this.sequence = [symbolId];
        } else {
            this.sequence[this.getIndex(index)] = symbolId;
        }
        return this;
    }

    public setSymbols(index: number, symbols: T[]): this {
        if (this.sequence.length < symbols.length) {
            this.sequence = [...symbols];
        } else {
            symbols.forEach((id, i) => this.setSymbol(index + i, id));
        }
        return this;
    }

    public addSymbol(symbolId: T, stackSize?: number, index?: number): this {
        if (index !== undefined && index < this.sequence.length) {
            this.sequence.splice(index, 0, ...Array<T>(stackSize || 1).fill(symbolId));
        } else {
            this.sequence.push(...Array<T>(stackSize || 1).fill(symbolId));
        }
        return this;
    }

    public addSymbols(symbolsIds: T[], index?: number): this {
        if (index !== undefined && index < this.sequence.length) {
            this.sequence.splice(index, 0, ...symbolsIds);
        } else {
            this.sequence.push(...symbolsIds);
        }
        return this;
    }

    public getSymbol(index: number): T {
        return this.sequence[this.getIndex(index)];
    }

    public getSymbols(index: number, symbolsNumber: number): T[] {
        const symbols: T[] = [];
        let currentIndex = index;
        for (let i = 0; i < symbolsNumber; i++) {
            currentIndex = this.getIndex(currentIndex);
            symbols.push(this.getSymbol(currentIndex));
            currentIndex++;
        }
        return symbols;
    }

    public getSize(): number {
        return this.sequence.length;
    }

    public getNumberOfSymbols(symbolId: T): number {
        return this.sequence.filter((symbol) => symbol === symbolId).length;
    }

    public getSymbolWeight(symbolId: T): number {
        const symbolCount = this.getNumberOfSymbols(symbolId);
        return (symbolCount / this.sequence.length) * 100;
    }

    public getSymbolsWeights(): Record<T, number> {
        const symbolsWeights = {} as Record<T, number>;
        const uniqueSymbols = [...new Set(this.sequence)];
        for (const symbolId of uniqueSymbols) {
            symbolsWeights[symbolId] = this.getSymbolWeight(symbolId);
        }
        return symbolsWeights;
    }

    public getSymbolsIndexes(symbolsIds: T[]): number[] {
        const indexes: number[] = [];
        for (let i = 0; i < this.sequence.length; i++) {
            if (symbolsIds.includes(this.sequence[i])) {
                indexes.push(i);
            }
        }
        return indexes;
    }

    public getSymbolsStacksIndexes(): {index: number; size: number}[] {
        const stacks: {index: number; size: number}[] = [];
        const length = this.sequence.length;
        if (length > 1 && new Set(this.sequence).size > 1) {
            for (let i = 0; i < length; i++) {
                let currentSymbol = this.sequence[i];
                let nextIndex = this.getIndex(i + 1);
                let nextSymbol = this.sequence[nextIndex];
                if (currentSymbol === nextSymbol) {
                    const stack = {index: i, size: 1};
                    while (currentSymbol === nextSymbol) {
                        stack.size++;
                        if (i < this.sequence.length - 1) {
                            i = nextIndex;
                        } else if (stacks[0] && stacks[0].index === 0) {
                            stacks.shift();
                        }
                        nextIndex = this.getIndex(nextIndex + 1);
                        currentSymbol = this.sequence[i];
                        nextSymbol = this.sequence[nextIndex];
                    }
                    stacks.push(stack);
                }
            }
        }
        return stacks;
    }

    public shuffle(): this {
        for (let i = this.sequence.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.sequence[i], this.sequence[j]] = [this.sequence[j], this.sequence[i]];
        }
        return this;
    }

    public fromArray(symbolsArray: T[]): this {
        this.sequence = [...symbolsArray];
        return this;
    }

    public fromSymbolsWeights(symbolsWeights: Record<T, number>, sequenceLength = 50): this {
        const weightsSum = Object.values<number>(symbolsWeights).reduce((sum, val) => sum + val, 0);
        if (weightsSum !== 100) {
            throw "Wrong weights data. Expected sum of values is 100, but actual is " + weightsSum;
        }
        const symbols: T[] = [];
        // Record keys always come back as strings from `for...in`/`Object.keys`, even when T is
        // numeric — the underlying object property lookup below still works because JS coerces
        // numeric-looking keys transparently, so casting the key back to T here is safe.
        for (const symbolId in symbolsWeights) {
            if (symbolsWeights[symbolId] !== undefined) {
                const symbolCount = Math.round((symbolsWeights[symbolId] / 100) * sequenceLength);
                symbols.push(...Array<T>(symbolCount).fill(symbolId as unknown as T));
            }
        }
        this.sequence = symbols;
        return this;
    }

    public fromNumbersOfSymbols(symbolsNumbers: Record<T, number>): this {
        const symbols: T[] = [];
        for (const symbolId in symbolsNumbers) {
            if (symbolsNumbers[symbolId] !== undefined) {
                symbols.push(...Array<T>(symbolsNumbers[symbolId]).fill(symbolId as unknown as T));
            }
        }
        this.sequence = symbols;
        return this;
    }

    public fromNumberOfEachSymbol(availableSymbols: T[], symbolsNumber: number): this {
        const symbols: T[] = [];
        for (const symbolId of availableSymbols) {
            symbols.push(...Array<T>(symbolsNumber).fill(symbolId));
        }
        this.sequence = symbols;
        return this;
    }

    public toArray(): T[] {
        return [...this.sequence];
    }

    public removeAllSymbols(symbolIdToRemove: T): this {
        return this.fromArray(this.toArray().filter((symbolId) => symbolId !== symbolIdToRemove));
    }

    public removeSymbol(index: number): this {
        this.sequence = this.sequence.filter((symbol, i) => i !== index);
        return this;
    }

    public getIndex(index: number): number {
        if (index >= 0) {
            return index % this.sequence.length;
        } else {
            return this.sequence.length - 1 - (Math.abs(index + 1) % this.sequence.length);
        }
    }
}
