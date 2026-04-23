#!/usr/bin/env node
// Renders the animated logo end-card to public/brand/animated-logo.mp4
// Pipeline: generate per-frame SVG (with the real brand PNG assets embedded)
// -> rasterize via @resvg/resvg-js -> stitch frames with ffmpeg.

import { Resvg } from '@resvg/resvg-js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const BRAND_DIR = join(REPO_ROOT, 'public', 'brand');
const OUT_MP4 = join(BRAND_DIR, 'animated-logo.mp4');
const TMP_DIR = join(__dirname, '.frames');

// ---------- Config ----------
const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 3.5;
const TOTAL_FRAMES = Math.round(FPS * DURATION);

// Beats
const T_FLY_END = 1.2;    // fly-in complete, eagle lands
const T_SETTLE_END = 1.6; // bounce-settle complete
const T_GLOW_PEAK = 2.0;  // glow hits full bloom
const T_TEXT_START = 2.1;
const T_TEXT_END = 3.0;

// ---------- Assets ----------
const eagleBuf = readFileSync(join(BRAND_DIR, 'logo-eagle-only.png'));
const textBuf = readFileSync(join(BRAND_DIR, 'logo-text-only.png'));
const EAGLE_DATA_URL = `data:image/png;base64,${eagleBuf.toString('base64')}`;
const TEXT_DATA_URL = `data:image/png;base64,${textBuf.toString('base64')}`;

// Native dimensions
const EAGLE_NATIVE_W = 384;
const EAGLE_NATIVE_H = 210;
const TEXT_NATIVE_W = 384;
const TEXT_NATIVE_H = 45;

// Target on-screen eagle size at rest (wingspan). Upscales the 384px source
// ~2.5x so it fills ~50% of the frame width at final pose.
const EAGLE_REST_W = 980;
const EAGLE_REST_H = (EAGLE_REST_W / EAGLE_NATIVE_W) * EAGLE_NATIVE_H;

const TEXT_REST_W = 760;
const TEXT_REST_H = (TEXT_REST_W / TEXT_NATIVE_W) * TEXT_NATIVE_H;

// ---------- Easing ----------
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------- Frame state ----------
function frameState(t) {
  const rest = {
    cx: W / 2,
    cy: H * 0.44,
    scale: 1,
    rotDeg: 0,
    squashY: 1,     // vertical squash (< 1 = wings pulled down; > 1 = stretched)
    glow: 1,
    textAlpha: 1,
    underlineScale: 1,
    shimmerT: 1,
  };

  if (t < T_FLY_END) {
    // --- Fly-in: small eagle arcs from upper-left toward center. ---
    const k = clamp(t / T_FLY_END);
    const ke = easeInOutCubic(k);

    // Quadratic bezier arc: start -> control -> end
    const p0 = { x: -W * 0.18, y: H * 0.06 };
    const p1 = { x: W * 0.30, y: H * 0.12 };
    const p2 = { x: W / 2,     y: H * 0.44 };
    const m = 1 - ke;
    const cx = m * m * p0.x + 2 * m * ke * p1.x + ke * ke * p2.x;
    const cy = m * m * p0.y + 2 * m * ke * p1.y + ke * ke * p2.y;

    // Growth as it "approaches camera"
    const scale = lerp(0.32, 1.0, easeOutCubic(k));

    // Subtle banking rotation + wing-beat squash (sin oscillation)
    const flapCycles = 2.8;
    const flap = Math.sin(k * Math.PI * 2 * flapCycles);
    const bank = lerp(-14, 0, ke) + flap * 2;
    // Squash rhythm: wings pull slightly down, then back, as if beating.
    const squashAmp = 0.12 * (1 - k * 0.4); // damp as it nears perch
    const squashY = 1 + flap * squashAmp;

    return {
      ...rest,
      cx, cy,
      scale,
      rotDeg: bank,
      squashY,
      glow: 0,
      textAlpha: 0,
      underlineScale: 0,
      shimmerT: 0,
    };
  }

  if (t < T_SETTLE_END) {
    // --- Perch settle: overshoot bounce into final pose. ---
    const k = clamp((t - T_FLY_END) / (T_SETTLE_END - T_FLY_END));
    const ke = easeOutBack(k);
    // Squash: compressed just before overshoot, settles to 1.0
    const squashY = lerp(0.9, 1.0, ke);
    return {
      ...rest,
      cx: W / 2,
      cy: H * 0.44 + Math.sin(k * Math.PI) * -4, // tiny upward lift as wings settle
      scale: 1 + Math.sin(k * Math.PI) * 0.04,
      rotDeg: 0,
      squashY,
      glow: easeOutCubic(k) * 0.5,
      textAlpha: 0,
      underlineScale: 0,
      shimmerT: 0,
    };
  }

  // --- Hold + glow bloom + text reveal. ---
  const kGlow = clamp((t - T_SETTLE_END) / (T_GLOW_PEAK - T_SETTLE_END));
  const glow = lerp(0.5, 1.0, easeOutCubic(kGlow));

  const kText = clamp((t - T_TEXT_START) / (T_TEXT_END - T_TEXT_START));
  const textAlpha = easeOutCubic(kText);
  const underlineScale = easeOutCubic(clamp(kText * 1.4));

  // Subtle breathing scale on eagle
  const breathe = 1 + Math.sin((t - T_SETTLE_END) * 1.2) * 0.006;

  // Shimmer sweeps across text a bit after text fades in
  const shimmerT = clamp((t - (T_TEXT_START + 0.35)) / 0.9);

  return {
    ...rest,
    scale: breathe,
    glow,
    textAlpha,
    underlineScale,
    shimmerT,
  };
}

// ---------- SVG assembly ----------
function bgSvg(glow) {
  const cx = W / 2, cy = H * 0.44;
  const bloomR = 620;
  return `
    <defs>
      <radialGradient id="bgGrad" cx="50%" cy="44%" r="80%">
        <stop offset="0" stop-color="#0f2339"/>
        <stop offset="0.55" stop-color="#07101f"/>
        <stop offset="1" stop-color="#02050c"/>
      </radialGradient>
      <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#f2d89a" stop-opacity="${0.32 * glow}"/>
        <stop offset="0.35" stop-color="#b8925a" stop-opacity="${0.16 * glow}"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0"    stop-color="#5a4726" stop-opacity="0"/>
        <stop offset="0.2"  stop-color="#b8925a"/>
        <stop offset="0.5"  stop-color="#f4dca2"/>
        <stop offset="0.8"  stop-color="#b8925a"/>
        <stop offset="1"    stop-color="#5a4726" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
    ${glow > 0 ? `<circle cx="${cx}" cy="${cy}" r="${bloomR}" fill="url(#bloom)"/>` : ''}
  `;
}

function eagleSvg(s) {
  const w = EAGLE_REST_W * s.scale;
  const h = EAGLE_REST_H * s.scale * s.squashY;
  const x = s.cx - w / 2;
  const y = s.cy - h / 2;
  // Rotation around the eagle center
  return `
    <g transform="rotate(${s.rotDeg} ${s.cx} ${s.cy})">
      <image href="${EAGLE_DATA_URL}"
             x="${x}" y="${y}" width="${w}" height="${h}"
             preserveAspectRatio="none"/>
    </g>
  `;
}

function textSvg(s) {
  if (s.textAlpha <= 0 && s.underlineScale <= 0) return '';
  const cx = W / 2;
  // Underline sits just above the text band
  const underlineY = H * 0.70;
  const textY = H * 0.72;
  const underlineHalfW = 430;

  const underline =
    s.underlineScale > 0
      ? `<g transform="translate(${cx} ${underlineY}) scale(${s.underlineScale} 1)">
           <rect x="-${underlineHalfW}" y="-1.4" width="${underlineHalfW * 2}" height="2.8"
                 fill="url(#goldLine)"/>
         </g>`
      : '';

  const tw = TEXT_REST_W;
  const th = TEXT_REST_H;
  const tx = cx - tw / 2;
  const ty = textY;

  let textImg = '';
  if (s.textAlpha > 0) {
    textImg = `
      <g opacity="${s.textAlpha}">
        <image href="${TEXT_DATA_URL}"
               x="${tx}" y="${ty}" width="${tw}" height="${th}"/>
      </g>
    `;

    // Shimmer: a soft white gradient rectangle sweeps left-to-right over the text,
    // using mix-blend via opacity trick (resvg doesn't support blend modes well),
    // so we just overlay a low-alpha white gradient window masked to the text bbox.
    if (s.shimmerT > 0 && s.shimmerT < 1) {
      const sweepW = 220;
      const sweepX = tx - sweepW + (tw + sweepW * 2) * s.shimmerT;
      const shimmerId = `shimmer_${Math.round(s.shimmerT * 1000)}`;
      textImg += `
        <defs>
          <linearGradient id="${shimmerId}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
            <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.85"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
          </linearGradient>
          <clipPath id="textClip_${shimmerId}">
            <rect x="${tx}" y="${ty}" width="${tw}" height="${th}"/>
          </clipPath>
        </defs>
        <g clip-path="url(#textClip_${shimmerId})" opacity="0.55">
          <rect x="${sweepX}" y="${ty}" width="${sweepW}" height="${th}"
                fill="url(#${shimmerId})"/>
        </g>
      `;
    }
  }

  return underline + textImg;
}

function frameSvg(t) {
  const s = frameState(t);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bgSvg(s.glow)}
  ${eagleSvg(s)}
  ${textSvg(s)}
</svg>`;
}

function rasterize(svg) {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true },
    background: '#02050c',
  });
  return resvg.render().asPng();
}

// ---------- Preview mode ----------
if (process.argv[2] === 'preview') {
  const t = parseFloat(process.argv[3] || '2.0');
  const svg = frameSvg(t);
  const png = rasterize(svg);
  const out = join(__dirname, `preview-${t.toFixed(2)}.png`);
  writeFileSync(out, png);
  writeFileSync(join(__dirname, `preview-${t.toFixed(2)}.svg`), svg);
  console.log(`Wrote ${out}`);
  process.exit(0);
}

// ---------- Full render ----------
function renderFrames() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  console.log(`Rendering ${TOTAL_FRAMES} frames at ${W}x${H} @ ${FPS}fps...`);
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;
    const png = rasterize(frameSvg(t));
    writeFileSync(join(TMP_DIR, `frame_${String(i).padStart(4, '0')}.png`), png);
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
  if (res.status !== 0) throw new Error(`ffmpeg exited ${res.status}`);
}

renderFrames();
encodeMp4();
rmSync(TMP_DIR, { recursive: true, force: true });
console.log('Done.');
