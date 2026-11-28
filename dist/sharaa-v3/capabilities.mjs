// Each answer has an explicit consumer. Capturing a wish is not proof of execution.
const context = new Set(['household.adults','household.children','household.parents','household.staff','household.familyTogether','household.householdChange','household.overnight','children.ages','children.sharedRooms','children.teenZone','children.flex','hospitality.simultaneous','hospitality.frequency','hospitality.typical','hospitality.peak','site.city','site.neighbor','site.noise','site.view','site.slope','daily.work','daily.breakfast','daily.hobbies','environment.climate','environment.daylight','environment.outdoorSeason','architecture.materials','architecture.reference','budget.amount','budget.priority','budget.finish','budget.flex','budget.costTradeoff','budget.review']);
const native = {
  'household.bedrooms':'counts.bedrooms','hospitality.men':'counts.majlis','hospitality.women':'counts.majlis',
  'services.kitchens':'counts.kitchens','living.count':'counts.halls','living.diningCount':'counts.dining','living.baths':'counts.baths',
  'household.staffRoom':'extras.maid','household.guestBedroom':'extras.guestRoom','daily.office':'extras.office','daily.officeGuests':'extras.office.ext','daily.prayer':'extras.prayer','daily.storage':'extras.storage','services.pantry':'extras.storage','services.laundry':'extras.laundry',
  'sleep.dressing':'prefs.masterDressing','sleep.ensuite':'prefs.allEnsuite','children.sharedBath':'prefs.sharedBaths',
  'hospitality.maleEntry':'prefs.guestEntrance','hospitality.femaleEntry':'prefs.familyEntrance','privacy.familyEntry':'prefs.familyEntrance','privacy.bathSight':'prefs.bathsOffHall','parents.ground':'prefs.elderlyRoom','services.kitchenStyle':'prefs.openKitchen','services.prep':'counts.kitchens',
  'living.shape':'prefs.shape','architecture.concept':'prefs.shape','architecture.style':'prefs.tasteStyle','garden.wanted':'prefs.outdoor','garden.type':'prefs.courtyard','garden.seating':'prefs.outdoor.pergola','site.parkingShade':'prefs.outdoor.carport',
  'hospitality.majlisDining':'rules','hospitality.kitchenDining':'rules','sleep.masterFloor':'rules','parents.nearLiving':'rules','parents.quiet':'rules',
  'privacy.entrySight':'privacy','privacy.guestRoute':'privacy','living.passage':'privacy','budget.count':'generation.keep',
};
// These have a separate geometric evaluator, in addition to native guidance.
const measured = new Set(['household.bedrooms','hospitality.men','hospitality.women','services.kitchens','living.count','living.diningCount','living.baths','hospitality.majlisDining','hospitality.kitchenDining','hospitality.maleEntry','hospitality.femaleEntry','privacy.familyEntry','privacy.bathSight','parents.ground','sleep.masterFloor','living.shape','privacy.entrySight','privacy.guestRoute','living.passage']);
export function capability(id, value) {
  if(['household.guestBedroom','sleep.guestBath'].includes(id))return{mode:'measured',consumer:'requirements.extras.guestRoom',verifiable:true};
  if(id==='architecture.style'&&['modern','classic'].includes(value))return{mode:'native',consumer:'requirements.prefs.style',verifiable:false};
  if(id==='budget.count')return{mode:'context',consumer:'generation.keep',verifiable:false};
  if (context.has(id)) return { mode:'context', consumer:'interview.context', verifiable:false };
  if(['privacy.guestRoute','garden.type'].includes(id))return{mode:'limited',consumer:'handoff.architecturalNotes',verifiable:false};
  if(id==='architecture.style'&&!['modern','classic'].includes(value))return{mode:'limited',consumer:'handoff.architecturalNotes',verifiable:false};
  if(id==='architecture.concept'&&value==='compact')return{mode:'limited',consumer:'handoff.architecturalNotes',verifiable:false};
  // A clear movement path is not proof of sight screening, and an L-shaped
  // building is not proof of an L-shaped living room.
  if (['privacy.entrySight','living.passage'].includes(id)) return { mode:'limited', consumer:'handoff.architecturalNotes', verifiable:false };
  if (id==='living.shape') return value==='balanced' ? {mode:'measured',consumer:'quality.hallAspectRatio',verifiable:true} : {mode:'limited',consumer:'handoff.architecturalNotes',verifiable:false};
  if (native[id]) {
    if (id === 'hospitality.majlisDining' && value === 'direct_access') return { mode:'measured', consumer:'quality.directDoor', verifiable:true };
    if ((id === 'living.shape' && value === 'multi_zone') || (id === 'architecture.concept' && !['courtyard','l_shape','compact','undecided'].includes(value))) return { mode:'limited', consumer:'handoff.architecturalNotes', verifiable:false };
    return { mode:measured.has(id)?'measured':'native', consumer:'requirements.'+native[id], verifiable:measured.has(id) };
  }
  return { mode:'limited', consumer:'handoff.architecturalNotes', verifiable:false };
}
export function requestsExecution(question, value) {
  if (question.type === 'b') return value === true;
  return !['none','undecided','unknown'].includes(value);
}
export const DOMAIN_WHY = {
  household:'تركيبة الأسرة تساعدني في توزيع غرف النوم والخصوصية بدل افتراض برنامج واحد للجميع.',
  children:'عمر الأبناء وطريقة استخدامهم للبيت يغيّران أسئلة النوم والدراسة واللعب.',
  parents:'مكان إقامة الوالدين وسهولة الحركة يوجهان دراسة غرفة مناسبة داخل إجمالي غرف النوم.',
  hospitality:'طريقة الضيافة تحدد المجالس والمداخل والطعام ومسار تقديمه دون اختراق حياة الأسرة.',
  site:'أستفيد من بيانات الأرض والشوارع والمجاورات؛ ما يتعلق بالتربة والميول يحتاج رفعًا مساحيًا.',
  privacy:'أحوّل الخصوصية إلى طلب واضح، ثم أفرّق بين ما يقيسه المخطط وما يحتاج مراجعة متخصصة.',
  daily:'روتينك يحدد الفراغات التي ستستخدمها يوميًا بدل إضافة غرف لا تحتاجها.',
  services:'عدد المطابخ وطريقة الطبخ والخدمات يؤثر في البرنامج ومسار تقديم الطعام.',
  sleep:'أوزع أجنحة النوم والحمامات داخل العدد الذي حددته وأراجع طلبات القرب والدور.',
  living:'أوازن استخدام الصالة ومسارات الحركة والطعام دون افتراض صالة واسعة وطويلة للجميع.',
  environment:'نوع المناخ والواجهات يوجهان أسئلة الظل والتهوية؛ التوصية ليست شهادة أداء بيئي.',
  garden:'أحدد استخدام الحوش ونوع الجلسة والخصوصية قبل اقتراح عناصر خارجية.',
  future:'أوثق احتياجات المستقبل؛ صلاحية التوسع أو الفصل الإنشائي تحتاج دراسة متخصصة.',
  architecture:'أربط الطابع بالشكل الممكن للمخطط، وأفصل التوجه الجمالي عن إثبات جودة الحل.',
  budget:'أوضح الأولويات والمفاضلات دون اختراع أسعار أو وعد بتكلفة غير محسوبة.',
};
