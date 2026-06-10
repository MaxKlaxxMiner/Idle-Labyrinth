/// <reference lib="webworker" />
import { Laby } from "@/lib/Laby";

/** Auftrag an den Generator-Worker. */
export interface LabyWorkerRequest {
	level: number;
	width: number;
	height: number;
	seed: number;
}

/** Antwort des Workers: gepackte Wanddaten des fertigen Labyrinths. */
export interface LabyWorkerResponse {
	level: number;
	bits: Uint32Array;
}

// 'self' ist über die DOM-Lib als Window typisiert; diese Datei läuft als dedizierter Worker.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<LabyWorkerRequest>) => {
	const { level, width, height, seed } = e.data;
	const laby = new Laby(width, height, seed, null);
	const response: LabyWorkerResponse = { level, bits: laby.bits };
	// Buffer per Transfer übergeben (Zero-Copy); das lokale Laby wird danach verworfen.
	ctx.postMessage(response, [laby.bits.buffer]);
};
