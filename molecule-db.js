// molecule-db.js
// Single-ring molecule structures for common high-school chemistry molecules.
// Each entry describes:
//   - ring:          atoms on the ring in order (going clockwise starting from the top)
//   - ringBonds:     bond order between consecutive ring atoms. Length = ring.length.
//                    ringBonds[i] is the bond between ring[i] and ring[(i+1) % n]
//   - substituents:  atoms/groups hanging off ring atoms
//                    Each substituent: { on: ringIdx, atoms: [{symbol, order}], branch?: [...] }
//                    'on' is which ring atom this group attaches to (0-indexed)
//                    'atoms' is a linear chain of atoms from the ring outward
//                    Each atom has {symbol, order} where 'order' is the bond FROM the previous
//                    atom (or from the ring for the first atom) TO this one.
//
// Lookup key is the canonical formula string (e.g. "C6H12O6").

const MOLECULE_DB = {

  // ── All-carbon rings ────────────────────────────────────────────────────
  'C6H6': { // Benzene — alternating single/double (kekulé form)
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: Array.from({length:6}, (_, i) => ({
      on: i, atoms: [{symbol:'H', order:1}]
    })),
  },

  'C6H12': { // Cyclohexane — all single
    ring: ['C','C','C','C','C','C'],
    ringBonds: [1,1,1,1,1,1],
    substituents: Array.from({length:6}, (_, i) => ({
      on: i, atoms: [{symbol:'H', order:1},{symbol:'H', order:1}]
    })).flatMap(s => [
      { on: s.on, atoms: [{symbol:'H', order:1}] },
      { on: s.on, atoms: [{symbol:'H', order:1}] }
    ]),
  },

  'C5H10': { // Cyclopentane
    ring: ['C','C','C','C','C'],
    ringBonds: [1,1,1,1,1],
    substituents: Array.from({length:5}, (_, i) => [
      { on: i, atoms: [{symbol:'H', order:1}] },
      { on: i, atoms: [{symbol:'H', order:1}] }
    ]).flat(),
  },

  'C4H8': { // Cyclobutane (not isobutene — we assume the cyclic form)
    ring: ['C','C','C','C'],
    ringBonds: [1,1,1,1],
    substituents: Array.from({length:4}, (_, i) => [
      { on: i, atoms: [{symbol:'H', order:1}] },
      { on: i, atoms: [{symbol:'H', order:1}] }
    ]).flat(),
  },

  'C3H6': { // Cyclopropane (not propene — we assume the cyclic form)
    ring: ['C','C','C'],
    ringBonds: [1,1,1],
    substituents: Array.from({length:3}, (_, i) => [
      { on: i, atoms: [{symbol:'H', order:1}] },
      { on: i, atoms: [{symbol:'H', order:1}] }
    ]).flat(),
  },

  'C6H10': { // Cyclohexene — one double bond
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,1,1,1,1],
    substituents: [
      { on: 0, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] }, { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] }, { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] }, { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] }, { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  // ── Sugars (rings with O in the ring) ─────────────────────────────────────
  'C6H12O6': { // Glucose (pyranose form) — 5 C + 1 O, -OH groups
    ring: ['O','C','C','C','C','C'],    // O at position 0 (top)
    ringBonds: [1,1,1,1,1,1],
    substituents: [
      // Position 0 is O — no substituents
      // Position 1 (C1, anomeric C): -H, -OH
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      // Position 2 (C2): -H, -OH
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      // Position 3 (C3): -H, -OH
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      // Position 4 (C4): -H, -OH
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      // Position 5 (C5): -H, -CH2OH
      { on: 5, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] }, // simplified CH2OH → show as one C-H branch; full CH2OH would need a "branch" concept
      { on: 5, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
    ],
  },

  'C5H10O5': { // Ribose (furanose) — 4 C + 1 O ring
    ring: ['O','C','C','C','C'],
    ringBonds: [1,1,1,1,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
    ],
  },

  // ── Aromatic heterocycles ────────────────────────────────────────────────
  'C5H5N': { // Pyridine — 5C + 1N aromatic
    ring: ['N','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: [
      // N has no H in pyridine (lone pair instead)
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C4H4O': { // Furan — 4C + 1O aromatic (5-membered)
    ring: ['O','C','C','C','C'],
    ringBonds: [1,2,1,2,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C4H4S': { // Thiophene — 4C + 1S aromatic
    ring: ['S','C','C','C','C'],
    ringBonds: [1,2,1,2,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C4H5N': { // Pyrrole — 4C + 1N aromatic (N has H)
    ring: ['N','C','C','C','C'],
    ringBonds: [1,2,1,2,1],
    substituents: [
      { on: 0, atoms: [{symbol:'H', order:1}] }, // N-H
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
    ],
  },

  // ── Substituted benzenes ─────────────────────────────────────────────────
  'C7H8': { // Toluene — benzene + methyl
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: [
      // Position 0 has the methyl group instead of H
      { on: 0, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 0, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 0, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C6H6O': { // Phenol — benzene + OH
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: [
      { on: 0, atoms: [{symbol:'O', order:1}, {symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C6H5Cl': { // Chlorobenzene
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: [
      { on: 0, atoms: [{symbol:'Cl', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C6H7N': { // Aniline — benzene + NH2
    ring: ['C','C','C','C','C','C'],
    ringBonds: [2,1,2,1,2,1],
    substituents: [
      { on: 0, atoms: [{symbol:'N', order:1}, {symbol:'H', order:1}] },
      { on: 0, atoms: [{symbol:'N', order:1}, {symbol:'H', order:1}] }, // second H off N (simplified as 2 branches)
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 5, atoms: [{symbol:'H', order:1}] },
    ],
  },

  // ── Small epoxide / oxygen rings ─────────────────────────────────────────
  'C2H4O': { // Ethylene oxide — 3-membered ring
    ring: ['O','C','C'],
    ringBonds: [1,1,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C3H6O': { // Propylene oxide — 3-membered ring + methyl
    ring: ['O','C','C'],
    ringBonds: [1,1,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'C', order:1}, {symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
    ],
  },

  'C4H8O': { // Tetrahydrofuran (THF)
    ring: ['O','C','C','C','C'],
    ringBonds: [1,1,1,1,1],
    substituents: [
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 1, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 2, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 3, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
      { on: 4, atoms: [{symbol:'H', order:1}] },
    ],
  },

};
