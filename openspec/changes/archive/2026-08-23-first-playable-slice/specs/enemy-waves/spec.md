## ADDED Requirements

### Requirement: Declarative wave definitions drive spawning
Waves SHALL be defined in the balance-data layer as declarative lists of spawn groups (enemy type, count, spawn interval); a wave may declare multiple groups, including mixed enemy types. Spawning SHALL follow these definitions without hardcoded wave logic.

#### Scenario: Wave spawns per definition
- **WHEN** a wave is defined as N enemies at interval I and the wave starts
- **THEN** N enemies spawn approximately I apart

#### Scenario: Mixed-type wave spawns every group
- **WHEN** a wave declares multiple spawn groups of differing enemy types
- **THEN** every group spawns per its own count and interval within that wave

### Requirement: Enemies traverse the cell graph toward the goal
Each enemy SHALL move cell-to-cell at its configured speed (cells per second), each step choosing an adjacent cell with lower distance-to-goal; enemies MUST NOT enter blocked cells. An enemy's position is `(fromCell, toCell, progress)` with continuous progress along the hop; its logical cell — consulted by targeting, coverage, and leak detection — remains `fromCell` until the hop completes, and a distance-field change mid-step completes the committed hop before the next step is chosen. Step ties among equal-distance neighbors SHALL break deterministically (axial-coordinate order). If an enemy ever finds no lower-distance unblocked neighbor, it SHALL hold position until one exists (defense-in-depth; placement validation prevents this arising from building).

#### Scenario: Enemy reaches goal in expected time
- **WHEN** an enemy with speed S spawns on a map whose distance field gives D hops to goal
- **THEN** it arrives at the goal after approximately D/S seconds of unobstructed movement

#### Scenario: Enemies path around towers
- **WHEN** towers block cells between spawn and goal
- **THEN** subsequent enemies route around those cells via remaining lower-distance neighbors

#### Scenario: Sealed enemy holds position
- **WHEN** the blocked set changes such that an enemy occupies a region where no adjacent unblocked cell has a finite distance-to-goal
- **THEN** the enemy holds its position until the field restores a lower-distance unblocked neighbor

#### Scenario: Mid-hop field change completes the committed step
- **WHEN** the distance field changes while an enemy is between cells
- **THEN** the enemy finishes its committed hop and only then re-evaluates its descent choice

### Requirement: Leak handling decrements lives
An enemy reaching the goal cell SHALL be removed from play and reduce the player's lives by one. The starting life count is owned by balance data (seeded at 10 for the slice). (Lives are specified here rather than in economy handling because they couple directly to wave-leak events.)

#### Scenario: Goal leak costs a life
- **WHEN** an enemy reaches the goal
- **THEN** lives decrease by exactly one and that enemy no longer exists in the world

### Requirement: Loss condition ends the run
When lives reach zero the game SHALL enter a loss state: spawning stops, gameplay halts, and a game-over indication with a restart affordance is presented.

#### Scenario: Lives exhausted triggers game over
- **WHEN** lives reach zero
- **THEN** no further enemies spawn and the loss state with restart is displayed

#### Scenario: Restart begins a fresh run
- **WHEN** the player activates restart from the loss state
- **THEN** the game resets to initial money, lives, and empty board

### Requirement: Waves progress sequentially
A wave SHALL be considered cleared only when its spawn queue is exhausted AND none of its enemies remain alive. The first wave SHALL start on player action, and each subsequent wave SHALL start automatically after the previous wave is cleared plus a short delay.

#### Scenario: Next wave auto-starts after clear
- **WHEN** a wave's spawn queue is exhausted and its last living enemy is killed or leaks
- **THEN** the next defined wave begins after the configured delay

#### Scenario: Kills outrunning the spawner do not advance waves
- **WHEN** all currently spawned enemies of a wave are killed while that wave still has pending spawns in its queue
- **THEN** the wave is not cleared and the next wave does not begin until spawning completes and the remaining enemies are gone

### Requirement: Finite campaign ends in victory
The wave set SHALL be finite, with its size owned by balance data; when the final defined wave is cleared (spawn queue exhausted AND no enemies of that wave remain alive) the game SHALL enter a victory state: spawning stops, gameplay halts, and a victory indication with a restart affordance is presented.

#### Scenario: Final clear triggers victory
- **WHEN** the final defined wave's spawn queue is exhausted and its last living enemy is killed or leaks
- **THEN** the game enters the victory state with a victory indication and restart affordance

#### Scenario: Restart from victory begins a fresh run
- **WHEN** the player activates restart from the victory state
- **THEN** the game resets to initial money, lives, and empty board
