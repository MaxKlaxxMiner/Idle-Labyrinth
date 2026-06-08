import { Consts } from "@/game/Consts";

export class Camera {
	private _camX = 0;
	private _camY = 0;
	private readonly deadFracX: number;
	private readonly deadFracY: number;
	private viewW = 0;
	private viewH = 0;
	private pixW = 0;
	private pixH = 0;
	private tileSizeIndex = 0;
	private tileSize = Consts.zoom.steps[0] ?? 5;
	// Wurde bereits einmal automatisch gefittet? Der erste Autofit hat keine vorherige
	// Spieler-Zoomstufe und ignoriert daher die keepFurtherZoomOut-Begrenzung.
	private hasAutoFitted = false;

	constructor(deadFracX = 0.60, deadFracY = 0.70) {
		this.deadFracX = deadFracX;
		this.deadFracY = deadFracY;
	}

	/** Index der ersten Zoomstufe, deren Tilegröße mindestens `minTileSize` beträgt (sonst die größte Stufe). */
	private indexForMinTileSize(minTileSize: number): number {
		const steps = Consts.zoom.steps;
		for (let i = 0; i < steps.length; i++) if (steps[i] >= minTileSize) return i;
		return steps.length - 1;
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

	zoom(delta: number, focusTileX: number, focusTileY: number): boolean {
		if (delta === 0) return false;
		const prevIndex = this.tileSizeIndex;
		const prevTileSize = this.tileSize;
		const prevOffsets = this.getOffsets();
		// Fokuspunkt so merken, dass seine Bildschirmposition nach dem Zoom erhalten bleibt
		const focusPxOld = (focusTileX + 0.5) * prevTileSize;
		const focusPyOld = (focusTileY + 0.5) * prevTileSize;
		const focusScreenX = prevOffsets.ox + focusPxOld;
		const focusScreenY = prevOffsets.oy + focusPyOld;

		this.setTileSizeIndex(prevIndex + delta);
		if (this.tileSizeIndex === prevIndex) return false;

		const newTileSize = this.tileSize;
		const focusPxNew = (focusTileX + 0.5) * newTileSize;
		const focusPyNew = (focusTileY + 0.5) * newTileSize;

		const desiredCamX = this.viewW / 2 + focusPxNew - focusScreenX;
		const desiredCamY = this.viewH / 2 + focusPyNew - focusScreenY;

		this.setCenter(desiredCamX, desiredCamY);
		return true;
	}

	private getWorldPixelSize(): { worldW: number; worldH: number } {
		return { worldW: this.pixW * this.tileSize, worldH: this.pixH * this.tileSize };
	}

	/**
	 * Wählt die größte Zoomstufe, bei der das Labyrinth in die View passt, klemmt aber nach unten
	 * auf `minStartTileSize` (riesige Labyrinthe passen nie ganz hinein -> sonst zu kleine Tiles).
	 *
	 * Mit `keepFurtherZoomOut` (Levelwechsel) wird zusätzlich nie enger als die aktuelle Stufe
	 * gezoomt: war der Spieler im Vorlevel weiter herausgezoomt als der Best-Fit ergäbe, bleibt
	 * diese herausgezoomte Stufe erhalten, statt wieder hineinzuspringen. Der erste Autofit fittet
	 * normal (es gibt keine vorherige Spieler-Zoomstufe).
	 */
	setBestFitZoom(keepFurtherZoomOut = false) {
		const steps = Consts.zoom.steps;
		const w = this.viewW, h = this.viewH;
		const maxTileW = Math.floor((w - Consts.sizes.basePad * 2) / Math.max(1, this.pixW));
		const maxTileH = Math.floor((h - Consts.sizes.basePad * 2) / Math.max(1, this.pixH));
		const maxFit = Math.max(Consts.sizes.minTileSize, Math.min(maxTileW, maxTileH));
		const minStart = Consts.zoom.minStartTileSize;
		let idx = 0;
		for (let i = 0; i < steps.length; i++) if (steps[i] <= maxFit) idx = i;
		if (steps[idx] < minStart) idx = this.indexForMinTileSize(minStart);
		// Beim Levelwechsel nicht über die aktuelle (evtl. weiter herausgezoomte) Stufe hinaus hineinzoomen.
		if (keepFurtherZoomOut && this.hasAutoFitted) idx = Math.min(idx, this.tileSizeIndex);
		this.hasAutoFitted = true;
		this.setTileSizeIndex(idx);
	}

	// Komfort: zentriere/folge anhand gespeicherter Größen
	centerOnPlayerTile(tileX: number, tileY: number) {
		const ts = this.tileSize;
		const playerPx = (tileX + 0.5) * ts;
		const playerPy = (tileY + 0.5) * ts;
		const { worldW, worldH } = this.getWorldPixelSize();
		this.centerOn(playerPx, playerPy, this.viewW, this.viewH, worldW, worldH);
	}

	updateFollowPlayerTile(tileX: number, tileY: number): boolean {
		const ts = this.tileSize;
		const playerPx = (tileX + 0.5) * ts;
		const playerPy = (tileY + 0.5) * ts;
		const { worldW, worldH } = this.getWorldPixelSize();
		return this.updateFollow(playerPx, playerPy, this.viewW, this.viewH, worldW, worldH);
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

	// View-Offsets basierend auf internem Zustand
	getOffsets(): { ox: number; oy: number; tileSize: number } {
		const viewW = this.viewW, viewH = this.viewH;
		const { worldW, worldH } = this.getWorldPixelSize();
		let ox: number;
		let oy: number;
		if (worldW <= viewW) ox = Math.floor((viewW - worldW) / 2); else ox = Math.floor(viewW / 2 - this._camX);
		if (worldH <= viewH) oy = Math.floor((viewH - worldH) / 2); else oy = Math.floor(viewH / 2 - this._camY);
		return { ox, oy, tileSize: this.tileSize };
	}

	// Direkter Zugriff auf Kamerazentrum (in Weltpixeln)
	getCenter(): { camX: number; camY: number } {
		return { camX: this._camX, camY: this._camY };
	}

	// Setzt Kamerazentrum (in Weltpixeln) mit Begrenzung auf Weltgrenzen
	setCenter(camX: number, camY: number): boolean {
		const { worldW, worldH } = this.getWorldPixelSize();
		let nx = camX;
		let ny = camY;
		if (worldW <= this.viewW) nx = worldW / 2; else nx = this.clamp(nx, this.viewW / 2, worldW - this.viewW / 2);
		if (worldH <= this.viewH) ny = worldH / 2; else ny = this.clamp(ny, this.viewH / 2, worldH - this.viewH / 2);
		const changed = nx !== this._camX || ny !== this._camY;
		this._camX = nx;
		this._camY = ny;
		return changed;
	}

	private clamp(v: number, min: number, max: number) {
		return Math.max(min, Math.min(max, v));
	}
}
