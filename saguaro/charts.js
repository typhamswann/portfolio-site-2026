// ---------- Dark-themed SVG phenology charts ----------

const SVG = 'http://www.w3.org/2000/svg';

const CLS_COLOR = {
    buds:        '#65d697',
    flowers:     '#c084fc',
    green_fruit: '#facc15',
    red_fruit:   '#f87171',
};
const CLS_LABEL = {
    buds:        'Buds',
    flowers:     'Flowers',
    green_fruit: 'Green fruit',
    red_fruit:   'Red fruit',
};

const YEAR_COLOR = {
    2017: '#3f4a5a',
    2018: '#4a5566',
    2019: '#566072',
    2020: '#626c7f',
    2021: '#6f798c',
    2022: '#f87171',
    2023: '#65d697',
};

// Month tick positions (DOY for first of each month, non-leap year)
const MONTH_TICKS = [
    { doy: 91,  label: 'Apr' },
    { doy: 121, label: 'May' },
    { doy: 152, label: 'Jun' },
    { doy: 182, label: 'Jul' },
];

// DOY to short label
function doyLabel(doy) {
    const base = new Date(Date.UTC(2021, 0, 1));
    base.setUTCDate(base.getUTCDate() + doy - 1);
    return base.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function el(name, attrs = {}, parent = null) {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
}

function linePath(xs, ys) {
    let d = '';
    for (let i = 0; i < xs.length; i++) {
        d += (i === 0 ? 'M' : 'L') + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1);
    }
    return d;
}

// Round up to a clean axis maximum and return [tickValues, max]
function niceTicks(rawMax, n = 4) {
    if (rawMax <= 0) return [[0, 1], 1];
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const candidates = [1, 2, 2.5, 5, 10];
    let step = pow;
    for (const c of candidates) {
        if (rawMax / (c * pow) <= n) { step = c * pow; break; }
    }
    const max = Math.ceil(rawMax / step) * step;
    const ticks = [];
    for (let v = 0; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(2));
    return [ticks, max];
}

function areaPath(xs, ys, baseline) {
    let d = 'M' + xs[0].toFixed(1) + ' ' + baseline.toFixed(1);
    for (let i = 0; i < xs.length; i++) {
        d += 'L' + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1);
    }
    d += 'L' + xs[xs.length - 1].toFixed(1) + ' ' + baseline.toFixed(1) + 'Z';
    return d;
}

// ---------- Chart 1: cascade ----------

function renderCascade(container, data) {
    container.innerHTML = '';
    const W = 1000, H = 420;
    const PAD = { top: 28, right: 100, bottom: 38, left: 18 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'xMidYMid meet',
        class: 'phen-chart',
    }, container);

    const { doy_start, doy_end } = data.meta;
    const span = doy_end - doy_start;
    const xs = data.cascade_avg.buds.map((_, i) =>
        PAD.left + (i / span) * plotW
    );

    // Y scale based on max of all classes
    let yRaw = 0;
    for (const c of ['buds','flowers','green_fruit','red_fruit']) {
        const m = Math.max(...data.cascade_avg[c]);
        if (m > yRaw) yRaw = m;
    }
    const [yTicks, yMax] = niceTicks(yRaw, 4);
    const yScale = v => PAD.top + plotH - (v / yMax) * plotH;

    // Y gridlines
    yTicks.forEach((v, i) => {
        const y = yScale(v);
        el('line', {
            x1: PAD.left, x2: PAD.left + plotW,
            y1: y, y2: y,
            class: 'grid' + (i === 0 ? ' grid-base' : ''),
        }, svg);
        if (v > 0) {
            el('text', {
                x: PAD.left + 4, y: y - 4,
                class: 'axis-label',
            }, svg).textContent = v;
        }
    });

    // X axis month ticks
    MONTH_TICKS.forEach(t => {
        const x = PAD.left + ((t.doy - doy_start) / span) * plotW;
        el('line', {
            x1: x, x2: x,
            y1: PAD.top, y2: PAD.top + plotH,
            class: 'grid grid-vert',
        }, svg);
        el('text', {
            x: x, y: PAD.top + plotH + 22,
            class: 'axis-label axis-month',
        }, svg).textContent = t.label;
    });

    // Series — areas first (back to front so labels readable: large first), then lines
    const order = ['buds','green_fruit','flowers','red_fruit'];
    for (const cls of order) {
        const ys = data.cascade_avg[cls].map(v => yScale(v));
        el('path', {
            d: areaPath(xs, ys, yScale(0)),
            fill: CLS_COLOR[cls],
            'fill-opacity': 0.10,
        }, svg);
        el('path', {
            d: linePath(xs, ys),
            stroke: CLS_COLOR[cls],
            'stroke-width': 2.2,
            fill: 'none',
            'stroke-linejoin': 'round',
        }, svg);
    }

    // Inline labels at peaks
    const peakLabelOffsets = {
        buds:        { dx: 0, dy: -14 },
        flowers:     { dx: 0, dy: -14 },
        green_fruit: { dx: 0, dy: -14 },
        red_fruit:   { dx: 0, dy: -14 },
    };
    for (const cls of ['buds','flowers','green_fruit','red_fruit']) {
        const peakDoy = data.peaks[cls];
        const i = peakDoy - doy_start;
        const peakVal = data.cascade_avg[cls][i];
        const px = xs[i];
        const py = yScale(peakVal);
        // dot
        el('circle', {
            cx: px, cy: py, r: 3,
            fill: CLS_COLOR[cls],
        }, svg);
        // label
        const off = peakLabelOffsets[cls];
        const t = el('text', {
            x: px + off.dx, y: py + off.dy,
            class: 'series-label',
            fill: CLS_COLOR[cls],
            'text-anchor': 'middle',
        }, svg);
        t.textContent = `${CLS_LABEL[cls]} · peaks ${doyLabel(peakDoy)}`;
    }
}

// ---------- Chart 2: drought vs bumper ----------

function renderDrought(container, data) {
    container.innerHTML = '';
    const W = 1000, H = 420;
    const PAD = { top: 36, right: 30, bottom: 38, left: 40 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'xMidYMid meet',
        class: 'phen-chart',
    }, container);

    const { doy_start, doy_end } = data.meta;
    const span = doy_end - doy_start;

    // Sum the 4 classes for each series we want
    function totalSeries(obj) {
        const n = obj.buds.length;
        const out = new Array(n).fill(0);
        for (const c of ['buds','flowers','green_fruit','red_fruit']) {
            for (let i = 0; i < n; i++) out[i] += obj[c][i];
        }
        return out;
    }

    const avgT = totalSeries(data.pre_2022_avg);
    const t22  = totalSeries(data.by_year['2022']);
    const t23  = totalSeries(data.by_year['2023']);

    const [yTicks, yMax] = niceTicks(Math.max(...avgT, ...t22, ...t23), 5);
    const yScale = v => PAD.top + plotH - (v / yMax) * plotH;
    const xs = avgT.map((_, i) => PAD.left + (i / span) * plotW);

    // Gridlines
    yTicks.forEach((v, i) => {
        const y = yScale(v);
        el('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y, y2: y,
                     class: 'grid' + (i === 0 ? ' grid-base' : '') }, svg);
        if (v > 0) {
            el('text', { x: PAD.left - 6, y: y + 3,
                         class: 'axis-label', 'text-anchor': 'end' }, svg).textContent = v;
        }
    });

    MONTH_TICKS.forEach(t => {
        const x = PAD.left + ((t.doy - doy_start) / span) * plotW;
        el('line', { x1: x, x2: x, y1: PAD.top, y2: PAD.top + plotH,
                     class: 'grid grid-vert' }, svg);
        el('text', { x: x, y: PAD.top + plotH + 22,
                     class: 'axis-label axis-month' }, svg).textContent = t.label;
    });

    // 2017-2021 average band
    const avgYs = avgT.map(yScale);
    el('path', {
        d: areaPath(xs, avgYs, yScale(0)),
        fill: '#3a4150', 'fill-opacity': 0.45,
    }, svg);
    el('path', {
        d: linePath(xs, avgYs),
        stroke: '#7a8499', 'stroke-width': 1.4, fill: 'none',
    }, svg);

    // 2022 line
    const ys22 = t22.map(yScale);
    el('path', {
        d: linePath(xs, ys22),
        stroke: YEAR_COLOR[2022], 'stroke-width': 2.6, fill: 'none',
        'stroke-linejoin': 'round',
    }, svg);

    // 2023 line
    const ys23 = t23.map(yScale);
    el('path', {
        d: linePath(xs, ys23),
        stroke: YEAR_COLOR[2023], 'stroke-width': 2.6, fill: 'none',
        'stroke-linejoin': 'round',
    }, svg);

    // Inline peak labels
    const peak23Idx = t23.indexOf(Math.max(...t23));
    const peak22Idx = t22.indexOf(Math.max(...t22));
    const peakAvgIdx = avgT.indexOf(Math.max(...avgT));

    // 2023 — above its peak, with multiplier
    const multi = (t23[peak23Idx] / avgT[peak23Idx]).toFixed(1);
    const g23 = el('g', {}, svg);
    el('circle', { cx: xs[peak23Idx], cy: ys23[peak23Idx], r: 3.5, fill: YEAR_COLOR[2023] }, g23);
    el('text', { x: xs[peak23Idx], y: ys23[peak23Idx] - 30,
                 class: 'series-label', fill: YEAR_COLOR[2023],
                 'text-anchor': 'middle' }, g23).textContent = '2023 · bumper year';
    el('text', { x: xs[peak23Idx], y: ys23[peak23Idx] - 14,
                 class: 'annotation', 'text-anchor': 'middle' }, g23).textContent =
        `${multi}× the 2017–21 peak`;

    // 2017-21 avg — label inside its band, near peak
    el('text', { x: xs[peakAvgIdx], y: avgYs[peakAvgIdx] - 8,
                 class: 'series-label', fill: '#9aa3b5',
                 'text-anchor': 'middle' }, svg).textContent = '2017–2021 average';

    // 2022 — below its peak
    el('circle', { cx: xs[peak22Idx], cy: ys22[peak22Idx], r: 3.5, fill: YEAR_COLOR[2022] }, svg);
    el('text', { x: xs[peak22Idx], y: ys22[peak22Idx] + 22,
                 class: 'series-label', fill: YEAR_COLOR[2022],
                 'text-anchor': 'middle' }, svg).textContent = '2022 · drought year';
    const drop = Math.round(100 * (1 - t22[peakAvgIdx] / avgT[peakAvgIdx]));
    el('text', { x: xs[peak22Idx], y: ys22[peak22Idx] + 38,
                 class: 'annotation', 'text-anchor': 'middle' }, svg).textContent =
        `${drop}% below the 2017–21 peak`;
}

// ---------- Chart 3: year-over-year small multiples ----------

function renderGrid(container, data) {
    container.innerHTML = '';
    const W = 1000, H = 520;
    const cellPad = { top: 38, right: 12, bottom: 36, left: 38 };
    const gap = { x: 32, y: 30 };

    const svg = el('svg', {
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'xMidYMid meet',
        class: 'phen-chart',
    }, container);

    const cellW = (W - gap.x) / 2;
    const cellH = (H - gap.y) / 2;
    const plotW = cellW - cellPad.left - cellPad.right;
    const plotH = cellH - cellPad.top - cellPad.bottom;

    const { doy_start, doy_end, years } = data.meta;
    const span = doy_end - doy_start;

    const positions = [
        { cls: 'buds',        col: 0, row: 0 },
        { cls: 'flowers',     col: 1, row: 0 },
        { cls: 'green_fruit', col: 0, row: 1 },
        { cls: 'red_fruit',   col: 1, row: 1 },
    ];

    for (const pos of positions) {
        const x0 = pos.col * (cellW + gap.x);
        const y0 = pos.row * (cellH + gap.y);
        const plotX0 = x0 + cellPad.left;
        const plotY0 = y0 + cellPad.top;

        // Find max across years for this class
        let yRaw = 0;
        for (const y of years) {
            const s = data.by_year[String(y)][pos.cls];
            const m = Math.max(...s);
            if (m > yRaw) yRaw = m;
        }
        const [_, yMax] = niceTicks(yRaw, 4);
        const yScale = v => plotY0 + plotH - (v / yMax) * plotH;
        const xs = data.by_year[String(years[0])][pos.cls].map((_, i) =>
            plotX0 + (i / span) * plotW
        );

        // Title
        el('text', {
            x: plotX0, y: y0 + 22,
            class: 'panel-title',
            fill: CLS_COLOR[pos.cls],
        }, svg).textContent = CLS_LABEL[pos.cls];

        // y-max label (top right of panel)
        el('text', {
            x: plotX0 - 6, y: yScale(yMax) + 3,
            class: 'axis-label', 'text-anchor': 'end',
        }, svg).textContent = yMax;
        el('text', {
            x: plotX0 - 6, y: yScale(0) + 3,
            class: 'axis-label', 'text-anchor': 'end',
        }, svg).textContent = '0';

        // baseline + vertical month grid
        el('line', { x1: plotX0, x2: plotX0 + plotW,
                     y1: yScale(0), y2: yScale(0),
                     class: 'grid grid-base' }, svg);
        MONTH_TICKS.forEach(t => {
            const x = plotX0 + ((t.doy - doy_start) / span) * plotW;
            el('line', { x1: x, x2: x, y1: plotY0, y2: yScale(0),
                         class: 'grid grid-vert' }, svg);
            el('text', { x: x, y: yScale(0) + 18,
                         class: 'axis-label axis-month' }, svg).textContent = t.label;
        });

        // Draw non-highlighted years first
        const sorted = years.slice().sort((a, b) => {
            const aHl = (a === 2022 || a === 2023) ? 1 : 0;
            const bHl = (b === 2022 || b === 2023) ? 1 : 0;
            return aHl - bHl;
        });
        for (const y of sorted) {
            const ys = data.by_year[String(y)][pos.cls].map(yScale);
            const isHl = (y === 2022 || y === 2023);
            el('path', {
                d: linePath(xs, ys),
                stroke: YEAR_COLOR[y],
                'stroke-width': isHl ? 2.4 : 1.2,
                'stroke-opacity': isHl ? 1 : 0.5,
                fill: 'none',
                'stroke-linejoin': 'round',
            }, svg);
        }

        // Inline labels for 2022 & 2023 at their peaks
        for (const y of [2022, 2023]) {
            const s = data.by_year[String(y)][pos.cls];
            const peakI = s.indexOf(Math.max(...s));
            const peakX = xs[peakI];
            const peakY = yScale(s[peakI]);
            const dy = (y === 2023) ? -8 : 16;
            el('text', {
                x: peakX, y: peakY + dy,
                class: 'series-label-sm',
                fill: YEAR_COLOR[y],
                'text-anchor': peakX > plotX0 + plotW - 40 ? 'end' : 'middle',
            }, svg).textContent = String(y);
        }
    }
}

// ---------- Boot ----------

(async function initCharts() {
    const res = await fetch('phenology.json');
    const data = await res.json();
    const c1 = document.querySelector('#chart-cascade .chart-canvas');
    const c2 = document.querySelector('#chart-drought .chart-canvas');
    const c3 = document.querySelector('#chart-grid .chart-canvas');
    if (c1) renderCascade(c1, data);
    if (c2) renderDrought(c2, data);
    if (c3) renderGrid(c3, data);
})();
