/** Resources the run starts with (owned by balance data per spec). */
export const STARTING_MONEY = 100;
export const STARTING_LIVES = 10;

// No self-accept boundary: starting resources only matter at world creation,
// so edits take effect on the next run (full reload or restart).
