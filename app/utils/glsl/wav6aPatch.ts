import type { GlslPatch } from './types'

// GLSL translation of wav6aPatch
// Palette: orange / vert-cyan / violet-indigo / jaune chaud
// Freq pilotées par bandes + modulation sinusoïdale temporelle
// Flow noise warp, colorama feedback, luma gate, scale 2×
export const wav6aPatch: GlslPatch = {
  fragSrc: `
precision highp float;

varying vec2 vUv;
uniform sampler2D u_prev;

uniform float u_rawLv;
uniform float u_rawMv1;
uniform float u_rawMv2;
uniform float u_rawHv;
uniform vec3  u_tint;
uniform float u_time;

uniform vec3  u_pitch_color;
uniform float u_mood_tension;
uniform float u_mood_brightness;
uniform float u_mood_complexity;

float _h(float n) { return fract(sin(n) * 43758.5453123); }
float noise3d(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + 113.0 * i.z;
  return mix(
    mix(mix(_h(n),_h(n+1.),f.x),mix(_h(n+57.),_h(n+58.),f.x),f.y),
    mix(mix(_h(n+113.),_h(n+114.),f.x),mix(_h(n+170.),_h(n+171.),f.x),f.y),f.z);
}
float hn(vec2 st, float sc, float off) {
  return noise3d(vec3(st * sc, off)) * 2.0 - 1.0;
}
vec4 hosc(vec2 st, float freq, float ph) {
  float f = max(freq, 0.001);
  float base = st.x - ph / f;
  return vec4(sin(base*f)*0.5+0.5, sin((base+1./3.)*f)*0.5+0.5, sin((base+2./3.)*f)*0.5+0.5, 1.0);
}
vec4 hcol(vec4 c, float r, float g, float b) { return vec4(c.r*r, c.g*g, c.b*b, c.a); }
vec4 hcon(vec4 c, float a) { return clamp((c - 0.5) * a + 0.5, 0.0, 1.0); }
vec4 hbri(vec4 c, float a) { return vec4(c.rgb + a, c.a); }
vec4 hadd(vec4 c0, vec4 c1, float a) { return clamp(c0 + c1 * a, 0.0, 1.0); }
vec4 hblend(vec4 c0, vec4 c1, float a) { return c0 * (1.0 - a) + c1 * a; }
vec4 hsat(vec4 c, float a) {
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(mix(vec3(l), c.rgb, a), c.a);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.*d + 1e-6)), d / (q.x + 1e-6), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1., 2./3., 1./3., 3.);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec4 hcolorama(vec4 c, float amt) {
  vec3 hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + amt);
  return vec4(hsv2rgb(hsv), c.a);
}
vec4 hluma(vec4 c, float th, float tol) {
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return c * smoothstep(th - tol, th + tol, l);
}

void main() {
  float L  = u_rawLv, M1 = u_rawMv1, M2 = u_rawMv2, Hh = u_rawHv;
  float Hs = pow(clamp(Hh, 0.0, 1.0), 0.72);

  // scale(2) — output UV covers inner half of source
  vec2 st = (vUv - 0.5) * 0.5 + 0.5;

  // scrollX / scrollY
  st.x = fract(st.x + (M2 - L)  * 0.0022);
  st.y = fract(st.y + (M1 - Hh) * 0.0022);

  // flow noise warp
  float flowSc = 1.25 + (M1 + M2 + Hh) * 2.2;
  float flowA  = 0.010 + (L + M1 + M2) * 0.015 + Hs * 0.026;
  st += vec2(hn(st, flowSc, 0.0), hn(st, flowSc, 7.31)) * flowA;
  st  = fract(st);

  // time-modulated frequencies
  float fLow  = 8.0  + L  * 22.0 + Hs * 6.0
              + L  * 3.0 * (sin(u_time * 0.90) + sin(u_time * 1.457)) * 0.5;
  float fM1   = 11.0 + M1 *  8.0 + Hs * 8.0
              + M1 * 2.4 * (sin(u_time * 1.00) + sin(u_time * 1.618)) * 0.5;
  float fM2   = 15.0 + M2 * 10.0 + Hs * 10.0
              + M2 * 2.8 * (sin(u_time * 1.20) + sin(u_time * 1.946)) * 0.5;
  float fHigh = min(18.0 + Hs * 28.0
              + Hs * 3.2 * (sin(u_time * 1.9) + sin(u_time * 2.89)) * 0.5, 38.0);

  float bL  = min(1.0, L  * 3.0);
  float bM1 = min(1.0, M1 * 3.0);
  float bM2 = min(1.0, M2 * 3.0);
  float bHi = min(1.0, Hs * 3.5);

  // Couleurs pilotées par l'analyse de pitch — hue chromatique + décalages par mood
  vec3 pc   = max(u_pitch_color, vec3(0.06));
  vec3 ph   = rgb2hsv(pc);
  float hue = ph.x;
  float sat = max(ph.y, 0.55);
  vec3 cLow  = hsv2rgb(vec3(hue,                                             sat,              1.0));
  vec3 cMid1 = hsv2rgb(vec3(fract(hue + 0.08 + u_mood_tension    * 0.22),   sat,              1.0));
  vec3 cMid2 = hsv2rgb(vec3(fract(hue + 0.33 + u_mood_complexity * 0.15),   min(sat+0.05,1.0), 1.0));
  vec3 cHigh = hsv2rgb(vec3(fract(hue + 0.50 + u_mood_brightness * 0.12),   min(sat+0.12,1.0), 1.0));

  vec4 lowL = hcol(hosc(st, fLow,  0.0), bL  * cLow.r,  bL  * cLow.g,  bL  * cLow.b);
  vec4 m1L  = hcol(hosc(st, fM1,   0.0), bM1 * cMid1.r, bM1 * cMid1.g, bM1 * cMid1.b);
  vec4 m2L  = hcol(hosc(st, fM2,   0.0), bM2 * cMid2.r, bM2 * cMid2.g, bM2 * cMid2.b);
  vec4 hiL  = hcol(hosc(st, fHigh, 0.0), bHi * cHigh.r, bHi * cHigh.g, bHi * cHigh.b);

  vec4 res = lowL;
  res = hadd(res, m1L, min(1.0, M1 * 4.0));
  res = hadd(res, m2L, min(1.0, M2 * 4.0));
  res = hadd(res, hiL, min(1.0, Hs * 4.0));
  res = hsat(res, 1.5);
  res = hcon(res, 1.4);

  // feedback (sampled at non-warped scaled UV, then colorama)
  float fbA = min(0.20, (L + M1 + M2 + Hs) * 0.12);
  vec2 fbUv = (vUv - 0.5) * 0.5 + 0.5;
  vec4 fb   = texture2D(u_prev, fbUv);
  fb = hcolorama(fb, 0.004 + Hh * 0.018);
  fb = hcon(fb, 1.0005);
  res = hblend(res, fb, fbA);

  res = hluma(res, 0.12, 0.08);
  res = hbri(res, -0.08);
  vec3 t6a = 1.0 + (u_tint - vec3(1.0)) * 0.25;
  res = hcol(res, t6a.r, t6a.g, t6a.b);

  gl_FragColor = res;
}
`,
}
