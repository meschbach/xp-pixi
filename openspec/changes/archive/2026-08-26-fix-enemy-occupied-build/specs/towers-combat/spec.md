## MODIFIED Requirements

### Requirement: Tower placement on valid tiles costs money
The player SHALL place a tower by clicking a buildable tile occupied by neither a tower, a level-owned marker (e.g., spawn portal, goal marker), nor a living enemy when affordable; placement deducts the tower's configured cost and the tile becomes occupied/blocked. Occupancy blocks building uniformly — there are no special-cased cell types. A tile with a living enemy present on it (whether the enemy is settled on the tile or arriving at it this tick) SHALL be treated as occupied for placement purposes.

#### Scenario: Successful placement
- **WHEN** the player clicks an unoccupied buildable tile with sufficient money
- **THEN** money decreases by the tower cost and a tower occupies that tile

#### Scenario: Invalid placement rejected without charge
- **WHEN** the player attempts placement on a non-buildable, blocked, or already-occupied tile (including spawn/goal marker tiles), or cannot afford the cost
- **THEN** no tower is placed and money is unchanged

#### Scenario: Enemy-present placement rejected
- **WHEN** the player attempts to place a tower on a tile where a living enemy is present (settled on the tile or arriving at it this tick)
- **THEN** no tower is placed, money is unchanged, and the rejection reason indicates an enemy is in the way

### Requirement: Path-aware target acquisition within coverage
Each tower SHALL cover exactly those enemies whose current cell is reachable from the tower's cell within the tower's configured hop radius through unblocked cells (BFS over open cells), including the tower's own cell (zero-hop coverage). The tower SHALL acquire as its target the covered enemy closest to the goal (by distance field), retargeting as enemies move or die. Targeting ties among equal distance-to-goal SHALL break deterministically by earliest acquisition (enemy id).

#### Scenario: Closest-to-goal enemy targeted
- **WHEN** multiple enemies are inside a tower's coverage
- **THEN** the tower attacks the one with the smallest distance-to-goal

#### Scenario: Wall-shadowed enemy not targeted
- **WHEN** an enemy is geometrically near a tower but not reachable from it within the hop radius through unblocked cells
- **THEN** the tower does not target that enemy

#### Scenario: Out-of-coverage enemy not targeted
- **WHEN** all enemies are outside a tower's coverage
- **THEN** the tower attacks nothing until an enemy enters coverage

#### Scenario: Tied targets break deterministically
- **WHEN** two covered enemies share the same distance-to-goal
- **THEN** the tower consistently targets the earlier-acquired enemy

#### Scenario: Tower targets enemy on its own cell
- **WHEN** an enemy is on the same tile as the tower (the tower's own cell)
- **THEN** the tower considers that enemy within its coverage and targets it (the tower's own cell is exempt from distance-field ranking since blocked cells have no distance value)
