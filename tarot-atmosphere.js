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
          vec2 p=(vUv-.5)*3.; float t=uTime*.14;
          float bend=sin(p.x*2.8+t)*.21+sin(p.x*5.1-t*.7)*.09;
          float ribbon=exp(-pow((p.y-bend-.22*sin(t*.5))*3.8,2.));
          float mist=exp(-length(p-vec2(.36*sin(t*.6),.24*cos(t*.8)))*1.7);
          float weave=.5+.5*sin(p.x*4.-p.y*2.+t);
          vec3 color=mix(vec3(.18,.24,.54),vec3(.48,.23,.49),weave);
          color=mix(color,vec3(.68,.43,.21),uEnergy*.32);
          float alpha=(ribbon*.23+mist*.15)*(1.+uEnergy*.8);
          gl_FragColor=vec4(color,alpha);
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
