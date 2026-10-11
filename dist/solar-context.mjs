import { calculateSiteSolar } from './site-solar.mjs';
import { validateLandSurvey, deriveRectangularGeneratorPlot, surveyFingerprint } from './land-survey.mjs';
export function normalizeSiteSolar(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || !['explicit-user','model-survey-first-vertex'].includes(raw.source)) throw Error('إعدادات شمس الموقع غير صالحة.');
  const numeric=key=>{const value=raw[key];if(value==null||value==='')return null;if(typeof value!=='number'||!Number.isFinite(value))throw Error(`قيمة ${key} غير صالحة.`);return value;};
  const out={version:1,source:raw.source,latitude:numeric('latitude'),longitude:numeric('longitude'),instant:raw.instant??'',northAngleDeg:numeric('northAngleDeg'),northConfirmed:raw.northConfirmed===true};
  if(raw.confirmedSurveyFingerprint!==undefined){if(typeof raw.confirmedSurveyFingerprint!=='string'||raw.confirmedSurveyFingerprint.length>20000)throw Error('مرجع تأكيد المسح غير صالح.');out.confirmedSurveyFingerprint=raw.confirmedSurveyFingerprint;}
  if(typeof out.instant!=='string'||out.instant.length>40)throw Error('وقت الشمس المحفوظ غير صالح.');
  // Metadata may retain an unfinished/invalid timestamp or coordinate draft.
  // Only the strict calculator can turn it into computed solar data.
  return out;
}
export function resolveModelSolarLocation(model,modelLandSurvey,modelSurveyAssociated=false) {
  if(modelSurveyAssociated!==true||!model)throw Error('لا يوجد مسح موثق الارتباط بالمخطط الحالي؛ أدخل موقعًا صريحًا.');
  const survey=validateLandSurvey(modelLandSurvey);
  if(!survey||survey.engineLink!=='survey-rectangle')throw Error('مسح المخطط غير مرتبط بمستطيل المولد؛ أدخل موقعًا صريحًا.');
  const derived=deriveRectangularGeneratorPlot(survey,{mode:survey.binding.source==='confirmed-edge-references'?'confirmed':'estimated'});
  for(const key of ['width','length'])if(Math.abs(derived[key]-survey.binding[key])>1e-6||Math.abs(survey.binding[key]-model.plot[key])>1e-6)throw Error('حدود مسح المخطط لا تطابق ربط هندسته؛ لم يُستخدم موقعها.');
  const [longitude,latitude]=survey.geometry.coordinates[0][0];
  return {latitude,longitude,source:'model-survey-first-vertex'};
}
export function siteSolarPreview(raw,{model,modelLandSurvey,modelSurveyAssociated=false}={}) {
  try{
    const context=normalizeSiteSolar(raw);
    if(!context)throw Error('أدخل موقع الأرض والتاريخ والوقت بإزاحة زمنية والشمال المؤكد.');
    if(!context.northConfirmed||context.northAngleDeg==null||context.northAngleDeg<0||context.northAngleDeg>360)throw Error('أدخل زاوية الشمال الحقيقي وأكّدها صراحةً.');
    if(!context.instant)throw Error('أدخل تاريخًا ووقتًا بصيغة ISO مع إزاحة زمنية صريحة.');
    if(context.source==='model-survey-first-vertex'&&context.confirmedSurveyFingerprint!==surveyFingerprint(modelLandSurvey))throw Error('تغيّر مسح المخطط أو لم يؤكد مرجعه؛ أعد تأكيد الشمال للمسح الحالي.');
    const location=context.source==='model-survey-first-vertex'?resolveModelSolarLocation(model,modelLandSurvey,modelSurveyAssociated):context;
    if(location.latitude==null||location.longitude==null)throw Error('خط العرض وخط الطول غير مكتملين.');
    return calculateSiteSolar({...context,...location,wallHeight:3.2});
  }catch(error){return {status:'not-calculated',reason:error.message,visible:false,altitude:null,azimuth:null,shadowLength:null,world:null,plan:null,shadowPerMeter:null};}
}

export function rebindSolarContext(context,previousSurvey,nextSurvey) {
  if(!context||surveyFingerprint(previousSurvey)===surveyFingerprint(nextSurvey))return context;
  const next={...context,northConfirmed:false};delete next.confirmedSurveyFingerprint;return next;
}
