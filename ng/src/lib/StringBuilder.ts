export class StringBuilder {
    private fullBuffer4k: string[] = [];
    private buffer: string = "";

    append(str: string): void {
        this.buffer += str;
        while (this.buffer.length >= 4096) {
            if (this.buffer.length > 4096) {
                this.fullBuffer4k.push(this.buffer.substring(0, 4096));
                this.buffer = this.buffer.substring(4096);
            } else {
                this.fullBuffer4k.push(this.buffer);
                this.buffer = "";
            }
        }
    }

    length(): number {
        return this.fullBuffer4k.length * 4096 + this.buffer.length;
    }

    lastChar(): string {
        if (this.buffer.length > 0) {
            return this.buffer.charAt(this.buffer.length - 1);
        }
        const buf = this.fullBuffer4k[this.fullBuffer4k.length - 1]
        return buf ? buf.charAt(buf.length - 1) : "";
    }

    removeLastChar(): void {
        if (this.buffer.length === 0) {
            if (this.fullBuffer4k.length === 0) return;
            this.buffer = this.fullBuffer4k.pop()!;
        }
        this.buffer = this.buffer.slice(0, -1);
    }

    toString(): string {
        return this.fullBuffer4k.join("") + this.buffer;
    }
}
