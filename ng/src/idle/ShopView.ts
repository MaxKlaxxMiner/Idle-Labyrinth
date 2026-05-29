import {UPGRADES, UpgradeDef, UpgradeId} from './Upgrades';

/**
 * Floating-Button oben links plus Overlay-Panel mit der Upgrade-Liste.
 * Sichtbarkeit des Buttons steuert Game.ts (z.B. erst ab Level 5).
 */
export interface ShopHost {
    /** Aktueller Coin-Bestand (zum Anzeigen und Verfügbarkeits-Check). */
    getCoins(): number;
    /** Aktuelle Upgrade-Stufe (0 = nicht gekauft). */
    getUpgradeLevel(id: UpgradeId): number;
    /**
     * Kauf durchführen: zieht Coins ab und erhöht die Upgrade-Stufe.
     * Implementierung im Host (Game), damit Save-Persistenz dort gebündelt bleibt.
     */
    purchase(id: UpgradeId, newLevel: number, cost: number): void;
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
     * Liefert die Liste anzuzeigender Upgrades:
     * - sichtbar nach `requires` und nicht ausgemaxt
     * - zusätzlich Sichtbarkeitsgrenze 25% der Kosten (man muss sich dem Kauf annähern können)
     * - Fallback: wenn dadurch nichts übrig bliebe, zeigt der Shop wenigstens das günstigste
     *   noch nicht gekaufte Upgrade an, damit immer ein nächstes Ziel sichtbar ist.
     */
    private collectDisplayed(): UpgradeDef[] {
        const candidates = UPGRADES.filter((u) => this.isVisible(u));
        if (candidates.length === 0) return [];
        const coins = this.host.getCoins();
        const visible = candidates.filter((u) => coins >= u.cost * 0.25);
        if (visible.length > 0) return visible;
        // Fallback: günstigstes Upgrade aus dem candidates-Pool.
        let cheapest = candidates[0];
        for (const u of candidates) if (u.cost < cheapest.cost) cheapest = u;
        return [cheapest];
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
    }

    /** Inhalt des Overlays neu aufbauen (Coins, Upgrade-Status). */
    refresh(): void {
        if (!this.opened || !this.listEl || !this.coinsValueEl) return;
        this.coinsValueEl.textContent = this.host.getCoins().toLocaleString('en-US');
        const visible = this.collectDisplayed();
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
        const owned = this.host.getUpgradeLevel(def.id);
        const maxLevel = def.maxLevel ?? 1;
        const coins = this.host.getCoins();
        const canAfford = coins >= def.cost;

        const row = document.createElement('div');
        row.className = 'shop-row';
        if (!canAfford) row.classList.add('shop-row-locked');

        const info = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'shop-row-label';
        label.textContent = maxLevel > 1 ? `${def.label} (${owned}/${maxLevel})` : def.label;
        const desc = document.createElement('div');
        desc.className = 'shop-row-desc';
        desc.textContent = def.description;
        info.appendChild(label);
        info.appendChild(desc);
        row.appendChild(info);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-buy-btn';
        btn.textContent = `Kaufen (${def.cost.toLocaleString('en-US')})`;
        btn.disabled = !canAfford;
        btn.addEventListener('click', () => {
            if (!canAfford) return;
            this.host.purchase(def.id, owned + 1, def.cost);
            this.refresh();
        });
        row.appendChild(btn);
        return row;
    }
}

