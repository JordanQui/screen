import type { GlslPatch } from './types'

// GLSL translation of wav7cPatch
// Palette: rouge-orange / jaune-pêche / cyan-turquoise / violet-magenta
// Valeurs lissées (u_sLv...) pour le mouvement, brutes (u_Lv...) pour la couleur
// Double noise (grossier + fin), colorama feedback, zoom 3× (scale 5*0.6 → ~3)
export const wav7cPatch: GlslPatch = {
  fragSrc: `
precision highp float;

varying vec2 vUv;
uniform sampler2D u_prev;

uniform float u_Lv;
uniform float u_Mv1;
uniform float u_Mv2;
uniform float u_Hv;
uniform float u_energy;
uniform float u_sLv;
uniform float u_sMv1;
uniform float u_sMv2;
uniform float u_sHv;
uniform vec3  u_tint;
uniform float u_time;

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

// osc avec sync (terme temporel)
vec4 hoscS(vec2 st, float freq, float sync, float ph, float t) {
  float f = max(freq, 0.001);
  float base = st.x - ph / f - t * sync;
  return vec4(sin(base*f)*0.5+0.5, sin((base+1./3.)*f)*0.5+0.5, sin((base+2./3.)*f)*0.5+0.5, 1.0);
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
  // valeurs lissées (mouvement) vs brutes (couleur)
  float sLv = u_sLv, sMv1 = u_sMv1, sMv2 = u_sMv2, sHs = u_sHv;
  float Lv  = u_Lv,  Mv1  = u_Mv1,  Mv2  = u_Mv2,  Hs  = u_Hv;
  float E   = u_energy;
  float FB_G = pow(max(0.0, E - 0.04) / 0.96, 1.2);

  // scale(5 * 0.6) = scale(3) → inner third visible
  vec2 st = (vUv - 0.5) / 3.0 + 0.5;

  // fréquences lissées (mouvement doux)
  float fLow = 6.0 + sLv  * 10.0 + sLv  * 1.5 * (sin(u_time * 0.9)  + sin(u_time * 1.31))  * 0.5;
  float fM1  = 9.0 + sMv1 *  6.0 + sMv1        * (sin(u_time * 1.1)  + sin(u_time * 1.77))  * 0.5;
  float fM2  = 12.0 + sMv2 * 8.0 + sMv2 * 1.2  * (sin(u_time * 1.3)  + sin(u_time * 2.03))  * 0.5;

  // oscillateurs colorés (couleur réactive, fréquence lissée)
  vec4 oscLo = hcol(hosc(st, fLow, sLv * 0.25), Lv*3.0, Lv*0.6, Lv*0.4);
  vec4 oscM1 = hcol(hosc(st, fM1,  1.0),         Mv1*2.5, Mv1*1.8, Mv1*0.5);
  vec4 oscM2 = hcol(hosc(st, fM2,  1.0),         Mv2*0.5, Mv2*2.2, Mv2*2.5);
  // HIGH: sync > 0 → animation temporelle
  vec4 oscHi = hcol(hoscS(st, 60.0 + sHs*50.0, 0.02 + sHs*0.12, sHs*32.0, u_time),
                    Hs*2.5, Hs*0.4, Hs*3.2);

  vec4 base = oscLo;
  base = hadd(base, oscM1, 0.6);
  base = hadd(base, oscM2, 0.6);
  base = hadd(base, oscHi, sHs * 0.4);
  base = hcon(base, 1.03 + sLv * 0.4);
  base = hbri(base, -0.5);

  // double noise : grossier (mouvement) + fin (aigus)
  float coarseNs = 0.5 + (sLv + sMv1) * 2.0;
  float fineNs   = 0.24 + sHs * 5.0;
  vec2 warpCoarse = vec2(hn(st, coarseNs, 0.0), hn(st, coarseNs, 5.1));
  vec2 warpFine   = vec2(hn(st, fineNs,   0.0), hn(st, fineNs,   3.7));

  // modulate(field) — warp par noise composé
  float fieldAmt = (0.005 + (sLv + sMv1) * 0.018) * FB_G;
  vec2 stW = st + warpCoarse * fieldAmt + warpFine * (0.35 + sHs * 0.65) * fieldAmt;

  base = texture2D(u_prev, (stW - 0.5) / 3.0 + 0.5);  // re-sample base depuis le warp
  // (approximation: on re-évalue depuis le prev warpé plutôt qu'inliner les oscs)
  // Les oscillateurs forment la couche principale, le feedback warpe et colore
  vec4 oscLayer = oscLo;
  oscLayer = hadd(oscLayer, oscM1, 0.6);
  oscLayer = hadd(oscLayer, oscM2, 0.6);
  oscLayer = hadd(oscLayer, oscHi, sHs * 0.4);
  oscLayer = hcon(oscLayer, 1.03 + sLv * 0.4);
  oscLayer = hbri(oscLayer, -0.5);

  // add fine noise directement
  float fineVal = noise3d(vec3(st * fineNs, 0.0));
  oscLayer = hadd(oscLayer, vec4(fineVal), (0.02 + sHs * 0.28) * FB_G);

  oscLayer = hcon(oscLayer, 1.01 + Hs * 0.12);
  oscLayer = hbri(oscLayer, -0.06 - Hs * 0.06);

  // feedback avec colorama
  vec2 fbUv = (vUv - 0.5) / 3.0 + 0.5;
  fbUv += warpCoarse * (0.006 + sLv * 0.02) * FB_G;
  vec4 fb = texture2D(u_prev, fbUv);
  fb = hcolorama(fb, (0.08 + Hs * 1.4) * FB_G);
  fb = hcon(fb, 1.003 + Hs * 0.005);

  float fbA = min(0.38, (0.06 + (sLv + sMv1) * 0.18) * FB_G);
  vec4 res = hadd(oscLayer, fb, fbA);

  res = hbri(res, -0.22);
  res = hluma(res, 0.75 - sHs * 0.45 + sLv * 0.05, 0.05);

  // blend(o0, ...) — mélange avec frame précédent non-warpé
  vec4 prevPlain = texture2D(u_prev, (vUv - 0.5) / 3.0 + 0.5);
  res = hblend(res, prevPlain, 0.18 + E * 0.25);

  res = hcol(res, u_tint.r, u_tint.g, u_tint.b);
  gl_FragColor = res;
}
`,
}
