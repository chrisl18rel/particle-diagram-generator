// lewis-engine.js
// Lightweight Lewis-structure layout engine.
// Input:  array of parsed atoms like [{symbol:'O', count:2}] or [{symbol:'Na',count:1},{symbol:'Cl',count:1}]
// Output: { atoms: [{symbol, x, y}...], bonds: [{i, j, order}...] }
//   where x,y are unit-normalized offsets from molecule center (roughly -1..+1)
//   and bond order is 1, 2, or 3.
//
// This engine does NOT draw anything. It only decides:
//   - which atom is central
//   - where each atom sits (2D layout, angles evenly distributed)
//   - how many bonds connect each pair (single / double / triple)
//
// It deliberately ignores lone pairs, formal charges, and resonance.
// For ionic compounds (e.g. NaCl), ions are treated as molecular — connected by a single bond.

const LewisEngine = (() => {

  // ── Periodic reference data ────────────────────────────────────────────
  // Valence electrons by main-group position. Only common teaching elements listed.
  const VALENCE = {
    H:1, He:2,
    Li:1, Be:2, B:3, C:4, N:5, O:6, F:7, Ne:8,
    Na:1, Mg:2, Al:3, Si:4, P:5, S:6, Cl:7, Ar:8,
    K:1,  Ca:2, Ga:3, Ge:4, As:5, Se:6, Br:7, Kr:8,
    Rb:1, Sr:2, In:3, Sn:4, Sb:5, Te:6, I:7,  Xe:8,
    Cs:1, Ba:2,
    // Transition metals — treat as 2+ by default (oxidation-state heuristic; good enough for diagrams)
    Fe:2, Cu:2, Zn:2, Ag:1, Ni:2, Co:2, Mn:2, Cr:3, Ti:4,
    Pb:2, Hg:2, Au:1, Pt:2,
  };

  // Pauling electronegativity (approximate). Lower = more likely to be central.
  const EN = {
    H:2.20, He:0,
    Li:0.98, Be:1.57, B:2.04, C:2.55, N:3.04, O:3.44, F:3.98, Ne:0,
    Na:0.93, Mg:1.31, Al:1.61, Si:1.90, P:2.19, S:2.58, Cl:3.16, Ar:0,
    K:0.82,  Ca:1.00, Ga:1.81, Ge:2.01, As:2.18, Se:2.55, Br:2.96, Kr:0,
    Rb:0.82, Sr:0.95, In:1.78, Sn:1.96, Sb:2.05, Te:2.10, I:2.66, Xe:0,
    Cs:0.79, Ba:0.89,
    Fe:1.83, Cu:1.90, Zn:1.65, Ag:1.93, Ni:1.91, Co:1.88, Mn:1.55, Cr:1.66, Ti:1.54,
    Pb:1.87, Hg:2.00, Au:2.54, Pt:2.28,
  };

  // Number of bonds each element typically forms in neutral molecules (used for bond-order math)
  const TYPICAL_BONDS = {
    H:1,  F:1,  Cl:1, Br:1, I:1,
    O:2,  S:2,  Se:2,
    N:3,  P:3,
    C:4,  Si:4,
    // Metals — assumed to form single bonds equal to their valence electrons
    Na:1, K:1,  Li:1, Rb:1, Cs:1, Ag:1, Cu:1, Au:1,
    Mg:2, Ca:2, Ba:2, Sr:2, Be:2, Zn:2, Fe:2, Ni:2, Co:2, Mn:2, Hg:2, Pb:2, Pt:2,
    Al:3, B:3,  Ga:3, Cr:3,
    Ti:4, Sn:4, Ge:4,
  };

  // ── Expand atom list ───────────────────────────────────────────────────
  // [{symbol:'H',count:2},{symbol:'O',count:1}] -> ['H','H','O']
  function expand(atomsIn) {
    const out = [];
    atomsIn.forEach(a => {
      for (let k = 0; k < a.count; k++) out.push(a.symbol);
    });
    return out;
  }

  // ── Central atom selection ─────────────────────────────────────────────
  // Rules (in order):
  //  1. H is NEVER central
  //  2. If exactly one non-H atom type exists, that element is central
  //     (handles CH4, NH3, H2O, HCN, etc.)
  //  3. Otherwise lowest-EN atom is central (handles CO2, SO2, PCl3, etc.)
  //  4. Single-atom / diatomic have no "central" — caller handles that case.
  function pickCentralIndex(symbols) {
    if (symbols.length < 3) return -1;  // diatomic or single: no center
    const nonHIdx = symbols.map((s, i) => s === 'H' ? -1 : i).filter(i => i >= 0);
    if (nonHIdx.length === 0) return -1;
    if (nonHIdx.length === 1) return nonHIdx[0];

    // Find unique non-H elements
    const uniqueNonH = [...new Set(nonHIdx.map(i => symbols[i]))];
    if (uniqueNonH.length === 1) {
      // All non-H atoms are the same element — pick any (first). e.g. CH2O where we treat...
      // Actually this branch handles cases like H2O2 (all non-H is O). Pick first O.
      return nonHIdx[0];
    }

    // Multiple non-H elements: pick lowest EN as central
    let bestIdx = nonHIdx[0];
    let bestEN  = EN[symbols[bestIdx]] ?? 99;
    for (const i of nonHIdx) {
      const e = EN[symbols[i]] ?? 99;
      if (e < bestEN) { bestEN = e; bestIdx = i; }
    }
    return bestIdx;
  }

  // ── Bond order calculation ─────────────────────────────────────────────
  // For each terminal atom, decide how many bonds it shares with the central atom.
  // Strategy:
  //   - Every terminal starts with 1 bond (single bond)
  //   - "Extra" bonds needed = (central atom's typical bond count) - (number of terminals)
  //     These extras are distributed to terminals that can accept them (have typicalBonds > 1)
  //   - Cap any single terminal at triple bond (order 3) max
  //
  // Examples:
  //   H2O:  O central, 2 H terminals. Central needs 2 bonds, 2 terminals, extras = 0. All single.
  //   CO2:  C central, 2 O terminals. Central needs 4 bonds, 2 terminals, extras = 2. Each O gets 1 extra → double bonds.
  //   CH4:  C central, 4 H terminals. Central needs 4 bonds, 4 terminals, extras = 0. All single.
  //   SO2:  S central, 2 O terminals. Central needs 2 bonds but has extras to spare via expanded octet...
  //         We use central = max(typical, # terminals). For S=2, terminals=2, extras=0, single+single.
  //         To draw SO2 as S=O-S we'd need to recognize S as hypervalent. Keep simple: single bonds.
  //   NH3:  N central, 3 H. Central=3, terminals=3, single bonds.
  //   HCN:  C central, 1 H + 1 N. Terminals=2, central needs 4 bonds. Extras=2.
  //         H can only accept 1 bond (typical=1), so both extras go to N → triple bond.
  function computeBondOrders(centralSym, terminalSyms) {
    const n = terminalSyms.length;
    const orders = new Array(n).fill(1);
    if (n === 0) return orders;

    const centralNeeds = Math.max(TYPICAL_BONDS[centralSym] ?? n, n);
    let extras = centralNeeds - n;

    // Distribute extras in passes to terminals that can accept more bonds
    // Pass 1: any terminal with typicalBonds > 1 gets +1 (so a single becomes double)
    // Pass 2: any terminal with typicalBonds > 2 (i.e. N, C) can get another +1 → triple
    while (extras > 0) {
      let added = false;
      for (let i = 0; i < n && extras > 0; i++) {
        const cap = Math.min(3, TYPICAL_BONDS[terminalSyms[i]] ?? 1);
        if (orders[i] < cap) {
          orders[i]++;
          extras--;
          added = true;
        }
      }
      if (!added) break; // no terminal can accept more
    }

    return orders;
  }

  // ── Layout ─────────────────────────────────────────────────────────────
  // Returns { atoms:[{symbol,x,y}], bonds:[{i,j,order}] }
  // Coordinates are normalized roughly to [-1, 1].
  //
  // Three cases:
  //   1 atom  → single atom at origin, no bonds
  //   2 atoms → horizontal pair, bond between them
  //   3+      → central atom at origin, terminals evenly spaced around
  function layout(parsedAtoms) {
    const symbols = expand(parsedAtoms);
    const N = symbols.length;

    if (N === 0) return { atoms: [], bonds: [] };

    if (N === 1) {
      return {
        atoms: [{ symbol: symbols[0], x: 0, y: 0 }],
        bonds: []
      };
    }

    if (N === 2) {
      // Diatomic: place horizontally, bond order from typical bond count
      // For same-element diatomics: H2=1, O2=2, N2=3, halogens=1
      const s1 = symbols[0], s2 = symbols[1];
      let order = 1;
      if (s1 === s2) {
        // Homonuclear: use typical bond count
        const t = TYPICAL_BONDS[s1] ?? 1;
        order = Math.min(3, t);
      } else {
        // Heteronuclear diatomic (HF, HCl, CO, NO, etc.)
        // Use min of the two typicals, capped at 3
        const t1 = TYPICAL_BONDS[s1] ?? 1;
        const t2 = TYPICAL_BONDS[s2] ?? 1;
        order = Math.min(3, Math.min(t1, t2));
      }
      return {
        atoms: [
          { symbol: s1, x: -0.8, y: 0 },
          { symbol: s2, x:  0.8, y: 0 }
        ],
        bonds: [{ i: 0, j: 1, order }]
      };
    }

    // 3+ atoms: pick central, place terminals around it
    const centralIdx = pickCentralIndex(symbols);
    if (centralIdx < 0) {
      // Fallback: ring layout, single bonds between consecutive atoms
      const atoms = symbols.map((sym, k) => {
        const a = (k / N) * 2 * Math.PI - Math.PI / 2;
        return { symbol: sym, x: Math.cos(a), y: Math.sin(a) };
      });
      const bonds = [];
      for (let k = 0; k < N; k++) {
        bonds.push({ i: k, j: (k + 1) % N, order: 1 });
      }
      return { atoms, bonds };
    }

    const centralSym = symbols[centralIdx];
    const terminalIndices = symbols.map((_, i) => i).filter(i => i !== centralIdx);
    const terminalSyms    = terminalIndices.map(i => symbols[i]);
    const orders          = computeBondOrders(centralSym, terminalSyms);

    // Build atom list: central first, then terminals in their original order
    const outAtoms = [{ symbol: centralSym, x: 0, y: 0 }];
    const numT     = terminalIndices.length;
    terminalIndices.forEach((origIdx, k) => {
      const angle = (k / numT) * 2 * Math.PI - Math.PI / 2;
      outAtoms.push({ symbol: symbols[origIdx], x: Math.cos(angle), y: Math.sin(angle) });
    });

    // Bonds: each terminal connects to the central (index 0)
    const bonds = orders.map((order, k) => ({ i: 0, j: k + 1, order }));

    return { atoms: outAtoms, bonds };
  }

  return { layout };

})();
