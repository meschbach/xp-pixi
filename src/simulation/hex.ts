export interface AxialCoord {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: readonly AxialCoord[] = [
  { q: +1, r: 0 },
  { q: +1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: +1 },
  { q: 0, r: +1 },
];

export function cellKey(c: AxialCoord): string {
  return `${c.q},${c.r}`;
}

export function sameCell(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function lexLess(a: AxialCoord, b: AxialCoord): boolean {
  return a.q !== b.q ? a.q < b.q : a.r < b.r;
}

export function neighborOf(c: AxialCoord, dir: AxialCoord): AxialCoord {
  return { q: c.q + dir.q, r: c.r + dir.r };
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function cubeRound(qf: number, rf: number): AxialCoord {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;

  let x = Math.round(xf);
  const y = Math.round(yf);
  let z = Math.round(zf);

  const dx = Math.abs(x - xf);
  const dy = Math.abs(y - yf);
  const dz = Math.abs(z - zf);

  // Re-anchor whichever of x/z rounded worst so the cube stays on the
  // x+y+z=0 plane. A dominant error on y never changes the returned axial
  // coordinates, so no correction is needed there.
  if (dx > dy && dx > dz) {
    x = -y - z;
  } else if (dz > dx && dz > dy) {
    z = -x - y;
  }

  return { q: x === 0 ? 0 : x, r: z === 0 ? 0 : z };
}
