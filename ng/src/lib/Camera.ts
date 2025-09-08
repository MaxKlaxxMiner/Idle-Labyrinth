// Kamera mit Dead-Zone und Zentrier-/Follow-Logik
export class Camera {
    private _camX = 0; // Weltpixel (Zentrum der Ansicht)
    private _camY = 0; // Weltpixel (Zentrum der Ansicht)
    private deadFracX: number;
    private deadFracY: number;

    constructor(deadFracX = 0.60, deadFracY = 0.70) {
        this.deadFracX = deadFracX;
        this.deadFracY = deadFracY;
    }

    get camX() {
        return this._camX;
    }

    get camY() {
        return this._camY;
    }

    setDeadZone(fracX: number, fracY: number) {
        this.deadFracX = fracX;
        this.deadFracY = fracY;
    }

    // Auf Spieler zentrieren, mit Begrenzung auf Weltgrenzen
    centerOn(playerPx: number, playerPy: number, viewW: number, viewH: number, worldW: number, worldH: number) {
        if (worldW <= viewW) this._camX = worldW / 2; else this._camX = this.clamp(playerPx, viewW / 2, worldW - viewW / 2);
        if (worldH <= viewH) this._camY = worldH / 2; else this._camY = this.clamp(playerPy, viewH / 2, worldH - viewH / 2);
    }

    // Dead-Zone-Follow: Kamera nur bewegen, wenn Spieler die Dead-Zone verlässt
    updateFollow(playerPx: number, playerPy: number, viewW: number, viewH: number, worldW: number, worldH: number): boolean {
        let changed = false;
        let targetCamX = this._camX;
        let targetCamY = this._camY;

        // Horizontal
        if (worldW <= viewW) {
            targetCamX = worldW / 2;
        } else {
            const halfDZx = (viewW * this.deadFracX) / 2;
            const left = this._camX - halfDZx;
            const right = this._camX + halfDZx;
            if (playerPx < left || playerPx > right) {
                targetCamX = playerPx;
            }
            const minX = viewW / 2, maxX = worldW - viewW / 2;
            targetCamX = this.clamp(targetCamX, minX, maxX);
        }

        // Vertikal
        if (worldH <= viewH) {
            targetCamY = worldH / 2;
        } else {
            const halfDZy = (viewH * this.deadFracY) / 2;
            const top = this._camY - halfDZy;
            const bottom = this._camY + halfDZy;
            if (playerPy < top || playerPy > bottom) {
                targetCamY = playerPy;
            }
            const minY = viewH / 2, maxY = worldH - viewH / 2;
            targetCamY = this.clamp(targetCamY, minY, maxY);
        }

        if (targetCamX !== this._camX) {
            this._camX = targetCamX;
            changed = true;
        }
        if (targetCamY !== this._camY) {
            this._camY = targetCamY;
            changed = true;
        }
        return changed;
    }

    // View-Offsets aus Kamera ermitteln
    getOffsets(viewW: number, viewH: number, worldW: number, worldH: number): { ox: number; oy: number } {
        let ox: number;
        let oy: number;
        if (worldW <= viewW) ox = Math.floor((viewW - worldW) / 2); else ox = Math.floor(viewW / 2 - this._camX);
        if (worldH <= viewH) oy = Math.floor((viewH - worldH) / 2); else oy = Math.floor(viewH / 2 - this._camY);
        return {ox, oy};
    }

    private clamp(v: number, min: number, max: number) {
        return Math.max(min, Math.min(max, v));
    }
}

