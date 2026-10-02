import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2 } from 'three';

const fragment = /* glsl */ `
uniform float uDouble;
uniform float uAberr;
uniform float uBlur;
uniform vec2 uDoubleDir;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;
  if (uDouble > 0.001) {
    vec2 off = uDoubleDir * uDouble * 0.018;
    vec3 a = texture2D(inputBuffer, uv + off).rgb;
    vec3 b = texture2D(inputBuffer, uv - off * 0.6).rgb;
    col = mix(col, (a + b) * 0.5, clamp(uDouble, 0.0, 1.0) * 0.55);
  }
  if (uBlur > 0.001) {
    vec2 t = texelSize * (1.5 + uBlur * 4.0);
    vec3 s = texture2D(inputBuffer, uv + vec2(t.x, 0.0)).rgb + texture2D(inputBuffer, uv - vec2(t.x, 0.0)).rgb
           + texture2D(inputBuffer, uv + vec2(0.0, t.y)).rgb + texture2D(inputBuffer, uv - vec2(0.0, t.y)).rgb;
    col = mix(col, s * 0.25, clamp(uBlur, 0.0, 1.0) * 0.8);
  }
  if (uAberr > 0.001) {
    vec2 dir = (uv - 0.5) * uAberr * 0.014;
    col.r = mix(col.r, texture2D(inputBuffer, uv + dir).r, 0.85);
    col.b = mix(col.b, texture2D(inputBuffer, uv - dir).b, 0.85);
  }
  outputColor = vec4(col, inputColor.a);
}
`;

/** Intoxication / fear distortion that resamples the image: double vision, blur, chromatic aberration. */
export class DrunkEffect extends Effect {
  constructor() {
    super('DrunkEffect', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uDouble', new Uniform(0)],
        ['uAberr', new Uniform(0)],
        ['uBlur', new Uniform(0)],
        ['uDoubleDir', new Uniform(new Vector2(1, 0.2))],
      ]),
    });
  }

  set(params: { double: number; aberr: number; blur: number; dirX: number; dirY: number }): void {
    const u = this.uniforms;
    u.get('uDouble')!.value = params.double;
    u.get('uAberr')!.value = params.aberr;
    u.get('uBlur')!.value = params.blur;
    (u.get('uDoubleDir')!.value as Vector2).set(params.dirX, params.dirY);
  }

  get active(): boolean {
    const u = this.uniforms;
    return (
      (u.get('uDouble')!.value as number) > 0.001 ||
      (u.get('uAberr')!.value as number) > 0.001 ||
      (u.get('uBlur')!.value as number) > 0.001
    );
  }
}

const warpFragment = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform float uWarp;

void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  uv += vec2(sin(uv.y * 5.0 + uTime * 1.27), cos(uv.x * 4.0 + uTime * 0.93)) * 0.0045 * uWobble;
  // slow lens warp at the edges (heavy intoxication / eldritch moments)
  uv += c * dot(c, c) * uWarp * 0.35 * sin(uTime * 0.7);
}
`;

/** UV wobble and lens warp (kept separate: UV transforms cannot share a pass with convolution effects). */
export class WarpEffect extends Effect {
  constructor() {
    super('WarpEffect', warpFragment, {
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uWobble', new Uniform(0)],
        ['uWarp', new Uniform(0)],
      ]),
    });
  }

  set(time: number, wobble: number, warp: number): void {
    this.uniforms.get('uTime')!.value = time;
    this.uniforms.get('uWobble')!.value = wobble;
    this.uniforms.get('uWarp')!.value = warp;
  }
}
