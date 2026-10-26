/** R21/01. Use one canonical semantic object for generator AND reviewer.
 * Feed the EXISTING Arabic requirements parser; only narrowly add 'مقلط'.
 * 'near' does not imply a direct door or a separate room.
 */
const norm=s=>String(s??'').normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/\s+/g,' ').trim();
function freezeDeep(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freezeDeep);Object.freeze(x);}return x;}
export function canonicalBrief(raw={}){
 const text=String(raw.text??raw.idea??''),parsed=raw.parsed??{};
 const req=(parsed.requirements??raw.requirements??[]).map((r,i)=>({...r,id:String(r.id??`req-${i}`),source:r.source??'parser',mandatory:r.mandatory===true}));
 const normalized=norm(text);
 const men=/(مجلس\s*(رجال|الرجال)|مجلس\s*الضيوف)/.test(normalized);
 const muqlat=/مقلط/.test(normalized);
 if(men&&muqlat&&!req.some(r=>r.kind==='guest_dining'))req.push({id:'guest-dining-client',kind:'guest_dining',mandatory:true,source:'client_text',evidence:'مقلط',relation:'near',directDoor:'unspecified',separateRoom:'unspecified'});
 return freezeDeep({schema:'mizan-brief/1',text,counts:raw.counts??parsed.counts??{},prefs:raw.prefs??parsed.prefs??{},rules:raw.rules??parsed.rules??[],requirements:req});
}
export function assertSharedBrief(generatorBrief,reviewerBrief){if(generatorBrief!==reviewerBrief)throw Error('Generator/reviewer briefs differ');return true;}
export function hasGuestDining(brief){return brief.requirements.some(r=>r.kind==='guest_dining'&&r.mandatory);}
