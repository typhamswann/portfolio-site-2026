// ---------- HERO: animated bounding-box reveal ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

const HERO_ORDER = ['hero-2', 'hero-3', 'hero-4'];
const BOX_INTERVAL = 180;       // ms between successive boxes within an image
const HOLD_AFTER_BOXES = 2200;  // ms to hold once all boxes are visible
const FADE_OUT = 450;           // ms fade between images
const INITIAL_PAUSE = 450;      // ms saguaro reads before boxes appear

const CLASS_LABEL = {
    bud: 'bud',
    flower: 'flower',
    green_fruit: 'green fruit',
    red_fruit: 'red fruit',
};

const CLASS_COLOR = {
    bud: '#65d697',
    flower: '#c084fc',
    green_fruit: '#facc15',
    red_fruit: '#f87171',
};

// Approx character width factor for the chip label (in viewBox px at font-size 22)
const CHAR_W = 11.2;
const LABEL_FONT = 22;
const LABEL_PAD_X = 7;
const LABEL_PAD_Y = 3;
const LABEL_H = LABEL_FONT + LABEL_PAD_Y * 2;

let ANNOTATIONS = null;

async function loadAnnotations() {
    const res = await fetch('images/annotations.json');
    ANNOTATIONS = await res.json();
}

function buildDetection(svg, b, ann, { animated = true, showLabel = true } = {}) {
    const x = b.x * ann.w;
    const y = b.y * ann.h;
    const w = b.w * ann.w;
    const h = b.h * ann.h;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', animated ? 'detection' : 'detection static');

    // Box
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('class', 'bbox');
    rect.dataset.cls = b.cls;
    g.appendChild(rect);

    if (showLabel) {
        const text = CLASS_LABEL[b.cls] || b.cls;
        const labelW = text.length * CHAR_W + LABEL_PAD_X * 2;

        let lx = x;
        if (lx + labelW > ann.w) lx = ann.w - labelW;
        if (lx < 0) lx = 0;

        let ly = y - LABEL_H;
        if (ly < 0) ly = y + h;
        if (ly + LABEL_H > ann.h) ly = Math.max(0, ann.h - LABEL_H);

        const chipBg = document.createElementNS(SVG_NS, 'rect');
        chipBg.setAttribute('x', lx);
        chipBg.setAttribute('y', ly);
        chipBg.setAttribute('width', labelW);
        chipBg.setAttribute('height', LABEL_H);
        chipBg.setAttribute('class', 'bbox-chip');
        chipBg.dataset.cls = b.cls;
        g.appendChild(chipBg);

        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', lx + LABEL_PAD_X);
        txt.setAttribute('y', ly + LABEL_H - LABEL_PAD_Y - 2);
        txt.setAttribute('class', 'bbox-text');
        txt.textContent = text;
        g.appendChild(txt);
    }

    svg.appendChild(g);
    return g;
}

function createBoxElements(svg, ann, opts = {}) {
    svg.setAttribute('viewBox', `0 0 ${ann.w} ${ann.h}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return ann.boxes.map(b => buildDetection(svg, b, ann, opts));
}

async function runHeroLoop() {
    const img = document.getElementById('stage-img');
    const svg = document.getElementById('stage-svg');

    let idx = 0;
    while (true) {
        const key = HERO_ORDER[idx % HERO_ORDER.length];
        const ann = ANNOTATIONS[key];

        // Fade BOTH the image and the existing boxes out together, so we never
        // leave colored boxes floating on a black background.
        img.style.opacity = 0;
        svg.style.opacity = 0;
        await wait(FADE_OUT);

        // Swap image + clear overlay while invisible
        img.src = `images/${key}.jpg`;
        await imageLoaded(img);
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        // Fade the empty frame back in
        img.style.opacity = 1;
        svg.style.opacity = 1;
        await wait(INITIAL_PAUSE);

        // Build detection groups paused, then reveal one at a time
        svg.setAttribute('viewBox', `0 0 ${ann.w} ${ann.h}`);
        const groups = ann.boxes.map(b => {
            const g = buildDetection(svg, b, ann, { animated: true, showLabel: true });
            g.style.animationPlayState = 'paused';
            return g;
        });

        for (let i = 0; i < groups.length; i++) {
            groups[i].style.animationPlayState = 'running';
            await wait(BOX_INTERVAL);
        }

        await wait(HOLD_AFTER_BOXES);
        idx++;
    }
}

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function imageLoaded(img) {
    return new Promise(resolve => {
        if (img.complete && img.naturalWidth > 0) resolve();
        else img.addEventListener('load', () => resolve(), { once: true });
    });
}

// ---------- GALLERY: static box overlays ----------

function renderGallery() {
    document.querySelectorAll('.gallery-card').forEach(card => {
        const key = card.dataset.key;
        const ann = ANNOTATIONS[key];
        if (!ann) return;
        const img = card.querySelector('img');
        img.src = `images/${key}.jpg`;
        const svg = card.querySelector('svg');
        createBoxElements(svg, ann, { animated: false, showLabel: false });
    });
}

// ---------- BOOT ----------

(async function init() {
    await loadAnnotations();
    renderGallery();
    runHeroLoop();
})();
