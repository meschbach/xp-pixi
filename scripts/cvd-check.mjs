#!/usr/bin/env node
/**
 * CVD gate — verifies colors against a color-vision-deficiency simulation.
 *
 * Usage:
 *   npm run cvd-check            # run the built-in check
 *   node scripts/cvd-check.mjs '#ff8800'   # check a candidate color
 *
 * Reproduces the analysis in docs/visual-language.md: transforms colors through
 * the Machado-Oliveira-Fernandes (2009) anopia matrices in linear RGB, then
 * measures CIE Lab distance across deuteranopia / protanopia / tritanopia.
 *
 * The "reserved" set is the curated list of readable game colors (see
 * docs/visual-language.md). It is scoped intentionally: incidental outlines,
 * backgrounds, and shadows are not load-bearing identity and are excluded.
 *
 * Treat ΔE < ~12 at game scale as an ambiguity risk.
 */

const THRESHOLD = 12;

// Machado, Oliveira & Fernandes (2009), severity 1.0 (anopia), linear RGB.
const CVD_MATRICES = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

// Curated readable game colors, kept in lock-step with docs/visual-language.md.
const RESERVED = [
  { role: 'enemy-body', value: '0xff8787' },
  { role: 'enemy-body', value: '0xffd43b' },
  { role: 'enemy-body', value: '0x74c0fc' },
  { role: 'enemy-body', value: '0xb197fc' },
  { role: 'enemy-body', value: '0x63e6be' },
  { role: 'enemy-fallback', value: '0xadb5bd' },
  { role: 'hp-full', value: '0x51cf66' },
  { role: 'hp-mid', value: '0xffa94d' },
  { role: 'hp-low', value: '0xff6b6b' },
  { role: 'coverage', value: '0x74c0fc' },
  { role: 'tower', value: '0xf59f00' },
  { role: 'tower-stroke', value: '0xffd43b' },
  { role: 'hover', value: '0xffffff' },
  { role: 'selected', value: '0xffd43b' },
  { role: 'preview-valid', value: '0x8ce99a' },
  { role: 'preview-invalid', value: '0xff6b6b' },
];

// The active tower-target accent palette (design D8).
const ACCENTS = [
  { role: 'accent-cyan', value: '0x22d3ee' },
  { role: 'accent-magenta', value: '0xcc55ff' },
  { role: 'accent-rose', value: '0xee2d8a' },
  { role: 'accent-spring-green', value: '0xb8e986' },
  { role: 'accent-teal', value: '0x0d9aa3' },
];

/* ---------- color math ---------- */

function hexToLinearRgb(hex) {
  const h = hex.replace(/^0x/i, '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad hex color: ${hex}`);
  const n = parseInt(h, 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return srgb.map(lin);
}

function linearRgbToHex([r, g, b]) {
  const clip = (c) => Math.max(0, Math.min(1, c));
  const toSrgb = (c) =>
    clip(c) <= 0.0031308 ? clip(c) * 12.92 : 1.055 * Math.pow(clip(c), 1 / 2.4) - 0.055;
  const round = (c) => Math.round(toSrgb(c) * 255);
  return `0x${[round(r), round(g), round(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function simulate(hex, kind) {
  const [r, g, b] = hexToLinearRgb(hex);
  const m = CVD_MATRICES[kind];
  const out = [
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ];
  return linearRgbToHex(out);
}

function hexToLab(hex) {
  const [r, g, b] = hexToLinearRgb(hex);
  // sRGB D65 -> XYZ
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t) => (t > Math.pow(6 / 29, 3) ? Math.cbrt(t) : (1 / 3) * Math.pow(29 / 6, 2) * t + 4 / 29);
  const [Xn, Yn, Zn] = [0.95047, 1.0, 1.08883];
  const [fx, fy, fz] = [f(X / Xn), f(Y / Yn), f(Z / Zn)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(a, b) {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

/** Min CIE Lab distance between two colors across all three CVD projections. */
function cvdDistance(a, b) {
  let best = Infinity;
  for (const kind of Object.keys(CVD_MATRICES)) {
    const d = labDistance(hexToLab(simulate(a, kind)), hexToLab(simulate(b, kind)));
    if (d < best) best = d;
  }
  return best;
}

/* ---------- reporting ---------- */

function summarize(title, set) {
  console.log(`\n=== ${title} ===`);
  for (const c of set) {
    let nearest = { d: Infinity };
    for (const r of RESERVED) {
      const d = cvdDistance(c.value, r.value);
      if (d < nearest.d) nearest = { d, role: r.role, value: r.value };
    }
    const flag = nearest.d < THRESHOLD ? '  <-- RISK' : '';
    console.log(
      `${c.role.padEnd(20)} ${c.value.padEnd(9)} min-vs-reserved=${nearest.d.toFixed(1)} (${nearest.value}, ${nearest.role})${flag}`,
    );
  }
}

function checkAll() {
  summarize('ACCENTS vs RESERVED', ACCENTS);
  summarize('ACCENTS vs ACCENTS (intra)', ACCENTS.map((a) => ({ ...a })));

  // intra-accent crosses
  console.log('\n=== ACCENT intra distances ===');
  for (let i = 0; i < ACCENTS.length; i++) {
    for (let j = i + 1; j < ACCENTS.length; j++) {
      const d = cvdDistance(ACCENTS[i].value, ACCENTS[j].value);
      const flag = d < THRESHOLD ? '  <-- RISK' : '';
      console.log(`  ${ACCENTS[i].role.padEnd(18)} vs ${ACCENTS[j].role.padEnd(18)} ${d.toFixed(1)}${flag}`);
    }
  }
}

function checkCandidate(candidate) {
  const norm = /^#/.test(candidate) ? candidate.replace(/^#/, '0x') : candidate;
  console.log(`Candidate ${norm}: min CVD distance to each reserved color (ΔE < ${THRESHOLD} = RISK)\n`);
  let worst = Infinity;
  for (const r of RESERVED) {
    const d = cvdDistance(norm, r.value);
    if (d < worst) worst = d;
    console.log(`  vs ${r.role.padEnd(18)} ${r.value.padEnd(9)} ${d.toFixed(1)}${d < THRESHOLD ? '  <-- RISK' : ''}`);
  }
  console.log(`\nWorst-case ΔE: ${worst.toFixed(1)}${worst < THRESHOLD ? ' — RISK of collision' : ' — OK'}`);
}

const candidate = process.argv[2];
if (candidate) {
  checkCandidate(candidate);
} else {
  checkAll();
}
