/* Padel Cup — animations.
   Approach borrowed from theperformancelab.ca: Lenis smooth scroll + hand-rolled rAF,
   one easing curve cubic-bezier(.16,1,.3,1), scroll-driven marquee, parallax windows,
   scrubbed text, big labels sliding in from the right. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Safari scrolls on the compositor, so JS-driven parallax visibly lags behind the page there; it keeps native scroll and drops continuous parallax (add ?fx=full to compare)
  var isSafari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  var fxCss = /[?&]fx=css/.test(location.search);
  var lite = (isSafari && !/[?&]fx=full/.test(location.search)) || fxCss;
  // where the browser supports scroll-driven CSS animations (Safari 26+), the parallax runs on the compositor in CSS instead of JS
  var cssPar = lite && !reduce && !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
  if (cssPar) document.documentElement.classList.add('css-par');
  var body = document.body;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeOutExpo = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  var vh = window.innerHeight;
  window.addEventListener('resize', function () { vh = window.innerHeight; build(); });

  /* ---------- text split (words > chars), letter stagger like their `step` prop ---------- */
  $$('[data-split]').forEach(function (el) {
    var text = el.textContent.trim(); el.setAttribute('aria-label', text); el.textContent = '';
    var c = 0;
    text.split(/\s+/).forEach(function (word, wi, arr) {
      var w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
      word.split('').forEach(function (ch) {
        var s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; s.style.setProperty('--c', c++); w.appendChild(s);
      });
      el.appendChild(w); if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('sp'); el.style.setProperty('--step', (c > 28 ? 14 : 24) + 'ms');
  });
  /* final CTA lines get an index for stagger */
  $$('.final .ln').forEach(function (l, i) { l.style.setProperty('--i', i); });

  /* ---------- scrub text: words ---------- */
  var scrub = $('#scrub'), scrubWords = [];
  if (scrub) {
    var t = scrub.textContent.trim(); scrub.textContent = '';
    t.split(/\s+/).forEach(function (w, i, a) {
      var s = document.createElement('span'); s.className = 'w'; s.textContent = w; scrub.appendChild(s); scrubWords.push(s);
      if (i < a.length - 1) scrub.appendChild(document.createTextNode(' '));
    });
  }
  var scrubDark = !!(scrub && scrub.closest('.dark'));
  var lerpC = function (p) { // light section: #B0B0B0 -> #171717, dark section: #5C5C5C -> #F2F2F2
    var a = scrubDark ? 92 : 176, b = scrubDark ? 242 : 23, v = Math.round(a + (b - a) * p); return 'rgb(' + v + ',' + v + ',' + v + ')';
  };

  /* ---------- reveal on enter: checked in the scroll loop (an IntersectionObserver misses fast jumps) ---------- */
  var pending = $$('[data-reveal],.sp,.final .display,.price-card,.win.reveal'), counters = $$('[data-count]');
  function dropHook(el) {
    if (!el.hasAttribute('data-reveal')) return;
    setTimeout(function () { el.removeAttribute('data-reveal'); }, 1300 + (parseInt(el.style.getPropertyValue('--i'), 10) || 0) * 100);
  }
  function runCount(el) {
    var to = parseFloat(el.getAttribute('data-count')), pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = pre + to + suf; return; }
    var t0 = performance.now(), dur = 1700;
    (function tick(now) {
      var p = clamp((now - t0) / dur, 0, 1); el.textContent = pre + Math.round(to * easeOutExpo(p)) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }
  counters.forEach(function (el) { if (!reduce) el.textContent = (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || ''); });
  function checkReveal() {
    if (!pending.length && !counters.length) return;
    var pt = pending.map(function (el) { return rect(el).top; }), ct = counters.map(function (el) { return rect(el).top; });
    pending = pending.filter(function (el, k) {
      if (reduce || pt[k] < vh * 0.9) { el.classList.add('in'); dropHook(el); return false; } return true;
    });
    counters = counters.filter(function (el, k) {
      if (reduce || ct[k] < vh * 0.88) { runCount(el); return false; } return true;
    });
  }

  /* ---------- scroll-driven marquee (their formula: drift 0.5px * dir - 0.6 * scroll delta) ---------- */
  function makeMarquee(track, speed) {
    var group = track.firstElementChild, x = 0, dir = -1, w = 0;
    var measure = function () { w = group.offsetWidth; };
    measure(); window.addEventListener('resize', measure); setTimeout(measure, 600);
    return function (delta) {
      if (delta > 0) dir = -1; else if (delta < 0) dir = 1;
      x += speed * dir; x -= 0.6 * delta;
      if (w > 0) x = ((x % w) + w) % w - w;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
    };
  }
  var mq2 = makeMarquee($('#stripTrack'), 0.8);

  /* ---------- rally background: the ball keeps roughly one screen height and only hops; the trail is drawn behind it ---------- */
  var rallyEl = $('#rally'), rally = null;
  function build() {
    if (!rallyEl) return;
    var hero = $('#hero'), strip = $('.strip'), footer = $('.footer'), main = $('main');
    var top = hero.offsetHeight + strip.offsetHeight, H = footer.offsetTop - top, W = main.clientWidth;
    if (H < 800) return;
    rallyEl.style.top = top + 'px'; rallyEl.style.height = H + 'px';
    var narrow = W < 900, n = Math.max(4, Math.round(H / (narrow ? 1100 : 1250)));
    // each segment has its own character: hop height, how far it travels sideways, and the easing of the sideways move
    var pat = [{ hop: 210, ins: .08, e: 'io' }, { hop: 70, ins: .2, e: 'out' }, { hop: 260, ins: .1, e: 'io' }, { hop: 130, ins: .3, e: 'lin' }, { hop: 180, ins: .14, e: 'in' }, { hop: 50, ins: .24, e: 'io' }];
    var ease = { io: function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }, out: function (t) { return 1 - (1 - t) * (1 - t); }, 'in': function (t) { return t * t; }, lin: function (t) { return t; } };
    var wts = [1, .85, 1.2, .9, 1.1, .8, 1.05, .9, 1.15], wsum = 0, i0;
    for (i0 = 0; i0 < n; i0++) wsum += wts[i0 % wts.length];
    var x = W * 0.92, y = 0, dir = -1, pts = [[x, 0, 0]], cum = [0], bIdx = [], N = 48, total = 0;
    for (var k = 0; k < n; k++) {
      var p = pat[k % pat.length], hop = p.hop * (narrow ? 0.55 : 1), step = H * 0.97 * wts[k % wts.length] / wsum;
      var nx = dir < 0 ? W * p.ins : W - W * p.ins;
      for (var j = 1; j <= N; j++) {
        var t = j / N, px = x + (nx - x) * ease[p.e](t), py = y + step * t - hop * Math.sin(Math.PI * t), last = pts[pts.length - 1];
        total += Math.sqrt((px - last[0]) * (px - last[0]) + (py - last[1]) * (py - last[1])); pts.push([px, py, hop * Math.sin(Math.PI * t)]); cum.push(total);
      }
      bIdx.push(pts.length - 1); x = nx; y += step; dir *= -1;
    }
    var cv = rallyEl.querySelector('canvas');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'rally-cv'; rallyEl.innerHTML = ''; rallyEl.appendChild(cv); }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(vh * dpr); cv.style.width = W + 'px'; cv.style.height = vh + 'px';
    rally = { top: top, H: H, W: W, total: total, pts: pts, cum: cum, bIdx: bIdx, cv: cv, ctx: cv.getContext('2d'), dpr: dpr };
  }
  // one viewport-sized canvas: draws only the visible part of the dotted trail, the bounce rings and the ball, so nothing page-tall is ever repainted
  function updateRally(scroll) {
    if (!rally) return;
    var R = rally; if (R.ls === scroll && R.lv === vh) return; R.ls = scroll; R.lv = vh;
    var c = R.ctx, pts = R.pts, last = pts.length - 1, off = R.top - scroll;
    var wy = clamp(scroll + vh * 0.55 - R.top, 0, pts[last][1]), lo = 0, hi = last;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pts[mid][1] <= wy) lo = mid; else hi = mid; }
    var a0 = pts[lo], b0 = pts[hi], f = b0[1] === a0[1] ? 0 : clamp((wy - a0[1]) / (b0[1] - a0[1]), 0, 1);
    var bx = a0[0] + (b0[0] - a0[0]) * f, by = a0[1] + (b0[1] - a0[1]) * f, len = R.cum[lo] + (R.cum[hi] - R.cum[lo]) * f;
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); c.clearRect(0, 0, R.W, vh);
    var vmin = -off - 60, vmax = -off + vh + 60;
    // trail: a fine dotted line up to the ball, with a barely visible tapered tail behind it
    var s = 0, h2 = lo; while (h2 - s > 1) { var m2 = (s + h2) >> 1; if (pts[m2][1] < vmin) s = m2; else h2 = m2; }
    if (by > vmin) {
      c.beginPath(); c.moveTo(pts[s][0], pts[s][1] + off);
      for (var i = s + 1; i <= lo; i++) { if (pts[i][1] > vmax) break; c.lineTo(pts[i][0], pts[i][1] + off); }
      if (by <= vmax) c.lineTo(bx, by + off);
      c.setLineDash([1, 9]); c.lineDashOffset = -R.cum[s]; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 1.4; c.strokeStyle = 'rgba(23,23,23,.22)'; c.stroke(); c.setLineDash([]);
      var TL = 340, ts = lo; while (ts > s && R.cum[ts] > len - TL) ts--;
      for (var q2 = ts + 1; q2 <= lo + 1; q2++) {
        var p0 = pts[q2 - 1], p1 = q2 <= lo ? pts[q2] : [bx, by], cEnd = q2 <= lo ? R.cum[q2] : len, fr = clamp((cEnd - (len - TL)) / TL, 0, 1);
        if (fr <= 0) continue;
        c.beginPath(); c.moveTo(p0[0], p0[1] + off); c.lineTo(p1[0], p1[1] + off);
        c.lineWidth = 0.5 + 1 * fr; c.strokeStyle = 'rgba(23,23,23,' + (0.1 * fr * fr).toFixed(3) + ')'; c.stroke();
      }
    }
    // bounce: one hairline ring and a centre dot that grow in once the ball has passed
    c.lineWidth = 1;
    for (var k = 0; k < R.bIdx.length; k++) {
      var q = pts[R.bIdx[k]], y = q[1] + off; if (q[1] < vmin - 120 || q[1] > vmax + 120) continue;
      var age = len - R.cum[R.bIdx[k]] + 6, g = easeOutCubic(clamp(age / 260, 0, 1)); if (g <= 0) continue;
      var sc = 0.2 + 0.8 * g;
      c.strokeStyle = 'rgba(23,23,23,' + (0.16 * g).toFixed(3) + ')'; c.beginPath(); c.ellipse(q[0], y, 84 * sc, 22 * sc, 0, 0, 6.2832); c.stroke();
      c.fillStyle = 'rgba(23,23,23,' + (0.26 * g).toFixed(3) + ')'; c.beginPath(); c.arc(q[0], y, 3, 0, 6.2832); c.fill();
    }
    // the ball: plain, translucent graphite
    var bY = by + off, hh = a0[2] + (b0[2] - a0[2]) * f;
    if (bY > -60 && bY < vh + 120) {
      // the ball hops above a floor line: a soft shadow stays on the floor, smaller and fainter the higher the ball is
      var lift = clamp(hh / 240, 0, 1), sw = 22 * (1 - 0.35 * lift);
      c.fillStyle = 'rgba(23,23,23,' + (0.1 * (1 - 0.65 * lift)).toFixed(3) + ')'; c.beginPath(); c.ellipse(bx, bY + hh * 0.7, sw, sw * 0.32, 0, 0, 6.2832); c.fill();
      // on touch-down it flattens a little
      var sq = clamp(1 - hh / 16, 0, 1), rx = 15 * (1 + 0.2 * sq), ry = 15 * (1 - 0.24 * sq);
      c.fillStyle = 'rgba(23,23,23,.16)'; c.beginPath(); c.ellipse(bx, bY + (15 - ry) * 0.6, rx, ry, 0, 0, 6.2832); c.fill();
    }
  }

  /* ---------- per-frame scroll effects ---------- */
  var heroEl = $('#hero'), heroImg = $('.hero-bg img'), header = $('#header'), ring = $('#ring');
  var scrubs = $$('[data-scrub]').map(function (el) { var sib = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.hasAttribute('data-scrub'); }); el._i = el.style.getPropertyValue('--i') !== '' ? parseFloat(el.style.getPropertyValue('--i')) : sib.indexOf(el); el._ty = 0; el._t = -1; el._win = el.getAttribute('data-scrub') === 'media' ? el.querySelector('.win') : null; return el; });
  var wins = $$('[data-speed]'), _w = $$('[data-speed]').forEach(function (w) { w.style.setProperty('--s', w.getAttribute('data-speed')); }), ghosts = $$('[data-ghost]'), steps = $$('[data-step]'), pxImgs = $$('.band-bg img,.final-bg img');
  var pxSecs = pxImgs.map(function (im) { return im.closest('section'); });
  var stepSecs = steps.map(function (s) { return s.getAttribute('data-step') === 'card' ? s.closest('section') : null; });
  var lastScroll = 0, heroH = heroEl.offsetHeight, frame = 0;
  if (cssPar) {
    scrubs.forEach(function (el) { el.style.setProperty('--i', el._i); });
    if (scrub) { scrub.style.setProperty('--n', scrubWords.length + 6); scrubWords.forEach(function (w, i) { w.style.setProperty('--k', i); }); }
  }
  // geometry is read once per frame before any write, and a style is only written when its value changed (cheap in Safari)
  function rect(el) { if (el._f !== frame) { el._r = el.getBoundingClientRect(); el._f = frame; } return el._r; }
  function put(el, prop, v) { var k = '_p' + prop; if (el[k] !== v) { el[k] = v; el.style[prop] = v; } }
  var skew = 0;
  function update(scroll) {
    frame++;
    skew += ((lenis ? clamp(lenis.velocity * 0.05, -2, 2) : 0) - skew) * 0.1;
    wins.forEach(rect); steps.forEach(rect); scrubs.forEach(rect); ghosts.forEach(rect); pxSecs.forEach(rect);
    stepSecs.forEach(function (s) { if (s) rect(s); });
    if (scrub) rect(scrub);
    if (body.classList.contains('ready')) checkReveal();
    var delta = scroll - lastScroll; lastScroll = scroll;
    if (!cssPar) mq2(delta);
    // hero parallax
    if (!lite && scroll < heroH * 1.2) put(heroImg, 'translate', '0 ' + (scroll * 0.22).toFixed(1) + 'px');
    // parallax windows: wrapper moves one way, picture inside the other
    if (!lite) wins.forEach(function (w) {
      var r = rect(w); if (r.bottom < -400 || r.top > vh + 400) return;
      var s = parseFloat(w.getAttribute('data-speed')), d = r.top + r.height / 2 - vh / 2;
      var isCollage = w.classList.contains('c-photo'), img = w.firstElementChild;
      // collage photos float up faster than the page, each at its own speed; the others drift gently
      put(w, 'translate', '0 ' + (isCollage ? d * s : -d * s * 0.4).toFixed(1) + 'px');
      if (img) { var lim = r.height * 0.1; put(img, 'transform', 'translate3d(0,' + clamp(isCollage ? -d * s * 0.12 : d * s * 0.3, -lim, lim).toFixed(1) + 'px,0)' + (isCollage ? ' skewY(' + skew.toFixed(2) + 'deg)' : '')); }
    });
    if (!lite) pxImgs.forEach(function (im, k) {
      var r = rect(pxSecs[k]); if (r.bottom < 0 || r.top > vh) return;
      put(im, 'transform', 'translate3d(0,' + ((r.top + r.height / 2 - vh / 2) * -0.12).toFixed(1) + 'px,0)');
    });
    // scrubbed statement
    if (scrub && !cssPar) {
      var sr0 = rect(scrub), p0 = clamp((vh * 0.85 - sr0.top) / (vh * 0.55 + sr0.height * 0.4), 0, 1), n = scrubWords.length;
      scrubWords.forEach(function (w, i) { var wp = clamp(p0 * (n + 6) - i, 0, 6) / 6; put(w, 'color', lerpC(wp)); });
    }
    // giant labels slide in from the right: translate3d((1-t)*720px), opacity .15 -> 1
    if (!cssPar) ghosts.forEach(function (g) {
      var top = rect(g).top, t = easeOutCubic(clamp((0.92 * vh - top) / (0.62 * vh), 0, 1));
      put(g, 'transform', 'translate3d(' + ((1 - t) * 720).toFixed(1) + 'px,0,0)'); put(g, 'opacity', (0.15 + 0.85 * t).toFixed(3));
    });
    // scroll-driven cards: process steps stack up one by one, "included" cards rise left to right with a slight scale
    if (!cssPar) steps.forEach(function (s, k) {
      var top = rect(s).top;
      if (s.getAttribute('data-step') === 'card') {
        var i = parseFloat(s.style.getPropertyValue('--i')) || 0, sr = rect(stepSecs[k]);
        var span = sr.height - vh, p = span > 40 ? clamp(-sr.top / span, 0, 1) : 1;
        // card i owns its own piece of the pinned scroll: [0.03 + i*0.2, +0.22]
        var t = span > 40 ? easeOutCubic(clamp((p - (0.03 + i * 0.2)) / 0.22, 0, 1)) : 1;
        put(s, 'transform', 'translate3d(0,' + ((1 - t) * 40).toFixed(1) + 'px,0) scale(' + (0.98 + 0.02 * t).toFixed(4) + ')'); put(s, 'opacity', t.toFixed(3));
      } else {
        var t2 = easeOutCubic(clamp((0.95 * vh - top) / (0.3 * vh), 0, 1));
        put(s, 'transform', 'translate3d(0,' + ((1 - t2) * 28).toFixed(1) + 'px,0)'); put(s, 'opacity', t2.toFixed(3));
      }
    });
    // scrubbed reveals: card = lift + scale, row = wipe from the left, media = lift + photo unmasked from the bottom; siblings enter one after another
    if (!cssPar) scrubs.forEach(function (el) {
      var kind = el.getAttribute('data-scrub'), top = rect(el).top - el._ty;
      var t = reduce ? 1 : Math.round(easeOutCubic(clamp((vh * 0.97 - el._i * vh * 0.05 - top) / (vh * 0.3), 0, 1)) * 1000) / 1000, ty = 0, st = el.style;
      if (t === el._t) return; el._t = t;
      if (kind === 'row') { st.clipPath = t >= 1 ? '' : 'inset(0 ' + ((1 - t) * 100).toFixed(2) + '% 0 0)'; st.transform = t >= 1 ? '' : 'translate3d(' + ((1 - t) * -1).toFixed(3) + 'rem,0,0)'; }
      else { ty = (1 - t) * 28; st.transform = t >= 1 ? '' : 'translate3d(0,' + ty.toFixed(1) + 'px,0)' + (kind === 'card' ? ' scale(' + (0.98 + 0.02 * t).toFixed(4) + ')' : ''); }
      st.opacity = kind === 'row' ? 1 : Math.min(1, t * 1.6);
      if (el._win) { var pt = easeOutCubic(clamp((t - 0.15) / 0.85, 0, 1)); el._win.style.clipPath = pt >= 1 ? '' : 'inset(' + ((1 - pt) * 100).toFixed(2) + '% 0 0 0)'; var im = el._win.firstElementChild; if (im) im.style.scale = (1 + 0.25 * (1 - pt)).toFixed(4); }
      el._ty = ty;
    });
    if (ring && !lite) put(ring, 'transform', 'rotate(' + (scroll * 0.25).toFixed(1) + 'deg)');
    updateRally(scroll);
    // header stays pinned; it turns light once the hero is behind it
    var light = scroll > heroH - 70;
    header.classList.toggle('is-light', light); header.classList.toggle('dark', !light);
  }

  /* ---------- Lenis + single rAF loop ---------- */
  var lenis = null;
  if (!reduce && !isSafari && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true });
    (function raf(t) { lenis.raf(t); update(lenis.scroll); requestAnimationFrame(raf); })(performance.now());
  } else {
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return; queued = true;
      requestAnimationFrame(function () { queued = false; update(window.scrollY); });
    }, { passive: true });
    update(window.scrollY);
  }
  var scrollTo = function (target) {
    if (lenis) lenis.scrollTo(target, { offset: -64, duration: 1.5, easing: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); } });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 64, behavior: 'smooth' });
  };
  $$('[data-scroll]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var h = a.getAttribute('href'); if (!h || h.charAt(0) !== '#') return;
      var t = h === '#top' ? document.body : $(h); if (!t) return; e.preventDefault();
      if (h === '#top') { lenis ? lenis.scrollTo(0, { duration: 1.6 }) : window.scrollTo({ top: 0, behavior: 'smooth' }); } else scrollTo(t);
    });
  });

  /* ---------- magnetic buttons ---------- */
  if (!reduce && window.matchMedia('(hover:hover)').matches) {
    $$('.btn-mag').forEach(function (b) {
      b.style.transition = 'background .4s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)';
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.22) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.3) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }


  /* ---------- reviews carousel: translateX 700ms expo (like their featured carousel), autoplay with progress, swipe ---------- */
  (function () {
    var wrap = $('#car'), track = $('#carTrack'), cards = $$('.quote', track), bar = $('#carBar'), count = $('#carCount');
    if (!track) return;
    var idx = 0, timer = null, AUTO = 8000, down = null;
    var per = function () { return window.innerWidth <= 900 ? 1 : 3; };
    var max = function () { return Math.max(0, cards.length - per()); };
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function progress() {
      clearTimeout(timer); bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
      if (reduce) return; void bar.offsetWidth;
      bar.style.transition = 'transform ' + AUTO + 'ms linear'; bar.style.transform = 'scaleX(1)';
      timer = setTimeout(function () { go(idx + 1); }, AUTO);
    }
    function go(i) {
      idx = i > max() ? 0 : (i < 0 ? max() : i);
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      track.style.transform = 'translate3d(' + (-idx * (cards[0].offsetWidth + gap)) + 'px,0,0)';
      count.textContent = pad(idx + 1) + ' / ' + pad(cards.length); progress();
    }
    wrap.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); } });
    wrap.addEventListener('pointerenter', function () { clearTimeout(timer); bar.style.transition = 'none'; });
    wrap.addEventListener('pointerleave', progress);
    wrap.addEventListener('pointerdown', function (e) { down = e.clientX; wrap.classList.add('drag'); });
    window.addEventListener('pointerup', function (e) {
      if (down === null) return; var dx = e.clientX - down; down = null; wrap.classList.remove('drag');
      if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
    });
    wrap.addEventListener('dragstart', function (e) { e.preventDefault(); });
    window.addEventListener('resize', function () { go(Math.min(idx, max())); });
    go(0);
  })();


  /* ---------- league comparison (interactive) ---------- */
  (function () {
    var root = $('#league'); if (!root) return;
    var D = [
      { n: 'Beginner', pairs: 24, rally: 6, prize: 1, spots: 4, fmt: 'One set to 6 games', lv: 1 },
      { n: 'Amateur', pairs: 24, rally: 11, prize: 3, spots: 5, fmt: 'Best of 3 sets', lv: 2 },
      { n: 'Pro', pairs: 16, rally: 18, prize: 6, spots: 3, fmt: 'Best of 3, full sets', lv: 3 }
    ];
    var tabs = $$('.lg-tab', root), cur = { pairs: 24, rally: 6, prize: 1, spots: 4 }, raf = {};
    var el = function (id) { return document.getElementById(id); };
    function tween(key, id, to, fmt) {
      cancelAnimationFrame(raf[key]); var from = cur[key], t0 = performance.now(), node = el(id);
      if (reduce) { cur[key] = to; node.textContent = fmt(to); return; }
      (function step(now) {
        var p = clamp((now - t0) / 700, 0, 1), v = from + (to - from) * easeOutExpo(p);
        node.textContent = fmt(Math.round(v)); cur[key] = v; if (p < 1) raf[key] = requestAnimationFrame(step); else cur[key] = to;
      })(t0);
    }
    function select(i, focus) {
      var d = D[i];
      tabs.forEach(function (t, k) { var on = k === i; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
      if (focus) tabs[i].focus();
      var title = el('lgTitle'); title.textContent = d.n; title.classList.remove('swap'); void title.offsetWidth; title.classList.add('swap');
      el('lgNum').textContent = 'League 0' + (i + 1) + ' / 03';
      $$('#lgLv i').forEach(function (b, k) { b.classList.toggle('on', k < d.lv); });
      tween('pairs', 'lgPairs', d.pairs, function (v) { return v; });
      tween('rally', 'lgRally', d.rally, function (v) { return v + ' shots'; });
      tween('prize', 'lgPrize', d.prize, function (v) { return '$' + v + 'K'; });
      tween('spots', 'lgSpots', d.spots, function (v) { return v; });
      el('lgPairsB').style.setProperty('--v', d.pairs / 24); el('lgRallyB').style.setProperty('--v', d.rally / 20);
      el('lgPrizeB').style.setProperty('--v', d.prize / 6); el('lgSpotsB').style.setProperty('--v', d.spots / 8);
      var f = el('lgFormat'); f.textContent = d.fmt; f.classList.remove('swap'); void f.offsetWidth; f.classList.add('swap');
      el('lgCta').setAttribute('data-level', d.n); el('lgCtaT').textContent = 'Register as ' + d.n;
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % 3, true); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select((i + 2) % 3, true); }
      });
    });
    select(0);
  })();



  /* ---------- round ball that grows over the reviews carousel (the real cursor stays normal) ---------- */
  if (!reduce && window.matchMedia('(hover:hover)').matches) {
    var cur = document.createElement('div'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true'); cur.innerHTML = '<b></b>'; document.body.appendChild(cur);
    var curB = cur.firstChild, cx = 0, cy = 0, tx = 0, ty = 0, curOn = false;
    document.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (t) { curB.textContent = t.getAttribute('data-cursor'); if (!curOn) { curOn = true; cx = tx; cy = ty; cur.classList.add('on'); } }
      else if (curOn) { curOn = false; cur.classList.remove('on'); }
    }, { passive: true });
    document.addEventListener('pointerleave', function () { curOn = false; cur.classList.remove('on'); });
    (function loop() { cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22; cur.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; requestAnimationFrame(loop); })();
  }

  /* ---------- FAQ accordion ---------- */
  var qas = $$('.qa');
  function setOpen(qa, open) {
    var a = $('.a', qa), q = $('.q', qa); qa.classList.toggle('open', open); q.setAttribute('aria-expanded', open);
    a.style.height = open ? a.scrollHeight + 'px' : '0px';
  }
  qas.forEach(function (qa) { setOpen(qa, qa.classList.contains('open')); $('.q', qa).addEventListener('click', function () {
    var o = !qa.classList.contains('open'); qas.forEach(function (x) { if (x !== qa) setOpen(x, false); }); setOpen(qa, o);
  }); });
  window.addEventListener('resize', function () { qas.forEach(function (q) { if (q.classList.contains('open')) $('.a', q).style.height = $('.a', q).scrollHeight + 'px'; }); });

  /* ---------- forms ---------- */
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function fieldErr(input, msg) {
    var f = input.closest('.field'); f.classList.remove('invalid'); void f.offsetWidth;
    if (msg) { f.classList.add('invalid'); $('.err', f).textContent = msg; }
    return !msg;
  }
  $$('input').forEach(function (i) { i.addEventListener('input', function () { i.closest('.field').classList.remove('invalid'); }); });
  var news = $('#newsForm');
  news.addEventListener('submit', function (e) {
    e.preventDefault(); var i = news.elements.email;
    if (!fieldErr(i, emailRe.test(i.value.trim()) ? '' : 'Enter a valid email')) return;
    var b = $('.btn', news); b.classList.add('is-loading');
    setTimeout(function () { b.classList.remove('is-loading'); $('span', b).textContent = 'Subscribed'; i.disabled = true; b.disabled = true; }, 700);
  });

  var popup = $('#popup'), form = $('#regForm'), ok = $('#regOk'), lastFocus = null;
  function openPopup(level) {
    if (level) $$('.lv').forEach(function (x) { var on = x.getAttribute('data-v') === level; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    lastFocus = document.activeElement; popup.classList.add('open'); popup.setAttribute('aria-hidden', 'false'); if (lenis) lenis.stop(); else document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { var n = form.elements.name; if (n) n.focus({ preventScroll: true }); }, 500);
  }
  function closePopup() {
    popup.classList.remove('open'); popup.setAttribute('aria-hidden', 'true'); if (lenis) lenis.start(); else document.documentElement.style.overflow = '';
    setTimeout(function () { form.hidden = false; ok.hidden = true; form.reset(); $$('.field', form).forEach(function (f) { f.classList.remove('invalid'); }); var b = $('.btn[type=submit]', form); b.classList.remove('is-loading'); }, 800);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $$('[data-open-popup]').forEach(function (b) { b.addEventListener('click', function () { openPopup(b.getAttribute('data-level')); }); });
  $$('[data-close]', popup).forEach(function (b) { b.addEventListener('click', closePopup); });
  document.addEventListener('keydown', function (e) {
    if (!popup.classList.contains('open')) return;
    if (e.key === 'Escape') closePopup();
    if (e.key === 'Tab') {
      var f = $$('button,input,[href]', popup).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $$('.lv').forEach(function (l) { l.addEventListener('click', function () {
    $$('.lv').forEach(function (x) { x.classList.toggle('on', x === l); x.setAttribute('aria-checked', x === l); });
  }); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name, contact = form.elements.contact, c = contact.value.trim();
    var digits = c.replace(/\D/g, '');
    var okName = fieldErr(name, name.value.trim().length >= 2 ? '' : 'Enter your name');
    var okContact = fieldErr(contact, (emailRe.test(c) || digits.length >= 7 || /^@[\w]{4,}$/.test(c)) ? '' : 'Enter a valid email or phone');
    if (!okName || !okContact) { (okName ? contact : name).focus(); return; }
    var b = $('.btn[type=submit]', form); b.classList.add('is-loading'); b.disabled = true;
    setTimeout(function () {
      b.disabled = false; form.hidden = true; ok.hidden = false;
      var path = $('#okPath'), L = path.getTotalLength(); path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
      path.getBoundingClientRect(); path.style.transition = 'stroke-dashoffset .8s cubic-bezier(.16,1,.3,1) .15s'; path.style.strokeDashoffset = 0;
    }, 900);
  });

  /* ---------- preloader -> hero intro ---------- */
  function start() {
    body.classList.remove('is-loading'); body.classList.add('ready'); if (lenis) lenis.start();
    setTimeout(function () { var p = $('#preloader'); if (p) p.remove(); }, 1600);
    build(); setTimeout(build, 800);
  }
  if (reduce) { checkReveal(); $('#preloader').remove(); body.classList.remove('is-loading'); body.classList.add('ready'); window.addEventListener('load', build); }
  else {
    if (lenis) lenis.stop();
    var num = $('#preNum'), imgs = $$('img'), loaded = 0, shown = 0, t0 = performance.now(), done = false;
    var tick = function (now) {
      var target = imgs.length ? (loaded / imgs.length) * 100 : 100, min = easeOutCubic(clamp((now - t0) / 1600, 0, 1)) * 100;
      shown = Math.max(shown, Math.min(target, min)); if (now - t0 > 6000) shown = 100;
      num.textContent = String(Math.round(shown)).padStart(3, '0');
      if (shown >= 100 && !done) { done = true; $('#preloader').classList.add('done'); setTimeout(start, 350); return; }
      requestAnimationFrame(tick);
    };
    imgs.forEach(function (im) { if (im.complete) loaded++; else { im.addEventListener('load', function () { loaded++; }); im.addEventListener('error', function () { loaded++; }); } });
    requestAnimationFrame(tick);
    window.addEventListener('load', function () { setTimeout(build, 300); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { heroH = heroEl.offsetHeight; build(); });
})();
