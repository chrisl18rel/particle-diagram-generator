// particulate.js

const Particulate = (() => {

  // ── Canvas setup ─────────────────────────────────────────────────────────
  const canvas = document.getElementById('pd-canvas');
  const ctx    = canvas.getContext('2d');
  let beakerImg = null;

  // Actual image size: 1254 × 1254
  // Interior bounds measured from pixel analysis:
  //   left wall inner edge  ≈ 365
  //   right wall inner edge ≈ 912
  //   top of open interior  ≈ 205
  //   bottom of interior    ≈ 935
  const BW = 1254, BH = 1254;
  const BEAKER = { l: 365, r: 912, t: 205, b: 935 };

  loadImageFromDataURI(BEAKER_IMG)
    .then(img => { beakerImg = img; draw(); })
    .catch(err => console.error('Beaker load failed:', err));

  // ── State ─────────────────────────────────────────────────────────────────
  let substances = [];

  const SHAPES       = ['circle','square','triangle','diamond','pentagon'];
  const PALETTE      = ['#4a90e2','#e2604a','#4ae28a','#e2c24a','#c44ae2',
                        '#4ae2d8','#e24a8e','#a0e24a','#e2904a','#4a60e2'];
  const SHAPE_LABELS = { circle:'●', square:'■', triangle:'▲', diamond:'◆', pentagon:'⬠' };

  // ── Formula parser ────────────────────────────────────────────────────────
  function parseFormula(f) {
    f = f.replace(/\(s\)|\(l\)|\(g\)|\(aq\)/gi, '').trim();
    const atoms = [];
    const re = /([A-Z][a-z]?)(\d*)/g;
    let m;
    while ((m = re.exec(f)) !== null) {
      if (m[1]) atoms.push({ symbol: m[1], count: parseInt(m[2] || '1', 10) });
    }
    return atoms;
  }

  function splitSubstances(raw) {
    return raw.split('+').map(s => s.trim()).filter(Boolean);
  }

  function isElement(atoms) {
    return atoms.length > 0 && atoms.every(a => a.symbol === atoms[0].symbol);
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

      sub.atoms.forEach((atom, ai) => {
        const colorEl = document.getElementById(`pd-color-${i}-${ai}`);
        const shapeEl = document.getElementById(`pd-shape-${i}-${ai}`);
        colorEl.addEventListener('input', () => { sub.colors[ai] = colorEl.value; draw(); });
        shapeEl.addEventListener('change', () => { sub.shapes[ai] = shapeEl.value; draw(); });
      });
    });
  }

  // ── Parse input ───────────────────────────────────────────────────────────
  function parse() {
    const raw = strVal('pd-formula', '');
    if (!raw) { showToast('Enter a formula or mixture.', true); return; }

    const parts = splitSubstances(raw);
    if (!parts.length) { showToast('Could not parse input.', true); return; }

    const prevMap = {};
    substances.forEach(s => { prevMap[s.formula] = { colors: s.colors, shapes: s.shapes }; });

    let colorIdx = 0;
    substances = parts.map(formula => {
      const atoms = parseFormula(formula);
      if (!atoms.length) return null;
      const prev   = prevMap[formula];
      const colors = atoms.map((a, i) => prev?.colors[i] || PALETTE[(colorIdx + i) % PALETTE.length]);
      const shapes = atoms.map((a, i) => prev?.shapes[i] || SHAPES[i % SHAPES.length]);
      colorIdx += atoms.length;
      return { formula, atoms, colors, shapes };
    }).filter(Boolean);

    if (!substances.length) { showToast('No valid formulas found.', true); return; }
    buildPanels();
    draw();
  }

  // ── Shape drawing ─────────────────────────────────────────────────────────
  function drawShape(x, y, r, shape, color) {
    ctx.fillStyle   = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = Math.max(0.8, r * 0.1);
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
          ctx.lineTo
            ? null : void 0;
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

  function drawBond(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160,160,160,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  function draw() {
    const zoom        = numVal('pd-zoom-range', 75) / 100;
    const countPerSub = Math.round(numVal('pd-count-range', 10));
    const atomR       = numVal('pd-size-range', 14);
    const transparent = isChecked('pd-transparent');

    canvas.width  = Math.round(BW * zoom);
    canvas.height = Math.round(BH * zoom);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const il = BEAKER.l * zoom, ir = BEAKER.r * zoom;
    const it = BEAKER.t * zoom, ib = BEAKER.b * zoom;
    const iw = ir - il, ih = ib - it;

    // ── Step 1: White background outside beaker (non-transparent mode) ────
    if (!transparent) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Step 2: Fill beaker interior white, then draw particles inside ────
    ctx.save();
    // Clip to beaker interior
    ctx.beginPath();
    ctx.rect(il, it, iw, ih);
    ctx.clip();

    ctx.fillStyle = '#fff';
    ctx.fillRect(il, it, iw, ih);

    // Generate particle positions
    const positions = [];
    if (substances.length) {
      const rng    = seededRng(42);
      const placed = [];
      const margin = atomR * zoom * 2.5;

      substances.forEach((sub, si) => {
        let attempts = 0, placed_count = 0;
        while (placed_count < countPerSub && attempts < 8000) {
          attempts++;
          const cx = il + margin + rng() * (iw - margin * 2);
          const cy = it + margin + rng() * (ih - margin * 2);
          const nAtoms = sub.atoms.length;
          const mAtoms = [];

          if (nAtoms === 1) {
            mAtoms.push({ x: cx, y: cy });
          } else {
            for (let ai = 0; ai < nAtoms; ai++) {
              const angle = (ai / nAtoms) * Math.PI * 2;
              const dist  = atomR * zoom * 1.7;
              mAtoms.push({ x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) });
            }
          }

          const r2 = atomR * zoom * 1.8;
          const inBounds = mAtoms.every(a =>
            a.x - r2 > il && a.x + r2 < ir &&
            a.y - r2 > it && a.y + r2 < ib
          );
          if (!inBounds) continue;

          const overlaps = mAtoms.some(a =>
            placed.some(p => Math.hypot(a.x - p.x, a.y - p.y) < r2 * 1.3)
          );
          if (overlaps) continue;

          mAtoms.forEach((a, ai) => {
            placed.push(a);
            positions.push({ ...a, subIdx: si, atomIdx: ai, molId: placed_count, cx, cy });
          });
          placed_count++;
        }
      });
    }

    // Draw bonds
    const byMol = {};
    positions.forEach(p => {
      const key = `${p.subIdx}-${p.molId}`;
      (byMol[key] = byMol[key] || []).push(p);
    });
    Object.values(byMol).forEach(atoms => {
      if (atoms.length < 2) return;
      const { cx, cy } = atoms[0];
      atoms.forEach(a => drawBond(a.x, a.y, cx, cy));
    });

    positions.forEach(p => {
      const sub = substances[p.subIdx];
      drawShape(p.x, p.y, atomR * zoom, sub.shapes[p.atomIdx], sub.colors[p.atomIdx]);
    });

    ctx.restore(); // remove interior clip

    // ── Step 3: Draw beaker glass on top of particles ─────────────────────
    if (beakerImg) {
      ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);
    }

    // ── Step 4: If transparent, erase exterior white ──────────────────────
    if (transparent && beakerImg) {
      eraseExterior(zoom);
    }

    buildLegend();
  }

  // Erase pixels outside the beaker outline using destination-in with a mask
  function eraseExterior(zoom) {
    // Build mask on offscreen canvas: white = keep, transparent = erase
    const tmp = document.createElement('canvas');
    tmp.width  = canvas.width;
    tmp.height = canvas.height;
    const tc = tmp.getContext('2d');

    // Outer beaker silhouette (from pixel analysis: outer walls ≈ 254–976, rows 138–1098)
    const ol = 248 * zoom, or_ = 982 * zoom;
    const ot = 134 * zoom, ob  = 1104 * zoom;
    const cw = canvas.width, ch = canvas.height;

    tc.fillStyle = '#fff';
    tc.beginPath();
    // Spout notch at top-left (the pour spout)
    const spoutL = ol, spoutT = ot;
    const spoutW = (or_ - ol) * 0.22;
    const rimT   = ot + 60 * zoom;
    // Outer shape: start at top-left of rim
    tc.moveTo(ol + spoutW, spoutT);                          // spout left
    tc.quadraticCurveTo(ol + spoutW * 0.4, spoutT, ol, rimT); // spout curve
    tc.lineTo(ol - 5 * zoom, ob - 90 * zoom);               // left side
    tc.quadraticCurveTo(ol, ob + 5 * zoom, (ol + or_) / 2, ob + 5 * zoom); // bottom arc
    tc.quadraticCurveTo(or_, ob + 5 * zoom, or_ + 5 * zoom, ob - 90 * zoom); // right bottom
    tc.lineTo(or_ + 5 * zoom, rimT);                         // right side
    tc.quadraticCurveTo(or_, spoutT, ol + spoutW, spoutT);  // right rim
    tc.closePath();
    tc.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function buildLegend() {
    const el = document.getElementById('pd-legend');
    el.innerHTML = '';
    if (!substances.length) return;

    const allElements  = substances.every(s => isElement(s.atoms));
    const allCompounds = substances.every(s => !isElement(s.atoms));
    const cat = substances.length === 1 ? '' :
                allElements  ? 'ME' :
                allCompounds ? 'MC' : 'MEC';

    substances.forEach(sub => {
      const typeLabel = isElement(sub.atoms)
        ? (sub.atoms.length > 1 ? 'Diatomic Element' : 'Element')
        : 'Compound';

      sub.atoms.forEach((atom, ai) => {
        const item   = document.createElement('div');
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

  // ── Seeded RNG (Mulberry32) ───────────────────────────────────────────────
  function seededRng(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Event bindings ────────────────────────────────────────────────────────
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

  function exportPNG() {
    draw();
    const link = document.createElement('a');
    link.download = 'particulate_diagram.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
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
