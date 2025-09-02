export class Input {
    private pressed = new Set<string>();
    private edged = new Set<string>();

    constructor() {
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    private normKey(e: KeyboardEvent): string {
        return e.key.length === 1 ? e.key.toLowerCase() : e.key;
    }

    private onKeyDown(e: KeyboardEvent) {
        const k = this.normKey(e);
        if (!this.pressed.has(k)) this.pressed.add(k);
        // Edge immer setzen – damit funktionieren auch Fälle, in denen keyup verpasst wurde
        this.edged.add(k);
    }

    private onKeyUp(e: KeyboardEvent) {
        const k = this.normKey(e);
        this.pressed.delete(k);
    }

    consumeStepDir(): { dx: number; dy: number } | null {
        // Priority order to make behavior deterministic
        const dirs: Array<[string[], { dx: number; dy: number }]> = [
            [["w", "ArrowUp"], {dx: 0, dy: -1}],
            [["s", "ArrowDown"], {dx: 0, dy: 1}],
            [["a", "ArrowLeft"], {dx: -1, dy: 0}],
            [["d", "ArrowRight"], {dx: 1, dy: 0}],
        ];
        for (const [keys, dir] of dirs) {
            for (const k of keys) {
                if (this.edged.has(k)) {
                    // consume all direction keys to avoid multiple moves per frame
                    for (const [ks] of dirs) ks.forEach(key => this.edged.delete(key));
                    return dir;
                }
            }
        }
        return null;
    }

    consumeKey(...names: string[]): boolean {
        for (const name of names) {
            if (this.edged.has(name)) {
                this.edged.delete(name);
                return true;
            }
        }
        return false;
    }

    isPressed(...names: string[]): boolean {
        return names.some(n => this.pressed.has(n));
    }
}
