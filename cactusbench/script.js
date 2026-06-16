/* CactusBench task player — vanilla JS, no deps.
 * Loads rollouts.json (real run traces) and autoplays. The autoplay loop rotates
 * through the "featured" subset; the dropdown exposes all rollouts. Each step is
 * a real turn from the model's run: the sheet/photo it pulled up, plus the
 * reasoning it wrote that turn. */

(function () {
    'use strict';

    const STEP_MS = 700;   // per-frame playback speed (slower than LostBench so the reasoning reads)

    // Brand identifiers for benchmark attribution (nominative use).
    const ICONS = {
        claude: '<img src="images/anthropic.png?v=1" alt="" aria-hidden="true">',
        codex:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .52 4.91 6.05 6.05 0 0 0 6.51 2.9 5.98 5.98 0 0 0 4.5 2.01 6.05 6.05 0 0 0 5.78-4.21 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.08 4.79 2.77a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.14-1.65ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.69a.77.77 0 0 0 .39.67l5.81 3.36-2.02 1.17a.08.08 0 0 1-.07 0L4 14.01A4.5 4.5 0 0 1 2.34 7.9Zm16.6 3.85L13.1 8.37l2.02-1.17a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67ZM20.94 8.7l-.14-.08-4.78-2.79a.78.78 0 0 0-.78 0L9.4 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.3 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.39.68Zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.6-1.5Z"/></svg>',
        gemini: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2c.4 5.4 4.2 9.2 9.6 9.6-5.4.4-9.2 4.2-9.6 9.6-.4-5.4-4.2-9.2-9.6-9.6C7.8 11.2 11.6 7.4 12 2Z"/></svg>',
        open:   '',   // open-model field: name only, no mark
    };

    const els = {
        img:        document.getElementById('stage-img'),
        overlay:    document.getElementById('stage-overlay'),
        prev:       document.getElementById('btn-prev'),
        play:       document.getElementById('btn-play'),
        next:       document.getElementById('btn-next'),
        scrubber:   document.getElementById('scrubber'),
        count:      document.getElementById('step-count'),
        select:     document.getElementById('rollout-select'),
        runnerWrap: document.getElementById('runner-badge'),
        runnerIcon: document.getElementById('runner-icon'),
        runnerName: document.getElementById('runner-name'),
        dist:       document.getElementById('dist-chip'),
        spinner:    document.getElementById('stage-spinner'),
        thought:    document.getElementById('stage-thought'),
    };
    if (!els.img) return;   // player not on this page

    function hideSpinner() { if (els.spinner) els.spinner.classList.add('hidden'); }
    els.img.addEventListener('load', hideSpinner, { once: true });

    let rollouts = [];
    let featuredOrder = [];
    let rotIdx = 0, rIdx = 0, sIdx = 0;
    let playing = false, timer = null, userPicked = false;

    fetch('rollouts.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            rollouts = data.rollouts || [];
            if (!rollouts.length) { hideSpinner(); els.overlay.textContent = 'No rollouts found.'; return; }
            featuredOrder = rollouts.map((r, i) => r.featured ? i : -1).filter(i => i >= 0);
            if (!featuredOrder.length) featuredOrder = rollouts.map((_, i) => i);
            rIdx = featuredOrder[0];
            preload(rIdx);
            mountSelect();
            wire();
            render();
            startPlay();
        })
        .catch(err => { console.error(err); hideSpinner(); els.overlay.textContent = 'Could not load rollouts.'; });

    function preload(i) {
        (rollouts[i].steps || []).forEach(s => { const im = new Image(); im.src = 'images/' + s.image; });
    }

    function mountSelect() {
        const groups = {};
        rollouts.forEach((r, i) => { (groups[r.runner] = groups[r.runner] || []).push({ i, r }); });
        const order = ['Claude Opus 4.8', 'GPT-5.5', 'Gemini 3.5 Flash', 'Qwen3-VL-Plus'];
        const ordered = order.filter(k => groups[k]).concat(Object.keys(groups).filter(k => !order.includes(k)));
        els.select.innerHTML = ordered.map(g => {
            const opts = groups[g].map(({ i, r }) =>
                `<option value="${i}">${r.featured ? '★ ' : ''}Saguaro ${r.task_id}</option>`).join('');
            return `<optgroup label="${g}">${opts}</optgroup>`;
        }).join('');
    }

    function tick() {
        const r = rollouts[rIdx];
        if (sIdx >= r.steps.length - 1) {
            if (userPicked && !rollouts[rIdx].featured) {
                userPicked = false; rotIdx = 0; rIdx = featuredOrder[rotIdx];
            } else {
                rotIdx = (rotIdx + 1) % featuredOrder.length; rIdx = featuredOrder[rotIdx];
            }
            sIdx = 0; preload(rIdx);
        } else { sIdx++; }
        render();
    }

    function startPlay() {
        if (playing) return;
        playing = true; els.play.textContent = '❚❚ Pause';
        timer = setInterval(tick, STEP_MS);
    }
    function stop() {
        playing = false; if (timer) { clearInterval(timer); timer = null; }
        els.play.textContent = '▶ Play';
    }

    function wire() {
        els.select.addEventListener('change', e => {
            rIdx = parseInt(e.target.value, 10); sIdx = 0; userPicked = true;
            const k = featuredOrder.indexOf(rIdx);
            if (k >= 0) { rotIdx = k; userPicked = false; }
            preload(rIdx); render();
        });
        els.prev.addEventListener('click', () => { stop(); if (sIdx > 0) { sIdx--; render(); } });
        els.next.addEventListener('click', () => { stop(); const r = rollouts[rIdx]; if (sIdx < r.steps.length - 1) { sIdx++; render(); } });
        els.play.addEventListener('click', () => {
            if (playing) { stop(); return; }
            if (sIdx >= rollouts[rIdx].steps.length - 1) sIdx = 0;
            startPlay();
        });
        els.scrubber.addEventListener('input', e => { stop(); sIdx = parseInt(e.target.value, 10); render(); });
    }

    function render() {
        const r = rollouts[rIdx];
        const step = r.steps[sIdx];
        els.img.src = 'images/' + step.image;
        els.img.alt = `step ${step.n} · ${r.task_id} · ${step.view}`;
        els.overlay.innerHTML =
            `<strong>${escapeHtml(step.view)}</strong> · step ${step.n}` +
            `<br><span style="color:#9a9a9a">${escapeHtml(step.action)}</span>`;
        els.scrubber.max = r.steps.length - 1;
        els.scrubber.value = sIdx;
        els.count.textContent = `${sIdx} / ${r.steps.length - 1}`;
        els.select.value = rIdx;

        // Runner badge
        const slug = r.runner_slug || 'open';
        els.runnerWrap.className = 'runner-badge runner-' + slug;
        const icon = ICONS[slug] || '';
        els.runnerIcon.innerHTML = icon;
        // The inline override sets `.runner-icon { display:block !important }`, so a plain
        // style.display can't hide the empty white chip — use setProperty with priority.
        if (icon) els.runnerIcon.style.removeProperty('display');
        else els.runnerIcon.style.setProperty('display', 'none', 'important');
        els.runnerName.textContent = r.runner;

        const acc = (r.accuracy != null) ? ` · accuracy ${r.accuracy.toFixed(2)}` : '';
        els.dist.textContent = `Saguaro ${r.task_id} · ${r.turns} turns${acc}`;

        // Model "thinking" — the real reasoning the model wrote that turn. Carry the
        // most recent one forward so scrubbing always shows the active reasoning.
        if (els.thought) {
            if (r._hasThoughts === undefined)
                r._hasThoughts = r.steps.some(s => s.thought);
            if (!r._hasThoughts) {
                els.thought.className = 'stage-thought empty';
                els.thought.innerHTML = ''; els.thought._built = false; els.thought._txt = null;
            } else {
                let th = '';
                for (let i = sIdx; i >= 0; i--) { if (r.steps[i].thought) { th = r.steps[i].thought; break; } }
                if (!th) for (let i = 0; i < r.steps.length; i++) { if (r.steps[i].thought) { th = r.steps[i].thought; break; } }
                if (!els.thought._built || !els.thought.querySelector('.txt')) {
                    els.thought.innerHTML = '<span class="txt"></span>';
                    els.thought._built = true; els.thought._txt = null;
                }
                els.thought.className = 'stage-thought';
                if (els.thought._txt !== th) {
                    els.thought.querySelector('.txt').textContent = th;
                    els.thought._txt = th;
                    els.thought.classList.remove('fade');
                    void els.thought.offsetWidth;
                    els.thought.classList.add('fade');
                }
            }
        }
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
})();
