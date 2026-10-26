/** Search preferences ONLY; not regulatory bathroom dimensions. */
export const BATH_DEPTH_PREFERENCES=Object.freeze({deep:{min:1.95,max:2.9},side:{min:1.5,max:2.4}});
export function evaluateBath({type,depth,fixturesFit=false,doorClearance=false,ventilation=false,clientRange=null}){
 if(!(type in BATH_DEPTH_PREFERENCES)||!Number.isFinite(depth)||depth<=0)throw Error('Invalid bath');
 const {min,max}=BATH_DEPTH_PREFERENCES[type];
 const preferred=depth>=min&&depth<=max;
 const clientOK=!clientRange||(depth>=clientRange.min&&depth<=clientRange.max);
 return {preferred,clientOK,functional:fixturesFit&&doorClearance&&ventilation,
  preliminaryAccept:clientOK&&fixturesFit&&doorClearance&&ventilation,
  disclaimer:'Verify applicable regulations and specialist requirements'};
}
