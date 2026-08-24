import type { RawBalance } from './registry';

/**
 * One-way push channel for tuning hot-applies (design D5). Self-accepting
 * data modules publish their fresh snapshots here; the registry consumes
 * them. Kept separate from the registry so data modules never import it
 * back — an import cycle would make module init order fragile.
 */

export type BalancePatch = Partial<RawBalance>;

type PatchConsumer = (patch: BalancePatch) => void;

let consumer: PatchConsumer | null = null;
const queued: BalancePatch[] = [];

/** Entry point used by data-module `import.meta.hot.accept` callbacks. */
export function publishBalancePatch(patch: BalancePatch): void {
  if (consumer) {
    consumer(patch);
  } else {
    queued.push(patch);
  }
}

/** Called by the registry once at startup; drains anything published early. */
export function setBalancePatchConsumer(next: PatchConsumer): void {
  consumer = next;
  for (const patch of queued.splice(0)) {
    next(patch);
  }
}
