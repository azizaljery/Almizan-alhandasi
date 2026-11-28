// Severity and proof are separate. Only V3-owned request findings use this map;
// geometry, municipal, locks and Aziz checks retain their original severity.
import { activeFacts, restoreBrief } from './core.mjs';
import { projectToProduction } from './native-bridge.mjs';
const owners={
 'C-bed':[['household.bedrooms'],'counts.bedrooms'],'C-dining':[['living.diningCount'],'counts.dining'],'C-dining1':[['living.diningCount'],'counts.dining'],'C-kitchen2':[['services.kitchens'],'counts.kitchens'],'C-hall2':[['living.count'],'counts.halls'],
 'P-ens':[['sleep.ensuite'],'prefs.allEnsuite'],'P-sh':[['children.sharedBath'],'prefs.sharedBaths'],'P-bathhall':[['privacy.bathSight'],'prefs.bathsOffHall'],'P-old':[['parents.ground'],'prefs.elderlyRoom'],'P-guest':[['hospitality.maleEntry'],'prefs.guestEntrance'],'P-dress':[['sleep.dressing'],'prefs.masterDressing'],'P-open':[['services.kitchenStyle'],'prefs.openKitchen'],
 'X-office':[['daily.office'],'extras.office'],'X-office-ext':[['daily.officeGuests'],'extras.office'],'X-prayer':[['daily.prayer'],'extras.prayer'],'X-laundry':[['services.laundry'],'extras.laundry'],'X-maid':[['household.staffRoom'],'extras.maid'],'X-storage':[['daily.storage','services.pantry'],'extras.storage'],
 'G-pergola':[['garden.seating'],'prefs.outdoor.pergola'],'G-lawn':[['garden.wanted'],'prefs.outdoor.lawn'],'G-planters':[['garden.wanted'],'prefs.outdoor.planters'],'G-carport':[['site.parkingShade'],'prefs.outdoor.carport'],
};
const at=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
export function v3RequestPriorityResolver(req){
 if(!req.sharaaV3)return()=>null;
 const b=restoreBrief(req.sharaaV3),facts=activeFacts(b),canonical=projectToProduction(b).requirements;
 return finding=>{
  const currentRule=req.rules?.find(r=>r.id===finding.id);
  if(currentRule?.v3FactId){const f=facts[currentRule.v3FactId],expected=canonical.rules.find(r=>r.v3FactId===currentRule.v3FactId);if(!f||!expected||['kind','a','b','floor','side','mode'].some(k=>currentRule[k]!==expected[k]))return null;return f.priority==='mandatory'?'mandatory':'warning';}
  if(['C-majlis','C-majlis1','C-maj2','P-sep'].includes(finding.id)&&canonical.counts.majlis===req.counts?.majlis&&facts['hospitality.men']&&facts['hospitality.women'])return'warning';
  // Presence and bath are separate, precisely prioritized V3 checks.
  if(finding.id==='X-guest'&&facts['household.guestBedroom']&&JSON.stringify(req.extras?.guestRoom)===JSON.stringify(canonical.extras.guestRoom))return'warning';
  const owned=owners[finding.id];if(!owned)return null;const[ids,path]=owned;
  if(JSON.stringify(at(req,path))!==JSON.stringify(at(canonical,path))||at(req,path)===undefined)return null;
  const active=ids.filter(id=>facts[id]&&facts[id].value!==false);if(!active.length)return null;
  return active.some(id=>facts[id].priority==='mandatory')?'mandatory':'warning';
 };
}
