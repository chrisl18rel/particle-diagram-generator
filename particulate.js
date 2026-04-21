// particulate.js

const Particulate = (() => {

  // ── Canvas setup ─────────────────────────────────────────────────────────
  const canvas = document.getElementById('pd-canvas');
  const ctx    = canvas.getContext('2d');
  let beakerImg = null;

  // Beaker interior bounds (relative to 1092×1092 source image)
  // These define where particles can be placed inside the beaker
  const BW = 1092, BH = 1092;
  const BEAKER = { l: 210, r: 882, t: 130, b: 940 };

  loadImageFromDataURI(BEAKER_IMG)
    .then(img => { beakerImg = img; draw(); })
    .catch(err => console.error('Beaker load failed:', err));

  // ── State ─────────────────────────────────────────────────────────────────
  let substances = [];   // [{ formula, atoms, color, shape, count }]

  const SHAPES   = ['circle','square','triangle','diamond','pentagon'];
  const PALETTE  = ['#4a90e2','#e2604a','#4ae28a','#e2c24a','#c44ae2',
                     '#4ae2d8','#e24a8e','#a0e24a','#e2904a','#4a60e2'];
  const SHAPE_LABELS = { circle:'●', square:'■', triangle:'▲', diamond:'◆', pentagon:'⬠' };

  // ── Formula parser ────────────────────────────────────────────────────────
  // Returns array of { symbol, count } atoms from a single formula string
  function parseFormula(f) {
    // Strip state symbols, charges, extras
    f = f.replace(/\(s\)|\(l\)|\(g\)|\(aq\)/gi, '').trim();
    const atoms = [];
    const re = /([A-Z][a-z]?)(\d*)/g;
    let m;
    while ((m = re.exec(f)) !== null) {
      if (m[1]) atoms.push({ symbol: m[1], count: parseInt(m[2] || '1', 10) });
    }
    return atoms;
  }

  // Split input on '+' respecting that formulas don't use +
  function splitSubstances(raw) {
    return raw.split('+').map(s => s.trim()).filter(Boolean);
  }

  // Determine if a formula is an element (all atoms same symbol) or compound
  function isElement(atoms) {
    if (!atoms.length) return false;
    return atoms.every(a => a.symbol === atoms[0].symbol);
  }

  // ── UI: rebuild substance color/shape panels ──────────────────────────────
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
      div.innerHTML = `
        <div class="substance-panel-title">${sub.formula}</div>
        ${sub.atoms.map((atom, ai) => `
          <div class="substance-row">
            <label>${atom.symbol}</label>
            <input type="color" id="pd-color-${i}-${ai}" value="${sub.colors[ai]}" />
            <select id="pd-shape-${i}-${ai}">
              ${SHAPES.map(s => `<option value="${s}"${sub.shapes[ai]===s?' selected':''}>${SHAPE_LABELS[s]} ${s}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      `;
      container.appendChild(div);

      // Bind events
      sub.atoms.forEach((atom, ai) => {
        const colorEl = document.getElementById(`pd-color-${i}-${ai}`);
        const shapeEl = document.getElementById(`pd-shape-${i}-${ai}`);
        colorEl.addEventListener('input', () => { sub.colors[ai] = colorEl.value; draw(); });
        shapeEl.addEventListener('change', () => { sub.shapes[ai] = shapeEl.value; draw(); });
      });
    });
  }

  // ── Parse input and rebuild substance list ────────────────────────────────
  function parse() {
    const raw = strVal('pd-formula', '');
    if (!raw) { showToast('Enter a formula or mixture.', true); return; }

    const parts = splitSubstances(raw);
    if (!parts.length) { showToast('Could not parse input.', true); return; }

    // Preserve color/shape settings for already-known formulas
    const prevMap = {};
    substances.forEach(s => { prevMap[s.formula] = { colors: s.colors, shapes: s.shapes }; });

    let colorIdx = 0;
    substances = parts.map(formula => {
      const atoms = parseFormula(formula);
      if (!atoms.length) return null;
      const prev = prevMap[formula];
      const colors = atoms.map((a, i) => prev ? prev.colors[i] || PALETTE[(colorIdx + i) % PALETTE.length] : PALETTE[(colorIdx + i) % PALETTE.length]);
      const shapes = atoms.map((a, i) => prev ? prev.shapes[i] || SHAPES[i % SHAPES.length] : SHAPES[i % SHAPES.length]);
      colorIdx += atoms.length;
      return { formula, atoms, colors, shapes };
    }).filter(Boolean);

    if (!substances.length) { showToast('No valid formulas found.', true); return; }
    buildPanels();
    draw();
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  function drawShape(x, y, r, shape, color, strokeColor) {
    ctx.fillStyle   = color;
    ctx.strokeStyle = strokeColor || 'rgba(0,0,0,0.35)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'square': {
        const s = r * 1.7;
        ctx.rect(x - s/2, y - s/2, s, s);
        break;
      }
      case 'triangle': {
        const h = r * 1.9;
        ctx.moveTo(x, y - h * 0.6);
        ctx.lineTo(x + h * 0.55, y + h * 0.4);
        ctx.lineTo(x - h * 0.55, y + h * 0.4);
        ctx.closePath();
        break;
      }
      case 'diamond': {
        const d = r * 1.8;
        ctx.moveTo(x, y - d * 0.6);
        ctx.lineTo(x + d * 0.45, y);
        ctx.lineTo(x, y + d * 0.6);
        ctx.lineTo(x - d * 0.45, y);
        ctx.closePath();
        break;
      }
      case 'pentagon': {
        for (let k = 0; k < 5; k++) {
          const angle = (k * 2 * Math.PI / 5) - Math.PI / 2;
          const px = x + r * 1.3 * Math.cos(angle);
          const py = y + r * 1.3 * Math.sin(angle);
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
    }
    ctx.fill();
    ctx.stroke();
  }

  // Draw a bond line between two atom centers
  function drawBond(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(180,180,180,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function draw() {
    const zoom        = numVal('pd-zoom-range', 75) / 100;
    const countPerSub = Math.round(numVal('pd-count-range', 10));
    const atomR       = numVal('pd-size-range', 14);
    const transparent = isChecked('pd-transparent');

    // Canvas dimensions = beaker image scaled
    canvas.width  = Math.round(BW * zoom);
    canvas.height = Math.round(BH * zoom);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!transparent) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Generate particle positions ──────────────────────────────────────
    // Interior bounds scaled
    const il = BEAKER.l * zoom, ir = BEAKER.r * zoom;
    const it = BEAKER.t * zoom, ib = BEAKER.b * zoom;
    const iw = ir - il, ih = ib - it;

    const positions = [];  // { x, y, subIdx, atomIdx, atomsInMolecule }

    if (substances.length) {
      // Attempt placement with simple random + rejection sampling
      const rng = seededRng(42);
      const placed = [];
      const margin = atomR * zoom * 2.2;

      substances.forEach((sub, si) => {
        let attempts = 0;
        let placed_count = 0;
        while (placed_count < countPerSub && attempts < 5000) {
          attempts++;
          // Molecule center
          const cx = il + margin + rng() * (iw - margin * 2);
          const cy = it + margin + rng() * (ih - margin * 2);
          const nAtoms = sub.atoms.length;

          // Build atom positions for this molecule
          const mAtoms = [];
          if (nAtoms === 1) {
            mAtoms.push({ x: cx, y: cy });
          } else {
            // arrange atoms in a small cluster around center
            for (let ai = 0; ai < nAtoms; ai++) {
              const angle = (ai / nAtoms) * Math.PI * 2;
              const dist  = atomR * zoom * 1.6;
              mAtoms.push({ x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) });
            }
          }

          // Check all atoms in bounds + no overlap with existing
          const r2 = atomR * zoom * 1.6;
          const inBounds = mAtoms.every(a =>
            a.x - r2 > il && a.x + r2 < ir &&
            a.y - r2 > it && a.y + r2 < ib
          );
          if (!inBounds) continue;

          const overlaps = mAtoms.some(a =>
            placed.some(p => Math.hypot(a.x - p.x, a.y - p.y) < r2 * 1.4)
          );
          if (overlaps) continue;

          mAtoms.forEach((a, ai) => {
            placed.push(a);
            positions.push({ ...a, subIdx: si, atomIdx: ai, totalAtoms: nAtoms, molId: placed_count, cx, cy });
          });
          placed_count++;
        }
      });
    }

    // ── Draw bonds first (below atoms) ──────────────────────────────────
    // Group by (subIdx, molId)
    const byMol = {};
    positions.forEach(p => {
      const key = `${p.subIdx}-${p.molId}`;
      (byMol[key] = byMol[key] || []).push(p);
    });
    Object.values(byMol).forEach(atoms => {
      if (atoms.length < 2) return;
      // Draw bond from each atom to the center
      const cx = atoms[0].cx, cy = atoms[0].cy;
      atoms.forEach(a => drawBond(a.x, a.y, cx, cy));
    });

    // ── Draw atoms ───────────────────────────────────────────────────────
    positions.forEach(p => {
      const sub = substances[p.subIdx];
      drawShape(p.x, p.y, atomR * zoom, sub.shapes[p.atomIdx], sub.colors[p.atomIdx]);
    });

    // ── Draw beaker image on top ─────────────────────────────────────────
    if (beakerImg) {
      ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);
    }

    // ── Legend ───────────────────────────────────────────────────────────
    buildLegend();
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function buildLegend() {
    const el = document.getElementById('pd-legend');
    el.innerHTML = '';
    if (!substances.length) return;

    substances.forEach(sub => {
      const isElem = isElement(sub.atoms);
      const typeLabel = isElem
        ? (sub.atoms.length > 1 ? 'Diatomic Element' : 'Element')
        : (substances.length > 1 ? 'Compound' : 'Compound');

      // For mixtures show category
      let cat = '';
      if (substances.length > 1) {
        const allElements  = substances.every(s => isElement(s.atoms));
        const allCompounds = substances.every(s => !isElement(s.atoms));
        if (allElements)       cat = 'ME';
        else if (allCompounds) cat = 'MC';
        else                   cat = 'MEC';
      }

      sub.atoms.forEach((atom, ai) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const swatch = document.createElement('div');
        swatch.className = 'legend-swatch';
        swatch.style.background    = sub.colors[ai];
        swatch.style.borderRadius  = sub.shapes[ai] === 'circle' ? '50%' : '3px';
        if (sub.shapes[ai] === 'triangle' || sub.shapes[ai] === 'diamond') {
          swatch.style.borderRadius = '2px';
          swatch.style.transform = 'rotate(45deg)';
        }
        const label = document.createElement('span');
        label.textContent = `${atom.symbol} (in ${sub.formula})` + (cat ? ` — ${cat}` : ` — ${typeLabel}`);
        item.appendChild(swatch);
        item.appendChild(label);
        el.appendChild(item);
      });
    });
  }

  // ── Seeded RNG (Mulberry32) ───────────────────────────────────────────────
  function seededRng(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Bind controls ─────────────────────────────────────────────────────────
  document.getElementById('pd-formula').addEventListener('keydown', e => {
    if (e.key === 'Enter') parse();
  });

  bindSliderWithInput('pd-count-range', 'pd-count-num', draw);
  bindSliderWithInput('pd-size-range',  'pd-size-num',  draw);
  bindSliderWithInput('pd-zoom-range',  'pd-zoom-num',  draw);

  document.getElementById('pd-transparent').addEventListener('change', () => {
    updateBgClass('pd-checker', isChecked('pd-transparent'));
    draw();
  });

  // ── Quick examples ────────────────────────────────────────────────────────
  const EXAMPLES = {
    element:  'Na',
    diatomic: 'O2',
    compound: 'H2O',
    me:       'Na + Ca',
    mc:       'NaCl + CaCl2',
    mec:      'Na + NaCl',
    three:    'H2O + NaCl + CO2',
  };

  function loadExample(key) {
    document.getElementById('pd-formula').value = EXAMPLES[key] || '';
    parse();
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportPNG() {
    draw();
    const link = document.createElement('a');
    link.download = 'particulate_diagram.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clear() {
    document.getElementById('pd-formula').value = '';
    substances = [];
    document.getElementById('pd-substance-panels').innerHTML = '';
    document.getElementById('pd-legend').innerHTML = '';
    canvas.width  = 400;
    canvas.height = 400;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!isChecked('pd-transparent')) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (beakerImg) ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);
  }

  // ── Initial draw ─────────────────────────────────────────────────────────
  draw();

  return { parse, clear, loadExample, exportPNG };
})();
