import{Et as e,Ht as t,Jn as n,Sr as r}from"./damp-DRkTPq9s.js";import{t as i,u as a}from"./ScriptRunner-Buh4VT3J.js";import{f as o,p as s}from"./index-Vp3OuTf2.js";import{n as c,t as l}from"./credits-C5GhMDMn.js";import{n as u,t as d}from"./voice-88Cl0Ert.js";var f=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,p=`
uniform float uT;
uniform float uAspect;
uniform float uAlpha;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
vec3 stars(vec2 p, float density, float bright, vec3 tint) {
  vec2 c = floor(p * density);
  vec2 f = fract(p * density) - 0.5;
  float h = hash(c);
  vec2 o = vec2(hash(c + 1.7), hash(c + 3.1)) - 0.5;
  float d = length(f - o * 0.7);
  float s = smoothstep(0.08, 0.0, d) * step(0.62, h) * (h - 0.62) * 2.6;
  return tint * s * bright;
}
float band(float t, float a, float b, float c, float d) {
  return smoothstep(a, b, t) * (1.0 - smoothstep(c, d, t));
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uT;
  vec3 col = vec3(0.0);

  // the cold, infinite universe: a few dim, reddened points, still drifting apart
  float s1 = band(t, 0.0, 1.5, 5.0, 6.5);
  col += s1 * stars(uv / (1.0 + t * 0.15), 16.0, 0.6, vec3(0.65, 0.3, 0.25));

  // nothing left to measure it by: the cold vastness is the hot beginning — plasma
  float heat = smoothstep(5.0, 11.0, t);
  float s2 = band(t, 5.0, 8.0, 11.0, 12.5);
  vec2 q = uv * (3.0 - heat * 1.5);
  float n = fbm(q * 2.0 + vec2(t * 0.4, -t * 0.3));
  float m = fbm(q * 5.0 - vec2(t * 0.6, t * 0.2));
  vec3 plasma = mix(vec3(0.45, 0.04, 0.0), vec3(0.95, 0.42, 0.08), n) + vec3(1.0, 0.75, 0.45) * pow(m, 4.0) * heat;
  col = mix(col, plasma * (0.3 + 0.75 * heat), s2);

  // the first light
  col += vec3(1.0, 0.95, 0.9) * band(t, 11.5, 12.0, 12.0, 13.5) * 1.5;

  // the glow fades, the first stars ignite
  float s4 = band(t, 12.5, 14.0, 19.0, 20.5);
  vec3 early = vec3(0.6, 0.3, 0.2) * (1.0 - smoothstep(13.0, 17.0, t)) * 0.25 * fbm(uv * 6.0)
    + stars(uv, 30.0, smoothstep(14.0, 18.0, t) * 1.5, vec3(0.8, 0.9, 1.0))
    + stars(uv + 3.3, 55.0, smoothstep(15.0, 19.0, t), vec3(1.0, 0.95, 0.85));
  col = mix(col, early, s4);

  // a galaxy turns, and we fall into it
  float s5 = band(t, 19.0, 21.0, 27.0, 28.5);
  float zoom = exp((t - 19.0) * 0.18);
  vec2 g = uv / zoom * 2.4;
  float r = length(g);
  float an = atan(g.y, g.x) + t * 0.08;
  float arms = 0.5 + 0.5 * cos(2.0 * (an - log(r + 1e-3) * 2.6));
  vec3 galaxy = vec3(0.75, 0.8, 1.0) * pow(arms, 3.0) * exp(-r * 1.6) * (0.6 + 0.8 * fbm(g * 4.0))
    + vec3(1.0, 0.85, 0.6) * exp(-r * r * 18.0) * 1.5
    + stars(uv, 40.0, 0.4, vec3(0.9));
  col = mix(col, galaxy * 1.2, s5);

  // one yellow star grows out of an arm: the Sun
  float s6 = band(t, 27.5, 29.0, 32.5, 34.0);
  float rad = 0.02 + max(t - 27.5, 0.0) * 0.035;
  float ds = length(uv - vec2(0.15, 0.05) * (1.0 - smoothstep(28.0, 33.0, t)));
  vec3 sun = vec3(1.0, 0.85, 0.5) * smoothstep(rad, rad * 0.85, ds) + vec3(1.0, 0.6, 0.25) * exp(-max(ds - rad, 0.0) * 9.0) * 0.6;
  col = mix(col, sun + stars(uv, 40.0, 0.4, vec3(0.9)), s6);

  // the Earth at night: a dark sphere, a thin blue rim, the lights of towns
  float s7 = band(t, 33.0, 34.5, 39.0, 40.5);
  float R = 0.25 + max(t - 33.0, 0.0) * 0.07;
  vec2 e = (uv - vec2(0.0, -0.05)) / R;
  float de = length(e);
  vec3 earth = vec3(0.0);
  if (de < 1.0) {
    vec3 nrm = vec3(e, sqrt(1.0 - de * de));
    vec2 sp = vec2(atan(nrm.x, nrm.z) + t * 0.05, asin(nrm.y)) * 6.0;
    float land = smoothstep(0.45, 0.55, fbm(sp * 0.8));
    float lights = land * step(0.94, hash(floor(sp * 14.0))) * smoothstep(0.3, 1.0, nrm.z) * smoothstep(0.1, -0.4, nrm.x);
    earth = vec3(0.01, 0.02, 0.05) + land * vec3(0.02, 0.025, 0.02) + vec3(1.0, 0.75, 0.4) * lights * 1.6;
  }
  earth += vec3(0.3, 0.5, 1.0) * smoothstep(0.06, 0.0, abs(de - 1.0)) * 0.5;
  earth += stars(uv, 40.0, 0.3, vec3(0.9)) * step(1.03, de);
  col = mix(col, earth, s7);

  // down into one warm light on it
  float s8 = smoothstep(39.0, 41.0, t);
  float dw = length(uv);
  col = mix(col, vec3(1.0, 0.8, 0.5) * exp(-dw * dw * max(30.0 - (t - 39.0) * 5.0, 0.5)) * 2.0, s8);

  // out of white at the start
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, 2.2, t));
  gl_FragColor = vec4(col, uAlpha);
}
`;function m(r){let i=r.add(new n({uniforms:{uT:{value:0},uAspect:{value:16/9},uAlpha:{value:1}},vertexShader:f,fragmentShader:p,depthTest:!1,depthWrite:!1,transparent:!0})),a=new e(r.add(new t(2,2)),i);return a.frustumCulled=!1,a.renderOrder=1e4,{mesh:a,material:i,update(e,t){i.uniforms.uT.value=e,i.uniforms.uAspect.value=t,i.uniforms.uAlpha.value=1-Math.min(1,Math.max(0,(e-43)/3)),a.visible=e<46}}}var h={t_town:{who:null,text:`Mestečko. Skorá jeseň. Na dlažbe gaštany, z okien krčmy svetlo.`},t_sign:{who:null,text:`Nad dverami drevené koleso. U Kolesa.`},v12_1:{who:`Vierka`,text:`Čo si dáte?`},e12_1:{who:`Ežo`,text:`No konečne. Ešte jedno?`,laugh:!0,min:3}},g={id:`r12`,index:12,title:`Svetlo`,async create(e){let{game:t,scene:n,scope:f}=e,p=await c(e,{outdoor:!0});await d(),t.nav=p.nav;let g=async e=>{let n=h[e],r=n.who===`Ežo`?p.ezo:n.who===`Vierka`?p.vierka:null;r?.setTalking(!0),n.laugh&&r?.laugh();try{await t.say(n.who,n.text,u(e),n.min)}finally{r?.setTalking(!1)}};p.windowFigure.visible=!1,p.tvFigure.visible=!1,p.glyph.visible=!1,p.ourMat.draw(0);let _=new o(t.audio);f.onDispose(()=>_.stop());let v=m(f);n.add(v.mesh);let y={phase:`film`,t:0,seated:!1,townSaid:!1},b=e=>{e instanceof i||console.error(e)},x=[];f.onDispose(()=>x.forEach(e=>e()));let S=t.interactions;S.add({id:`frontDoor`,pos:new r(-4.2,1.05,4.5),radius:.45,prompt:()=>p.frontDoor.isOpen?`Zavrieť`:`Otvoriť`,enabled:()=>y.phase===`walk`||y.phase===`inside`,onUse:()=>{p.frontDoor.isOpen?p.frontDoor.close():p.frontDoor.open(95)}}),S.add({id:`seat`,pos:new r(3,.6,2.5),radius:.35,prompt:`Sadnúť si`,enabled:()=>y.phase===`inside`,onUse:()=>void C().catch(b)});let C=async()=>{y.phase=`seated`,t.seated=!0,t.seatedWithDrink=!0,t.player.teleport(p.playerSeat.pos,t.player.yaw),t.player.forcedHeight=1.28,t.rig.setOrientation(p.playerSeat.yaw,-.12),t.player.frozen=!0,await t.clock.wait(1),p.ezo?.startDrink(),await t.clock.wait(.8),t.synth.clink(p.ezoMug.getWorldPosition(new r),1),await t.clock.wait(1.4),p.ezo?.stopDrink(),y.phase=`end`,t.input.setEnabled(!1),await t.tweenFx(`fade`,1,2.5),x.forEach(e=>e()),x.length=0,_.play(s.esteJedno,void 0,.4),await t.ui.showEndingText([`EŠTE JEDNO`],5e3),await t.ui.showCredits(l),_.stop(),p.ourMat.draw(1),t.rig.lockTarget={yaw:Math.PI,pitch:-.55},await t.tweenFx(`fade`,0,2),await t.clock.wait(5),await t.tweenFx(`fade`,1,2),t.rig.lockTarget=null,await t.titleScreen()};return{defaultCheckpoint:`town`,checkpoints:{town:{pos:new r(-4.2,0,9.5),yaw:0,pitch:.12},square:{pos:new r(-4.2,0,9.5),yaw:0,pitch:.12}},start(e){a(t,f,`r12`,new r(5.7,2,.95)),t.fx.white=0;let n=async()=>{x.forEach(e=>e()),x.length=0,x.push(t.synth.loopNoise({kind:`white`,type:`bandpass`,freq:650,q:.4,volume:.02})),_.play(s.esteJedno,new r(5.4,1,.8),.25),y.phase=`walk`,t.player.frozen=!1,t.saveCheckpoint(`square`),await t.clock.wait(1.5),await g(`t_town`),await t.clock.wait(.6),await g(`t_sign`),y.townSaid=!0};if(e===`square`){y.t=46,n().catch(b);return}t.player.frozen=!0,x.push(t.synth.drone({freqs:[55,82.5,110],cutoff:900,volume:.04})),(async()=>{await t.clock.wait(11.8),t.synth.chime(void 0,[1760,2637],.2),await t.clock.wait(34.2),await n()})().catch(b)},tick(e){y.t+=e,p.frontDoor.step(e),p.wcDoor.step(e);let n=t.player.pos;y.phase===`walk`&&n.z<4.1&&n.z>-4.4&&Math.abs(n.x)<6&&(y.phase=`inside`,(async()=>{await t.clock.until(()=>y.townSaid,12),await t.clock.wait(.6),await g(`v12_1`),await t.clock.wait(.8),await g(`e12_1`)})().catch(b))},frame(e,n,r){let i=t.renderer.camera;v.update(y.t,i.aspect),p.tv.update(r),p.clock.update(r,()=>t.rng.next());for(let t of[p.ezo,p.vierka])t&&(t.lookTarget=y.phase===`inside`||y.phase===`seated`?i.position:null,t.update(e,r))},darkness:()=>0,visibility:()=>.8,threat:()=>0}}};export{g as default};