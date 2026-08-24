## ADDED Requirements

### Requirement: Tower placement on valid tiles costs money
The player SHALL place a tower by clicking a buildable tile occupied by neither a tower nor a level-owned marker (e.g., spawn portal, goal marker) when affordable; placement deducts the tower's configured cost and the tile becomes occupied/blocked. Occupancy blocks building uniformly — there are no special-cased cell types.

#### Scenario: Successful placement
- **WHEN** the player clicks an unoccupied buildable tile with sufficient money
- **THEN** money decreases by the tower cost and a tower occupies that tile

#### Scenario: Invalid placement rejected without charge
- **WHEN** the player attempts placement on a non-buildable, blocked, or already-occupied tile (including spawn/goal marker tiles), or cannot afford the cost
- **THEN** no tower is placed and money is unchanged

### Requirement: Placement preserves reachability for goal and live enemies
A placement SHALL be rejected without charging the player if it would leave the spawn cell unable to reach the goal cell through unblocked cells, or — while any enemy is alive — if it would leave any living enemy's cell without a finite distance-to-goal through unblocked cells (stranding prevention).

#### Scenario: Sealing placement refused
- **WHEN** placing a tower would disconnect spawn from goal in the cell graph
- **THEN** the placement is rejected, money is unchanged, and feedback is shown

#### Scenario: Stranding placement refused
- **WHEN** placing a tower leaves a living enemy pocketed away from the goal while the spawn→goal route itself remains intact
- **THEN** the placement is rejected, money is unchanged, and feedback is shown

### Requirement: Path-aware target acquisition within coverage
Each tower SHALL cover exactly those enemies whose current cell is reachable from the tower's cell within the tower's configured hop radius through unblocked cells (BFS over open cells), and SHALL acquire as its target the covered enemy closest to the goal (by distance field), retargeting as enemies move or die. Targeting ties among equal distance-to-goal SHALL break deterministically by earliest acquisition (enemy id).

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

### Requirement: Coverage tracks board changes
Any change to the set of blocked cells (e.g., a tower placement) SHALL recompute every tower's coverage, as SHALL any change to a tower's configured range (e.g., via tuning-data hot-apply); active targets no longer covered SHALL be dropped until reacquired under normal targeting rules.

#### Scenario: Placement severs a fire corridor
- **WHEN** a tower placement blocks cells such that an engaged enemy is no longer reachable from an adjacent tower within its hop radius
- **THEN** that tower immediately drops the target and reacquires only among newly covered enemies

#### Scenario: Range retune reshapes coverage
- **WHEN** a tower's range value changes in balance data during a run
- **THEN** every tower's coverage is recomputed from the new radius and engaged targets outside the new regions are dropped

### Requirement: Damage resolution and kill rewards
Towers SHALL attack on their configured cooldown, dealing their configured damage instantly on the attack tick (projectiles and hit effects are presentation only). Cooldowns are tower-local and target-independent: the timer is never reset by acquiring, switching, or losing a target; a tower fires whenever the cooldown has elapsed and a covered target exists. An enemy whose health reaches zero is killed, removed from play, and credits the player the kill reward. (Kill rewards are specified here rather than in wave handling because they couple directly to combat outcomes.)

#### Scenario: Enemy dies and pays out
- **WHEN** accumulated damage meets or exceeds an enemy's health
- **THEN** the enemy is removed and player money increases by the configured kill reward

#### Scenario: Cooldown gates fire rate
- **WHEN** a target remains in range continuously
- **THEN** attacks occur only once per cooldown interval

#### Scenario: Damage lands on the attack tick
- **WHEN** a tower's cooldown elapses against a covered target
- **THEN** damage applies immediately on that tick regardless of any projectile visual travel

#### Scenario: Retargeting does not reset the cooldown
- **WHEN** a tower switches to a newly covered enemy before its cooldown has elapsed
- **THEN** the attack lands when the original cooldown elapses, not at acquisition time
