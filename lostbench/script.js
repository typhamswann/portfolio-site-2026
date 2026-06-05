/* LostBench task player — vanilla JS, no deps.
 * Loads rollouts.json and autoplays. The autoplay loop rotates through the
 * "featured" subset; the dropdown exposes all rollouts. */

(function () {
    'use strict';

    const STEP_MS = 850;   // per-frame playback speed

    const ICONS = {
        claude: '<svg viewBox="0 0 32 32" aria-hidden="true">' +
                '<path d="M16 3l3.4 9.4L29 16l-9.6 3.6L16 29l-3.4-9.4L3 16l9.6-3.6z"/></svg>',
        codex:  '<svg viewBox="0 0 32 32" aria-hidden="true">' +
                '<path d="M16 2l1.6 5.7 5.7 1.6-5.7 1.6L16 16l-1.6-5.1-5.7-1.6 5.7-1.6z"/>' +
                '<path d="M27 9l-1.2 4.1L21.7 14.3l4.1 1.2L27 19.6l1.2-4.1 4.1-1.2-4.1-1.2z" transform="translate(-4 0)"/>' +
                '<path d="M9 17l1.6 5.7 5.7 1.6-5.7 1.6L9 32l-1.6-7.1-5.7-1.6 5.7-1.6z" transform="translate(2 -3)"/></svg>',
        human:  '<svg viewBox="0 0 32 32" aria-hidden="true">' +
                '<circle cx="16" cy="11" r="4.5" fill="currentColor"/>' +
                '<path d="M6 28c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
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
        runnerTask: document.getElementById('runner-task'),
        diff:       document.getElementById('diff-chip'),
        dist:       document.getElementById('dist-chip'),
    };

    let rollouts = [];
    let featuredOrder = [];   // indices into `rollouts`, in rotation order
    let rotIdx = 0;           // pointer into featuredOrder when autoplaying
    let rIdx = 0;             // current rollout index (into `rollouts`)
    let sIdx = 0;             // current step index
    let playing = false;
    let timer = null;
    let userPicked = false;   // true if user manually picked from dropdown

    fetch('rollouts.json')
        .then(r => r.json())
        .then(data => {
            rollouts = data.rollouts || [];
            if (!rollouts.length) { els.overlay.textContent = 'No rollouts found.'; return; }
            featuredOrder = rollouts
                .map((r, i) => r.featured ? i : -1)
                .filter(i => i >= 0);
            if (!featuredOrder.length) featuredOrder = rollouts.map((_, i) => i);
            rIdx = featuredOrder[0];
            preload(rIdx);
            mountSelect();
            wire();
            render();
            startPlay();
        })
        .catch(err => { console.error(err); els.overlay.textContent = 'Could not load rollouts.'; });

    function preload(i) {
        (rollouts[i].steps || []).forEach(s => { const im = new Image(); im.src = 'images/' + s.image; });
    }

    function mountSelect() {
        const groups = {};
        rollouts.forEach((r, i) => {
            const g = r.runner;
            (groups[g] = groups[g] || []).push({i, r});
        });
        const order = ['Human', 'Claude Opus 4.8', 'GPT-5.5'];
        const ordered = order.filter(k => groups[k]).concat(
            Object.keys(groups).filter(k => !order.includes(k))
        );
        els.select.innerHTML = ordered.map(g => {
            const opts = groups[g].map(({i, r}) => {
                const mark = r.featured ? '★ ' : '';
                return `<option value="${i}">${mark}${r.task_id} · ${r.difficulty}</option>`;
            }).join('');
            return `<optgroup label="${g}">${opts}</optgroup>`;
        }).join('');
    }

    function tick() {
        const r = rollouts[rIdx];
        if (sIdx >= r.steps.length - 1) {
            // finished — advance to the next featured rollout (or just to next
            // if the user manually picked a non-featured one)
            if (userPicked && !rollouts[rIdx].featured) {
                userPicked = false;
                rotIdx = 0;
                rIdx = featuredOrder[rotIdx];
            } else {
                rotIdx = (rotIdx + 1) % featuredOrder.length;
                rIdx = featuredOrder[rotIdx];
            }
            sIdx = 0;
            preload(rIdx);
        } else {
            sIdx++;
        }
        render();
    }

    function startPlay() {
        if (playing) return;
        playing = true;
        els.play.textContent = '❚❚ Pause';
        timer = setInterval(tick, STEP_MS);
    }

    function stop() {
        playing = false;
        if (timer) { clearInterval(timer); timer = null; }
        els.play.textContent = '▶ Play';
    }

    function wire() {
        els.select.addEventListener('change', e => {
            rIdx = parseInt(e.target.value, 10);
            sIdx = 0;
            userPicked = true;
            // align rotation so when this finishes we move on cleanly
            const k = featuredOrder.indexOf(rIdx);
            if (k >= 0) { rotIdx = k; userPicked = false; }
            preload(rIdx);
            render();
        });
        els.prev.addEventListener('click', () => { stop(); if (sIdx > 0) { sIdx--; render(); } });
        els.next.addEventListener('click', () => {
            stop();
            const r = rollouts[rIdx];
            if (sIdx < r.steps.length - 1) { sIdx++; render(); }
        });
        els.play.addEventListener('click', () => {
            if (playing) { stop(); return; }
            if (sIdx >= rollouts[rIdx].steps.length - 1) sIdx = 0;
            startPlay();
        });
        els.scrubber.addEventListener('input', e => { stop(); sIdx = parseInt(e.target.value, 10); render(); });
    }

    function diffColor(d) {
        return ({ easy: 'var(--c-easy)', medium: 'var(--c-medium)', hard: 'var(--c-hard)' })[d] || 'var(--muted)';
    }

    function render() {
        const r = rollouts[rIdx];
        const step = r.steps[sIdx];
        els.img.src = 'images/' + step.image;
        els.img.alt = `step ${step.n} viewport for ${r.task_id}`;
        els.overlay.innerHTML =
            `<strong>${step.view.toUpperCase()}</strong> · step ${step.n} · ` +
            `<span style="color:#bbb">dist→goal ${step.dist_to_goal_m} m</span><br>` +
            `<span style="color:#9a9a9a">${escapeHtml(step.action)}</span>`;
        els.scrubber.max = r.steps.length - 1;
        els.scrubber.value = sIdx;
        els.count.textContent = `${sIdx} / ${r.steps.length - 1}`;
        els.select.value = rIdx;

        // Prominent runner badge
        const slug = r.runner_slug || (r.runner.toLowerCase().includes('claude') ? 'claude'
                                       : r.runner.toLowerCase().includes('gpt') || r.runner.toLowerCase().includes('codex') ? 'codex'
                                       : 'human');
        els.runnerWrap.className = 'runner-badge runner-' + slug;
        els.runnerIcon.innerHTML = ICONS[slug] || '';
        els.runnerName.textContent = r.runner;
        els.runnerTask.textContent = r.task_id + ' · ' + r.difficulty;

        els.diff.textContent = r.difficulty;
        els.diff.style.background = diffColor(r.difficulty);
        els.diff.style.color = '#0a0a0a';
        const ppLabel = (r.path_progress != null) ? ` · pp ${r.path_progress.toFixed(2)}` : '';
        els.dist.textContent = `optimal ${Math.round(r.optimal_distance_m)} m · ${r.optimal_steps} hops${ppLabel}`;
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
})();
