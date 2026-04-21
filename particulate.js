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
      const colors    = atoms.map((a, i) => prev?.colors[i]     || PALETTE[(colorIdx + i) % PALETTE.length]);
      const shapes    = atoms.map((a, i) => prev?.shapes[i]     || SHAPES[i % SHAPES.length]);
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
        // 6-pointed star (two overlapping triangles feel)
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

  function drawBond(x1, y1, x2, y2, thickness, lengthFrac) {
    const dx = x2-x1, dy = y2-y1;
    const trim = (1 - Math.min(1, Math.max(0, lengthFrac))) / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(140,140,140,0.65)';
    ctx.lineWidth   = Math.max(0.5, thickness);
    ctx.beginPath();
    ctx.moveTo(x1 + dx * trim, y1 + dy * trim);
    ctx.lineTo(x2 - dx * trim, y2 - dy * trim);
    ctx.stroke();
    ctx.restore();
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  function draw() {
    const zoom       = numVal('pd-zoom-range',  45) / 100;
    const countPerSub = Math.round(numVal('pd-count-range', 10));
    const atomR      = numVal('pd-size-range',  14);
    const transparent = isChecked('pd-transparent');
    const randomness = numVal('pd-random-range',     50) / 100;
    const bondThick  = numVal('pd-bond-thick-range', 15) / 10;
    const bondLen    = numVal('pd-bond-len-range',   90) / 100;

    canvas.width  = Math.round(BW * zoom);
    canvas.height = Math.round(BH * zoom);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (beakerImg) ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);

    if (!substances.length) { buildLegend(); return; }

    const zl = ZONE.l * zoom, zr = ZONE.r * zoom;
    const zt = ZONE.t * zoom, zb = ZONE.b * zoom;
    const zw = zr - zl, zh = zb - zt;
    const N = substances.length;

    // ── Placement strategy ────────────────────────────────────────────────
    // Each substance is guaranteed its quota by trying in round-robin order.
    // Positions are generated from a reproducible but varied RNG per substance.
    // randomness=0  → near-grid layout
    // randomness=1  → fully random scatter

    const placed  = [];   // { x, y, r } for overlap testing
    const allPos  = [];   // final render list

    // Per-substance independent RNG streams
    const rngs = substances.map((_, si) => makeRng(si * 9999 + countPerSub * 7 + Math.round(atomR)));

    // How many grid cells per substance
    const cols  = Math.max(2, Math.ceil(Math.sqrt(countPerSub * 1.5)));
    const rows  = Math.max(2, Math.ceil(countPerSub / cols) + 1);
    const cellW = zw / cols;
    const cellH = zh / rows;

    const counts   = new Array(N).fill(0);
    const attempts = new Array(N).fill(0);
    const MAX_ATT  = 8000;

    // Round-robin until everyone is done or gives up
    let anyActive = true;
    while (anyActive) {
      anyActive = false;
      for (let si = 0; si < N; si++) {
        if (counts[si] >= countPerSub) continue;
        if (attempts[si] >= MAX_ATT) continue;
        anyActive = true;

        const sub   = substances[si];
        const rng   = rngs[si];
        attempts[si]++;

        // Grid position (loosely ordered so same substance doesn't cluster)
        const molIdx = counts[si];
        const col    = molIdx % cols;
        const row    = Math.floor(molIdx / cols) % rows;
        const baseX  = zl + (col + 0.5) * cellW;
        const baseY  = zt + (row + 0.5) * cellH;

        // Jitter scales with randomness
        const jx  = (rng() - 0.5) * 2 * randomness * cellW * 2.5;
        const jy  = (rng() - 0.5) * 2 * randomness * cellH * 2.5;
        const cx  = Math.max(zl + 10, Math.min(zr - 10, baseX + jx));
        const cy  = Math.max(zt + 10, Math.min(zb - 10, baseY + jy));

        // Per-molecule rotation (only meaningful for non-circles, scales with randomness)
        const molRot = randomness * (rng() * 2 - 1) * Math.PI;

        const nAtoms   = sub.atoms.length;
        const maxMult  = Math.max(...sub.sizeMults);
        const bondDist = atomR * zoom * maxMult * 1.9;
        const mAtoms   = [];

        if (nAtoms === 1) {
          mAtoms.push({ x: cx, y: cy });
        } else {
          for (let ai = 0; ai < nAtoms; ai++) {
            const angle = molRot + (ai / nAtoms) * Math.PI * 2;
            mAtoms.push({ x: cx + bondDist * Math.cos(angle), y: cy + bondDist * Math.sin(angle) });
          }
        }

        // Bounds check
        const inBounds = mAtoms.every((a, ai) => {
          const r2 = atomR * zoom * sub.sizeMults[ai] * 1.3;
          return a.x - r2 > zl && a.x + r2 < zr && a.y - r2 > zt && a.y + r2 < zb;
        });
        if (!inBounds) continue;

        // Overlap check
        const overlaps = mAtoms.some(a => {
          const r2 = atomR * zoom * maxMult * 1.05;
          return placed.some(p => Math.hypot(a.x - p.x, a.y - p.y) < r2 + p.r);
        });
        if (overlaps) continue;

        // Accept
        mAtoms.forEach((a, ai) => {
          const r2 = atomR * zoom * sub.sizeMults[ai];
          placed.push({ x: a.x, y: a.y, r: r2 });
          allPos.push({ x: a.x, y: a.y, subIdx: si, atomIdx: ai,
                        molId: molIdx, cx, cy, rotation: molRot });
        });
        counts[si]++;
      }
    }

    // ── Draw bonds ────────────────────────────────────────────────────────
    const byMol = {};
    allPos.forEach(p => {
      const key = `${p.subIdx}-${p.molId}`;
      (byMol[key] = byMol[key] || []).push(p);
    });
    Object.values(byMol).forEach(atoms => {
      if (atoms.length < 2) return;
      const { cx, cy } = atoms[0];
      atoms.forEach(a => drawBond(a.x, a.y, cx, cy, bondThick, bondLen));
    });

    // ── Draw atoms ────────────────────────────────────────────────────────
    allPos.forEach(p => {
      const sub = substances[p.subIdx];
      const r   = atomR * zoom * sub.sizeMults[p.atomIdx];
      drawShape(p.x, p.y, r, sub.shapes[p.atomIdx], sub.colors[p.atomIdx], p.rotation);
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
                allElements  ? 'ME' : allCompounds ? 'MC' : 'MEC';
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
  bindSliderWithInput('pd-bond-len-range',   'pd-bond-len-num',   draw);
  document.getElementById('pd-transparent').addEventListener('change', () => {
    updateBgClass('pd-checker', isChecked('pd-transparent')); draw();
  });

  const EXAMPLES = {
    element: 'Na', diatomic: 'O2', compound: 'H2O',
    me: 'Na + Ca', mc: 'NaCl + CaCl2', mec: 'Na + NaCl', three: 'H2O + NaCl + CO2',
  };
  function loadExample(k) { document.getElementById('pd-formula').value = EXAMPLES[k]||''; parse(); }

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
