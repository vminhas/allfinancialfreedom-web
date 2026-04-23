#!/usr/bin/env node
// Renders the animated logo end-card to public/brand/animated-logo.mp4
// Pipeline: generate per-frame SVG -> rasterize via resvg -> ffmpeg to MP4.

import { Resvg } from '@resvg/resvg-js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_MP4 = join(REPO_ROOT, 'public', 'brand', 'animated-logo.mp4');
const TMP_DIR = join(__dirname, '.frames');

const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 3.5;
const TOTAL_FRAMES = Math.round(FPS * DURATION);

// Beat timing (in seconds)
const T_FLY_END = 1.2;
const T_PERCH_END = 1.8;
const T_SPREAD_END = 2.5;
const T_TEXT_END = 3.2;

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------- Eagle silhouette ----------
// Designed in a local coordinate system centered on the eagle's body center.
// Body + head + tail are the "core" (always visible).
// Left / right wings are separate paths so they can rotate around their shoulder.
const EAGLE_CORE = `
  <!-- tail feathers -->
  <path d="M -22 48 L -6 52 L -14 92 L -4 86 L 0 96 L 4 86 L 14 92 L 6 52 L 22 48 L 12 44 L -12 44 Z"
        fill="#ffffff"/>
  <!-- body -->
  <path d="M 0 -28
           C -14 -26, -18 -10, -16 8
           C -16 28, -10 44, 0 50
           C 10 44, 16 28, 16 8
           C 18 -10, 14 -26, 0 -28 Z"
        fill="#ffffff"/>
  <!-- neck + head -->
  <path d="M -10 -26
           C -12 -40, -6 -52, 2 -56
           C 12 -58, 18 -52, 18 -46
           L 30 -44
           L 32 -42
           L 20 -40
           C 18 -36, 14 -34, 8 -32
           C 2 -30, -6 -28, -10 -26 Z"
        fill="#ffffff"/>
  <!-- eye notch (tiny dark spot - optional, keeps silhouette cleaner without) -->
`;

// A wing, drawn as the viewer's LEFT wing (negative x from center).
// Shoulder pivot is at about (-10, -18). The tip reaches far to the left
// and slightly up; primary "finger" feathers splay along the trailing edge.
const WING_LEFT = `
  <path d="M -10 -18
           C -60 -42, -140 -40, -210 -18
           C -236 -10, -248 0, -250 10
           L -232 8
           L -220 26
           L -210 12
           L -192 30
           L -182 14
           L -160 32
           L -150 16
           L -126 32
           L -116 18
           L -92 30
           L -84 20
           L -58 28
           L -50 22
           C -34 22, -20 16, -8 6
           C -6 -2, -8 -12, -10 -18 Z"
        fill="#ffffff"/>
`;

// Viewer's RIGHT wing — mirror of left around x=0.
const WING_RIGHT = `
  <path d="M 10 -18
           C 60 -42, 140 -40, 210 -18
           C 236 -10, 248 0, 250 10
           L 232 8
           L 220 26
           L 210 12
           L 192 30
           L 182 14
           L 160 32
           L 150 16
           L 126 32
           L 116 18
           L 92 30
           L 84 20
           L 58 28
           L 50 22
           C 34 22, 20 16, 8 6
           C 6 -2, 8 -12, 10 -18 Z"
        fill="#ffffff"/>
`;

// Shoulder pivots (in local eagle coords)
const LEFT_SHOULDER = { x: -10, y: -18 };
const RIGHT_SHOULDER = { x: 10, y: -18 };

// ---------- Per-frame state ----------
function frameState(t) {
  // t: seconds into animation, 0..DURATION
  // Returns { eagle: {cx, cy, scale, rotDeg}, wings: {leftRot, rightRot, scale},
  //          text: {alpha, underlineScale}, glow: 0..1 }

  const state = {
    eagle: { cx: W / 2, cy: H * 0.42, scale: 1, rotDeg: 0 },
    wings: { leftRot: 0, rightRot: 0, scale: 1 },
    text: { alpha: 0, underlineScale: 0, shimmer: 0 },
    glow: 0,
  };

  if (t < T_FLY_END) {
    // Fly-in: from upper-left, arcing toward center, wings flapping.
    const k = clamp(t / T_FLY_END); // 0..1
    const ke = easeInOutCubic(k);
    // Position: arc from far upper-left to perch point.
    const startX = -W * 0.15, startY = H * 0.08;
    const endX = W / 2, endY = H * 0.42;
    // Quadratic Bezier-ish arc with a peak
    const ctrlX = W * 0.35, ctrlY = H * 0.15;
    const oneMinus = 1 - ke;
    state.eagle.cx =
      oneMinus * oneMinus * startX + 2 * oneMinus * ke * ctrlX + ke * ke * endX;
    state.eagle.cy =
      oneMinus * oneMinus * startY + 2 * oneMinus * ke * ctrlY + ke * ke * endY;
    // Scale grows as it "approaches camera"
    state.eagle.scale = lerp(0.35, 1.0, ke);
    // Subtle banking rotation along the path
    state.eagle.rotDeg = lerp(-12, 0, ke);
    // Wing flap — rotate each wing around shoulder. Down-stroke = negative, up-stroke = positive.
    const flapCycles = 3.2;
    const flap = Math.sin(k * Math.PI * 2 * flapCycles);
    state.wings.leftRot = -flap * 32; // viewer's left wing: negative angle = down-stroke
    state.wings.rightRot = flap * 32;
    // As it nears perch, dampen the flap
    const damp = 1 - easeOutCubic(k);
    state.wings.leftRot *= damp * 0.6 + 0.4;
    state.wings.rightRot *= damp * 0.6 + 0.4;
  } else if (t < T_PERCH_END) {
    // Perch: settle with a small bounce, wings fold in.
    const k = clamp((t - T_FLY_END) / (T_PERCH_END - T_FLY_END));
    const ke = easeOutBack(k);
    // Tiny vertical settle
    const settleY = Math.sin(k * Math.PI) * 6;
    state.eagle.cx = W / 2;
    state.eagle.cy = H * 0.42 + settleY;
    state.eagle.scale = 1.0;
    state.eagle.rotDeg = 0;
    // Wings fold down/in (as if tucked)
    const fold = ke; // 0..1
    state.wings.leftRot = lerp(0, 75, fold);
    state.wings.rightRot = lerp(0, -75, fold);
    state.wings.scale = lerp(1, 0.55, fold);
  } else if (t < T_SPREAD_END) {
    // Spread: wings unfurl from tucked to full heraldic spread.
    const k = clamp((t - T_PERCH_END) / (T_SPREAD_END - T_PERCH_END));
    const ke = easeOutCubic(k);
    state.eagle.cx = W / 2;
    state.eagle.cy = H * 0.42;
    state.eagle.scale = lerp(1.0, 1.05, ke);
    state.wings.leftRot = lerp(75, 0, ke);
    state.wings.rightRot = lerp(-75, 0, ke);
    state.wings.scale = lerp(0.55, 1.0, ke);
    state.glow = ke; // glow blooms as wings fully spread
  } else {
    // Text + hold
    const k = clamp((t - T_SPREAD_END) / (T_TEXT_END - T_SPREAD_END));
    const ke = easeOutCubic(k);
    state.eagle.cx = W / 2;
    state.eagle.cy = H * 0.42;
    state.eagle.scale = lerp(1.05, 1.0, ke);
    state.glow = lerp(1, 0.65, ke);
    state.text.underlineScale = easeOutCubic(clamp(k * 1.4));
    state.text.alpha = clamp((k - 0.15) / 0.6);
    state.text.shimmer = clamp((t - (T_SPREAD_END + 0.4)) / 0.7);
  }

  return state;
}

// ---------- SVG build ----------
function eagleSvg(s) {
  // Eagle scales from local coords (~500 wide) into screen.
  // Local eagle is roughly 500 wide x 200 tall; we'll scale it so the
  // full wingspan is about W * 0.42 when eagle.scale = 1.
  const BASE_WINGSPAN_LOCAL = 500; // from -250 to +250
  const BASE_WINGSPAN_SCREEN = W * 0.42;
  const eagleScale = (BASE_WINGSPAN_SCREEN / BASE_WINGSPAN_LOCAL) * s.eagle.scale;

  // Wing shoulder pivots transformed to local coords — rotation happens
  // in local space (before eagleScale) so the angle values stay intuitive.
  const leftWingGroup = `
    <g transform="
      translate(${LEFT_SHOULDER.x} ${LEFT_SHOULDER.y})
      scale(1 ${s.wings.scale})
      rotate(${s.wings.leftRot})
      translate(${-LEFT_SHOULDER.x} ${-LEFT_SHOULDER.y})
    ">
      ${WING_LEFT}
    </g>
  `;
  const rightWingGroup = `
    <g transform="
      translate(${RIGHT_SHOULDER.x} ${RIGHT_SHOULDER.y})
      scale(1 ${s.wings.scale})
      rotate(${s.wings.rightRot})
      translate(${-RIGHT_SHOULDER.x} ${-RIGHT_SHOULDER.y})
    ">
      ${WING_RIGHT}
    </g>
  `;

  return `
    <g transform="
      translate(${s.eagle.cx} ${s.eagle.cy})
      rotate(${s.eagle.rotDeg})
      scale(${eagleScale})
    ">
      ${leftWingGroup}
      ${rightWingGroup}
      ${EAGLE_CORE}
    </g>
  `;
}

function textSvg(s) {
  if (s.text.alpha <= 0 && s.text.underlineScale <= 0) return '';
  const cx = W / 2;
  const textY = H * 0.72;
  const underlineY = H * 0.66;
  const underlineHalfWidth = 360;
  const shimmerX =
    cx - underlineHalfWidth + s.text.shimmer * (underlineHalfWidth * 2);

  const underline = `
    <g transform="translate(${cx} ${underlineY}) scale(${s.text.underlineScale} 1)">
      <defs>
        <linearGradient id="goldLine" x1="-1" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#6b5530" stop-opacity="0"/>
          <stop offset="0.25" stop-color="#b8925a"/>
          <stop offset="0.5" stop-color="#f2d89a"/>
          <stop offset="0.75" stop-color="#b8925a"/>
          <stop offset="1" stop-color="#6b5530" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="-${underlineHalfWidth}" y="-1" width="${underlineHalfWidth * 2}" height="2" fill="url(#goldLine)"/>
    </g>
  `;

  const text = s.text.alpha > 0
    ? `
      <g opacity="${s.text.alpha}">
        <text x="${cx}" y="${textY}"
              text-anchor="middle"
              font-family="Liberation Serif, DejaVu Serif, serif"
              font-weight="700"
              font-size="68"
              letter-spacing="14"
              fill="#ffffff">ALL FINANCIAL FREEDOM</text>
        ${s.text.shimmer > 0 && s.text.shimmer < 1 ? `
          <rect x="${shimmerX - 60}" y="${textY - 60}" width="120" height="80"
                fill="url(#shimmerGrad)" opacity="0.35"/>
          <defs>
            <linearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
              <stop offset="0.5" stop-color="#ffffff" stop-opacity="1"/>
              <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
            </linearGradient>
          </defs>
        ` : ''}
      </g>
    ` : '';

  return underline + text;
}

function bgSvg(glow) {
  // Dark navy radial background with a soft bloom behind the eagle.
  const cx = W / 2, cy = H * 0.42;
  const bloomR = 520;
  return `
    <defs>
      <radialGradient id="bgGrad" cx="50%" cy="42%" r="75%">
        <stop offset="0" stop-color="#102238"/>
        <stop offset="0.6" stop-color="#07101f"/>
        <stop offset="1" stop-color="#03060d"/>
      </radialGradient>
      <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#e7d39a" stop-opacity="${0.28 * glow}"/>
        <stop offset="0.4" stop-color="#8a6a3a" stop-opacity="${0.12 * glow}"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
    ${glow > 0 ? `<circle cx="${cx}" cy="${cy}" r="${bloomR}" fill="url(#bloom)"/>` : ''}
  `;
}

function frameSvg(t) {
  const s = frameState(t);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bgSvg(s.glow)}
  ${eagleSvg(s)}
  ${textSvg(s)}
</svg>`;
}

// ---------- Render ----------
function renderFrames() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  console.log(`Rendering ${TOTAL_FRAMES} frames at ${W}x${H} @ ${FPS}fps...`);
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;
    const svg = frameSvg(t);
    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Serif' },
      background: '#03060d',
    });
    const png = resvg.render().asPng();
    const name = `frame_${String(i).padStart(4, '0')}.png`;
    writeFileSync(join(TMP_DIR, name), png);
    if (i % 10 === 0 || i === TOTAL_FRAMES - 1) {
      process.stdout.write(`\r  frame ${i + 1}/${TOTAL_FRAMES}`);
    }
  }
  process.stdout.write('\n');
}

function encodeMp4() {
  mkdirSync(dirname(OUT_MP4), { recursive: true });
  const args = [
    '-y',
    '-framerate', String(FPS),
    '-i', join(TMP_DIR, 'frame_%04d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'slow',
    '-movflags', '+faststart',
    OUT_MP4,
  ];
  console.log(`Encoding MP4 -> ${OUT_MP4}`);
  const res = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`ffmpeg exited with code ${res.status}`);
  }
}

// ---------- Preview mode ----------
// Usage: node render.mjs preview 1.5   -> writes single frame at t=1.5s to preview.png
if (process.argv[2] === 'preview') {
  const t = parseFloat(process.argv[3] || '2.0');
  const svg = frameSvg(t);
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Serif' },
    background: '#03060d',
  });
  const png = resvg.render().asPng();
  const out = join(__dirname, `preview-${t.toFixed(2)}.png`);
  writeFileSync(out, png);
  writeFileSync(join(__dirname, `preview-${t.toFixed(2)}.svg`), svg);
  console.log(`Wrote ${out}`);
  process.exit(0);
}

renderFrames();
encodeMp4();
rmSync(TMP_DIR, { recursive: true, force: true });
console.log('Done.');
