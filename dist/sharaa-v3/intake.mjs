// Local proposals only. They require the client's explicit confirmation and
// never become generation constraints just because a parser inferred them.
import { normalizeAr } from '../requirements.mjs';
import { parseFamily } from '../shara/family.mjs';
const WORDS={واحد:1,واحده:1,اثنين:2,اثنان:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};
const NUM='(?:\\d+|'+Object.keys(WORDS).join('|')+')';
export function proposeFromText(raw){
 if(typeof raw!=='string'||raw.length>4000)throw Error('اكتب وصفًا لا يتجاوز 4000 حرف.');
 const t=normalizeAr(raw), proposals=new Map(),put=(id,value,evidence=raw)=>proposals.set(id,{id,value,evidence,source:'client_free_text'});
 const family=parseFamily(raw),kids=family.boys+family.girls+family.kids;
 if(/(?:لا يوجد|بدون|ما عندي|ماعندي|ما عندنا) (?:اطفال|عيال|ابناء|اولاد)/.test(t))put('household.children',0);
 else if(kids>0)put('household.children',kids);
 if(/(?:امي|ابوي|والدتي|والدي|الوالدين)[^،؛.]{0,12}(?:لا|ما) (?:يسكن|تسكن|يعيش|تعيش)/.test(t)||/لا (?:يقيم|يسكن) (?:احد )?(?:الوالدين|الوالدان)/.test(t))put('household.parents','none');
 else if(/(?:امي|ابوي|والدتي|والدي|الوالدين|والدينا)[^،؛.]{0,18}(?:ساكن|ساكنه|يسكن|تسكن|معنا|معي)/.test(t))put('household.parents','permanent');
 if(/انا وزوجتي|انا وزوجي/.test(t)&&!proposals.has('household.parents'))put('household.adults',2);
 for(const[id,word]of [['household.bedrooms','غرف(?:ه)? نوم'],['services.kitchens','مطابخ|مطبخ'],['living.count','صالات|صاله'],['living.diningCount','غرف(?:ه)? طعام|مقالط'],['living.baths','حمامات|دورات مياه|دوره مياه']]){
  const matches=[...t.matchAll(new RegExp('('+NUM+')\\s+(?:'+word+')(?![؀-ۿ])','g'))];
  if(matches.length){const token=matches.at(-1)[1];put(id,WORDS[token]??Number(token));}
 }
 if(/مطبخين/.test(t))put('services.kitchens',2);
 else if(/(?<![؀-ۿ])مطبخ(?![؀-ۿ])/.test(t)&&!proposals.has('services.kitchens'))put('services.kitchens',1);
 if(/مجلسين/.test(t)){put('hospitality.men',true);put('hospitality.women',true);}
 for(const[id,pattern]of [['hospitality.men','مجلس(?: ال)?رجال|مجلس رجال'],['hospitality.women','مجلس(?: ال)?نساء|مجلس نساء']]){
  if(new RegExp('(?:بدون|لا اريد|ما ابي|ما ابغي) (?:'+pattern+')').test(t))put(id,false);
  else if(new RegExp(pattern).test(t))put(id,true);
 }
 for(const clause of t.split(/[،؛.!\n]|لكن/)){
  if(/مطبخ/.test(clause)){
   if(/مغلق/.test(clause))put('services.kitchenStyle','closed',clause);
   if(/مفتوح/.test(clause))put('services.kitchenStyle',/صاله/.test(clause)?'open_to_hall':'open',clause);
  }
 }
 if(/(?:بدون|لا اريد|ما ابي) (?:غرفه |صاله )?طعام|بدون مقلط/.test(t))put('living.diningCount',0);
 else if(/مقلط|غرفه طعام|صاله طعام/.test(t)&&!proposals.has('living.diningCount'))put('living.diningCount',1);
 if(/صاله(?: عائليه| معيشه)?/.test(t)&&!proposals.has('living.count')&&!/صاله طعام/.test(t))put('living.count',1);
 if(/(?:لا|ما ابي|بدون) حمام لكل غرفه/.test(t))put('sleep.ensuite',false);
 else if(/حمام لكل غرفه|كل غرفه بحمام/.test(t))put('sleep.ensuite',true);
 if(/مدخل رجال مستقل|مجلس الرجال بمدخل مستقل/.test(t))put('hospitality.maleEntry',true);
 if(/مدخل (?:نساء|النساء|عائله|العائله) مستقل/.test(t))put('privacy.familyEntry',true);
 if(/الصاله[^،؛.]{0,12}(?:طوليه|شريطيه)|صاله[^،؛.]{0,12}(?:متوازنه|مربعه)/.test(t)&&/(?:ما ابي|تجنب|لا اريد|متوازنه|مربعه)/.test(t))put('living.shape','balanced');
 const obligationText=t.replace(/(?:مو|مش|ليس|ما هو|ماهي|ما هي|غير)\s+(?:لازم|ضروري|شرط)/g,'').replace(/(?:لا|ما)\s+يجب/g,'');
 const must=/(?:لازم|يجب|ضروري|شرط|لا بد|ممنوع)/.test(obligationText);
 // Keep unclassified wishes visible. Do not silently drop, for example, an
 // acoustic/structural requirement when only the room count was understood.
 const special=/صوت|صوتي|انشائي|اساسات|تسليح|مسبح|منحدر|كرسي متحرك|شقه مستقله|عزل حراري|طاقه شمسيه/.test(t);
 const familiar=new Set('لازم يجب ضروري شرط لا بد ابي ابغى اريد انا عندي و مع بيت منزل غرف غرفه نوم مطبخ مطابخ مطبخين صاله صالات طعام مقلط حمام حمامات دورات دوره مياه مجلس رجال النساء نساء والرجال مستقل مدخل مغلق مفتوح على الصاله العائله للرجال للنساء متوازنه مربعه اجمالا عدد'.split(' '));
 const unclassified=t.split(/\s+/).filter(word=>!/^[\d،؛,.]+$/.test(word)&&!familiar.has(word)&&!familiar.has(word.replace(/^و/,''))&&!Object.hasOwn(WORDS,word));
 if(!proposals.size||special||(must&&unclassified.length))put('budget.nonnegotiable',raw.slice(0,2000));
 if(must)for(const proposal of proposals.values())proposal.priority='mandatory';
 return [...proposals.values()];
}
