precision highp float;
uniform vec2 uRes;
uniform vec2 uFrame;   // x = focal length, y = vertical recentre

// ── SDF primitives ────────────────────────────────────────────────────────
float sdSph(vec3 p, float r){ return length(p)-r; }
float sdBox(vec3 p, vec3 b, float r){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r; }
float sdCyl(vec3 p, float h, float r){ vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h); return min(max(d.x,d.y),0.)+length(max(d,0.)); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
float smin(float a,float b,float k){ float h=clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
float smax(float a,float b,float k){ return -smin(-a,-b,k); }

// material id carried alongside distance
vec2 opU(vec2 a, vec2 b){ return a.x<b.x?a:b; }

// ── the robot bust ────────────────────────────────────────────────────────
vec2 map(vec3 p){
  vec3 q = p;

  // CRANIUM — elongated helmet dome
  vec3 hp = q - vec3(0.,1.34,0.);
  float cran = sdSph(hp*vec3(1.,0.86,0.92), 0.40)/0.86;
  // flatten the back of the skull
  cran = smax(cran, -(hp.z+0.44), 0.06);

  // FACE PLATE — angled slab set into the front
  vec3 fp = hp - vec3(0.,-0.03,0.30);
  fp.yz = mat2(0.966,-0.259,0.259,0.966)*fp.yz;      // tilt forward 15deg
  float face = sdBox(fp, vec3(0.20,0.20,0.055), 0.035);

  // BROW / VISOR recess
  vec3 vp = hp - vec3(0.,0.05,0.36);
  float visor = sdBox(vp, vec3(0.205,0.028,0.055), 0.012);

  // JAW — narrower wedge below
  vec3 jp = hp - vec3(0.,-0.30,0.20);
  float jaw = sdBox(jp*vec3(1.,1.,1.), vec3(0.155,0.10,0.135), 0.045);

  float head = smin(cran, face, 0.05);
  head = smin(head, jaw, 0.07);

  // cheek vents — three grooves cut into the side
  float vent = 1e9;
  for(int i=0;i<3;i++){
    float fi = float(i);
    vec3 cp = hp - vec3(0., -0.10 - fi*0.075, 0.14);
    vent = min(vent, sdBox(vec3(abs(cp.x)-0.235, cp.y, cp.z), vec3(0.05,0.016,0.13), 0.008));
  }
  head = smax(head, -vent, 0.012);
  // seam down the crown
  head = smax(head, -sdBox(hp-vec3(0.,0.30,0.05), vec3(0.016,0.14,0.34), 0.004), 0.01);

  vec2 res = vec2(head, 1.0);
  res = opU(res, vec2(visor, 2.0));                   // emissive visor

  // NECK — column with two collars
  float neck = sdCyl(q-vec3(0.,0.87,0.02), 0.17, 0.135);
  neck = smin(neck, sdCyl(q-vec3(0.,0.79,0.02), 0.02, 0.175), 0.03);
  neck = smin(neck, sdCyl(q-vec3(0.,0.98,0.02), 0.02, 0.16), 0.03);
  res = opU(res, vec2(neck, 3.0));

  // SHOULDERS + CHEST — the bust base
  vec3 tp = q - vec3(0.,0.30,0.);
  float torso = sdBox(tp*vec3(1.,1.,1.25), vec3(0.42,0.42,0.30), 0.085)/1.0;
  // clavicle scoop
  torso = smax(torso, -sdSph(q-vec3(0.,0.86,0.30), 0.30), 0.09);
  res = opU(res, vec2(torso, 1.0));

  // shoulder pauldrons — angular plates, not spheres
  for(float s=-1.; s<=1.; s+=2.){
    vec3 sp = q - vec3(s*0.52, 0.60, 0.);
    sp.xy = mat2(0.94, -0.34*s, 0.34*s, 0.94)*sp.xy;      // cant outward
    float pad = sdBox(sp, vec3(0.15,0.115,0.20), 0.055);
    pad = smax(pad, -sdBox(sp-vec3(0.,0.02,0.), vec3(0.20,0.008,0.22), 0.002), 0.01);
    res = opU(res, vec2(pad, 1.0));
  }

  // CHEST CORE — emissive ring
  vec3 cq = (q-vec3(0.,0.44,0.345)).xzy;
  float core = max(sdCyl(cq, 0.028, 0.088), -sdCyl(cq, 0.06, 0.052));   // ring
  res = opU(res, vec2(core, 2.0));

  // machined panel lines — what stops it reading as a smooth toy
  float seams = 1e9;
  seams = min(seams, sdBox(q-vec3(0.,0.30,0.40), vec3(0.34,0.0035,0.12), 0.0015));
  seams = min(seams, sdBox(q-vec3(0.,0.13,0.40), vec3(0.30,0.0035,0.12), 0.0015));
  seams = min(seams, sdBox(vec3(abs(q.x)-0.26, q.y-0.34, q.z-0.34), vec3(0.0035,0.20,0.14), 0.0015));
  seams = min(seams, sdBox(hp-vec3(0.,-0.02,0.36), vec3(0.19,0.0035,0.06), 0.0015));
  res.x = smax(res.x, -seams, 0.006);

  return res;
}

vec3 nrm(vec3 p){
  vec2 e = vec2(0.0015,0.);
  return normalize(vec3(
    map(p+e.xyy).x-map(p-e.xyy).x,
    map(p+e.yxy).x-map(p-e.yxy).x,
    map(p+e.yyx).x-map(p-e.yyx).x));
}

float shadow(vec3 ro, vec3 rd){
  float res=1., t=0.03;
  for(int i=0;i<28;i++){
    float h=map(ro+rd*t).x;
    if(h<0.001) return 0.0;
    res=min(res,10.*h/t); t+=clamp(h,0.01,0.14);
    if(t>3.) break;
  }
  return clamp(res,0.,1.);
}

float ao(vec3 p, vec3 n){
  float o=0., s=1.;
  for(int i=0;i<5;i++){
    float h=0.02+0.11*float(i);
    o += (h-map(p+n*h).x)*s; s*=0.72;
  }
  return clamp(1.-1.4*o,0.,1.);
}

// ── lighting rig ──────────────────────────────────────────────────────────
// Three lights, as a product photographer would set them: a key high and to
// the subject's left, a teal rim raking the near edge, and a dim cool fill so
// the shadow side does not go to pure black.
const vec3 KEY  = vec3(-0.62, 0.62,  0.37);   // normalized below
const vec3 RIM  = vec3( 0.78, 0.20, -0.60);
const vec3 FILL = vec3( 0.36,-0.30,  0.88);

/* GGX specular. A single pow() lobe gives plastic; a microfacet lobe with a
   real Fresnel term is what makes machined metal read as metal. */
float ggx(vec3 n, vec3 v, vec3 l, float rough){
  vec3 h = normalize(v+l);
  float a = rough*rough;
  float ndh = max(dot(n,h),0.), ndv = max(dot(n,v),1e-4), ndl = max(dot(n,l),0.);
  float d = a*a / max(3.14159*pow(ndh*ndh*(a*a-1.)+1., 2.), 1e-6);
  float k = a*0.5;
  float g = (ndl/(ndl*(1.-k)+k)) * (ndv/(ndv*(1.-k)+k));
  return d*g*ndl;
}

vec3 shade(vec3 ro, vec3 rd, float t, vec2 h, out bool hit){
  hit = h.x < 0.0012;

  /* Studio backdrop: a soft pool of light behind the subject, not a flat fill.
     It resolves to PAGE_BG at the frame edges — see the note at the bottom of
     main(). */
  vec2 uv = vec2(dot(rd, normalize(cross(vec3(0.,1.,0.), normalize(-ro)))), rd.y);
  vec3 col;
  {
    float bg = 1.0 - smoothstep(0.0, 1.05, length((uv - vec2(0.02,0.10))*vec2(1.0,1.30)));
    col = mix(vec3(0.0000,0.0002,0.0008), vec3(0.030,0.036,0.046), pow(bg,2.4));
  }
  if(!hit) return col;

  vec3 p = ro+rd*t, n = nrm(p), v = -rd;
  float mid = h.y;

  vec3 kl = normalize(KEY), rl = normalize(RIM), fl = normalize(FILL);
  float sh  = shadow(p,kl);
  float dif = max(dot(n,kl),0.) * sh;
  float occ = ao(p,n);

  /* Rim. Two gates, both necessary:
       fresnel  — confines it to the silhouette, where a rim light actually is
       dot(n,rl)— confines it to the side the rim light is on
     Without the second gate this term behaves like a diffuse light and floods
     whole faces teal; without the first it wraps around the form. Exponent 13
     is tight enough that the band stays a few pixels wide at this framing. */
  float fre  = pow(1.0 - max(dot(n,v),0.), 13.0);
  float rim  = fre * smoothstep(0.05, 0.75, dot(n,rl)) * shadow(p,rl);
  float rim2 = pow(1.0 - max(dot(n,v),0.), 9.0)
             * smoothstep(0.20, 0.95, dot(n, normalize(vec3(-0.80,0.18,-0.57))));

  // hemisphere ambient — sky above, cold floor bounce below
  vec3 amb = mix(vec3(0.014,0.016,0.020), vec3(0.048,0.056,0.070), n.y*0.5+0.5) * occ;
  float fil = max(dot(n,fl),0.) * 0.5 + 0.5*max(dot(n,fl),0.);

  if(mid < 1.5){
    // gunmetal: dark, but light enough to hold form. Two specular lobes —
    // a tight one for the polished bevels, a broad one for the brushed faces.
    /* Backdrop duty changes the exposure brief: this sits BEHIND body copy, so
       the body stays in the lower third of the range and only the bevels and
       the rim are allowed to reach for the highlights. A correctly exposed
       product shot here would eat the text. */
    vec3 base = vec3(0.030,0.034,0.041);
    col  = base * (0.30 + 0.95*dif) * occ;
    col += base * amb * 3.4;
    col += vec3(0.62,0.70,0.84) * ggx(n,v,kl,0.13) * 0.85 * sh;   // tight bevel hit
    col += vec3(0.16,0.20,0.27) * ggx(n,v,kl,0.42) * 0.30 * sh;   // broad sheen
    col += vec3(0.09,0.55,0.49) * ggx(n,v,rl,0.28) * 1.10;
    col += vec3(0.16,0.98,0.84) * rim  * 4.6;      // teal edge light, house color
    col += vec3(0.30,0.40,0.58) * rim2 * 1.0;      // cool kicker, opposite edge
    col += vec3(0.022,0.030,0.042) * fil * occ;
  } else if(mid < 2.5){
    // emissive visor / chest core — blown out on purpose; the bake adds bloom
    col  = vec3(0.13,1.05,0.90);
    col += vec3(0.5,1.0,0.95) * ggx(n,v,kl,0.2) * 0.6;
  } else {
    // neck: recessed, rougher, deliberately darker so the head separates
    vec3 base = vec3(0.014,0.016,0.020);
    col  = base * (0.25 + 0.7*dif) * occ;
    col += base * amb * 2.6;
    col += vec3(0.20,0.24,0.31) * ggx(n,v,kl,0.40) * 0.35 * sh;
    col += vec3(0.12,0.72,0.63) * rim * 2.4;
  }

  // depth fade so the bust sinks into the dark rather than being cut out
  col *= 1.0 - smoothstep(3.4, 6.2, t)*0.9;
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;

  // three-quarter view, slightly above the eyeline
  vec3 ro = vec3(1.95, 1.72, 3.55);
  vec3 ta = vec3(0.00, 0.86 + uFrame.y, 0.0);
  vec3 fw = normalize(ta-ro), rt = normalize(cross(vec3(0.,1.,0.),fw)), up = cross(fw,rt);
  vec3 rd = normalize(uv.x*rt + uv.y*up + uFrame.x*fw);

  float t=0.; vec2 h = vec2(1e9,0.);
  for(int i=0;i<128;i++){
    h = map(ro+rd*t);
    if(h.x<0.0012) break;
    t += h.x*0.85;
    if(t>7.) { h.x = 1e9; break; }
  }

  bool hit;
  vec3 col = shade(ro, rd, t, h, hit);

  // vignette, filmic curve, gamma, and a whisper of grain to kill JPEG banding
  col *= 1.0 - 0.62*smoothstep(0.34, 1.20, length(uv*vec2(0.86,1.0)));
  col = col/(col+0.62);
  col = pow(col, vec3(0.4545));

  /* Resolve the frame edges to the page's exact background colour.

     This is the fix for a visible rectangle. The render is a JPEG — it has no
     alpha, so whatever fills the empty studio around the subject is painted
     onto the page as an opaque block. When that fill was a generic dark grey it
     sat a few levels above #05070a, and the image's bounding box read as a
     faint but perfectly straight-edged panel behind the hero, which no amount
     of CSS masking removes cleanly. Landing the edges on the page colour makes
     the boundary disappear because there is nothing there to see.
     The falloff is per-axis, not radial: uv is normalised by height, so a
     radial band would saturate in the corners long before it reached the top
     and bottom edges of a square frame and the horizontal seams would survive. */
  const vec3 PAGE_BG = vec3(0.0196, 0.0275, 0.0392);   // #05070a
  vec2 halfExtent = vec2(0.5*uRes.x/uRes.y, 0.5);
  vec2 edge = smoothstep(vec2(0.72), vec2(1.0), abs(uv)/halfExtent);
  col = mix(col, PAGE_BG, max(edge.x, edge.y));

  col += (fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)*0.010;

  gl_FragColor = vec4(col,1.0);
}
