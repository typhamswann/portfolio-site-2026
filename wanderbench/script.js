/* Wanderbench task player — vanilla JS, no deps.
 * Loads rollouts.json and drives the hero stage. */

(function () {
    'use strict';

    const STEP_MS = 900;

    const els = {
        img:       document.getElementById('stage-img'),
        overlay:   document.getElementById('stage-overlay'),
        prev:      document.getElementById('btn-prev'),
        play:      document.getElementById('btn-play'),
        next:      document.getElementById('btn-next'),
        scrubber:  document.getElementById('scrubber'),
        count:     document.getElementById('step-count'),
        select:    document.getElementById('rollout-select'),
        runner:    document.getElementById('runner-chip'),
        diff:      document.getElementById('diff-chip'),
        dist:      document.getElementById('dist-chip'),
    };

    let rollouts = [];
    let rIdx = 0;
    let sIdx = 0;
    let playing = false;
    let timer = null;

    fetch('rollouts.json')
        .then(r => r.json())
        .then(data => {
            rollouts = data.rollouts || [];
            if (!rollouts.length) {
                els.overlay.textContent = 'No rollouts found.';
                return;
            }
            mountSelect();
            wire();
            render();
        })
        .catch(err => {
            console.error(err);
            els.overlay.textContent = 'Could not load rollouts.';
        });

    function mountSelect() {
        els.select.innerHTML = rollouts.map((r, i) =>
            `<option value="${i}">${r.runner} · ${r.task_id}</option>`
        ).join('');
    }

    function wire() {
        els.select.addEventListener('change', e => {
            rIdx = parseInt(e.target.value, 10);
            sIdx = 0; stop(); render();
        });
        els.prev.addEventListener('click', () => {
            if (sIdx > 0) { sIdx--; stop(); render(); }
        });
        els.next.addEventListener('click', () => {
            const r = rollouts[rIdx];
            if (sIdx < r.steps.length - 1) { sIdx++; stop(); render(); }
        });
        els.play.addEventListener('click', () => {
            const r = rollouts[rIdx];
            if (playing) { stop(); render(); return; }
            if (sIdx >= r.steps.length - 1) sIdx = 0;
            playing = true;
            els.play.textContent = '❚❚ Pause';
            timer = setInterval(() => {
                const r = rollouts[rIdx];
                if (sIdx >= r.steps.length - 1) { stop(); render(); return; }
                sIdx++; render();
            }, STEP_MS);
        });
        els.scrubber.addEventListener('input', e => {
            sIdx = parseInt(e.target.value, 10);
            stop(); render();
        });
    }

    function stop() {
        playing = false;
        if (timer) { clearInterval(timer); timer = null; }
        els.play.textContent = '▶ Play';
    }

    function diffColor(d) {
        const m = { easy: 'var(--c-easy)', medium: 'var(--c-medium)', hard: 'var(--c-hard)' };
        return m[d] || 'var(--muted)';
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

        els.prev.disabled = sIdx === 0;
        els.next.disabled = sIdx >= r.steps.length - 1;

        els.select.value = rIdx;
        els.runner.textContent = r.runner;
        els.runner.style.background = r.label_color || 'var(--muted)';

        els.diff.textContent = r.difficulty;
        els.diff.style.background = diffColor(r.difficulty);
        els.diff.style.color = '#0a0a0a';

        els.dist.textContent = `optimal ${Math.round(r.optimal_distance_m)} m · ${r.optimal_steps} hops`;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
})();
