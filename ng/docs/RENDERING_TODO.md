# Rendering TODOs

## Chunked Pixel Map (Background)
- Goal: Render maze background via chunked pixel maps for large levels.
- Chunks: 256x256 tiles per chunk (configurable in `Consts`).
- Storage: One OffscreenCanvas per chunk, 1px = 1 tile (unscaled).
- Build:
  - Initial: paint all needed chunks tile-by-tile to `ImageData` (nearest-neighbor look).
  - Cache: keep created chunks in an LRU map; evict far-away chunks on memory pressure.
- View/Blit:
  - Compute visible chunk range from camera (ox, oy, tile size).
  - For each visible chunk: `drawImage` with scaling to screen tile size (no smoothing).
  - Order: simple row-major; later: z-order not needed.
- Updates:
  - Tile changes: compute chunk id, patch `ImageData` at local (tx,ty), then `putImageData` with a small dirty rect.
  - Level reset/zoom change: only affects blit (re-use chunks); invalidate all on dimension/tileset change.
- Overlays:
  - Option A: keep trail/backtrack in background (separate transparent Offscreen layer per chunk).
  - Option B: keep overlays in foreground for simpler invalidation (current approach).
- Performance:
  - Disable smoothing on contexts; rely on nearest-neighbor scaling.
  - Batch `putImageData` by merging adjacent dirty rects when frequent.
  - Avoid per-frame allocations; reuse buffers.
- Testing/Debug:
  - Toggle to show chunk grid and ids.
  - Benchmark scenarios: big levels; rapid panning; frequent small updates.

## 1px Gaps Between Tiles
- Keep visual gaps for readability but render them efficiently.
- Options:
  - Lines: draw horizontal and vertical grid lines (1px) over the filled tiles.
  - Rect trick: draw solid tiles as full size, then overlay a background-colored rect expanded by 1px margins to create consistent gaps.
  - Prebake: incorporate gap pixels directly in chunked `ImageData` when generating the pixel map.
- Notes:
  - Ensure consistent alignment at all zoom levels; clamp offsets to integers.
  - Verify performance: prefer prebaked gaps in chunk maps for static cost.

## Near-term Steps
1. Add `Consts.chunks = { tile: 1, size: 256 }` and feature flag.
2. Implement chunk id math and view range computation.
3. Prototype chunk build + blit without updates.
4. Add overlay strategy (keep current FG for player/goal/HUD).
5. Add optional prebaked 1px gaps in chunk generation.

