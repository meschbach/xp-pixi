## MODIFIED Requirements

### Requirement: Damage resolution and kill rewards
Towers SHALL attack on their configured cooldown, dealing their configured damage instantly on the attack tick. Each attack SHALL publish a shot fact identifying the firing tower, the target enemy, the tick, and the target's cell to the simulation event outbox on the same tick (outbox mechanics are specified in the `simulation` capability). Projectiles and hit effects are presentation only — the simulation does not simulate them. Cooldowns are tower-local and target-independent: the timer is never reset by acquiring, switching, or losing a target; a tower fires whenever the cooldown has elapsed and a covered target exists. An enemy whose health reaches zero is killed, removed from play, and credits the player the kill reward. (Kill rewards are specified here rather than in wave handling because they couple directly to combat outcomes.)

#### Scenario: Enemy dies and pays out
- **WHEN** accumulated damage meets or exceeds an enemy's health
- **THEN** the enemy is removed and player money increases by the configured kill reward

#### Scenario: Cooldown gates fire rate
- **WHEN** a target remains in range continuously
- **THEN** attacks occur only once per cooldown interval

#### Scenario: Damage lands on the attack tick
- **WHEN** a tower's cooldown elapses against a covered target
- **THEN** damage applies immediately on that tick regardless of any presentation-only effect

#### Scenario: Retargeting does not reset the cooldown
- **WHEN** a tower switches to a newly covered enemy before its cooldown has elapsed
- **THEN** the attack lands when the original cooldown elapses, not at acquisition time

#### Scenario: Attack publishes a shot fact
- **WHEN** a tower's attack lands
- **THEN** a shot event identifying the firing tower, target enemy, tick, and target cell is appended to the simulation outbox on the same tick