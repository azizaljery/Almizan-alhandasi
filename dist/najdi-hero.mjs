// Decorative welcome model, independent of customer project geometry.
export function buildNajdiHero(T,{scene,mesh,material,geometries,sandstone,ivory,darkStone,metal,glass}){
 const bounds=new T.Box3();
 const box=(...a)=>{const o=mesh(...a);bounds.expandByObject(o);return o};
 const earth=material('#b59470',.91),lime=material('#ece3d2',.88),timber=material('#5e4030',.78),recess=material('#4c4940',.92),paving=material('#d3c3aa',.92),soil=material('#86755a',1),foliage=material('#65765c',.95);
 const luminous=material('#b2b0a0',.25,{metalness:.18,emissive:0xf2b46f,emissiveIntensity:.08});
 // Grounded, asymmetric volumes: shaded central entrance, upper majlis and terrace.
 box(22,.32,17,0,.04,0,paving,false);
 box(9,4.2,9,-5.4,2.3,-1.1,sandstone);
 box(7.4,4.2,8.2,5.2,2.3,-1.5,lime);
 box(4.2,3.8,6,0,2.1,-2,earth);
 box(8.8,3.65,8.1,-5.4,6.28,-1.4,ivory);
 box(6.9,3.1,5.3,5.15,5.98,-2.5,sandstone);
 // Thin parapets and shaded terraces keep the silhouette contemporary.
 for(const [x,w,y,z,d]of[[-5.4,9.2,8.25,-1.4,8.5],[5.15,7.25,7.68,-2.5,5.65]]){
  box(w,.22,d,x,y,z,lime);
  box(w,.55,.22,x,y+.2,z+d/2,lime);
  for(const s of [-1,1])box(.22,.55,d,x+s*(w/2-.1),y+.2,z,lime);
  box(w,.1,.2,x,y-.18,z+d/2+.04,metal);
 }
 const window=(x,y,z,w=1.25,h=2.05)=>{
  box(w+.38,h+.35,.22,x,y,z,recess);
  box(w,h,.1,x,y,z+.13,luminous);
  for(const s of [-1,1])box(.16,h+.6,.5,x+s*(w/2+.17),y+.05,z+.17,lime);
  box(w+.65,.18,.7,x,y+h/2+.32,z+.28,lime);
  box(w+.55,.12,.45,x,y-h/2-.2,z+.21,sandstone);
  box(.045,h,.16,x,y,z+.23,metal);
 };
 for(const x of [-7.65,-5.4,-3.15]){window(x,2.2,3.48,1.15,2.05);window(x,6.3,2.79,1.12,1.9)}
 for(const x of [3.35,6.9])window(x,2.15,2.68,1.4,2.0);
 window(5.15,6,-.2,2.25,1.85);
 // Deep entry portal, hardwood door, bronze threshold and broad arrival steps.
 box(4.6,4.4,.45,0,2.55,1.15,earth);
 box(2.65,3.45,.48,0,1.97,1.43,recess);
 box(2.16,3.12,.14,0,1.82,1.73,timber);
 for(let i=0;i<11;i++)box(.035,3.1,.04,-.98+i*.196,1.82,1.82,metal,false);
 box(.065,.9,.1,.72,1.8,1.88,metal);
 box(4.95,.35,2.1,0,4.65,2.05,lime);
 for(const s of[-1,1])box(.42,4.3,1.2,s*2.27,2.5,1.95,sandstone);
 for(let i=0;i<3;i++)box(5.8+i*.8,.13,1.15+i*.6,0,.37-i*.09,3.7+i*.65,paving,false);
 // Triangular Najdi ventilation motifs, used sparingly above the entrance.
 for(let i=0;i<5;i++){
  const shape=new T.Shape();shape.moveTo(-.18,0);shape.lineTo(.18,0);shape.lineTo(0,.3);shape.closePath();
  const g=new T.ShapeGeometry(shape);geometries.add(g);const m=new T.Mesh(g,recess);m.position.set(-1.25+i*.62,3.77,1.39);scene.add(m);
 }
 // Timber shade screen on the upper right terrace.
 for(let i=0;i<13;i++)box(.09,2.5,.15,2.04+i*.53,5.86,.4,timber);
 box(7.1,.18,2.25,5.2,7.22,.25,metal);
 for(let i=0;i<11;i++)box(.12,.15,2.3,2.05+i*.63,7.36,.25,timber);
 // Side elevation articulation and recessed windows, visible from the main angle.
 for(const z of[-4.1,-1.5,1.1]){
  box(.2,1.95,1.25,8.99,2.2,z,recess);box(.12,1.7,1.04,9.12,2.2,z,luminous);
  box(.55,.18,1.55,9.2,3.33,z,lime);
 }
 // Arrival court: segmented stone paving, integrated planters and native-looking trees.
 for(let i=0;i<6;i++)for(let j=0;j<3;j++)mesh(.95,.035,1.1,(j-1)*1.05,.22,5.5+i*1.15,paving,false);
 for(const s of[-1,1]){
  mesh(3.8,.45,2.2,s*6.2,.42,5.6,sandstone);
  mesh(3.55,.08,1.95,s*6.2,.69,5.6,soil,false);
  for(let i=0;i<6;i++){
   const g=new T.SphereGeometry(.32,10,7);geometries.add(g);const o=new T.Mesh(g,foliage);o.scale.set(1,.7,1);o.position.set(s*6.2+(i%3-1)*.9,.94,5.15+Math.floor(i/3)*.8);o.castShadow=true;scene.add(o);
  }
 }
 const tree=(x,z)=>{
  const trunk=new T.CylinderGeometry(.09,.17,3,9);geometries.add(trunk);const t=new T.Mesh(trunk,timber);t.position.set(x,1.65,z);t.castShadow=true;scene.add(t);
  for(let i=0;i<7;i++){
   const a=i*2.4,r=i===0?0:.6,g=new T.SphereGeometry(.9,12,9);geometries.add(g);const c=new T.Mesh(g,foliage);c.scale.set(1,.55,.85);c.position.set(x+Math.cos(a)*r,3.2+(i%3)*.16,z+Math.sin(a)*r);c.castShadow=true;c.receiveShadow=true;scene.add(c);
  }
 };
 tree(-11,3.7);tree(10.9,-3.8);
 const lights=[];
 for(const s of[-1,1]){
  mesh(.16,.6,.2,s*2.2,2.4,2.61,metal);
  const light=new T.PointLight(0xffc98a,0,6,2);light.position.set(s*2.1,2.3,3);scene.add(light);lights.push(light);
 }
 return {bounds,lighting(night){luminous.emissiveIntensity=.08+.6*night;for(const l of lights)l.intensity=4*night;}};
}

export function fitHeroCamera(T,camera,bounds,view,aspect){
 const center=bounds.getCenter(new T.Vector3());center.y+=.15;
 const direction=Array.isArray(view)?view:({angle:[1,.62,1.6],front:[.05,.35,1.8],side:[-1.15,.58,1.6]}[view]||[1,.62,1.6]);
 const ray=new T.Vector3(...direction).normalize();
 const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),ray).normalize(),up=new T.Vector3().crossVectors(ray,right).normalize();
 const tan=Math.tan(camera.fov*Math.PI/360),tx=tan*aspect;let distance=0;
 for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z]){
  const p=new T.Vector3(x,y,z).sub(center),depth=p.dot(ray);
  distance=Math.max(distance,depth+Math.abs(p.dot(right))*1.17/tx,depth+Math.abs(p.dot(up))*1.22/tan);
 }
 camera.position.copy(center).addScaledVector(ray,distance);camera.lookAt(center);
}
