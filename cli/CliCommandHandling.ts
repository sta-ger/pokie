export interface CliCommandHandling {
    getName(): string;

    getDescription(): string;

    run(args: string[]): Promise<void | number>;
}
