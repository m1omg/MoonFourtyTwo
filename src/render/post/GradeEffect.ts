import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const fragment = /* glsl */ `
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;
uniform float uFade;      // fade to black (0..1)
uniform float uWhite;     // fade to white (0..1)
uniform float uVignette;  // extra vignette (fear / cold)
uniform float uGrain;
uniform float uTime;
uniform vec3 uTint;
uniform float uFrost;     // cold overlay

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Film grain from an integer hash of the pixel and the frame (pcg3d). The sine hash above, fed
// with screen coordinates, turns into bands and moiré on GPUs with less precise sin().
float grainNoise(vec2 fragCoord, float t) {
  uvec3 v = uvec3(uvec2(max(fragCoord, vec2(0.0))), uint(t * 24.0));
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float(v.x) * (1.0 / 4294967296.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c = pow(max(c * uGain + uLift * (1.0 - c), 0.0), 1.0 / max(uGamma, vec3(0.01)));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  c *= uTint;
  vec2 d = uv - 0.5;
  float v = smoothstep(0.85, 0.15, length(d) * (1.0 + uVignette * 1.4));
  c *= mix(1.0, v, clamp(0.35 + uVignette, 0.0, 1.0));
  if (uFrost > 0.001) {
    float edge = smoothstep(0.25, 0.75, length(d * vec2(1.2, 1.0)));
    float n = hash(floor(uv * 180.0)) * 0.5 + 0.5;
    c = mix(c, vec3(0.82, 0.9, 1.0) * n, edge * uFrost * 0.75);
  }
  // grain is even to the eye: added on a perceptual (square-root) scale, so the darks do not drown
  // in it while the lights still show it
  float g = grainNoise(gl_FragCoord.xy, uTime) - 0.5;
  vec3 pc = sqrt(max(c, 0.0)) + g * uGrain;
  c = pc * max(pc, 0.0);
  c = mix(c, vec3(0.0), uFade);
  c = mix(c, vec3(1.0), uWhite);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}
`;

export interface GradeParams {
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  tint: [number, number, number];
  grain: number;
}

export const NEUTRAL_GRADE: GradeParams = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  saturation: 1,
  contrast: 1,
  tint: [1, 1, 1],
  grain: 0.018,
};

/** Per-reality colour grading plus fades, fear vignette, frost and film grain (runs after tone mapping). */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['uLift', new Uniform(new Vector3())],
        ['uGamma', new Uniform(new Vector3(1, 1, 1))],
        ['uGain', new Uniform(new Vector3(1, 1, 1))],
        ['uSaturation', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uFade', new Uniform(0)],
        ['uWhite', new Uniform(0)],
        ['uVignette', new Uniform(0)],
        ['uGrain', new Uniform(0.018)],
        ['uTime', new Uniform(0)],
        ['uTint', new Uniform(new Vector3(1, 1, 1))],
        ['uFrost', new Uniform(0)],
      ]),
    });
  }

  setGrade(g: GradeParams): void {
    const u = this.uniforms;
    (u.get('uLift')!.value as Vector3).fromArray(g.lift);
    (u.get('uGamma')!.value as Vector3).fromArray(g.gamma);
    (u.get('uGain')!.value as Vector3).fromArray(g.gain);
    (u.get('uTint')!.value as Vector3).fromArray(g.tint);
    u.get('uSaturation')!.value = g.saturation;
    u.get('uContrast')!.value = g.contrast;
    u.get('uGrain')!.value = g.grain;
  }

  setDynamic(p: {
    time: number;
    fade: number;
    white: number;
    vignette: number;
    frost: number;
    desat: number;
    baseSaturation: number;
  }): void {
    const u = this.uniforms;
    u.get('uTime')!.value = p.time;
    u.get('uFade')!.value = p.fade;
    u.get('uWhite')!.value = p.white;
    u.get('uVignette')!.value = p.vignette;
    u.get('uFrost')!.value = p.frost;
    u.get('uSaturation')!.value = p.baseSaturation * (1 - p.desat);
  }
}
