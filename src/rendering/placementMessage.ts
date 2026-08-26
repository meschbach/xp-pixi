import type { PlacementIssue } from '../simulation/placement';
import { getDefaultTowerTypeId } from '../simulation/placement';
import { getBalance } from '../simulation/registry';

export function rejectionMessage(reason: PlacementIssue): string {
  switch (reason) {
    case 'unaffordable':
      return `Need $${getBalance().towers.get(getDefaultTowerTypeId())?.cost ?? '?'}`;
    case 'blocked':
    case 'level-marker':
      return 'Occupied';
    case 'enemy-present':
      return 'Enemy in the way';
    case 'not-buildable':
      return "Can't build here";
    case 'would-seal-spawn':
    case 'would-strand-enemy':
      return 'Path must stay open';
    case 'out-of-bounds':
      return 'Out of bounds';
    case 'run-not-active':
      return 'Game is not running';
    default:
      return 'Rejected';
  }
}
