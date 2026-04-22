// particulate.js

const Particulate = (() => {

  const canvas = document.getElementById('pd-canvas');
  const ctx    = canvas.getContext('2d');
  let beakerImg = null;

  const BW = 1254, BH = 1254;
  const ZONE = { l: 340, r: 935, t: 260, b: 935 };

  loadImageFromDataURI(BEAKER_IMG)
    .then(img => { beakerImg = img; draw(); })
    .catch(err => console.error('Beaker load failed:', err));

  let substances = [];

  const SHAPES       = ['circle','square','triangle','diamond','pentagon','hexagon','star','cross'];
  const PALETTE      = ['#4a90e2','#e2604a','#4ae28a','#e2c24a','#c44ae2',
                        '#4ae2d8','#e24a8e','#a0e24a','#e2904a','#4a60e2'];
  const SHAPE_LABELS = { circle:'●', square:'■', triangle:'▲', diamond:'◆', pentagon:'⬠',
                         hexagon:'⬡', star:'★', cross:'✚' };

  // ── Seeded RNG (Mulberry32) ────────────────────────────────────────────────
  function makeRng(seed) {
    let s = (seed ^ 0xDEADBEEF) | 0;
    return function() {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Formula parser ────────────────────────────────────────────────────────
  function normalizeSymbol(sym) {
    return sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();
  }

  function parseFormula(f) {
    f = f.replace(/\(s\)|\(l\)|\(g\)|\(aq\)/gi, '').trim();
    const atoms = [];
    const re    = /([A-Z][a-z]?)(\d*)/g;
    let m;
    while ((m = re.exec(f)) !== null) {
      if (m[1]) atoms.push({ symbol: normalizeSymbol(m[1]), count: parseInt(m[2] || '1', 10) });
    }
    return atoms;
  }

  function reconstructFormula(atoms) {
    return atoms.map(a => a.symbol + (a.count > 1 ? a.count : '')).join('');
  }

  function splitSubstances(raw) {
    return raw.split('+').map(s => s.trim()).filter(Boolean);
  }

  function isElement(atoms) {
    return atoms.length > 0 && atoms.every(a => a.symbol === atoms[0].symbol);
  }

  // ── UI panels ─────────────────────────────────────────────────────────────
  function buildPanels() {
    const container = document.getElementById('pd-substance-panels');
    container.innerHTML = '';
    if (!substances.length) return;

    const header = document.createElement('div');
    header.className = 'control-group';
    header.innerHTML = '<div class="group-title">PARTICLE APPEARANCE</div>';
    container.appendChild(header);

    substances.forEach((sub, i) => {
      const div = document.createElement('div');
      div.className = 'substance-panel';

      const rowsHTML = sub.atoms.map((atom, ai) => `
        <div class="substance-row">
          <label>${atom.symbol}</label>
          <button class="color-swatch-btn" id="pd-sw-${i}-${ai}"
            style="background:${sub.colors[ai]};width:22px;height:22px;"></button>
          <select id="pd-shape-${i}-${ai}">
            ${SHAPES.map(s =>
              `<option value="${s}"${sub.shapes[ai]===s?' selected':''}>${SHAPE_LABELS[s]} ${s}</option>`
            ).join('')}
          </select>
        </div>
        <div class="substance-size-row">
          <span class="size-row-lbl">Size ×</span>
          <input type="range" id="pd-smr-${i}-${ai}" min="0.4" max="3.0" step="0.1"
            value="${sub.sizeMults[ai]}" />
          <input type="number" id="pd-smn-${i}-${ai}" min="0.4" max="3.0" step="0.1"
            value="${sub.sizeMults[ai]}" style="width:46px;font-size:11px;" />
        </div>
      `).join('');

      div.innerHTML = `<div class="substance-panel-title">${sub.formula}</div>${rowsHTML}`;
      container.appendChild(div);

      sub.atoms.forEach((atom, ai) => {
        const sw    = document.getElementById(`pd-sw-${i}-${ai}`);
        const shape = document.getElementById(`pd-shape-${i}-${ai}`);
        const smr   = document.getElementById(`pd-smr-${i}-${ai}`);
        const smn   = document.getElementById(`pd-smn-${i}-${ai}`);

        sw.addEventListener('click', e => {
          e.stopPropagation();
          openColorPicker(sw, sub.colors[ai], col => {
            sub.colors[ai] = col; sw.style.background = col; draw();
          });
        });
        shape.addEventListener('change', () => { sub.shapes[ai] = shape.value; draw(); });
        smr.addEventListener('input', () => {
          smn.value = smr.value; sub.sizeMults[ai] = parseFloat(smr.value); draw();
        });
        smn.addEventListener('input', () => {
          const v = Math.max(0.4, Math.min(3.0, parseFloat(smn.value) || 1));
          smr.value = v; sub.sizeMults[ai] = v; draw();
        });
      });
    });
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  function parse() {
    const raw = strVal('pd-formula', '');
    if (!raw) { showToast('Enter a formula or mixture.', true); return; }
    const parts = splitSubstances(raw);
    if (!parts.length) { showToast('Could not parse input.', true); return; }

    const prevMap = {};
    substances.forEach(s => { prevMap[s.formula] = s; });

    let colorIdx = 0;
    substances = parts.map(formula => {
      const atoms     = parseFormula(formula);
      if (!atoms.length) return null;
      const canonical = reconstructFormula(atoms);
      const prev      = prevMap[canonical];
      const colors    = atoms.map((a, i) => prev?.colors[i]      || PALETTE[(colorIdx + i) % PALETTE.length]);
      const shapes    = atoms.map((a, i) => prev?.shapes[i]      || SHAPES[i % SHAPES.length]);
      const sizeMults = atoms.map((a, i) => prev?.sizeMults?.[i] ?? 1.0);
      colorIdx += atoms.length;
      return { formula: canonical, atoms, colors, shapes, sizeMults };
    }).filter(Boolean);

    if (!substances.length) { showToast('No valid formulas found.', true); return; }
    buildPanels();
    draw();
  }

  // ── Shape drawing ─────────────────────────────────────────────────────────
  function drawShape(x, y, r, shape, color, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation || 0);
    ctx.fillStyle   = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = Math.max(0.8, r * 0.12);
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        break;
      case 'square': {
        const s = r * 1.7;
        ctx.rect(-s/2, -s/2, s, s);
        break;
      }
      case 'triangle': {
        const h = r * 1.9;
        ctx.moveTo(0, -h * 0.65);
        ctx.lineTo( h * 0.58,  h * 0.38);
        ctx.lineTo(-h * 0.58,  h * 0.38);
        ctx.closePath();
        break;
      }
      case 'diamond': {
        const d = r * 1.8;
        ctx.moveTo(0, -d * 0.62);
        ctx.lineTo( d * 0.45, 0);
        ctx.lineTo(0,  d * 0.62);
        ctx.lineTo(-d * 0.45, 0);
        ctx.closePath();
        break;
      }
      case 'pentagon': {
        for (let k = 0; k < 5; k++) {
          const a = (k * 2 * Math.PI / 5) - Math.PI / 2;
          k === 0 ? ctx.moveTo(r*1.3*Math.cos(a), r*1.3*Math.sin(a))
                  : ctx.lineTo(r*1.3*Math.cos(a), r*1.3*Math.sin(a));
        }
        ctx.closePath();
        break;
      }
      case 'hexagon': {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI / 3) - Math.PI / 6;
          k === 0 ? ctx.moveTo(r*1.25*Math.cos(a), r*1.25*Math.sin(a))
                  : ctx.lineTo(r*1.25*Math.cos(a), r*1.25*Math.sin(a));
        }
        ctx.closePath();
        break;
      }
      case 'star': {
        const outer = r * 1.4, inner = r * 0.6;
        for (let k = 0; k < 12; k++) {
          const a  = (k * Math.PI / 6) - Math.PI / 2;
          const rk = k % 2 === 0 ? outer : inner;
          k === 0 ? ctx.moveTo(rk*Math.cos(a), rk*Math.sin(a))
                  : ctx.lineTo(rk*Math.cos(a), rk*Math.sin(a));
        }
        ctx.closePath();
        break;
      }
      case 'cross': {
        const arm = r * 1.35, thick = r * 0.52;
        ctx.moveTo(-thick, -arm); ctx.lineTo( thick, -arm);
        ctx.lineTo( thick, -thick); ctx.lineTo( arm, -thick);
        ctx.lineTo( arm,  thick); ctx.lineTo( thick,  thick);
        ctx.lineTo( thick,  arm); ctx.lineTo(-thick,  arm);
        ctx.lineTo(-thick,  thick); ctx.lineTo(-arm,  thick);
        ctx.lineTo(-arm, -thick); ctx.lineTo(-thick, -thick);
        ctx.closePath();
        break;
      }
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── Symbol text inside shape ──────────────────────────────────────────────
  function drawSymbol(x, y, r, symbol) {
    ctx.save();
    ctx.fillStyle    = '#000';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Scale font to fit inside shape — shorter symbols can use larger text
    const fontSize = Math.max(8, r * (symbol.length === 1 ? 1.05 : 0.85));
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.fillText(symbol, x, y);
    ctx.restore();
  }

  // ── Bond drawing — solid line, supports order 1/2/3 ──────────────────────
  function drawBond(x1, y1, x2, y2, thickness, lengthFrac, order) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const trim = (1 - Math.min(1, Math.max(0, lengthFrac))) / 2;
    const sx = x1 + dx * trim, sy = y1 + dy * trim;
    const ex = x2 - dx * trim, ey = y2 - dy * trim;

    // Perpendicular unit vector for offsetting parallel lines
    const perpX = -dy / dist, perpY = dx / dist;
    // Space between parallel lines scales with thickness
    const sep = Math.max(3, thickness * 1.8);

    ctx.save();
    ctx.strokeStyle = 'rgba(140,140,140,0.75)';
    ctx.lineWidth   = Math.max(0.5, thickness);
    ctx.lineCap     = 'round';

    const o = order || 1;
    if (o === 1) {
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
      ctx.stroke();
    } else if (o === 2) {
      for (const d of [-sep/2, sep/2]) {
        ctx.beginPath();
        ctx.moveTo(sx + perpX * d, sy + perpY * d);
        ctx.lineTo(ex + perpX * d, ey + perpY * d);
        ctx.stroke();
      }
    } else {
      for (const d of [-sep, 0, sep]) {
        ctx.beginPath();
        ctx.moveTo(sx + perpX * d, sy + perpY * d);
        ctx.lineTo(ex + perpX * d, ey + perpY * d);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ── Build a per-molecule layout ──────────────────────────────────────────
  // Returns { atoms: [{x, y, elemIdx}], bonds: [{i, j, order}] } scaled by atomRadiusPx.
  // In basic mode: generic circular layout + single bonds between adjacent atoms and center.
  // In advanced mode: use LewisEngine.
  //
  // elemIdx points into sub.atoms (unique element list) so we can look up color/shape/size.
  function buildMoleculeLayout(sub, advanced, atomRadiusPx, molRot, bondSpacing) {
    // Map element symbol -> index in sub.atoms (for color/shape lookup)
    const elemIdxBySym = {};
    sub.atoms.forEach((a, i) => { elemIdxBySym[a.symbol] = i; });

    const nAtomsTotal = sub.atoms.reduce((n, a) => n + a.count, 0);

    if (advanced) {
      const lay = LewisEngine.layout(sub.atoms);
      // lay.atoms have normalized x,y in roughly [-1,1]. Scale to pixel units.
      // bondSpacing multiplier (1.0..3.0) increases physical distance between atoms
      const scale = atomRadiusPx * 2.4 * bondSpacing;
      const cosR = Math.cos(molRot), sinR = Math.sin(molRot);
      const atoms = lay.atoms.map(a => {
        const px = a.x * scale, py = a.y * scale;
        return {
          x: px * cosR - py * sinR,
          y: px * sinR + py * cosR,
          symbol: a.symbol,
          elemIdx: elemIdxBySym[a.symbol] ?? 0
        };
      });
      return { atoms, bonds: lay.bonds };
    }

    // Basic mode: preserve existing behavior — expand atoms, ring around center.
    const expandedSyms = [];
    sub.atoms.forEach(a => {
      for (let k = 0; k < a.count; k++) expandedSyms.push(a.symbol);
    });

    const atoms = [];
    const bonds = [];
    if (expandedSyms.length === 1) {
      atoms.push({ x: 0, y: 0, symbol: expandedSyms[0], elemIdx: elemIdxBySym[expandedSyms[0]] });
    } else {
      const bondDist = atomRadiusPx * 1.9 * bondSpacing;
      expandedSyms.forEach((sym, ai) => {
        const angle = molRot + (ai / expandedSyms.length) * Math.PI * 2;
        atoms.push({
          x: bondDist * Math.cos(angle),
          y: bondDist * Math.sin(angle),
          symbol: sym,
          elemIdx: elemIdxBySym[sym] ?? 0
        });
      });
    }
    return { atoms, bonds, basicMode: true };
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  function draw() {
    const zoom        = numVal('pd-zoom-range',       45) / 100;
    const countPerSub = Math.round(numVal('pd-count-range', 10));
    const atomR       = numVal('pd-size-range',       14);
    const transparent = isChecked('pd-transparent');
    const randomness  = numVal('pd-random-range',     50) / 100;
    const bondThick   = numVal('pd-bond-thick-range', 15) / 10;
    const bondLen     = numVal('pd-bond-space-range', 100) / 100;  // now 1.0..3.0 multiplier
    const spacing     = numVal('pd-spacing-range',    20) / 100;  // 0..1.5 range
    const advanced    = isChecked('pd-advanced-mode');

    canvas.width  = Math.round(BW * zoom);
    canvas.height = Math.round(BH * zoom);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (beakerImg) ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);

    if (!substances.length) { buildLegend(); return; }

    const zl = ZONE.l * zoom, zr = ZONE.r * zoom;
    const zt = ZONE.t * zoom, zb = ZONE.b * zoom;
    const zw = zr - zl, zh = zb - zt;
    const N  = substances.length;
    const baseR = atomR * zoom;  // reference radius in pixels, used throughout

    const rngs     = substances.map((_, si) => makeRng(si * 9999 + countPerSub * 7 + Math.round(atomR)));
    const cols     = Math.max(2, Math.ceil(Math.sqrt(countPerSub * 1.5)));
    const rows     = Math.max(2, Math.ceil(countPerSub / cols) + 1);
    const cellW    = zw / cols;
    const cellH    = zh / rows;
    const placed   = [];      // { x, y, r } for overlap testing
    const molecules = [];     // { subIdx, cx, cy, rotation, layout }
    const counts   = new Array(N).fill(0);
    const attempts = new Array(N).fill(0);
    const MAX_ATT  = 8000;

    let anyActive = true;
    while (anyActive) {
      anyActive = false;
      for (let si = 0; si < N; si++) {
        if (counts[si] >= countPerSub) continue;
        if (attempts[si] >= MAX_ATT) continue;
        anyActive = true;

        const sub    = substances[si];
        const rng    = rngs[si];
        attempts[si]++;

        const molIdx = counts[si];
        const col    = molIdx % cols;
        const row    = Math.floor(molIdx / cols) % rows;
        const baseX  = zl + (col + 0.5) * cellW;
        const baseY  = zt + (row + 0.5) * cellH;
        const jx     = (rng() - 0.5) * 2 * randomness * cellW * 2.5;
        const jy     = (rng() - 0.5) * 2 * randomness * cellH * 2.5;
        const cx     = Math.max(zl + 10, Math.min(zr - 10, baseX + jx));
        const cy     = Math.max(zt + 10, Math.min(zb - 10, baseY + jy));
        const molRot = randomness * (rng() * 2 - 1) * Math.PI;

        const maxMult  = Math.max(...sub.sizeMults);
        const layout   = buildMoleculeLayout(sub, advanced, baseR * maxMult, molRot, bondLen);

        // Compute absolute atom positions for this molecule
        const mAtoms = layout.atoms.map(a => ({
          x: cx + a.x,
          y: cy + a.y,
          elemIdx: a.elemIdx,
          symbol: a.symbol
        }));

        // Bounds check — each atom must be inside the zone with its scaled radius
        const inBounds = mAtoms.every(a => {
          const r2 = baseR * sub.sizeMults[a.elemIdx] * 1.2;
          return a.x - r2 > zl && a.x + r2 < zr && a.y - r2 > zt && a.y + r2 < zb;
        });
        if (!inBounds) continue;

        // Overlap check — spacing multiplier (1 + spacing) adds extra gap
        const overlaps = mAtoms.some(a => {
          const myR = baseR * sub.sizeMults[a.elemIdx];
          return placed.some(p => {
            const minDist = (myR + p.r) * (1 + spacing);
            return Math.hypot(a.x - p.x, a.y - p.y) < minDist;
          });
        });
        if (overlaps) continue;

        mAtoms.forEach(a => {
          const r2 = baseR * sub.sizeMults[a.elemIdx];
          placed.push({ x: a.x, y: a.y, r: r2 });
        });
        molecules.push({ subIdx: si, cx, cy, rotation: molRot, mAtoms, layout });
        counts[si]++;
      }
    }

    // ── Draw bonds ────────────────────────────────────────────────────────
    molecules.forEach(mol => {
      const sub = substances[mol.subIdx];
      if (mol.layout.basicMode) {
        // Basic mode: center-to-atom bonds, order 1
        if (mol.mAtoms.length < 2) return;
        mol.mAtoms.forEach(a => {
          drawBond(a.x, a.y, mol.cx, mol.cy, bondThick, 1.0, 1);
        });
      } else {
        // Advanced mode: explicit bonds from layout
        mol.layout.bonds.forEach(b => {
          const a1 = mol.mAtoms[b.i], a2 = mol.mAtoms[b.j];
          if (!a1 || !a2) return;
          drawBond(a1.x, a1.y, a2.x, a2.y, bondThick, 1.0, b.order);
        });
      }
    });

    // ── Draw atoms (shape + optional symbol) ─────────────────────────────
    molecules.forEach(mol => {
      const sub = substances[mol.subIdx];
      mol.mAtoms.forEach(a => {
        const r    = baseR * sub.sizeMults[a.elemIdx];
        const clr  = sub.colors[a.elemIdx];
        const shp  = sub.shapes[a.elemIdx];
        drawShape(a.x, a.y, r, shp, clr, mol.rotation);
        if (advanced) {
          drawSymbol(a.x, a.y, r, a.symbol);
        }
      });
    });

    buildLegend();
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function buildLegend() {
    const el = document.getElementById('pd-legend');
    el.innerHTML = '';
    if (!substances.length) return;
    const allElements  = substances.every(s => isElement(s.atoms));
    const allCompounds = substances.every(s => !isElement(s.atoms));
    const cat = substances.length === 1 ? '' :
                allElements ? 'ME' : allCompounds ? 'MC' : 'MEC';
    substances.forEach(sub => {
      const typeLabel = isElement(sub.atoms)
        ? (sub.atoms.length > 1 ? 'Diatomic Element' : 'Element') : 'Compound';
      sub.atoms.forEach((atom, ai) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const swatch = document.createElement('div');
        swatch.className = 'legend-swatch';
        swatch.style.background   = sub.colors[ai];
        swatch.style.borderRadius = sub.shapes[ai] === 'circle' ? '50%' : '3px';
        const label = document.createElement('span');
        label.textContent = `${atom.symbol} (in ${sub.formula})` +
                            (cat ? ` — ${cat}` : ` — ${typeLabel}`);
        item.appendChild(swatch);
        item.appendChild(label);
        el.appendChild(item);
      });
    });
  }

  // ── Event bindings ────────────────────────────────────────────────────────
  document.getElementById('pd-formula').addEventListener('keydown', e => {
    if (e.key === 'Enter') parse();
  });
  bindSliderWithInput('pd-count-range',      'pd-count-num',      draw);
  bindSliderWithInput('pd-size-range',       'pd-size-num',       draw);
  bindSliderWithInput('pd-zoom-range',       'pd-zoom-num',       draw);
  bindSliderWithInput('pd-random-range',     'pd-random-num',     draw);
  bindSliderWithInput('pd-bond-thick-range', 'pd-bond-thick-num', draw);
  bindSliderWithInput('pd-bond-space-range', 'pd-bond-space-num', draw);
  bindSliderWithInput('pd-spacing-range',    'pd-spacing-num',    draw);
  document.getElementById('pd-transparent').addEventListener('change', () => {
    updateBgClass('pd-checker', isChecked('pd-transparent')); draw();
  });
  document.getElementById('pd-advanced-mode').addEventListener('change', draw);

  const EXAMPLES = {
    element: 'Na', diatomic: 'O2', compound: 'H2O',
    me: 'Na + Ca', mc: 'NaCl + CaCl2', mec: 'Na + NaCl', three: 'H2O + NaCl + CO2',
  };
  function loadExample(k) { document.getElementById('pd-formula').value = EXAMPLES[k] || ''; parse(); }

  function exportPNG() {
    draw();
    const a = document.createElement('a');
    a.download = 'particulate_diagram.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
  function clear() {
    document.getElementById('pd-formula').value = '';
    substances = [];
    document.getElementById('pd-substance-panels').innerHTML = '';
    document.getElementById('pd-legend').innerHTML = '';
    draw();
  }

  draw();
  return { parse, clear, loadExample, exportPNG };
})();
