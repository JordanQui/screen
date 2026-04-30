import type { GlslPatch } from './types'

// FM Bell — routing FM synthé traduit en espace UV
// Chaîne: Op3 (sub-mod, bass) → Op2 (mod, mids) → Carriers (x4, bandes)
// Chaque carrier est déphasé par Op2, lequel est déphasé par Op3
// → interférence complexe, caractère FM (riche à l'attaque, qui se stabilise au decay)
// Palette: amber/gold (low) · orange-pêche (mid1) · teal-cyan (mid2) · bleu-violet (high)
export const fmBellPatch: GlslPatch = {
  fragSrc: `
precision highp float;

varying vec2 vUv;
uniform sampler2D u_prev;

uniform float u_rawLv;
uniform float u_rawMv1;
uniform float u_rawMv2;
uniform float u_rawHv;
uniform float u_sLv;
uniform float u_sMv1;
uniform float u_sMv2;
uniform float u_sHv;
uniform float u_energy;
uniform vec3  u_tint;
uniform float u_time;

uniform vec3  u_pitch_color;
uniform float u_mood_tension;
uniform float u_mood_brightness;
uniform float u_mood_complexity;

vec4 hosc(vec2 st, float freq, float ph) {
  float f = max(freq, 0.001);
  float base = st.x - ph / f;
  float rv = sin(base * f) * 0.5 + 0.5;
  float gv = sin((base + 1.0/3.0) * f) * 0.5 + 0.5;
  float bv = sin((base + 2.0/3.0) * f) * 0.5 + 0.5;
  return vec4(rv, gv, bv, 1.0);
}
vec4 hcol(vec4 c, float r, float gv, float bv) { return vec4(c.r*r, c.g*gv, c.b*bv, c.a); }
vec4 hcon(vec4 c, float a)                      { return clamp((c - 0.5)*a + 0.5, 0.0, 1.0); }
vec4 hbri(vec4 c, float a)                      { return vec4(c.rgb + a, c.a); }
vec4 hadd(vec4 c0, vec4 c1, float a)            { return clamp(c0 + c1*a, 0.0, 1.0); }
vec4 hblend(vec4 c0, vec4 c1, float a)          { return c0*(1.0-a) + c1*a; }
vec4 hsat(vec4 c, float a) {
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(mix(vec3(lum), c.rgb, a), c.a);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-6)), d/(q.x+1e-6), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1., 2./3., 1./3., 3.);
  vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
}
vec4 hcolorama(vec4 c, float amt) {
  vec3 hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + amt);
  return vec4(hsv2rgb(hsv), c.a);
}
vec4 hluma(vec4 c, float th, float tol) {
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  return c * smoothstep(th-tol, th+tol, lum);
}
vec2 rot2d(vec2 p, float a) {
  float cs = cos(a), sn = sin(a);
  return vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs);
}

void main() {
  // Valeurs rapides (réactivité couleur, attaque FM)
  float L  = u_rawLv, M1 = u_rawMv1, M2 = u_rawMv2, Hh = u_rawHv;
  float Hs = pow(clamp(Hh, 0.0, 1.0), 0.72);
  // Valeurs lissées (mouvement, évolution des fréquences)
  float sLv = u_sLv, sMv1 = u_sMv1, sMv2 = u_sMv2, sHs = u_sHv;
  float t = u_time;

  // Zoom + scroll + rotation réactifs
  float zoom = 3.0 + sLv * 1.8 + sMv1 * 0.8 + sHs * 0.4;
  float rotA = (M1 - L * 0.5) * 0.005 + sin(t * 0.08) * 0.002;
  float sX   = (M2 - L) * 0.002 + sin(t * 0.06) * 0.0008;
  float sY   = (M1 - Hh) * 0.002 + cos(t * 0.05) * 0.0006;

  vec2 st = (vUv - 0.5) / zoom + 0.5;
  st = rot2d(st - 0.5, rotA) + 0.5;
  st.x = fract(st.x + sX);
  st.y = fract(st.y + sY);

  // Déformation UV : fréquence spatiale des vagues ∝ fréquence audio de chaque bande
  // basses → grandes vagues lentes   mid → vagues moyennes   aigus → micro-ondulations
  float wL  = L  * 0.09;
  float wM1 = M1 * 0.07;
  float wM2 = M2 * 0.06;
  float wH  = Hs * 0.05;
  st.y += sin(st.x *  3.5 + t * 0.7)  * wL
        + sin(st.x *  9.0 + t * 1.3)  * wM1
        + sin(st.x * 17.0 + t * 2.2)  * wM2
        + sin(st.x * 30.0 + t * 3.5)  * wH;
  st.x += cos(st.y *  3.5 + t * 0.5)  * wL  * 0.6
        + cos(st.y *  9.0 + t * 1.1)  * wM1 * 0.6
        + cos(st.y * 17.0 + t * 1.9)  * wM2 * 0.6
        + cos(st.y * 30.0 + t * 2.9)  * wH  * 0.6;
  st = fract(st);

  // Fréquences des opérateurs FM
  float fm3  = 2.0  + sMv2 * 3.5  + sLv * 2.0;     // Op3: sub-mod lent
  float fm2  = 6.0  + sMv1 * 8.0  + sMv2 * 3.5;    // Op2: modulator
  float fcL  = 8.0  + sLv  * 9.0  + sLv  * 2.5 * (sin(t*0.70)+sin(t*1.21))*0.5;
  float fcM1 = 13.0 + sMv1 * 11.0 + sMv1 * 2.0 * (sin(t*0.85)+sin(t*1.47))*0.5;
  float fcM2 = 19.0 + sMv2 * 13.0 + sMv2 * 1.8 * (sin(t*1.10)+sin(t*1.73))*0.5;
  float fcH  = min(30.0 + sHs * 24.0, 54.0);

  // ─── Routing FM: Op3 → Op2 → Carriers ─────────────────────────────────────
  //
  // Op3 (sub-modulator, piloté par le bass)
  vec4 op3v = hosc(st, fm3, t * 0.04);
  // Signaux de déplacement centrés autour de 0 ([-0.5, +0.5])
  float s3x = op3v.r - 0.5;
  float s3y = op3v.g - 0.5;

  // β3 = index de modulation de Op3 → piloté par le bass (attaque FM)
  float beta3 = min(1.0, L * 3.5 + sLv * 1.5);

  // Op2: déphasé par Op3 (FM routing Op3 → Op2)
  vec4 op2v = hosc(fract(st + vec2(s3x, s3y) * beta3 * 0.038), fm2, t * 0.07);
  float s2x = op2v.r - 0.5;
  float s2y = op2v.g - 0.5;

  // β2 par bande: index de modulation Op2 → Carriers
  float beta2L  = min(1.0, M1 * 2.5 + sLv  * 0.8);
  float beta2M1 = min(1.0, M1 * 2.2 + sMv1 * 0.7);
  float beta2M2 = min(1.0, M2 * 2.0 + sMv2 * 0.7);
  float beta2H  = min(1.0, Hs * 2.8 + sHs  * 0.6);

  // Carriers: chacun déphasé par Op2 + croisement avec Op3 (2ème ordre)
  // cL  : Op2 pur
  // cM1 : Op2 + cross Op3 (xing)
  // cM2 : Op2 rot90° + cross Op3 rot90° → pattern orthogonal
  // cHi : combinaison fine
  vec4 cL  = hosc(fract(st + vec2(s2x, s2y) * beta2L  * 0.032),
                  fcL,  t * 0.08);
  vec4 cM1 = hosc(fract(st + vec2(s2x, s2y) * beta2M1 * 0.026
                           + vec2(s3x, s3y) * beta3   * 0.014),
                  fcM1, t * 0.12);
  vec4 cM2 = hosc(fract(st + vec2(s2y,-s2x) * beta2M2 * 0.024
                           + vec2(s3y,-s3x) * beta3   * 0.012),
                  fcM2, t * 0.16);
  vec4 cHi = hosc(fract(st + vec2(s2x, s2y) * beta2H  * 0.018
                           + vec2(s3x, s3y) * beta3   * 0.009),
                  fcH,  t * 0.22);

  // ─── Couleurs FM Bell pilotées par l'analyse de pitch ───────────────────────
  float bL  = min(1.0, L  * 4.0);
  float bM1 = min(1.0, M1 * 4.0);
  float bM2 = min(1.0, M2 * 4.0);
  float bHi = min(1.0, Hs * 4.5);

  vec3 pc   = max(u_pitch_color, vec3(0.06));
  vec3 ph   = rgb2hsv(pc);
  float hue = ph.x;
  float sat = max(ph.y, 0.55);
  vec3 cLow  = hsv2rgb(vec3(hue,                                             sat,              1.0));
  vec3 cMid1 = hsv2rgb(vec3(fract(hue + 0.08 + u_mood_tension    * 0.22),   sat,              1.0));
  vec3 cMid2 = hsv2rgb(vec3(fract(hue + 0.33 + u_mood_complexity * 0.15),   min(sat+0.05,1.0), 1.0));
  vec3 cHigh = hsv2rgb(vec3(fract(hue + 0.50 + u_mood_brightness * 0.12),   min(sat+0.12,1.0), 1.0));

  cL  = hcol(cL,  bL  * 2.0 * cLow.r,  bL  * 2.0 * cLow.g,  bL  * 2.0 * cLow.b);
  cM1 = hcol(cM1, bM1 * 2.0 * cMid1.r, bM1 * 2.0 * cMid1.g, bM1 * 2.0 * cMid1.b);
  cM2 = hcol(cM2, bM2 * 2.2 * cMid2.r, bM2 * 2.2 * cMid2.g, bM2 * 2.2 * cMid2.b);
  cHi = hcol(cHi, bHi * 3.0 * cHigh.r, bHi * 3.0 * cHigh.g, bHi * 3.0 * cHigh.b);

  vec4 res = cL;
  res = hadd(res, cM1, min(1.0, M1 * 5.0));
  res = hadd(res, cM2, min(1.0, M2 * 5.0));
  res = hadd(res, cHi, min(1.0, Hs * 6.0));
  res = hsat(res, 2.0);
  res = hcon(res, 1.6);

  // ─── Feedback: sustain + dérive spectrale (decay de cloche) ─────────────────
  float fbA = min(0.50, (L + M1 + M2 + Hs) * 0.22 + 0.07);

  // Zoom léger vers l'intérieur + contre-rotation → expansion + spirale
  vec2 fbUv = (vUv - 0.5) / (zoom * (1.006 + sLv * 0.010)) + 0.5;
  fbUv = rot2d(fbUv - 0.5, -rotA * 0.55) + 0.5;
  // Micro-warp FM sur le feedback (conserve le caractère FM dans le sustain)
  fbUv += vec2(s2x, s2y) * (L + M1) * 0.005;
  // Vagues dans le feedback : basses font slosh, aigus ajoutent texture fine
  fbUv.y += sin(fbUv.x *  3.5 + t * 0.7) * wL  * 0.35
          + sin(fbUv.x * 17.0 + t * 2.2) * wM2 * 0.30
          + sin(fbUv.x * 30.0 + t * 3.5) * wH  * 0.25;
  fbUv  = clamp(fbUv, 0.0, 1.0);

  vec4 fb = texture2D(u_prev, fbUv);
  fb = hcolorama(fb, 0.006 + Hh * 0.028 + L * 0.018);
  fb = hcon(fb, 1.002);
  res = hblend(res, fb, fbA);

  res = hluma(res, 0.09, 0.07);
  res = hbri(res, -0.04);
  vec3 tfm = 1.0 + (u_tint - vec3(1.0)) * 0.25;
  res = hcol(res, tfm.r, tfm.g, tfm.b);

  gl_FragColor = res;
}
`,
}
