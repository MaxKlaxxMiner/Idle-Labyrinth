import {Consts} from '../game/Consts';

export class Camera {
    private _camX = 0;
    private _camY = 0;
    private deadFracX: number;
    private deadFracY: number;
    private viewW = 0;
    private viewH = 0;
    private pixW = 0;
    private pixH = 0;
    private tileSizeIndex = 0;
    private tileSize = Consts.zoom.steps[0] ?? 5;

    constructor(deadFracX = 0.60, deadFracY = 0.70) {
        this.deadFracX = deadFracX;
        this.deadFracY = deadFracY;
    }

    setViewSize(w: number, h: number) {
        this.viewW = w;
        this.viewH = h;
    }

    setWorldSize(pixW: number, pixH: number) {
        this.pixW = pixW;
        this.pixH = pixH;
    }

    setTileSizeIndex(idx: number) {
        const clamped = this.clamp(Math.floor(idx), 0, Consts.zoom.steps.length - 1);
        this.tileSizeIndex = clamped;
        this.tileSize = Consts.zoom.steps[clamped] ?? this.tileSize;
    }

    zoomIn(): boolean {
        const prev = this.tileSizeIndex;
        this.setTileSizeIndex(prev + 1);
        return this.tileSizeIndex !== prev;
    }

    zoomOut(): boolean {
        const prev = this.tileSizeIndex;
        this.setTileSizeIndex(prev - 1);
        return this.tileSizeIndex !== prev;
    }

    private getWorldPixelSize(): { worldW: number; worldH: number } {
        return {worldW: this.pixW * this.tileSize, worldH: this.pixH * this.tileSize};
    }

    setBestFitZoom() {
        const steps = Consts.zoom.steps;
        const w = this.viewW, h = this.viewH;
        const maxTileW = Math.floor((w - Consts.sizes.basePad * 2) / Math.max(1, this.pixW));
        const maxTileH = Math.floor((h - Consts.sizes.basePad * 2) / Math.max(1, this.pixH));
        const maxFit = Math.max(Consts.sizes.minTileSize, Math.min(maxTileW, maxTileH));
        const minStart = Consts.zoom.minStartTileSize;
        let idx = 0;
        for (let i = 0; i < steps.length; i++) if (steps[i] <= maxFit) idx = i;
        if (steps[idx] < minStart) {
            for (let i = 0; i < steps.length; i++) {
                if (steps[i] >= minStart) {
                    idx = i;
                    break;
                }
            }
        }
        this.setTileSizeIndex(idx);
    }

    centerOnPlayerTile(tileX: number, tileY: number) {
        const ts = this.tileSize;
        const playerPx = (tileX + 0.5) * ts;
        const playerPy = (tileY + 0.5) * ts;
        const {worldW, worldH} = this.getWorldPixelSize();
        this.centerOn(playerPx, playerPy, this.viewW, this.viewH, worldW, worldH);
    }

    updateFollowPlayerTile(tileX: number, tileY: number): boolean {
        const ts = this.tileSize;
        const playerPx = (tileX + 0.5) * ts;
        const playerPy = (tileY + 0.5) * ts;
        const {worldW, worldH} = this.getWorldPixelSize();
        return this.updateFollow(playerPx, playerPy, this.viewW, this.viewH, worldW, worldH);
    }

    centerOn(playerPx: number, playerPy: number, viewW: number, viewH: number, worldW: number, worldH: number) {
        if (worldW <= viewW) this._camX = worldW / 2; else this._camX = this.clamp(playerPx, viewW / 2, worldW - viewW / 2);
        if (worldH <= viewH) this._camY = worldH / 2; else this._camY = this.clamp(playerPy, viewH / 2, worldH - viewH / 2);
    }

    updateFollow(playerPx: number, playerPy: number, viewW: number, viewH: number, worldW: number, worldH: number): boolean {
        let changed = false;
        let targetCamX = this._camX;
        let targetCamY = this._camY;

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

    getOffsets(): { ox: number; oy: number; tileSize: number } {
        const viewW = this.viewW, viewH = this.viewH;
        const {worldW, worldH} = this.getWorldPixelSize();
        let ox: number;
        let oy: number;
        if (worldW <= viewW) ox = Math.floor((viewW - worldW) / 2); else ox = Math.floor(viewW / 2 - this._camX);
        if (worldH <= viewH) oy = Math.floor((viewH - worldH) / 2); else oy = Math.floor(viewH / 2 - this._camY);
        return {ox, oy, tileSize: this.tileSize};
    }

    getCenter(): { camX: number; camY: number } {
        return {camX: this._camX, camY: this._camY};
    }

    setCenter(camX: number, camY: number): boolean {
        const {worldW, worldH} = this.getWorldPixelSize();
        let nx = camX;
        let ny = camY;
        if (worldW <= this.viewW) nx = worldW / 2; else nx = this.clamp(nx, this.viewW / 2, worldW - this.viewW / 2);
        if (worldH <= this.viewH) ny = worldH / 2; else ny = this.clamp(ny, this.viewH / 2, worldH - this.viewH / 2);
        const changed = nx !== this._camX || ny !== this._camY;
        this._camX = nx;
        this._camY = ny;
        return changed;
    }

    ensurePlayerInsideDeadZone(playerPx: number, playerPy: number): boolean {
        const {worldW, worldH} = this.getWorldPixelSize();
        let targetCamX = this._camX;
        let targetCamY = this._camY;

        if (worldW <= this.viewW) {
            targetCamX = worldW / 2;
        } else {
            const halfDZx = (this.viewW * this.deadFracX) / 2;
            const left = this._camX - halfDZx;
            const right = this._camX + halfDZx;
            if (playerPx < left) targetCamX = playerPx + halfDZx;
            else if (playerPx > right) targetCamX = playerPx - halfDZx;
            const minX = this.viewW / 2, maxX = worldW - this.viewW / 2;
            targetCamX = this.clamp(targetCamX, minX, maxX);
        }

        if (worldH <= this.viewH) {
            targetCamY = worldH / 2;
        } else {
            const halfDZy = (this.viewH * this.deadFracY) / 2;
            const top = this._camY - halfDZy;
            const bottom = this._camY + halfDZy;
            if (playerPy < top) targetCamY = playerPy + halfDZy;
            else if (playerPy > bottom) targetCamY = playerPy - halfDZy;
            const minY = this.viewH / 2, maxY = worldH - this.viewH / 2;
            targetCamY = this.clamp(targetCamY, minY, maxY);
        }

        const changed = targetCamX !== this._camX || targetCamY !== this._camY;
        this._camX = targetCamX;
        this._camY = targetCamY;
        return changed;
    }

    private clamp(v: number, min: number, max: number) {
        return Math.max(min, Math.min(max, v));
    }
}

