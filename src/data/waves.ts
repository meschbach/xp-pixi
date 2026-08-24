import type { WaveDef } from './types';
import { publishBalancePatch } from '../simulation/balanceChannel';

/** Pause between a wave's clear and the next wave's auto-start. */
export const INTER_WAVE_DELAY_SECONDS = 5;

/** Seven authored waves; mixed-type waves are expressible via multiple groups. */
export const WAVES: readonly WaveDef[] = [
  {
    groups: [{ enemyType: 'grunt', count: 5, intervalSeconds: 1.2 }],
  },
  {
    groups: [{ enemyType: 'grunt', count: 7, intervalSeconds: 1.0 }],
  },
  {
    groups: [
      { enemyType: 'grunt', count: 6, intervalSeconds: 0.9 },
      { enemyType: 'runner', count: 2, intervalSeconds: 2.0 },
    ],
  },
  {
    groups: [{ enemyType: 'runner', count: 5, intervalSeconds: 1.1 }],
  },
  {
    groups: [
      { enemyType: 'grunt', count: 8, intervalSeconds: 0.7 },
      { enemyType: 'runner', count: 4, intervalSeconds: 1.5 },
    ],
  },
  {
    groups: [
      { enemyType: 'runner', count: 8, intervalSeconds: 0.8 },
      { enemyType: 'grunt', count: 6, intervalSeconds: 1.0 },
    ],
  },
  {
    groups: [
      { enemyType: 'grunt', count: 10, intervalSeconds: 0.6 },
      { enemyType: 'runner', count: 8, intervalSeconds: 0.7 },
    ],
  },
];

// Self-accept boundary (design D5): already-scheduled spawns keep their
// timing; the edited definitions govern subsequent waves.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const waves = (mod as { WAVES?: readonly WaveDef[] } | undefined)?.WAVES;
    const interWaveDelaySeconds = (
      mod as { INTER_WAVE_DELAY_SECONDS?: number } | undefined
    )?.INTER_WAVE_DELAY_SECONDS;
    if (waves || interWaveDelaySeconds !== undefined) {
      publishBalancePatch({ waves, interWaveDelaySeconds });
    }
  });
}
