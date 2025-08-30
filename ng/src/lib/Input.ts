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

    axis(): { x: number; y: number } {
        const left = this.pressed.has('a') || this.pressed.has('ArrowLeft');
        const right = this.pressed.has('d') || this.pressed.has('ArrowRight');
        const up = this.pressed.has('w') || this.pressed.has('ArrowUp');
        const down = this.pressed.has('s') || this.pressed.has('ArrowDown');
        let x = (right ? 1 : 0) - (left ? 1 : 0);
        let y = (down ? 1 : 0) - (up ? 1 : 0);
        if (x !== 0 || y !== 0) {
            const len = Math.hypot(x, y);
            x /= len;
            y /= len;
        }
        return {x, y};
    }

    zoomDelta(): number {
        let z = 0;
        if (this.pressed.has('+') || this.pressed.has('=')) z += 1;
        if (this.pressed.has('-')) z -= 1;
        if (this.pressed.has('0')) z = Number.NaN; // reset signal
        return z;
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
