import type { GlslPatch } from './types'

// GLSL translation of roseaceRondePatch
// Logo SVG chargé comme texture u_logo (blanc sur noir)
// Déformation audio multi-bandes, feedback fractal, kaleid(7), scale(0.3)
export const roseaceRondePatch: GlslPatch = {
  logoUrl: '/logorondewob.svg',
  fragSrc: `
precision highp float;

varying vec2 vUv;
uniform sampler2D u_prev;
uniform sampler2D u_logo;

uniform float u_Lv;
uniform float u_Mv1;
uniform float u_Mv2;
uniform float u_Hv;
uniform float u_energy;
uniform vec3  u_tint;
uniform float u_time;

#define PI 6.2831853

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

// osc avec sync (animation temporelle du warp)
vec4 hoscS(vec2 st, float freq, float sync, float ph, float t) {
  float f = max(freq, 0.001);
  float base = st.x - ph / f - t * sync;
  return vec4(sin(base*f)*0.5+0.5, sin((base+1./3.)*f)*0.5+0.5, sin((base+2./3.)*f)*0.5+0.5, 1.0);
}
vec4 hcol(vec4 c, float r, float g, float b) { return vec4(c.r*r, c.g*g, c.b*b, c.a); }
vec4 hcon(vec4 c, float a) { return clamp((c - 0.5) * a + 0.5, 0.0, 1.0); }
vec4 hbri(vec4 c, float a) { return vec4(c.rgb + a, c.a); }
vec4 hadd(vec4 c0, vec4 c1, float a) { return clamp(c0 + c1 * a, 0.0, 1.0); }
vec4 hblend(vec4 c0, vec4 c1, float a) { return c0 * (1.0 - a) + c1 * a; }

// Kaleidoscope n-fold
vec2 kaleid(vec2 uv, float n) {
  vec2 p = uv - 0.5;
  float r = length(p);
  float theta = atan(p.y, p.x);
  float seg = PI / n;
  theta = mod(theta, seg);
  if (theta > seg * 0.5) theta = seg - theta;
  return vec2(cos(theta), sin(theta)) * r + 0.5;
}

void main() {
  float L  = u_Lv, M1 = u_Mv1, M2 = u_Mv2, Hs = u_Hv;
  float E  = u_energy;
  bool  live = E > 0.05;
  float FB_G = live ? pow((E - 0.05) / 0.95, 1.1) : 0.0;
  float PHI = 1.6180339887;

  // On travaille dans l'espace kaleid — kaleid(7) puis scale(0.3)
  // Ordre inverse pour UV: scale(0.3) → (vUv-0.5)/0.3+0.5 (zoom out), kaleid(7)
  // scale(0.3) donne la vue "miniaturisée" de la rosace
  vec2 stK = (vUv - 0.5) / 0.3 + 0.5;   // scale(0.3) inverse → zoom out
  stK = kaleid(stK, 7.0);                 // kaleid(7)

  // Sur l'UV kaleidoscopé, on applique les warps audio pour lire le logo
  // warpL — basses : grandes ondulations
  float warpLAmt = 0.04 + L * 0.18;
  vec2 wL = vec2(hn(stK, 2.0 + L * 10.0, u_time * 1.2),
                  hn(stK, 2.0 + L * 10.0, u_time * 1.2 + 5.7)) * warpLAmt;

  // warpM — médiums : fréquence intermédiaire
  float warpMAmt = 0.02 + M1 * 0.10;
  float angM = u_time * 0.22;
  vec2 wM = vec2(hn(stK, 5.0 + (M1 + M2) * 20.0, u_time * 2.2 + L * 3.14),
                  hn(stK, 5.0 + (M1 + M2) * 20.0, u_time * 2.2 + L * 3.14 + 8.3)) * warpMAmt;
  // rotation de wM
  float cmA = cos(angM), smA = sin(angM);
  wM = vec2(wM.x * cmA - wM.y * smA, wM.x * smA + wM.y * cmA);

  // warpH — aigus : haute fréquence
  float warpHAmt = 0.005 + Hs * 0.07;
  float angH = u_time * 0.58;
  vec2 wH = vec2(hn(stK, 12.0 + Hs * 65.0, u_time * 5.5 + M2 * 3.14 * PHI),
                  hn(stK, 12.0 + Hs * 65.0, u_time * 5.5 + M2 * 3.14 * PHI + 6.1)) * warpHAmt;
  float chA = cos(angH), shA = sin(angH);
  wH = vec2(wH.x * chA - wH.y * shA, wH.x * shA + wH.y * chA);

  // UV du logo (avec scroll et scale réactifs)
  float scale = 1.4 + E * 0.15;
  vec2 logoUv = stK;
  logoUv = (logoUv - 0.5) / scale + 0.5;
  logoUv.x += (L - M2) * 0.12;
  logoUv.y += (M1 - Hs) * 0.10;
  logoUv += wL + wM + wH;
  logoUv = fract(logoUv);

  // Lecture logo (grayscale, forcé saturate(0))
  vec4 logoSample = texture2D(u_logo, logoUv);
  float luma = dot(logoSample.rgb, vec3(0.299, 0.587, 0.114));
  vec4 logo = vec4(vec3(luma), 1.0);

  // Contraste et brightness réactifs
  logo = hcon(logo, 2.5 + L * 2.0 + Hs * 4.0);
  logo = hbri(logo, -0.12 + L * 0.22);

  // Feedback fractal (warped, decay lent)
  // feedback sur l'UV kaleidoscopé + warpL + warpH
  vec2 fbSt = stK;
  fbSt = (fbSt - 0.5) * (1.0 - L * 0.025) + 0.5;      // scale(1 - L*0.025)
  // rotate feedback
  float rotFb = (M1 - L) * 0.018 * FB_G;
  float crFb = cos(rotFb), srFb = sin(rotFb);
  fbSt -= 0.5;
  fbSt = vec2(fbSt.x * crFb - fbSt.y * srFb, fbSt.x * srFb + fbSt.y * crFb);
  fbSt += 0.5;
  // warp feedback
  fbSt += vec2(hn(fbSt, 2.0 + L * 10.0, u_time * 1.2),
                hn(fbSt, 2.0 + L * 10.0, u_time * 1.2 + 5.7))
          * (0.004 + L * 0.012) * FB_G;
  fbSt += vec2(hn(fbSt, 12.0 + Hs * 65.0, u_time * 5.5 + M2 * PHI * 3.14),
                hn(fbSt, 12.0 + Hs * 65.0, u_time * 5.5 + M2 * PHI * 3.14 + 6.1))
          * (0.002 + Hs * 0.016) * FB_G;
  fbSt = clamp(fbSt, 0.0, 1.0);

  // Pour lire le feedback, on reconstruit l'UV de sortie correspondant à fbSt dans l'espace kaleid
  // (approx: on lit u_prev directement à l'UV de rendu précédent)
  vec4 fb = texture2D(u_prev, vUv);
  float fbLuma = dot(fb.rgb, vec3(0.299, 0.587, 0.114));
  fb = vec4(vec3(fbLuma), 1.0);
  fb = hbri(fb, -0.011);

  // Combinaison logo + feedback
  float fbBlend = live ? min(0.95, 0.22 + L * 0.18 * FB_G) : 0.10;

  vec4 res = hadd(logo, fb, fbBlend);
  res = hcon(res, 1.05 + L * 0.25 + Hs * 0.45);

  // luma gate (retire les zones trop sombres)
  float lumaThresh = 0.08 + Hs * 0.10;
  float lumaMask = dot(res.rgb, vec3(0.299, 0.587, 0.114));
  res *= smoothstep(lumaThresh - 0.04, lumaThresh + 0.04, lumaMask);

  res = hcol(res, u_tint.r, u_tint.g, u_tint.b);
  gl_FragColor = res;
}
`,
}
