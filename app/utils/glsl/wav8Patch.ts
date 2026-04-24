import type { GlslPatch } from './types'

// GLSL translation of wav8Patch
// Palette froide / électrique: bleu / magenta / cyan / blanc violacé
// Double flow noise (lent+rapide), rotation réactive, zoom fort (3.5+)
// Spirale feedback (zoom + contre-rotation dans la boucle)
export const wav8Patch: GlslPatch = {
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

vec2 rot2d(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(p.x*c - p.y*s, p.x*s + p.y*c);
}

void main() {
  float L  = u_rawLv, M1 = u_rawMv1, M2 = u_rawMv2, Hh = u_rawHv;
  float Hs = pow(clamp(Hh, 0.0, 1.0), 0.72);

  // rotation réactive + dérive lente
  float rotAmt = (M1 - L * 0.5) * 0.006 + sin(u_time * 0.11) * 0.003;

  // scroll différentiel
  float sX = (M2 - L)  * 0.003 + sin(u_time * 0.08) * 0.001;
  float sY = (M1 - Hh) * 0.003;

  // zoom fort réactif — 3.5 base, monte avec les basses
  float zoom = 3.5 + L * 1.5 + M1 * 0.8 + Hs * 0.5;

  // UV de base (scale zoom)
  vec2 st = (vUv - 0.5) / zoom + 0.5;

  // rotation
  st = rot2d(st - 0.5, rotAmt) + 0.5;

  // scroll
  st.x = fract(st.x + sX);
  st.y = fract(st.y + sY);

  // double flow noise
  float nsLow  = 1.0 + (L + M1) * 3.5;
  float nsHigh = 2.8 + (M2 + Hh) * 5.0;
  float aLow   = 0.014 + L * 0.025 + M1 * 0.014;
  float aHigh  = 0.008 + Hs * 0.036 + M2 * 0.020;

  st += vec2(hn(st, nsLow,  0.0), hn(st, nsLow,  4.2)) * aLow;
  st += vec2(hn(st, nsHigh, 0.0), hn(st, nsHigh, 9.1)) * aHigh;
  st  = fract(st);

  // fréquences
  float fLow  = 7.0  + L  * 20.0 + Hs * 5.0
              + L  * 2.8 * (sin(u_time * 0.75) + sin(u_time * 1.31))  * 0.5;
  float fM1   = 10.0 + M1 *  8.0 + Hs * 7.0
              + M1 * 2.2 * (sin(u_time * 0.90) + sin(u_time * 1.49))  * 0.5;
  float fM2   = 14.0 + M2 * 10.0 + Hs * 9.0
              + M2 * 2.6 * (sin(u_time * 1.15) + sin(u_time * 1.78))  * 0.5;
  float fHigh = min(17.0 + Hs * 26.0
              + Hs * 3.5 * (sin(u_time * 1.85) + sin(u_time * 2.73)) * 0.5, 40.0);

  float bL  = min(1.0, L  * 4.0);
  float bM1 = min(1.0, M1 * 4.0);
  float bM2 = min(1.0, M2 * 4.0);
  float bHi = min(1.0, Hs * 4.5);

  // Couleurs pilotées par l'analyse de pitch
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
  res = hadd(res, m1L, min(1.0, M1 * 5.0));
  res = hadd(res, m2L, min(1.0, M2 * 5.0));
  res = hadd(res, hiL, min(1.0, Hs * 5.0));
  res = hsat(res, 2.0);
  res = hcon(res, 1.6);

  // feedback spirale (zoom + contre-rotation dans la boucle)
  float fbA  = min(0.42, (L + M1 + M2 + Hs) * 0.18 + 0.06);
  vec2 fbUv  = (vUv - 0.5) / zoom + 0.5;
  fbUv  = rot2d(fbUv - 0.5, -rotAmt * 0.6) + 0.5;
  fbUv += vec2(hn(fbUv, nsLow, 0.0), hn(fbUv, nsLow, 4.2)) * aLow * 0.5;
  // zoom léger dans la boucle → effet spirale
  fbUv  = (fbUv - 0.5) * (1.0 / (1.004 + Hs * 0.010)) + 0.5;
  fbUv  = clamp(fbUv, 0.0, 1.0);

  vec4 fb = texture2D(u_prev, fbUv);
  fb = hcolorama(fb, 0.008 + Hh * 0.030 + L * 0.020);
  fb = hcon(fb, 1.002);
  res = hblend(res, fb, fbA);

  res = hluma(res, 0.10, 0.08);
  res = hbri(res, -0.05);
  res = hcol(res, u_tint.r, u_tint.g, u_tint.b);

  gl_FragColor = res;
}
`,
}
