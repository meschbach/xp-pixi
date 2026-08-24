## ADDED Requirements

### Requirement: Map modeled as hex cell graph in simulation space
The simulation SHALL represent the map as a graph of cells with six-way adjacency (hex lattice) and buildable/blocked flags per cell. Spawn and goal are placed by the level instance as occupants consuming ordinary tiles — there are no special-cased cell types; occupancy (towers and level markers alike) blocks building uniformly. The simulation MUST NOT depend on pixel geometry; all distances are hop counts over adjacency.

#### Scenario: Interior cell has exactly six neighbors
- **WHEN** adjacency is queried for a non-edge cell of the slice map
- **THEN** exactly six neighboring cells are returned

#### Scenario: Edge cell has fewer neighbors
- **WHEN** adjacency is queried for a corner/edge cell of the slice map
- **THEN** fewer than six neighbors are returned and none lie outside the map

### Requirement: Authored slice map data
At least one map SHALL be defined in the balance-data layer, specifying dimensions, buildable cells, blocked cells, and the tiles consumed by its spawn and goal occupants, with a reachable route between spawn and goal.

#### Scenario: Slice map is solvable
- **WHEN** the distance-from-goal field is computed for the authored map before any towers are placed
- **THEN** the spawn cell has a finite distance to the goal

### Requirement: Hex rendering of the map
Every map cell SHALL be rendered as a pointy-top hexagon tile visually distinguishable by role (spawn, goal, buildable, blocked, tower-occupied).

#### Scenario: Map renders completely
- **WHEN** the game loads the slice map
- **THEN** one tile is rendered per map cell and roles are visually distinguishable

### Requirement: Click picking resolves screen position to a cell
Clicking on the canvas SHALL resolve the clicked pixel position to exactly one map cell via pixel-to-axial conversion and cube rounding.

#### Scenario: Click selects intended cell
- **WHEN** the player clicks near the center of a known hex tile
- **THEN** the resolved cell is that tile's cell (e.g., shown via selection highlight)
