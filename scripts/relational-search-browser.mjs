import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/cua/lib/node_modules/playwright');
const evidence=process.env.MIZAN_EVIDENCE||'/workspace/diversity-review-evidence/search';
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000},ignoreHTTPSErrors:true});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(process.env.MIZAN_URL||'http://127.0.0.1:8766');
 await page.waitForFunction(()=>!!window.mizanStudioAPI);
 const generation=await page.evaluate(async()=>{
  const {buildDesignRequest}=await import('./multi-engine.mjs');
  const {generateCandidate,decideReviewed}=await import('./integration/pipeline.mjs');
  const {reviewCandidate,verifyBoundReview}=await import('./integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js');
  const {defaultRooms,normalizeRooms,validatePlot}=await import('./planner.mjs');
  const {spatialRelationDescriptor,spatialRelationDistance}=await import('./spatial-relations.mjs');
  const {verifyCandidateBinding}=await import('./integration/control/reference/identity.mjs');
  const plot=validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},coverage:.75});
  const request=await buildDesignRequest({plot,rooms:normalizeRooms(defaultRooms()),idea:'I want dining near both majlis',discovery:{likes:[],rejects:[],avoids:[],life:{}}});
  const pairs=[];
  for(const variant of [0,2]) {
   const generated=await generateCandidate(request,'rect',{}, {shape:'rect',key:`browser-relational-${variant}`,mode:-1,widthRatio:1,seed:1,search:{variant}});
   const review=await reviewCandidate(generated.candidate,request);
   await verifyCandidateBinding(generated.candidate,request);await verifyBoundReview(review,generated.candidate,request);
   pairs.push({...generated,review,variant});
  }
  const result=await decideReviewed(request,pairs),descriptors=pairs.map(p=>spatialRelationDescriptor(p.candidate.geometry));
  window.__relationalAcceptance={request,pairs,result};
  return {programRoomCount:request.program.length,decision:result.decision,azizStatus:result.aziz?.status,rejected:result.rejected,roomProgramsEqual:JSON.stringify(pairs[0].candidate.geometry.program)===JSON.stringify(pairs[1].candidate.geometry.program),plotsEqual:JSON.stringify(pairs[0].candidate.geometry.plot)===JSON.stringify(pairs[1].candidate.geometry.plot),relationshipDistance:spatialRelationDistance(...descriptors),validDescriptors:descriptors.every(d=>d.valid),accessEdges:descriptors.map(d=>d.evidence.accessEdges),sharedWalls:descriptors.map(d=>d.evidence.sharedWalls),candidates:pairs.map(p=>({variant:p.variant,candidateId:p.candidate.candidateId,geometryHash:p.candidate.geometryHash.value,reviewId:p.review.reviewId,reviewOverall:p.review.overall,failedChecks:p.review.checks.filter(c=>c.status==='FAIL').map(c=>c.id)}))};
 });
 assert.equal(generation.decision.status,'SELECTED_PRELIMINARY');assert.equal(generation.azizStatus,'selected');assert.deepEqual(generation.rejected,[]);assert.equal(generation.roomProgramsEqual,true);assert.equal(generation.plotsEqual,true);assert.equal(generation.validDescriptors,true);assert.ok(generation.relationshipDistance>.24);assert.notDeepEqual(generation.accessEdges[0],generation.accessEdges[1]);assert.notDeepEqual(generation.sharedWalls[0],generation.sharedWalls[1]);
 const renders=[];
 for(const index of [0,1]) {
  const result=await page.evaluate(async index=>{
   const {loadThreeRuntime}=await import('./three-runtime.mjs');await loadThreeRuntime();
   const {RoomViewer}=await import('./viewer3d.mjs');const {buildPlanSVG}=await import('./plan-view.mjs');
   const {wallPieces,validateModel}=await import('./planner.mjs');const {geometryHash,verifyCandidateBinding}=await import('./integration/control/reference/identity.mjs');
   const {request,pairs}=window.__relationalAcceptance,{candidate,variant}=pairs[index],model=candidate.geometry;
   window.__acceptanceViewer?.destroy();document.querySelector('#relational-acceptance')?.remove();
   const root=document.createElement('section');root.id='relational-acceptance';root.style.cssText='position:fixed;inset:0;z-index:999999;background:#f4f4ed;padding:18px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:70px 1fr;gap:16px;color:#183632';
   root.innerHTML=`<header style="grid-column:1/3;font:18px sans-serif">Local relational search · variant ${variant} · same bound candidate in SVG and WebGL<br><small>${candidate.candidateId}</small></header><div id="acceptance-plan" style="height:880px"></div><div id="acceptance-3d" style="height:880px"></div>`;document.body.append(root);
   const plan=root.querySelector('#acceptance-plan');plan.innerHTML=buildPlanSVG(model);plan.querySelector('svg').style.cssText='width:100%;height:100%';
   const close=(a,b)=>Math.abs(a-b)<1e-7;
   const svgRooms=model.rooms.every(room=>{const rect=plan.querySelector(`[data-room-id="${room.id}"] .room-fill`);return rect&&close(+rect.getAttribute('x'),room.x)&&close(+rect.getAttribute('y'),-room.y-room.h)&&close(+rect.getAttribute('width'),room.w)&&close(+rect.getAttribute('height'),room.h);});
   const viewer=new RoomViewer(root.querySelector('#acceptance-3d')),meshCalls=[],original=viewer.mesh;
   viewer.mesh=function(...args){meshCalls.push(args.slice(0,9));return original.apply(this,args);};viewer.setModel(model);viewer.setRoof(false);viewer.view('top');viewer.render();window.__acceptanceViewer=viewer;
   const pieces=wallPieces(model),matchingMesh=(values,rotation=0)=>meshCalls.some(args=>values.every((v,i)=>close(args[i],v))&&close(args[7]??0,rotation));
   const wallMeshes=pieces.every(p=>matchingMesh([p.x,p.bottom+p.height/2,-p.y,p.length,p.height,p.thickness],p.angle));
   const roomFloors=model.rooms.every(r=>matchingMesh([r.x+r.w/2,.09,-r.y-r.h/2,r.w,.04,r.h]));
   await verifyCandidateBinding(candidate,request);const afterHash=(await geometryHash({...candidate,geometry:viewer.model})).value;
   return {variant,candidateId:candidate.candidateId,geometryHash:candidate.geometryHash.value,afterRenderGeometryHash:afterHash,svgRoomCount:plan.querySelectorAll('[data-room-id]').length,svgRoomsMatchActualRectangles:svgRooms,webglAvailable:!viewer.renderer.getContext().isContextLost(),webglDrawCalls:viewer.renderer.info.render.calls,webglTriangles:viewer.renderer.info.render.triangles,viewerReceivesExactBoundModel:viewer.model===model,wallPiecesEqual:JSON.stringify(viewer.pieces)===JSON.stringify(pieces),allPhysicalWallMeshesMatch:wallMeshes,allRoomFloorMeshesMatch:roomFloors,wallPieceCount:pieces.length,nativeValidation:validateModel(model)};
  },index);
  assert.equal(result.svgRoomCount,generation.programRoomCount);assert.equal(result.svgRoomsMatchActualRectangles,true);assert.equal(result.webglAvailable,true);assert.ok(result.webglDrawCalls>0);assert.ok(result.webglTriangles>0);assert.equal(result.viewerReceivesExactBoundModel,true);assert.equal(result.wallPiecesEqual,true);assert.equal(result.allPhysicalWallMeshesMatch,true);assert.equal(result.allRoomFloorMeshesMatch,true);assert.equal(result.afterRenderGeometryHash,result.geometryHash);assert.deepEqual(result.nativeValidation,[]);
  await page.screenshot({path:`${evidence}/variant-${result.variant}-svg-webgl.png`,fullPage:false});renders.push(result);
 }
 const report={browser:'Chromium headless with real software WebGL',scope:'Direct browser modules: native generation, bound review, AZIZ decision, live SVG DOM and actual RoomViewer WebGL meshes. Does not exercise the user generation button or certify construction compliance.',url:process.env.MIZAN_URL||'http://127.0.0.1:8766',generation,renders,pageErrors};
 await writeFile(`${evidence}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.deepEqual(pageErrors,[]);
}finally{await browser.close();}
