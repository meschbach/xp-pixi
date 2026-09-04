import type { AxialCoord } from './hex';

/**
 * Ground-truth combat facts published by the simulation to an outbox that
 * presentation consumes (design D1/D5/D11). Contains only sim-safe values —
 * no pixi/DOM types. The event `id` is a monotonic, never-resetting identity
 * independent of physical storage; `tick` is the world tick the fact landed on.
 */
export interface CombatEvent {
  kind: 'shot';
  id: number;
  tick: number;
  towerId: number;
  targetId: number;
  targetCell: AxialCoord;
  targetToCell: AxialCoord;
  targetProgress: number;
}
