import {UPGRADES, UpgradeDef, UpgradeId, upgradeCost} from './Upgrades';

/**
 * Floating-Button oben links plus Overlay-Panel mit der Upgrade-Liste.
 * Sichtbarkeit des Buttons steuert Game.ts (z.B. erst ab Level 5).
 */
export interface ShopHost {
	/** Aktueller Coin-Bestand (zum Anzeigen und Verfügbarkeits-Check). */
	getCoins(): bigint;
	/** Aktuelle Upgrade-Stufe (0 = nicht gekauft). */
	getUpgradeLevel(id: UpgradeId): number;
	/**
	 * Kauf durchführen: zieht Coins ab und erhöht die Upgrade-Stufe.
	 * Implementierung im Host (Game), damit Save-Persistenz dort gebündelt bleibt.
	 */
	purchase(id: UpgradeId, newLevel: number, cost: bigint): void;
}

export class ShopView {
	private parent: HTMLElement;
	private host: ShopHost;
	private button: HTMLButtonElement;
	private overlay: HTMLDivElement | null = null;
	private listEl: HTMLDivElement | null = null;
	private coinsValueEl: HTMLSpanElement | null = null;
	private enabled = false;
	private opened = false;
	// Serialisierte Reihenfolge der aktuell gerenderten Upgrade-Ids; null erzwingt einen Rebuild.
	private displayedKey: string | null = null;
	// Referenzen auf die Zeilen-Elemente für In-Place-Updates (kein DOM-Rebuild pro Frame).
	private readonly rowEls = new Map<UpgradeId, {row: HTMLDivElement; label: HTMLDivElement; desc: HTMLDivElement; btn: HTMLButtonElement}>();

	constructor(parent: HTMLElement, host: ShopHost) {
		this.parent = parent;
		this.host = host;
		this.button = document.createElement('button');
		this.button.id = 'shop-button';
		this.button.type = 'button';
		this.button.textContent = 'Shop';
		this.button.style.display = 'none';
		this.button.addEventListener('click', () => this.open());
		this.parent.appendChild(this.button);
	}

	/** Steuert die Sichtbarkeit des Floating-Buttons (z.B. ab Level 5 aktiv). */
	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) return;
		this.enabled = enabled;
		this.button.style.display = enabled ? '' : 'none';
		// Falls ausgeblendet wird, ggf. ein offenes Overlay schließen.
		if (!enabled && this.opened) this.close();
	}

	isOpen(): boolean {
		return this.opened;
	}

	open(): void {
		if (this.opened) return;
		this.opened = true;
		this.overlay = document.createElement('div');
		this.overlay.id = 'shop-overlay';
		this.overlay.innerHTML = `
            <div class="shop-panel">
                <h2>Shop</h2>
                <div class="shop-coins">Coins: <span class="shop-coin-value">0</span></div>
                <div class="shop-list"></div>
                <button class="shop-close" type="button">Schließen</button>
            </div>
        `;
		document.body.appendChild(this.overlay);
		this.coinsValueEl = this.overlay.querySelector<HTMLSpanElement>('.shop-coin-value');
		this.listEl = this.overlay.querySelector<HTMLDivElement>('.shop-list');
		const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.shop-close');
		closeBtn?.addEventListener('click', () => this.close());
		// Klick auf den Hintergrund schließt auch.
		this.overlay.addEventListener('click', (ev) => {
			if (ev.target === this.overlay) this.close();
		});
		this.refresh();
	}

	/**
	 * Liefert die anzuzeigenden Upgrades, nach Preis (nächste Stufe) aufsteigend sortiert.
	 * Sichtbarkeit ist klassenbasiert: angezeigt wird jede freigeschaltete, noch nicht ausgemaxte
	 * Stufe (`requires` erfüllt) - bei linearen Ketten (AutoMover) also immer genau die nächste
	 * Stufe, bei Verzweigungen (Ratten) alle verfügbaren. Rein aus dem (persistierten) Besitzstand
	 * abgeleitet, daher stabil über Reloads und ohne erneutes Verstecken.
	 */
	private collectDisplayed(): UpgradeDef[] {
		const nextCost = (u: UpgradeDef) => upgradeCost(u, this.host.getUpgradeLevel(u.id));
		const shown = UPGRADES.filter((u) => this.isVisible(u));
		shown.sort((a, b) => {
			const ca = nextCost(a);
			const cb = nextCost(b);
			return ca < cb ? -1 : ca > cb ? 1 : 0;
		});
		return shown;
	}

	close(): void {
		if (!this.opened) return;
		this.opened = false;
		if (this.overlay && this.overlay.parentElement) {
			this.overlay.parentElement.removeChild(this.overlay);
		}
		this.overlay = null;
		this.listEl = null;
		this.coinsValueEl = null;
		this.displayedKey = null;
		this.rowEls.clear();
	}

	/**
	 * Aktualisiert das Overlay. Die dynamischen Teile (Coins, Kosten, Verfügbarkeit) werden jeden
	 * Frame in-place gesetzt; ein DOM-Rebuild erfolgt nur, wenn sich die Menge der angezeigten
	 * Upgrades ändert. So bleibt der :hover-/Transition-Zustand der Buttons erhalten (der Bot
	 * triggert pro Frame ein Re-Render).
	 */
	refresh(): void {
		if (!this.opened || !this.listEl || !this.coinsValueEl) return;
		const coins = this.host.getCoins();
		this.coinsValueEl.textContent = coins.toLocaleString('en-US');

		const visible = this.collectDisplayed();
		const key = visible.map((u) => u.id).join(',');
		if (key !== this.displayedKey) {
			this.displayedKey = key;
			this.rebuildList(visible);
		}
		for (const def of visible) this.updateRow(def, coins);
	}

	/** Baut die Zeilenliste komplett neu auf (nur bei geänderter sichtbarer Menge). */
	private rebuildList(visible: UpgradeDef[]): void {
		if (!this.listEl) return;
		this.rowEls.clear();
		this.listEl.innerHTML = '';
		if (visible.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'shop-empty';
			empty.textContent = 'Aktuell keine Upgrades verfügbar.';
			this.listEl.appendChild(empty);
			return;
		}
		for (const def of visible) this.listEl.appendChild(this.buildRow(def));
	}

	/** Setzt die veränderlichen Teile einer Zeile (Stufen-Label, Kosten, Verfügbarkeit) in-place. */
	private updateRow(def: UpgradeDef, coins: bigint): void {
		const els = this.rowEls.get(def.id);
		if (!els) return;
		const owned = this.host.getUpgradeLevel(def.id);
		const maxLevel = def.maxLevel ?? 1;
		const cost = upgradeCost(def, owned);
		const canAfford = coins >= cost;

		let labelText: string;
		if (maxLevel <= 1) labelText = def.label;
		else if (Number.isFinite(maxLevel)) labelText = `${def.label} (${owned}/${maxLevel})`;
		else labelText = `${def.label} (Stufe ${owned + 1})`; // unbegrenzt: die zu kaufende Stufe
		if (els.label.textContent !== labelText) els.label.textContent = labelText;

		const descText = def.describe ? def.describe(owned) : def.description;
		if (els.desc.textContent !== descText) els.desc.textContent = descText;

		const btnText = `Kaufen (${cost.toLocaleString('en-US')})`;
		if (els.btn.textContent !== btnText) els.btn.textContent = btnText;
		if (els.btn.disabled !== !canAfford) els.btn.disabled = !canAfford;
		els.row.classList.toggle('shop-row-locked', !canAfford);
	}

	dispose(): void {
		this.close();
		if (this.button.parentElement) this.button.parentElement.removeChild(this.button);
	}

	private isVisible(def: UpgradeDef): boolean {
		// Gekaufte (bzw. ausgemaxte) Upgrades verschwinden komplett aus der Liste.
		const maxLevel = def.maxLevel ?? 1;
		if (this.host.getUpgradeLevel(def.id) >= maxLevel) return false;
		if (!def.requires) return true;
		for (const req of def.requires) {
			if (this.host.getUpgradeLevel(req) < 1) return false;
		}
		return true;
	}

	private buildRow(def: UpgradeDef): HTMLDivElement {
		const row = document.createElement('div');
		row.className = 'shop-row';

		const info = document.createElement('div');
		const label = document.createElement('div');
		label.className = 'shop-row-label';
		const desc = document.createElement('div');
		desc.className = 'shop-row-desc';
		info.appendChild(label);
		info.appendChild(desc);
		row.appendChild(info);

		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'shop-buy-btn';
		btn.addEventListener('click', () => {
			// Stand frisch lesen (kein veralteter Closure-Wert nach In-Place-Updates).
			const owned = this.host.getUpgradeLevel(def.id);
			const cost = upgradeCost(def, owned);
			if (this.host.getCoins() < cost) return;
			this.host.purchase(def.id, owned + 1, cost);
			this.refresh();
		});
		row.appendChild(btn);

		// Label, Beschreibung, Kosten und Verfügbarkeit werden von updateRow gesetzt.
		this.rowEls.set(def.id, {row, label, desc, btn});
		return row;
	}
}

