import * as THREE from 'three'
import { clock, isVerifier, lastSignal, LIVE_WINDOW_MIN, ms, type AgentStats } from '../data/model'
import type { ActivityEvent, GraphState } from '../data/types'
import { MAX_TASKS } from './world'

/**
 * Per-frame values shared between scene components without React re-renders.
 * The Rig writes; everything else reads inside useFrame.
 */
export const live = {
  assemble: 0,
  time: 0,
  mouse: new THREE.Vector3(0, -999, 0),
  mouseR: 1.8,
  mouseOn: 0,
  focusTask: -1,
  focusAgent: -1,
  focusMix: 0,
  status: new Float32Array(MAX_TASKS),
  progress: new Float32Array(MAX_TASKS),
  visible: new Float32Array(MAX_TASKS).fill(1),
  fresh: new Float32Array(MAX_TASKS),
  agentGlow: new Float32Array(9),
  /** Tasks with a session really on them right now (status running and a recent step). */
  working: 0,
  motion: 1,
  fps: 0,
  idle: 0,
  /** Panel sizes the DOM reports, so the camera can centre the subject between them. */
  ui: { railW: 0, inspW: 0, sheetH: 0 },
}

export const PALETTE = {
  ground: new THREE.Color('#0a0524'),
  idle: new THREE.Color('#180a3a'),
  active: new THREE.Color('#2bf0ff'),
  violet: new THREE.Color('#7a3cff'),
  mote: new THREE.Color('#8fe6ff'),
  rose: new THREE.Color('#ff4d7a'),
  glass: new THREE.Color('#1a1147'),
}

/** Scene-only status code: the graph says running but nothing was recorded lately, so no session is on it. */
export const STALLED = 6
/** Status code → tower colour (pending, ready, working, done, needs founder, blocked, stalled). */
export const STATUS_COLOR = ['#6b5bb8', '#2bf0ff', '#ffb547', '#2bf0ff', '#a77bff', '#ff4d7a', '#8a7d6c']

/** The agent's task is live only because the independent verifier is on it: the agent itself has gone quiet. */
export function verifying(a: AgentStats, data: GraphState, at: number) {
  if (!a.running || (a.lastStep !== null && at - a.lastStep <= LIVE_WINDOW_MIN * 60_000)) return false
  let last: ActivityEvent | null = null
  for (const e of data.activity?.[a.running.id] ?? []) if (ms(e.t) <= at && (!last || ms(e.t) >= ms(last.t))) last = e
  return !!last && isVerifier(last)
}

/** One wording for what an agent is doing, for tags and labels: "working on V03", "stalled since 19:37 — no session". */
export function agentState(a: AgentStats, data: GraphState, at: number, long = false) {
  if (a.running) return verifying(a, data, at) ? `verifier checking ${a.running.id}` : `working on ${a.running.id}`
  if (a.stalled) {
    const t = lastSignal(data, a.stalled.id, at)
    return `${long ? `${a.stalled.id} ` : ''}stalled${t ? ` since ${clock(t).slice(0, 5)}` : ''} — no session${long ? ' running' : ''}`
  }
  if (a.waiting) return 'needs the founder'
  return a.lastStep ? `idle since ${clock(a.lastStep).slice(0, 5)}` : 'not started'
}

export const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`
