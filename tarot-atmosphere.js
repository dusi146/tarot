/* Two GPU draws for flowing aurora and soft, short-lived card light. */
(function (root) {
  'use strict';
  function create(THREE, scene, texture, reducedMotion) {
    const uniforms = { uTime: { value: 0 }, uEnergy: { value: 0 } };
    const aurora = new THREE.Mesh(new THREE.PlaneGeometry(110, 90), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uEnergy;
        void main() {
          vec2 p=(vUv-.5)*3.; float t=uTime*.12;
          float bend=sin(p.x*2.1+t)*.28+cos(p.x*4.3-t*.63)*.12;
          float other=cos(p.x*1.8-t*.72)*.34+sin(p.x*3.7+t*.5)*.11;
          float ribbon=exp(-pow((p.y-bend)*4.5,2.));
          float veil=exp(-pow((p.y-other+.25)*3.2,2.));
          vec2 center=vec2(.45*cos(t*.5),.33*sin(t*.7));
          float mist=exp(-dot((p-center)*vec2(1.,1.35),(p-center)*vec2(1.,1.35))*1.6);
          float weave=.5+.5*sin(p.x*2.7-p.y*1.6+t*.8);
          vec3 color=mix(vec3(.15,.24,.55),vec3(.48,.20,.47),weave);
          color=mix(color,vec3(.16,.39,.42),veil*.35);
          color+=vec3(.35,.22,.09)*ribbon*(.15+uEnergy*.3);
          float alpha=(ribbon*.22+veil*.14+mist*.19)*(1.+uEnergy*.6);
          float dither=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
          gl_FragColor=vec4(color+dither,alpha);
        }`
    }));
    aurora.position.set(0, 0, -38); aurora.renderOrder = -10; scene.add(aurora);
    const glowMaterial = new THREE.SpriteMaterial({ map: texture, color: 0xf1c68c, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMaterial); scene.add(glow);
    const count = reducedMotion ? 12 : 88;
    const positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2, speed = .15 + Math.random() * .5;
      positions.set([Math.cos(angle) * .14, Math.sin(angle) * .24, 0], i * 3);
      velocities.set([Math.cos(angle) * speed, Math.sin(angle) * speed * 1.2, Math.random() * .12], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    const sparkUniforms = { uAge: { value: 5 }, uMap: { value: texture }, uPixelRatio: { value: 1 } };
    const sparks = new THREE.Points(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: sparkUniforms,
      vertexShader: `attribute vec3 aVelocity; uniform float uAge; uniform float uPixelRatio; varying float vFade;
        void main(){ vec3 p=position+aVelocity*uAge; p.y-=uAge*uAge*.06;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(16.*uPixelRatio/max(1.,-mv.z),1.,9.*uPixelRatio);
        vFade=max(0.,1.-uAge/1.6); }`,
      fragmentShader: 'uniform sampler2D uMap; varying float vFade; void main(){gl_FragColor=texture2D(uMap,gl_PointCoord)*vec4(1.,.79,.48,vFade);}'
    }));
    sparks.frustumCulled = false; sparks.visible = false; scene.add(sparks);
    let age = 5, intensity = 0;
    return {
      burst(point, scale = 1) {
        age = 0; intensity = reducedMotion ? .16 : .52;
        glow.position.copy(point); glow.position.z -= .08; glow.scale.set(2.4 * scale, 3.2 * scale, 1);
        sparks.position.copy(point); sparks.scale.setScalar(scale); sparks.visible = !reducedMotion;
      },
      update(time, energy, dt, pixelRatio) {
        uniforms.uTime.value = reducedMotion ? 0 : time;
        uniforms.uEnergy.value = energy;
        age += dt; sparkUniforms.uAge.value = age; sparkUniforms.uPixelRatio.value = pixelRatio;
        glowMaterial.opacity = intensity * Math.exp(-age * 2.3);
        sparks.visible = !reducedMotion && age < 1.6;
      }
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotAtmosphere = api;
})(typeof window === 'object' ? window : this);
