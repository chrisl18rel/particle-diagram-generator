// particulate.js

const Particulate = (() => {

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.getElementById('pd-canvas');
  const ctx    = canvas.getContext('2d');
  let beakerImg = null;

  // Image is 1254×1254 with flood-fill transparent exterior.
  // Interior particle zone (measured from pixel analysis):
  //   left  ≈ 340   right ≈ 935
  //   top   ≈ 250   bottom ≈ 940
  const BW = 1254, BH = 1254;
  const ZONE = { l: 340, r: 935, t: 260, b: 935 };

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
    const re    = /([A-Z][a-z]?)(\d*)/g;
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

  // ── UI: substance color/shape panels ─────────────────────────────────────
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

      let rowsHTML = sub.atoms.map((atom, ai) => `
        <div class="substance-row">
          <label>${atom.symbol}</label>
          <button class="color-swatch-btn" id="pd-sw-${i}-${ai}" style="background:${sub.colors[ai]};width:22px;height:22px;" title="Change color"></button>
          <select id="pd-shape-${i}-${ai}">
            ${SHAPES.map(s => `<option value="${s}"${sub.shapes[ai]===s?' selected':''}>${SHAPE_LABELS[s]} ${s}</option>`).join('')}
          </select>
        </div>
      `).join('');

      div.innerHTML = `<div class="substance-panel-title">${sub.formula}</div>${rowsHTML}`;
      container.appendChild(div);

      sub.atoms.forEach((atom, ai) => {
        const swBtn  = document.getElementById(`pd-sw-${i}-${ai}`);
        const shapeEl = document.getElementById(`pd-shape-${i}-${ai}`);

        swBtn.addEventListener('click', e => {
          e.stopPropagation();
          openColorPicker(swBtn, sub.colors[ai], col => {
            sub.colors[ai] = col;
            swBtn.style.background = col;
            draw();
          });
        });
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
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = Math.max(1, r * 0.12);
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
        ctx.moveTo(x,          y - h * 0.65);
        ctx.lineTo(x + h * 0.58, y + h * 0.38);
        ctx.lineTo(x - h * 0.58, y + h * 0.38);
        ctx.closePath();
        break;
      }
      case 'diamond': {
        const d = r * 1.8;
        ctx.moveTo(x,           y - d * 0.62);
        ctx.lineTo(x + d * 0.45, y);
        ctx.lineTo(x,           y + d * 0.62);
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

  function drawBond(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,140,140,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  // Draw order:
  //   1. White (or transparent) canvas background
  //   2. Beaker image FIRST (as the base layer)
  //   3. Particles drawn ON TOP of the beaker, constrained to the interior zone
  function draw() {
    const zoom        = numVal('pd-zoom-range', 45) / 100;
    const countPerSub = Math.round(numVal('pd-count-range', 10));
    const atomR       = numVal('pd-size-range', 14);
    const transparent = isChecked('pd-transparent');

    canvas.width  = Math.round(BW * zoom);
    canvas.height = Math.round(BH * zoom);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Step 1: background
    if (!transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Step 2: beaker image FIRST — drawn as the base layer
    if (beakerImg) {
      ctx.drawImage(beakerImg, 0, 0, canvas.width, canvas.height);
    }

    // Scaled interior zone
    const zl = ZONE.l * zoom, zr = ZONE.r * zoom;
    const zt = ZONE.t * zoom, zb = ZONE.b * zoom;
    const zw = zr - zl, zh = zb - zt;

    // Step 3: generate + draw particles ON TOP of the beaker
    if (substances.length) {
      const rng    = seededRng(42);
      const placed = [];
      const margin = atomR * zoom * 2.8;
      const positions = [];

      substances.forEach((sub, si) => {
        let attempts = 0, placed_count = 0;
        while (placed_count < countPerSub && attempts < 10000) {
          attempts++;
          const cx = zl + margin + rng() * (zw - margin * 2);
          const cy = zt + margin + rng() * (zh - margin * 2);
          const nAtoms = sub.atoms.length;
          const mAtoms = [];

          if (nAtoms === 1) {
            mAtoms.push({ x: cx, y: cy });
          } else {
            for (let ai = 0; ai < nAtoms; ai++) {
              const angle = (ai / nAtoms) * Math.PI * 2;
              const dist  = atomR * zoom * 1.8;
              mAtoms.push({ x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) });
            }
          }

          const r2 = atomR * zoom * 1.9;
          const inBounds = mAtoms.every(a =>
            a.x - r2 > zl && a.x + r2 < zr &&
            a.y - r2 > zt && a.y + r2 < zb
          );
          if (!inBounds) continue;

          const overlaps = mAtoms.some(a =>
            placed.some(p => Math.hypot(a.x - p.x, a.y - p.y) < r2 * 1.25)
          );
          if (overlaps) continue;

          mAtoms.forEach((a, ai) => {
            placed.push(a);
            positions.push({ ...a, subIdx: si, atomIdx: ai, molId: placed_count, cx, cy });
          });
          placed_count++;
        }
      });

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

      // Draw atoms on top of the beaker
      positions.forEach(p => {
        const sub = substances[p.subIdx];
        drawShape(p.x, p.y, atomR * zoom, sub.shapes[p.atomIdx], sub.colors[p.atomIdx]);
      });
    }

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
