import type { GlslPatch } from './types'

// GLSL faithful translation of wav7cPatch (Hydra)
// Palette: rouge-orange / jaune-pêche / cyan-turquoise / violet-magenta
//
// Corrections vs. previous version:
//  - Scale dynamique: (5 + sLv*1.5)*0.6 réagit au bass
//  - Noise field animé: u_time * speed passé comme offset
//  - Oscillateurs évalués au UV warpé (stW) après modulate
//  - Structure propre: un seul 'base', pas de dead-code
//  - Brightness: -0.35 (Hydra) au lieu de -0.5
//  - Colorama: 0.05 + Hs*0.9 (Hydra) au lieu de 0.08 + Hs*1.4
//  - Contraste du field: 1.0 + sLv*0.08 + sHs*0.08
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

// === Value noise 3D ===
float _h(float n) { return fract(sin(n) * 43758.5453123); }
float noise3d(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n = i.x + i.y*57.0 + 113.0*i.z;
  return mix(
    mix(mix(_h(n),_h(n+1.),f.x), mix(_h(n+57.),_h(n+58.),f.x), f.y),
    mix(mix(_h(n+113.),_h(n+114.),f.x), mix(_h(n+170.),_h(n+171.),f.x), f.y), f.z);
}
// Retourne [-1,1], animé via off = u_time * speed
float hn(vec2 st, float sc, float off) {
  return noise3d(vec3(st * sc, off)) * 2.0 - 1.0;
}

// === Hydra ops ===
// osc(freq, ph) — sync=0
vec4 hosc(vec2 st, float freq, float ph) {
  float f = max(freq, 0.001);
  float base = st.x - ph/f;
  return vec4(sin(base*f)*0.5+0.5, sin((base+1./3.)*f)*0.5+0.5, sin((base+2./3.)*f)*0.5+0.5, 1.0);
}
// osc avec sync (modulation temporelle)
vec4 hoscS(vec2 st, float freq, float sync, float ph, float t) {
  float f = max(freq, 0.001);
  float base = st.x - ph/f - t*sync;
  return vec4(sin(base*f)*0.5+0.5, sin((base+1./3.)*f)*0.5+0.5, sin((base+2./3.)*f)*0.5+0.5, 1.0);
}
vec4 hcol(vec4 c, float r, float gv, float b)  { return vec4(c.r*r, c.g*gv, c.b*b, c.a); }
vec4 hcon(vec4 c, float a)                     { return clamp((c-0.5)*a+0.5, 0.0, 1.0); }
vec4 hbri(vec4 c, float a)                     { return vec4(clamp(c.rgb+a, 0.0, 1.0), c.a); }
vec4 hadd(vec4 c0, vec4 c1, float a)           { return clamp(c0 + c1*a, 0.0, 1.0); }
vec4 hblend(vec4 c0, vec4 c1, float a)         { return c0*(1.0-a) + c1*a; }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.,-1./3.,2./3.,-1.);
  vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-6)), d/(q.x+1e-6), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.,2./3.,1./3.,3.);
  vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
}
vec4 hcolorama(vec4 c, float amt) {
  vec3 hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + amt);
  return vec4(hsv2rgb(hsv), c.a);
}
vec4 hluma(vec4 c, float th, float tol) {
  float l = dot(c.rgb, vec3(0.299,0.587,0.114));
  return c * smoothstep(th-tol, th+tol, l);
}

void main() {
  // Smooth (mouvement) vs raw (couleur réactive)
  float sLv=u_sLv, sMv1=u_sMv1, sMv2=u_sMv2, sHs=u_sHv;
  float Lv=u_Lv, Mv1=u_Mv1, Mv2=u_Mv2, Hs=u_Hv;
  float E=u_energy;
  float FB_G = pow(max(0.0, E-0.04)/0.96, 1.2);

  // Scale dynamique: scale(5+sLv*1.5) * scale(0.6) — réagit au bass
  float sc = (5.0 + sLv*1.5) * 0.6;
  vec2 st = (vUv - 0.5) / sc + 0.5;

  // Fréquences oscillateurs (valeurs lissées → mouvement doux)
  float fLow = 6.0  + sLv *10.0 + sLv *1.5*(sin(u_time*0.9) +sin(u_time*1.31))*0.5;
  float fM1  = 9.0  + sMv1* 6.0 + sMv1    *(sin(u_time*1.1) +sin(u_time*1.77))*0.5;
  float fM2  = 12.0 + sMv2* 8.0 + sMv2*1.2*(sin(u_time*1.3) +sin(u_time*2.03))*0.5;

  // Noise field animé (speed = 2e arg de noise() dans Hydra)
  float coarseNs  = 0.5 + (sLv+sMv1)*2.0;
  float coarseSpd = 0.08 + sLv*0.20;
  float fineNs    = 0.24 + sHs*5.0;
  float fineSpd   = 0.6  + sHs*0.70;

  float tC = u_time * coarseSpd;
  float tF = u_time * fineSpd;

  // Composantes x/y indépendantes du field (offset z pour décorrélation)
  vec2 fldCoarse = vec2(hn(st,coarseNs,tC),     hn(st,coarseNs,tC+5.1));
  vec2 fldFine   = vec2(hn(st,fineNs,  tF),     hn(st,fineNs,  tF+3.7));

  // coarseNoise.add(fineNoise, 0.35+sHs*0.65).contrast(1.0+sLv*0.08+sHs*0.08)
  vec2 fldRaw = fldCoarse + fldFine*(0.35+sHs*0.65);
  vec2 field  = clamp(fldRaw * (1.0+sLv*0.08+sHs*0.08), -1.0, 1.0);

  // modulate(field, amt): warp UV pour les oscillateurs
  // hn retourne [-1,1]; Hydra noise=[0,1] → (noise-0.5)*amt → facteur 0.5
  float modAmt = (0.005 + (sLv+sMv1)*0.018) * FB_G;
  vec2 stW = st + field * modAmt * 0.5;

  // Oscillateurs au UV warpé (= modulate en Hydra)
  vec4 oscLo = hcol(hosc(stW, fLow, sLv*0.25),              Lv*3.0,  Lv*0.6,  Lv*0.4);
  vec4 oscM1 = hcol(hosc(stW, fM1,  1.0),                   Mv1*2.5, Mv1*1.8, Mv1*0.5);
  vec4 oscM2 = hcol(hosc(stW, fM2,  1.0),                   Mv2*0.5, Mv2*2.2, Mv2*2.5);
  vec4 oscHi = hcol(hoscS(stW, 60.0+sHs*50.0, 0.02+sHs*0.12, sHs*32.0, u_time),
                    Hs*2.5, Hs*0.4, Hs*3.2);

  // Base: 4 oscillateurs combinés, contrast, brightness (-0.35 cf. Hydra)
  vec4 base = oscLo;
  base = hadd(base, oscM1, 0.6);
  base = hadd(base, oscM2, 0.6);
  base = hadd(base, oscHi, sHs*0.4);
  base = hcon(base, 1.03 + sLv*0.4);
  base = hbri(base, -0.35);

  // .add(fineNoise, (0.02+sHs*0.28)*FB_G) — fineNoise évalué à st (UV courant)
  float fineVal = noise3d(vec3(st*fineNs, tF));
  base = hadd(base, vec4(vec3(fineVal),1.0), (0.02+sHs*0.28)*FB_G);

  // Contrast + brightness réactifs aux aigus
  base = hcon(base, 1.01 + Hs*0.12);
  base = hbri(base, -0.06 - Hs*0.06);

  // Feedback: src(o0).modulate(field, amt2).colorama(...).contrast(...)
  float fbModAmt = (0.006 + sLv*0.02) * FB_G;
  vec2 fbUv = st + field * fbModAmt * 0.5;
  vec4 fb = texture2D(u_prev, fbUv);
  fb = hcolorama(fb, (0.05 + Hs*0.9) * FB_G);
  fb = hcon(fb, 1.003 + Hs*0.005);

  // .add(feedback, min(0.38, ...))
  float fbBlend = min(0.38, (0.06+(sLv+sMv1)*0.18)*FB_G);
  vec4 res = hadd(base, fb, fbBlend);

  // .brightness(-0.22).luma(...)
  res = hbri(res, -0.22);
  res = hluma(res, 0.75 - sHs*0.45 + sLv*0.05, 0.10);

  // .blend(o0, 0.18+E*0.25) — fondu temporel avec frame précédente (zoom feedback)
  vec4 prevPlain = texture2D(u_prev, st);
  res = hblend(res, prevPlain, 0.18 + E*0.25);

  // .color(tint)
  vec3 t7c = 1.0 + (u_tint - vec3(1.0)) * 0.25;
  res = hcol(res, t7c.r, t7c.g, t7c.b);

  gl_FragColor = clamp(res, 0.0, 1.0);
}
`,
}
