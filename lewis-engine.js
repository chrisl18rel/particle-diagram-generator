// lewis-engine.js
// Lightweight Lewis-structure layout engine.
// Input:  array of parsed atoms like [{symbol:'O', count:2}] or [{symbol:'Na',count:1},{symbol:'Cl',count:1}]
// Output: { atoms: [{symbol, x, y}...], bonds: [{i, j, order}...] }
//   where x,y are unit-normalized offsets from molecule center (roughly -1..+1)
//   and bond order is 1, 2, or 3.
//
// Resolution order for a given formula:
//   1. Look up canonical formula in MOLECULE_DB (ring + substituents). If found, use ring layout.
//   2. If 1 atom, return single atom.
//   3. If 2 atoms, diatomic layout (auto bond order from typical bonds).
//   4. If 3+ atoms, pick central atom, arrange terminals around it, compute bond orders.
//   5. If no central atom can be determined, fall back to an N-ring with single bonds.
//
// Ignores formal charges, lone pairs, resonance.

const LewisEngine = (() => {

  // ── Periodic reference data ────────────────────────────────────────────
  const VALENCE = {
    H:1, He:2,
    Li:1, Be:2, B:3, C:4, N:5, O:6, F:7, Ne:8,
    Na:1, Mg:2, Al:3, Si:4, P:5, S:6, Cl:7, Ar:8,
    K:1,  Ca:2, Ga:3, Ge:4, As:5, Se:6, Br:7, Kr:8,
    Rb:1, Sr:2, In:3, Sn:4, Sb:5, Te:6, I:7,  Xe:8,
    Cs:1, Ba:2,
    Fe:2, Cu:2, Zn:2, Ag:1, Ni:2, Co:2, Mn:2, Cr:3, Ti:4,
    Pb:2, Hg:2, Au:1, Pt:2,
  };

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

  const TYPICAL_BONDS = {
    H:1,  F:1,  Cl:1, Br:1, I:1,
    O:2,  S:2,  Se:2,
    N:3,  P:3,
    C:4,  Si:4,
    Na:1, K:1,  Li:1, Rb:1, Cs:1, Ag:1, Cu:1, Au:1,
    Mg:2, Ca:2, Ba:2, Sr:2, Be:2, Zn:2, Fe:2, Ni:2, Co:2, Mn:2, Hg:2, Pb:2, Pt:2,
    Al:3, B:3,  Ga:3, Cr:3,
    Ti:4, Sn:4, Ge:4,
  };

  // ── Expand atom list ───────────────────────────────────────────────────
  function expand(atomsIn) {
    const out = [];
    atomsIn.forEach(a => {
      for (let k = 0; k < a.count; k++) out.push(a.symbol);
    });
    return out;
  }

  // ── Canonical formula (Hill order: C first, H second, rest alphabetical) ─
  function canonicalFormula(parsedAtoms) {
    const counts = {};
    parsedAtoms.forEach(a => { counts[a.symbol] = (counts[a.symbol] || 0) + a.count; });
    const keys = Object.keys(counts);
    keys.sort((a, b) => {
      if (a === 'C' && b !== 'C') return -1;
      if (b === 'C' && a !== 'C') return 1;
      if (a === 'H' && b !== 'H') return -1;
      if (b === 'H' && a !== 'H') return 1;
      return a.localeCompare(b);
    });
    return keys.map(k => k + (counts[k] > 1 ? counts[k] : '')).join('');
  }

  // ── Central atom selection ─────────────────────────────────────────────
  function pickCentralIndex(symbols) {
    if (symbols.length < 3) return -1;
    const nonHIdx = symbols.map((s, i) => s === 'H' ? -1 : i).filter(i => i >= 0);
    if (nonHIdx.length === 0) return -1;
    if (nonHIdx.length === 1) return nonHIdx[0];
    const uniqueNonH = [...new Set(nonHIdx.map(i => symbols[i]))];
    if (uniqueNonH.length === 1) return nonHIdx[0];
    let bestIdx = nonHIdx[0];
    let bestEN  = EN[symbols[bestIdx]] ?? 99;
    for (const i of nonHIdx) {
      const e = EN[symbols[i]] ?? 99;
      if (e < bestEN) { bestEN = e; bestIdx = i; }
    }
    return bestIdx;
  }

  // ── Bond order calculation ─────────────────────────────────────────────
  function computeBondOrders(centralSym, terminalSyms) {
    const n = terminalSyms.length;
    const orders = new Array(n).fill(1);
    if (n === 0) return orders;
    const centralNeeds = Math.max(TYPICAL_BONDS[centralSym] ?? n, n);
    let extras = centralNeeds - n;
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
      if (!added) break;
    }
    return orders;
  }

  // ── Ring-based layout from MOLECULE_DB entry ─────────────────────────────
  // Given a DB entry, place ring atoms as a regular polygon, then arrange
  // substituents radially outward from each ring atom.
  function layoutFromDB(entry) {
    const ring  = entry.ring;
    const rn    = ring.length;
    const atoms = [];
    const bonds = [];

    // Ring radius (normalized). Larger rings = bigger radius.
    const ringR = rn <= 3 ? 0.55 : rn <= 4 ? 0.7 : rn <= 5 ? 0.85 : 1.0;

    // Place ring atoms clockwise, starting from the top (−π/2)
    const ringPositions = [];
    for (let k = 0; k < rn; k++) {
      const angle = (k / rn) * 2 * Math.PI - Math.PI / 2;
      const x = ringR * Math.cos(angle);
      const y = ringR * Math.sin(angle);
      atoms.push({ symbol: ring[k], x, y });
      ringPositions.push({ x, y, angle });
    }

    // Ring bonds between consecutive atoms
    for (let k = 0; k < rn; k++) {
      bonds.push({ i: k, j: (k + 1) % rn, order: entry.ringBonds[k] || 1 });
    }

    // Group substituents by the ring atom they attach to
    const subsByRing = {};
    (entry.substituents || []).forEach(s => {
      if (!subsByRing[s.on]) subsByRing[s.on] = [];
      subsByRing[s.on].push(s);
    });

    // Bond length for substituent chains (shorter than ring radius for compactness)
    const subBondLen = 0.42;

    Object.keys(subsByRing).forEach(onKey => {
      const on       = parseInt(onKey);
      const subs     = subsByRing[on];
      const nSubs    = subs.length;
      const outAngle = ringPositions[on].angle;
      // Fan substituents around the outward radial direction.
      // Spread grows with more substituents but is capped.
      const spread = Math.min(Math.PI * 0.85, (nSubs - 1) * 0.5);

      subs.forEach((sub, si) => {
        let branchAngle;
        if (nSubs === 1) {
          branchAngle = outAngle;
        } else {
          branchAngle = outAngle - spread / 2 + (si / (nSubs - 1)) * spread;
        }

        let curIdx = on;
        let curX   = ringPositions[on].x;
        let curY   = ringPositions[on].y;

        sub.atoms.forEach(atm => {
          const nx = curX + subBondLen * Math.cos(branchAngle);
          const ny = curY + subBondLen * Math.sin(branchAngle);
          const newIdx = atoms.length;
          atoms.push({ symbol: atm.symbol, x: nx, y: ny });
          bonds.push({ i: curIdx, j: newIdx, order: atm.order || 1 });
          curIdx = newIdx;
          curX = nx;
          curY = ny;
        });
      });
    });

    return { atoms, bonds };
  }

  // ── Main layout function ──────────────────────────────────────────────────
  function layout(parsedAtoms) {
    // Step 1: check the molecule database for a known ring structure.
    // MOLECULE_DB is a global (loaded from molecule-db.js before this file).
    if (typeof MOLECULE_DB !== 'undefined') {
      const key = canonicalFormula(parsedAtoms);
      if (MOLECULE_DB[key]) {
        return layoutFromDB(MOLECULE_DB[key]);
      }
    }

    // Step 2: algorithmic layout
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
      const s1 = symbols[0], s2 = symbols[1];
      let order = 1;
      if (s1 === s2) {
        const t = TYPICAL_BONDS[s1] ?? 1;
        order = Math.min(3, t);
      } else {
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

    // 3+ atoms: central-atom layout
    const centralIdx = pickCentralIndex(symbols);
    if (centralIdx < 0) {
      // Fallback: ring layout with single bonds
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

    const centralSym      = symbols[centralIdx];
    const terminalIndices = symbols.map((_, i) => i).filter(i => i !== centralIdx);
    const terminalSyms    = terminalIndices.map(i => symbols[i]);
    const orders          = computeBondOrders(centralSym, terminalSyms);

    const outAtoms = [{ symbol: centralSym, x: 0, y: 0 }];
    const numT     = terminalIndices.length;
    terminalIndices.forEach((origIdx, k) => {
      const angle = (k / numT) * 2 * Math.PI - Math.PI / 2;
      outAtoms.push({ symbol: symbols[origIdx], x: Math.cos(angle), y: Math.sin(angle) });
    });

    const bonds = orders.map((order, k) => ({ i: 0, j: k + 1, order }));
    return { atoms: outAtoms, bonds };
  }

  return { layout, canonicalFormula };

})();
