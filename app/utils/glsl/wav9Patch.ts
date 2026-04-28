import type { GlslPatch } from './types'

// Direct GLSL translation of wav9Patch — matches test.html MAIN_FS
export const wav9Patch: GlslPatch = {
  fragSrc: `
precision highp float;

varying vec2 vUv;
uniform sampler2D u_prev;

uniform float u_Lv;
uniform float u_Mv1;
uniform float u_Mv2;
uniform float u_Hv;
uniform float u_vLv;
uniform float u_vMv1;
uniform float u_vMv2;
uniform float u_energy;
uniform vec3  u_tint;

uniform vec3  u_pitch_color;
uniform float u_mood_tension;
uniform float u_mood_brightness;
uniform float u_mood_complexity;

float _h(float n) { return fract(sin(n) * 43758.5453123); }

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + 113.0 * i.z;
  return mix(
    mix( mix(_h(n+0.0),   _h(n+1.0),   f.x),
         mix(_h(n+57.0),  _h(n+58.0),  f.x), f.y ),
    mix( mix(_h(n+113.0), _h(n+114.0), f.x),
         mix(_h(n+170.0), _h(n+171.0), f.x), f.y ),
    f.z );
}

float hn(vec2 st, float scale, float offset) {
  return noise3d(vec3(st * scale, offset)) * 2.0 - 1.0;
}

vec4 hosc(vec2 st, float freq, float ph) {
  float f    = max(freq, 0.001);
  float base = st.x - ph / f;
  float r = sin(base * f) * 0.5 + 0.5;
  float g = sin((base + 1.0/3.0) * f) * 0.5 + 0.5;
  float b = sin((base + 2.0/3.0) * f) * 0.5 + 0.5;
  return vec4(r, g, b, 1.0);
}
vec4 hcol(vec4 c, float r, float g, float b) {
  return vec4(c.r*r, c.g*g, c.b*b, c.a);
}
vec4 hcon(vec4 c, float a) {
  return clamp((c - 0.5) * a + 0.5, 0.0, 1.0);
}
vec4 hbri(vec4 c, float a) {
  return vec4(c.rgb + a, c.a);
}
vec4 hadd(vec4 c0, vec4 c1, float a) {
  return clamp(c0 + c1 * a, 0.0, 1.0);
}
vec4 hblend(vec4 c0, vec4 c1, float a) {
  return c0 * (1.0 - a) + c1 * a;
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r));
  float d = q.x - min(q.w,q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-6)), d/(q.x+1e-6), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1., 2./3., 1./3., 3.);
  vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
}

void main() {
  vec2  st   = vUv;
  float Lv   = u_Lv,   Mv1 = u_Mv1,  Mv2 = u_Mv2,  Hv  = u_Hv;
  float vLv  = u_vLv,  vM1 = u_vMv1, vM2 = u_vMv2;
  float E    = u_energy;
  bool  live = E > 0.05;
  float FBG  = live ? pow((E - 0.05) / 0.95, 1.2) : 0.0;

  float wfL  = hn(st, 0.18 + Lv  * 0.015, 0.0);
  float wfM1 = hn(st, 0.15 + Mv1 * 0.025, 0.0);
  float wfM2 = hn(st, 0.50 + Mv2 * 0.035, 0.0);
  float wfH  = hn(st, 0.80 + Hv  * 0.080, 0.0);

  // Couleurs pilotées par l'analyse de pitch
  vec3 pc   = max(u_pitch_color, vec3(0.06));
  vec3 ph   = rgb2hsv(pc);
  float hue = ph.x;
  float sat = max(ph.y, 0.55);
  vec3 cLow  = hsv2rgb(vec3(hue,                                             sat,              1.0));
  vec3 cMid1 = hsv2rgb(vec3(fract(hue + 0.08 + u_mood_tension    * 0.22),   sat,              1.0));
  vec3 cMid2 = hsv2rgb(vec3(fract(hue + 0.33 + u_mood_complexity * 0.15),   min(sat+0.05,1.0), 1.0));
  vec3 cHigh = hsv2rgb(vec3(fract(hue + 0.50 + u_mood_brightness * 0.12),   min(sat+0.12,1.0), 1.0));

  vec2 stL = st + vec2(wfL) * (0.25 + Lv * 0.55);
  vec4 cL  = hosc(stL, 2.0 + Lv * 2.5, 0.0);
  cL = hcol(cL, vLv * 2.0 * cLow.r, vLv * 2.0 * cLow.g, vLv * 2.0 * cLow.b);
  cL = hcon(cL, 1.1 + vLv * 0.8);
  cL = hbri(cL, -0.15 + vLv * 0.20);

  vec2 stM1 = st + vec2(wfM1) * (0.18 + Mv1 * 0.40);
  vec4 cM1  = hosc(stM1, 5.0 + Mv1 * 6.0, 1.0);
  cM1 = hcol(cM1, vM1 * 2.0 * cMid1.r, vM1 * 2.0 * cMid1.g, vM1 * 2.0 * cMid1.b);
  cM1 = hcon(cM1, 1.1 + vM1 * 0.8);
  cM1 = hbri(cM1, -0.15 + vM1 * 0.20);

  vec2 stM2 = st + vec2(wfM2) * (0.12 + Mv2 * 0.30);
  vec4 cM2  = hosc(stM2, 11.0 + Mv2 * 8.0, 2.0);
  cM2 = hcol(cM2, vM2 * 2.0 * cMid2.r, vM2 * 2.0 * cMid2.g, vM2 * 2.0 * cMid2.b);
  cM2 = hcon(cM2, 1.2 + vM2 * 1.2);
  cM2 = hbri(cM2, -0.3 + vM2 * 0.35);

  vec2 stH = st + vec2(wfH) * (0.08 + Hv * 0.22);
  vec4 cH  = hosc(stH, 22.0 + Hv * 16.0, 3.0);
  cH = hcol(cH, Hv * 2.5 * cHigh.r, Hv * 2.5 * cHigh.g, Hv * 2.5 * cHigh.b);
  cH = hcon(cH, 1.2 + Hv * 1.0);

  vec4 res = cL;
  res = hadd(res, cM1, min(1.0, vM1 * 1.5));
  res = hadd(res, cM2, min(1.0, vM2 * 1.5));
  res = hadd(res, cH,  min(1.0, Hv  * 2.0));
  res = hcon(res, 1.0 + E * 0.5);
  res = hbri(res, -0.2 + E * 0.25);

  vec2 fbSt = st
    + vec2(hn(st, 1.2, 0.015)) * (vLv * 0.04 * FBG)
    + vec2(hn(st, 4.5, 0.04))  * (Hv  * 0.03 * FBG);
  fbSt = clamp(fbSt, 0.0, 1.0);

  vec4 fb = texture2D(u_prev, fbSt);
  fb = hbri(fb, -(0.006 - E * 0.005));

  float fbA = live ? min(0.88, 0.75 + E * 0.11) : 0.22;
  res = hblend(res, fb, fbA);

  vec3 t = 1.0 + (u_tint - vec3(1.0)) * 0.25;
  res = hcol(res, t.r, t.g, t.b);

  gl_FragColor = res;
}
`,
}
