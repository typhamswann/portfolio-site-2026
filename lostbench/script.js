/* LostBench task player — vanilla JS, no deps.
 * Loads rollouts.json and autoplays. The autoplay loop rotates through the
 * "featured" subset; the dropdown exposes all rollouts. */

(function () {
    'use strict';

    const STEP_MS = 450;   // per-frame playback speed (LLM rollouts run long, so move quick)

    // Brand identifiers for benchmark attribution (nominative use).
    // Claude: four-petal cross asterisk approximating Anthropic's mark.
    // OpenAI: hexafoil blossom.
    // Human: solid silhouette.
    const ICONS = {
        claude: '<img src="images/anthropic_chip.png?v=3" alt="" aria-hidden="true">',
        codex:  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .52 4.91 6.05 6.05 0 0 0 6.51 2.9 5.98 5.98 0 0 0 4.5 2.01 6.05 6.05 0 0 0 5.78-4.21 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.08 4.79 2.77a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.14-1.65ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.69a.77.77 0 0 0 .39.67l5.81 3.36-2.02 1.17a.08.08 0 0 1-.07 0L4 14.01A4.5 4.5 0 0 1 2.34 7.9Zm16.6 3.85L13.1 8.37l2.02-1.17a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67ZM20.94 8.7l-.14-.08-4.78-2.79a.78.78 0 0 0-.78 0L9.4 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.3 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.39.68Zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.6-1.5Z"/></svg>',
        human:  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
                '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.5 0-8 2.4-8 5.6V21h16v-1.4c0-3.2-3.5-5.6-8-5.6Z"/></svg>',
        // Gemini: the four-point "spark" with concave (petalled) sides.
        gemini: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
                '<path d="M12 2c.4 5.4 4.2 9.2 9.6 9.6-5.4.4-9.2 4.2-9.6 9.6-.4-5.4-4.2-9.2-9.6-9.6C7.8 11.2 11.6 7.4 12 2Z"/></svg>',
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

    // Hide the loading spinner once the first frame has actually painted.
    function hideSpinner() { if (els.spinner) els.spinner.classList.add('hidden'); }
    if (els.img) els.img.addEventListener('load', hideSpinner, { once: true });

    let rollouts = [];
    let featuredOrder = [];   // indices into `rollouts`, in rotation order
    let rotIdx = 0;           // pointer into featuredOrder when autoplaying
    let rIdx = 0;             // current rollout index (into `rollouts`)
    let sIdx = 0;             // current step index
    let playing = false;
    let timer = null;
    let userPicked = false;   // true if user manually picked from dropdown

    fetch('rollouts.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            rollouts = data.rollouts || [];
            if (!rollouts.length) { hideSpinner(); els.overlay.textContent = 'No rollouts found.'; return; }
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
        .catch(err => { console.error(err); hideSpinner(); els.overlay.textContent = 'Could not load rollouts.'; });

    function preload(i) {
        (rollouts[i].steps || []).forEach(s => { const im = new Image(); im.src = 'images/' + s.image; });
    }

    function mountSelect() {
        const groups = {};
        rollouts.forEach((r, i) => {
            const g = r.runner;
            (groups[g] = groups[g] || []).push({i, r});
        });
        const order = ['Claude Opus 4.8', 'GPT-5.5', 'Gemini 3.5 Flash'];
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

        // Model "thinking" — recovered from the run transcript, shown as an
        // ambient in-frame caption (the model name already rides in the badge).
        // Not every run has it (e.g. Gemini's wasn't recorded), so hide the
        // caption when absent. Thoughts attach to the steps where the model
        // reasoned; carry the most recent one forward so scrubbing always shows
        // the active reasoning. We mutate only the text node when it actually
        // changes — rebuilding innerHTML every frame would restart the pulse and
        // re-fire the fade on every 450ms tick.
        if (els.thought) {
            if (r._hasThoughts === undefined)
                r._hasThoughts = r.steps.some(function (s) { return s.thought; });
            if (!r._hasThoughts) {
                els.thought.className = 'stage-thought empty';
                els.thought.innerHTML = '';
                els.thought._txt = null;
            } else {
                let th = '';
                for (let i = sIdx; i >= 0; i--) { if (r.steps[i].thought) { th = r.steps[i].thought; break; } }
                if (!th) for (let i = 0; i < r.steps.length; i++) { if (r.steps[i].thought) { th = r.steps[i].thought; break; } }
                if (!els.thought._built) {
                    els.thought.innerHTML = '<span class="txt"></span>';
                    els.thought._built = true;
                    els.thought._txt = null;
                }
                els.thought.className = 'stage-thought';
                if (els.thought._txt !== th) {
                    els.thought.querySelector('.txt').textContent = th;
                    els.thought._txt = th;
                    // retrigger the cross-fade only on a genuine change
                    els.thought.classList.remove('fade');
                    void els.thought.offsetWidth;
                    els.thought.classList.add('fade');
                }
            }
        }

        // Runner badge on the frame
        const slug = r.runner_slug || (r.runner.toLowerCase().includes('claude') ? 'claude'
                                       : r.runner.toLowerCase().includes('gemini') ? 'gemini'
                                       : r.runner.toLowerCase().includes('gpt') || r.runner.toLowerCase().includes('codex') ? 'codex'
                                       : 'human');
        els.runnerWrap.className = 'runner-badge runner-' + slug;
        els.runnerIcon.innerHTML = ICONS[slug] || '';
        els.runnerName.textContent = r.runner;

        const ppLabel = (r.path_progress != null) ? ` · pp ${r.path_progress.toFixed(2)}` : '';
        els.dist.textContent = `optimal ${Math.round(r.optimal_distance_m)} m · ${r.optimal_steps} hops${ppLabel}`;
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
})();
