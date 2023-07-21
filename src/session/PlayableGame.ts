export interface PlayableGame {
    play(): void;

    canPlayNextGame(): boolean;
}
