/**
 * Fixed simulation rate. Lives in its own module so the balance registry can
 * convert human units against it without importing the world (avoids cycles);
 * `simulation/world.ts` re-exports it for backwards compatibility.
 */
export const TICK_RATE_HZ = 30;
