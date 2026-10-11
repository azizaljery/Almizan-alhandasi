/** Physical relationship evidence, not a geometry validator or a graph-isomorphism proof.
 * Coordinates establish actual walls/portals only; signatures contain no centres,
 * labels, IDs, directions, lengths or styling. Invalid evidence earns no novelty.
 */
const EPS = 1e-5;
const near = (a, b) => Math.abs(a - b) <= EPS;
const finite = (...values) => values.every(Number.isFinite);
const rounded = value => Number(value.toFixed(4));
const rectOK = r => r && finite(r.x,r.y,r.w,r.h) && r.w > 0 && r.h > 0;
const inside = (r,p) => p.x >= r.x-EPS && p.x <= r.x+r.w+EPS && p.y >= r.y-EPS && p.y <= r.y+r.h+EPS;
const pairKey = (a,b) => [a,b].sort().join('\u0000');
const roomLabel = room => `room:${room.type}:${rounded(room.w * room.h)}`;
function pointInPolygon(points,p) {
  let result=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }
  return result;
}
function wallAxis(wall) {
  if(!wall || !finite(wall.x1,wall.y1,wall.x2,wall.y2,wall.t) || wall.t<=0) return null;
  if(near(wall.y1,wall.y2)&&Math.abs(wall.x2-wall.x1)>EPS) return {horizontal:true,fixed:wall.y1,start:Math.min(wall.x1,wall.x2),end:Math.max(wall.x1,wall.x2)};
  if(near(wall.x1,wall.x2)&&Math.abs(wall.y2-wall.y1)>EPS) return {horizontal:false,fixed:wall.x1,start:Math.min(wall.y1,wall.y2),end:Math.max(wall.y1,wall.y2)};
  return null;
}
function wallSide(rect,wall,axis) {
  const base=axis.horizontal?rect.y:rect.x,length=axis.horizontal?rect.h:rect.w;
  if(near(base+length+wall.t/2,axis.fixed))return -1;
  if(near(base-wall.t/2,axis.fixed))return 1;
  return 0;
}
function unionLength(intervals) {
  const sorted=intervals.filter(([a,b])=>b-a>EPS).sort((a,b)=>a[0]-b[0]);
  let total=0,start=0,end=0,active=false;
  for(const [a,b] of sorted){if(!active){start=a;end=b;active=true;}else if(a<=end+EPS)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}
  return total+(active?end-start:0);
}
function openCorridorJoin(a,b,walls) {
  if(!rectOK(a)||!rectOK(b))return false;
  const x0=Math.max(a.x,b.x),x1=Math.min(a.x+a.w,b.x+b.w),y0=Math.max(a.y,b.y),y1=Math.min(a.y+a.h,b.y+b.h);
  if(x1-x0>EPS&&y1-y0>EPS)return true;
  let horizontal,fixed,start,end;
  if(x1-x0>EPS&&Math.abs(y1-y0)<=EPS){horizontal=true;fixed=(y0+y1)/2;start=x0;end=x1;}
  else if(y1-y0>EPS&&Math.abs(x1-x0)<=EPS){horizontal=false;fixed=(x0+x1)/2;start=y0;end=y1;}
  else return false;
  const blocked=[];
  for(const wall of walls){const axis=wallAxis(wall);if(axis&&axis.horizontal===horizontal&&Math.abs(axis.fixed-fixed)<=wall.t/2+EPS)blocked.push([Math.max(start,axis.start),Math.min(end,axis.end)]);}
  return end-start-unionLength(blocked)>EPS;
}
// Fixed-width hashing bounds the refinement representation. Distinct graphs may
// share this conservative signature; equality never proves graph isomorphism.
function hash(value) {
  let result=14695981039346656037n;
  for(let i=0;i<value.length;i++){result^=BigInt(value.charCodeAt(i));result=BigInt.asUintN(64,result*1099511628211n);}
  return result.toString(16).padStart(16,'0');
}
function graphTokens(labels,edges) {
  const neighbors=new Map([...labels].map(([id])=>[id,[]]));
  for(const edge of edges){neighbors.get(edge.a).push([edge.kind,edge.b]);neighbors.get(edge.b).push([edge.kind,edge.a]);}
  let colors=new Map(labels);
  for(let round=0;round<3;round++)colors=new Map([...labels].map(([id,label])=>[id,hash(JSON.stringify([label,neighbors.get(id).map(([kind,to])=>[kind,colors.get(to)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]))]));
  return [...colors.values()].map(color=>'node:'+color).concat(edges.map(edge=>`edge:${edge.kind}:${[colors.get(edge.a),colors.get(edge.b)].sort().join(':')}`)).sort();
}
export function spatialRelationDescriptor(model) {
  const issues=[];
  const issue=(code,ids=[])=>issues.push({code,ids});
  const rooms=Array.isArray(model?.rooms)?model.rooms:[],corridors=Array.isArray(model?.corridors)?model.corridors:[],walls=Array.isArray(model?.walls)?model.walls:[],openings=Array.isArray(model?.openings)?model.openings:[],links=Array.isArray(model?.links)?model.links:[];
  if(!rooms.length||!walls.length||!Array.isArray(model?.links))issue('INCOMPLETE_EVIDENCE');
  const allSpaces=[...rooms,...corridors],spaces=new Map(),wallMap=new Map();
  for(const space of allSpaces){if(typeof space.id!=='string'||space.id==='outside'||spaces.has(space.id)||!rectOK(space))issue('INVALID_SPACE',[space.id]);else spaces.set(space.id,space);}
  for(const wall of walls){if(typeof wall.id!=='string'||wallMap.has(wall.id)||!wallAxis(wall))issue('INVALID_WALL',[wall.id]);else wallMap.set(wall.id,wall);}
  const roomIds=new Set(rooms.map(room=>room.id)),corridorIds=new Set(corridors.map(c=>c.id));
  // A missing solid partition must not masquerade as a new adjacency graph.
  // Current supported rectangle engines emit complete wall hosts around rooms.
  for(const room of rooms.filter(room=>spaces.has(room.id))) {
    const sides=new Map([['h:-1',[]],['h:1',[]],['v:-1',[]],['v:1',[]]]);
    for(const wall of wallMap.values()) {
      const axis=wallAxis(wall),side=wallSide(room,wall,axis);if(!side)continue;
      const start=axis.horizontal?room.x:room.y,end=start+(axis.horizontal?room.w:room.h);
      sides.get(`${axis.horizontal?'h':'v'}:${side}`).push([Math.max(start,axis.start),Math.min(end,axis.end)]);
    }
    if([...sides].some(([side,spans])=>unionLength(spans)<(side.startsWith('h')?room.w:room.h)-EPS))issue('ROOM_WALL_EVIDENCE_INCOMPLETE',[room.id]);
  }

  const adjacency=new Map();
  for(const wall of wallMap.values()) {
    const axis=wallAxis(wall),faces=rooms.filter(room=>spaces.has(room.id)).map(room=>({room,side:wallSide(room,wall,axis)})).filter(face=>face.side);
    for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
      const a=faces[i],b=faces[j];if(a.side===b.side)continue;
      const start=Math.max(axis.start,axis.horizontal?a.room.x:a.room.y,axis.horizontal?b.room.x:b.room.y);
      const end=Math.min(axis.end,axis.horizontal?a.room.x+a.room.w:a.room.y+a.room.h,axis.horizontal?b.room.x+b.room.w:b.room.y+b.room.h);
      if(end-start<=EPS)continue;
      const key=pairKey(a.room.id,b.room.id);if(!adjacency.has(key))adjacency.set(key,{a:a.room.id,b:b.room.id,kind:'shared-wall',walls:[],length:0});
      const edge=adjacency.get(key);edge.walls.push(wall.id);edge.length+=end-start;
    }
  }
  const access=new Map(),addAccess=(a,b,kind)=>{const key=kind+':'+pairKey(a,b);if(!access.has(key))access.set(key,{a,b,kind});};
  const doorIds=new Set();
  for(const door of openings.filter(o=>o.type==='door')) {
    const wall=wallMap.get(door.wallId),axis=wall&&wallAxis(wall);
    if(doorIds.has(door.id)||!axis||!finite(door.pos,door.w,door.h)||door.w<=0||door.h<=0||door.sill!==0||!Array.isArray(door.connects)||door.connects.length!==2||door.connects[0]===door.connects[1]){issue('DOOR_NOT_PHYSICAL',[door.id]);continue;}
    doorIds.add(door.id);
    const length=Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1),ux=(wall.x2-wall.x1)/length,uy=(wall.y2-wall.y1)/length;
    if(door.pos*length-door.w/2<-EPS||door.pos*length+door.w/2>length+EPS){issue('DOOR_NOT_PHYSICAL',[door.id]);continue;}
    const onSpace=(id,p)=>{
      if(id!=='outside')return spaces.has(id)&&inside(spaces.get(id),p);
      if(wall.type!=='ext')return false;
      return Array.isArray(model?.buildingFootprint)&&model.buildingFootprint.length>=3?!pointInPolygon(model.buildingFootprint,p):rectOK(model?.building)&&!inside(model.building,p);
    };
    const center={x:wall.x1+(wall.x2-wall.x1)*door.pos,y:wall.y1+(wall.y2-wall.y1)*door.pos};
    const margin=Math.min(.02,door.w/4),samples=[-door.w/2+margin,0,door.w/2-margin];
    const physical=samples.every(along=>{
      const normal=wall.t/2+.02,a={x:center.x+ux*along-uy*normal,y:center.y+uy*along+ux*normal},b={x:center.x+ux*along+uy*normal,y:center.y+uy*along-ux*normal};
      return (onSpace(door.connects[0],a)&&onSpace(door.connects[1],b))||(onSpace(door.connects[1],a)&&onSpace(door.connects[0],b));
    });
    if(!physical){issue('DOOR_NOT_PHYSICAL',[door.id]);continue;}
    addAccess(door.connects[0],door.connects[1],'door');
  }
  for(const pair of links) {
    if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||!pair.every(id=>corridorIds.has(id))||!openCorridorJoin(spaces.get(pair[0]),spaces.get(pair[1]),walls)){issue('LINK_NOT_PHYSICAL',Array.isArray(pair)?pair:[]);continue;}
    addAccess(pair[0],pair[1],'link');
  }
  // Quotient artificial segmentation of one clear rectangular corridor. Only
  // physically verified open links between collinear, same-width rectangles collapse;
  // Fully contained bridge/spine duplicates collapse too. Ambiguous subdivisions
  // fail closed; T/L branches and door-separated corridors remain distinct.
  const representatives=new Map(corridors.filter(c=>spaces.has(c.id)).map(c=>[c.id,c.id]));
  const corridorGroups=new Map(corridors.filter(c=>spaces.has(c.id)).map(c=>[c.id,{...c,members:[c.id]}]));
  const representative=id=>representatives.get(id)??id;
  const ambiguousSegments=new Set();
  let merged=true;
  while(merged){merged=false;
    for(const edge of access.values()){
      if(edge.kind!=='link')continue;
      const aId=representative(edge.a),bId=representative(edge.b);if(aId===bId)continue;
      const a=corridorGroups.get(aId),b=corridorGroups.get(bId);if(!a||!b)continue;
      const horizontal=a.w>a.h+EPS&&b.w>b.h+EPS&&near(a.y,b.y)&&near(a.h,b.h);
      const vertical=a.h>a.w+EPS&&b.h>b.w+EPS&&near(a.x,b.x)&&near(a.w,b.w);
      const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.max(a.x+a.w,b.x+b.w)-x,h=Math.max(a.y+a.h,b.y+b.h)-y;
      const overlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      if(!near(w*h,a.w*a.h+b.w*b.h-overlap))continue;
      const contained=near(w*h,a.w*a.h)||near(w*h,b.w*b.h);
      if(!horizontal&&!vertical&&!contained){
        const key=pairKey(aId,bId);
        if(!ambiguousSegments.has(key)){ambiguousSegments.add(key);issue('CORRIDOR_SEGMENTATION_AMBIGUOUS',[aId,bId]);}
        continue;
      }
      const members=[...a.members,...b.members];for(const id of members)representatives.set(id,aId);
      corridorGroups.set(aId,{x,y,w,h,members});corridorGroups.delete(bId);merged=true;
    }
  }
  const normalizedAccess=new Map();
  for(const edge of access.values()){
    const a=representative(edge.a),b=representative(edge.b);if(a!==b)normalizedAccess.set(edge.kind+':'+pairKey(a,b),{a,b,kind:edge.kind});
  }
  access.clear();for(const [key,edge]of normalizedAccess)access.set(key,edge);
  const labels=new Map([...spaces].filter(([id])=>roomIds.has(id)||representative(id)===id).map(([id,space])=>[id,roomIds.has(id)?roomLabel(space):'corridor']));labels.set('outside','entry');
  const graph=new Map([...labels].map(([id])=>[id,[]]));
  for(const edge of access.values()){graph.get(edge.a)?.push(edge.b);graph.get(edge.b)?.push(edge.a);}
  const depths=new Map([['outside',0]]),queue=['outside'];
  for(let i=0;i<queue.length;i++)for(const to of graph.get(queue[i])||[])if(!depths.has(to)){depths.set(to,depths.get(queue[i])+1);queue.push(to);}
  if(!(graph.get('outside')||[]).length)issue('ENTRY_NOT_PHYSICAL');
  for(const room of rooms)if(!depths.has(room.id))issue('ROOM_NOT_REACHABLE',[room.id]);
  const roomAccess=rooms.filter(room=>spaces.has(room.id)).map(room=>({roomId:room.id,room:roomLabel(room),depth:depths.get(room.id)??null,hosts:(graph.get(room.id)||[]).filter(id=>corridorIds.has(id)).map(id=>({depth:depths.get(id)??null,rooms:(graph.get(id)||[]).filter(id=>roomIds.has(id)).map(id=>labels.get(id)).sort()}))}));
  const valid=issues.length===0;
  const sharedWalls=valid?graphTokens(new Map(rooms.map(room=>[room.id,roomLabel(room)])),[...adjacency.values()]):[];
  const accessTokens=valid?graphTokens(labels,[...access.values()]).concat(roomAccess.map(row=>'root:'+JSON.stringify([row.room,row.depth,row.hosts.map(host=>[host.depth,host.rooms]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]))).sort():[];
  return {version:1,valid,issues,sharedWalls,access:accessTokens,fingerprint:valid?hash(JSON.stringify([sharedWalls,accessTokens])):null,evidence:{corridorGroups:[...corridorGroups].map(([id,group])=>({id,members:group.members})),sharedWalls:[...adjacency.values()].map(edge=>({...edge,length:rounded(edge.length),rooms:[labels.get(edge.a),labels.get(edge.b)].sort()})),accessEdges:[...access.values()],roomAccess}};
}
function multisetDistance(a,b) {
  const counts=new Map();for(const value of a)counts.set(value,[1+(counts.get(value)?.[0]||0),counts.get(value)?.[1]||0]);for(const value of b)counts.set(value,[counts.get(value)?.[0]||0,1+(counts.get(value)?.[1]||0)]);
  let intersection=0,union=0;for(const [left,right]of counts.values()){intersection+=Math.min(left,right);union+=Math.max(left,right);}return union?1-intersection/union:0;
}
export function compareSpatialRelations(a,b) {
  if(!a?.valid||!b?.valid)return {valid:false,sharedWalls:0,access:0,distance:0};
  const sharedWalls=multisetDistance(a.sharedWalls,b.sharedWalls),access=multisetDistance(a.access,b.access);
  return {valid:true,sharedWalls,access,distance:Math.max(sharedWalls,access)};
}
export function spatialRelationDistance(a,b) { return compareSpatialRelations(a,b).distance; }
