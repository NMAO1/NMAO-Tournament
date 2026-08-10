/* NMAO Badge Frames — runtime.
   Applies a badge's frame_spec to a DOM element. Framework-agnostic.
   Usage:
     <div id="frame"><div class="bf__inner"><video ...></video></div></div>
     applyFrame(document.getElementById('frame'), spec)   // spec from badge-frames.json
   Exposes an ES module API and a window.BadgeFrames global. */

export const BORDER_ACCENT = {
  'solid-bronze': '#b98a4a', 'solid-silver': '#c9ced5', 'solid-amber': '#e0851e',
  'solid-jade': '#3ec87a', gold: '#e6b93f', platinum: '#f1c64c', spectrum: '#a32bf7',
  gemstone: '#bfe0ff', flame: '#ff7a1e', ripple: '#3e86e0', electric: '#1f7bff', enso: '#3ec87a',
};

export function accentFor(spec) {
  if (spec.particle && spec.particle.color) return spec.particle.color;
  return BORDER_ACCENT[spec.border] || '#c9ced5';
}

function particleLayer(spec) {
  const p = spec.particle;
  if (!p || !p.count) return null;
  const layer = document.createElement('div');
  layer.className = 'bf__particles';
  for (let i = 0; i < p.count; i++) {
    const s = document.createElement('span');
    s.className = 'bf__p bf__p--' + p.kind;
    const L = 6 + Math.random() * 88;
    if (p.kind === 'sparkle') {
      s.style.width = s.style.height = '4px';
      s.style.left = L + '%';
      s.style.top = (10 + Math.random() * 72) + '%';
      s.style.background = p.color;
      s.style.boxShadow = '0 0 6px ' + p.color;
      s.style.animationDuration = (1.3 + Math.random() * 1.4) + 's';
      s.style.animationDelay = (-Math.random() * 2) + 's';
    } else {
      s.style.width = s.style.height = '5px';
      s.style.left = L + '%';
      s.style.bottom = '-8px';
      s.style.background = p.color;
      if (p.kind === 'ember') s.style.boxShadow = '0 0 6px ' + p.color;
      s.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      s.style.animationDelay = (-Math.random() * 2.5) + 's';
    }
    layer.appendChild(s);
  }
  return layer;
}

/* Signature motifs (flagship-only). First-pass stylized overlays — tasteful and light.
   Each returns an HTML string placed in a full-size .bf__motif layer. */
const G = '#e6b93f', P = '#f2f4f7';
export const MOTIFS = {
  'gem-shine': () => '<div class="bf-shine"></div>',
  'season-gem-shine': () => '<div class="bf-shine"></div>',
  signature: () => '<div class="bf-shine"></div>',
  laurel: () =>
    `<svg style="position:absolute;left:4%;bottom:2%;width:26%;height:40%" viewBox="0 0 40 60" fill="none" stroke="${G}" stroke-width="2" stroke-linecap="round">
       <path d="M30 58 Q14 46 16 26 Q18 12 30 4"/>
       <g stroke-width="1.6">${leaf(18,44)}${leaf(16,34)}${leaf(17,24)}${leaf(21,14)}</g></svg>
     <svg style="position:absolute;right:4%;bottom:2%;width:26%;height:40%;transform:scaleX(-1)" viewBox="0 0 40 60" fill="none" stroke="${G}" stroke-width="2" stroke-linecap="round">
       <path d="M30 58 Q14 46 16 26 Q18 12 30 4"/>
       <g stroke-width="1.6">${leaf(18,44)}${leaf(16,34)}${leaf(17,24)}${leaf(21,14)}</g></svg>`,
  crown: () =>
    `<svg style="position:absolute;left:50%;top:3%;width:22%;height:16%;transform:translateX(-50%)" viewBox="0 0 60 34">
       <path d="M6 30 L10 10 L22 22 L30 6 L38 22 L50 10 L54 30 Z" fill="${G}" stroke="#7a5a10"/>
       <circle cx="30" cy="6" r="3" fill="#ff3b47"/></svg>
     <div class="bf-shine"></div>`,
  'dragon-coil': (a) =>
    `<svg style="position:absolute;left:0;top:0;width:100%;height:46%" viewBox="0 0 100 30" fill="none" preserveAspectRatio="none">
       <path d="M4 24 C22 6 34 26 50 14 C66 2 78 24 96 8" stroke="${G}" stroke-width="3" stroke-linecap="round" opacity=".9"/>
       <path d="M4 24 C22 6 34 26 50 14 C66 2 78 24 96 8" stroke="${a}" stroke-width="1" stroke-dasharray="2 6" opacity=".8"/></svg>
     <div class="bf-shine"></div>`,
  'torch-flame': () =>
    `<svg style="position:absolute;left:50%;top:2%;width:16%;height:26%;transform:translateX(-50%);animation:bf-tw 1.4s ease-in-out infinite" viewBox="0 0 30 46">
       <path d="M15 2 C22 12 22 20 17 28 C24 24 22 12 15 2 Z" fill="#ff9e2a"/>
       <path d="M15 8 C19 16 19 22 15 30 C11 22 11 16 15 8 Z" fill="#ffe07a"/></svg>`,
  'enso-radiant': () =>
    `<svg style="position:absolute;left:50%;top:50%;width:60%;height:80%;transform:translate(-50%,-50%);animation:bf-spin 14s linear infinite" viewBox="0 0 100 100">
       <circle cx="50" cy="50" r="42" fill="none" stroke="${G}" stroke-width="4" stroke-linecap="round" stroke-dasharray="200 60" opacity=".7"/></svg>`,
  'twin-rings': () =>
    `<svg style="position:absolute;right:5%;bottom:4%;width:24%;height:24%" viewBox="0 0 60 40" fill="none" stroke="${G}" stroke-width="3">
       <circle cx="22" cy="20" r="14"/><circle cx="38" cy="20" r="14"/></svg>`,
  'wax-seal': () =>
    `<svg style="position:absolute;left:6%;bottom:5%;width:20%;height:20%" viewBox="0 0 40 40">
       <circle cx="20" cy="20" r="16" fill="#8c1d2a" stroke="${G}" stroke-width="2"/>
       <path d="M20 11 L23 18 L30 18 L24 23 L26 30 L20 26 L14 30 L16 23 L10 18 L17 18 Z" fill="#e0b0b6"/></svg>`,
  'star-ribbon': () =>
    `<svg style="position:absolute;left:50%;top:4%;width:20%;height:26%;transform:translateX(-50%)" viewBox="0 0 40 52">
       <path d="M20 2 L24 14 L37 14 L26 22 L30 34 L20 26 L10 34 L14 22 L3 14 L16 14 Z" fill="${G}" stroke="#7a5a10"/>
       <path d="M14 30 L10 50 L20 44 L30 50 L26 30 Z" fill="#c21326"/></svg>`,
  'crowned-blade': () =>
    `<svg style="position:absolute;left:50%;top:4%;width:16%;height:70%;transform:translateX(-50%)" viewBox="0 0 24 80">
       <path d="M12 8 L16 20 L12 74 L8 20 Z" fill="${P}" stroke="#9aa0a8"/>
       <rect x="6" y="20" width="12" height="4" fill="${G}"/>
       <path d="M4 8 L8 2 L12 7 L16 2 L20 8 Z" fill="${G}"/></svg>`,
  'ten-stars': () => {
    let s = '';
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(ang) * 44, y = 50 + Math.sin(ang) * 44;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${G}"/>`;
    }
    return `<svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 100 100">${s}</svg>`;
  },
  'clash-lightning': (a) =>
    `<svg style="position:absolute;left:50%;top:6%;width:14%;height:60%;transform:translateX(-50%);animation:bf-tw .5s steps(2) infinite" viewBox="0 0 20 60">
       <path d="M11 2 L5 26 L12 28 L7 58" fill="none" stroke="${a}" stroke-width="3"/></svg>`,
};
function leaf(x, y) { return `<path d="M${x} ${y} q-6 -3 -8 -8" />`; }

export function motifHTML(name, accent) {
  const fn = MOTIFS[name];
  return fn ? fn(accent) : '';
}

/* Apply a frame_spec to a .bf element (which should contain a .bf__inner with the media). */
export function applyFrame(el, spec) {
  if (!el || !spec) return;
  el.classList.add('bf');
  [...el.classList].forEach((c) => { if (/^bf--/.test(c)) el.classList.remove(c); });
  el.classList.add('bf--b-' + spec.border, 'bf--g-' + spec.glow, 'bf--a-' + spec.anim, 'bf--tier-' + spec.tier);
  const accent = accentFor(spec);
  el.style.setProperty('--bf-accent', accent);
  el.querySelectorAll(':scope > .bf__particles, :scope > .bf__motif').forEach((n) => n.remove());
  const pl = particleLayer(spec);
  if (pl) el.appendChild(pl);
  if (spec.motif) {
    const m = document.createElement('div');
    m.className = 'bf__motif';
    m.innerHTML = motifHTML(spec.motif, accent);
    el.appendChild(m);
  }
}

/* Convenience: build the full frame DOM around a media element. */
export function createFrame(mediaEl, spec) {
  const frame = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'bf__inner';
  inner.appendChild(mediaEl);
  frame.appendChild(inner);
  applyFrame(frame, spec);
  return frame;
}

if (typeof window !== 'undefined') {
  window.BadgeFrames = { applyFrame, createFrame, accentFor, motifHTML, MOTIFS, BORDER_ACCENT };
}
