/* MSAA where available, followed by edge-aware antialiasing on the 3D canvas. */
(function (root) {
  'use strict';
  function preferredRatio(width, height, deviceRatio = 1) {
    const budget = width < 640 ? 4800000 : 8000000;
    return Math.max(1, Math.min(Math.max(1.5, deviceRatio), width < 640 ? 2.5 : 3, Math.sqrt(budget / (width * height))));
  }
  function create(THREE, renderer) {
    if (!renderer.setRenderTarget || !renderer.getContext) {
      return { resize() {}, render: (scene, camera) => renderer.render(scene, camera) };
    }
    const multisample = Boolean(renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget);
    let maximumSamples = 1;
    const Target = multisample ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
    const target = new Target(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding, depthBuffer: true, stencilBuffer: false });
    if (multisample) {
      const context = renderer.getContext();
      maximumSamples = Math.max(1, Math.min(8, context.getParameter(context.MAX_SAMPLES) || 4));
      target.samples = maximumSamples;
    }
    const uniforms = { uMap: { value: target.texture }, uStep: { value: new THREE.Vector2(1, 1) } };
    const material = new THREE.ShaderMaterial({
      uniforms, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform vec2 uStep;
        void main(){
          vec3 rgb=texture2D(uMap,vUv).rgb;
          vec3 nw=texture2D(uMap,vUv+vec2(-1.,-1.)*uStep).rgb;
          vec3 ne=texture2D(uMap,vUv+vec2(1.,-1.)*uStep).rgb;
          vec3 sw=texture2D(uMap,vUv+vec2(-1.,1.)*uStep).rgb;
          vec3 se=texture2D(uMap,vUv+vec2(1.,1.)*uStep).rgb;
          vec3 luma=vec3(.299,.587,.114);
          float a=dot(nw,luma),b=dot(ne,luma),c=dot(sw,luma),d=dot(se,luma),m=dot(rgb,luma);
          float low=min(m,min(min(a,b),min(c,d))),high=max(m,max(max(a,b),max(c,d)));
          if(high-low<max(.025,high*.12)){gl_FragColor=vec4(rgb,1.);return;}
          vec2 direction=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
          float reduce=max((a+b+c+d)*.03125,.0078125);
          direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-6.),vec2(6.))*uStep;
          vec3 middle=.5*(texture2D(uMap,vUv-direction/6.).rgb+texture2D(uMap,vUv+direction/6.).rgb);
          vec3 wide=middle*.5+.25*(texture2D(uMap,vUv-direction*.5).rgb+texture2D(uMap,vUv+direction*.5).rgb);
          float value=dot(wide,luma);
          gl_FragColor=vec4(value<low||value>high?middle:wide,1.);
        }`
    });
    const passScene = new THREE.Scene(), camera = new THREE.Camera();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); quad.frustumCulled = false; passScene.add(quad);
    return {
      resize(width, height, ratio) {
        const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
        if (multisample) target.samples = Math.min(maximumSamples, w * h > 2800000 || width < 640 ? 4 : 8);
        target.setSize(w, h); uniforms.uStep.value.set(1 / w, 1 / h);
      },
      render(scene, sceneCamera) {
        renderer.setRenderTarget(target); renderer.render(scene, sceneCamera);
        renderer.setRenderTarget(null); renderer.render(passScene, camera);
      }
    };
  }
  const api = { create, preferredRatio };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotRender = api;
})(typeof window === 'object' ? window : this);
