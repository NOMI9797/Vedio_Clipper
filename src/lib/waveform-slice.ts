/**
 * Slice full-source peak envelope to a [wFrom, wTo] time window, then resample to
 * `targetBars` for canvas column rendering.
 */
export function peaksForTimeWindow(
  all: number[],
  durationSec: number,
  wFrom: number,
  wTo: number,
  targetBars: number
): number[] {
  if (all.length === 0 || targetBars < 1) {
    return [];
  }
  const d = Math.max(0.01, durationSec);
  const t0 = Math.max(0, Math.min(d, wFrom));
  const t1 = Math.max(t0, Math.min(d, wTo));
  const i0 = Math.max(0, Math.min(all.length, Math.floor((t0 / d) * all.length)));
  const i1 = Math.max(
    i0 + 1,
    Math.min(all.length, Math.ceil((t1 / d) * all.length))
  );
  const chunk = all.slice(i0, i1);
  if (chunk.length === 0) {
    return new Array(targetBars).fill(0.02);
  }
  const out: number[] = [];
  for (let b = 0; b < targetBars; b += 1) {
    const a = (b / targetBars) * chunk.length;
    const z = ((b + 1) / targetBars) * chunk.length;
    let m = 0;
    for (let k = Math.floor(a); k < Math.ceil(z); k += 1) {
      m = Math.max(m, chunk[k] ?? 0);
    }
    out.push(m);
  }
  return out;
}
