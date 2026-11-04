import {connectDesignFacade} from './site-native.mjs';
import {createFacadeViewer} from '../src/viewer.mjs';
/** Opt-in preview panel, mounted by design.mjs only when ?facade-kit=1. */
export async function mountDesignFacadePanel(host,{getSession,projectId,loadThree,getBuildInfo}){
  const response=await fetch(new URL('../config/project-policy.json',import.meta.url));if(!response.ok)throw new Error('FACADE_POLICY_HTTP');
  const policy=await response.json(),agent=connectDesignFacade({getSession,projectId,getPolicy:()=>policy,...(getBuildInfo?{getBuildInfo}: {})});
  const title=document.createElement('h2');title.textContent='اقتراحات الواجهة';
  const caption=document.createElement('p');caption.textContent='معاينة أولية؛ البروزات الجديدة متوقفة حتى تحديد قواعد المشروع، ومقاسات الحجر افتراضات عرض.';
  const controls=document.createElement('div'),status=document.createElement('p'),canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:440px;max-width:100%';canvas.setAttribute('aria-label','معاينة الواجهة');
  host.replaceChildren(title,caption,controls,status,canvas);let viewer=null,disposed=false,operation=0;
  const invalidate=()=>{operation++;viewer?.dispose();viewer=null;agent.clear();status.textContent='أعد توليد الواجهة بعد تغيير التصميم.';};
  for(const style of ['A','B','C']){const button=document.createElement('button');button.type='button';button.textContent='البديل '+style;controls.append(button);button.onclick=async()=>{
    const token=++operation;controls.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='جاري تجهيز الواجهة…';
    let next;
    try{const result=await agent.call('facade.generate',{style,expectedDocumentHash:await agent.documentHash()});
      const current=await agent.call('facade.get',{resultId:result.resultId});const THREE=await loadThree();
      if(disposed||token!==operation)return;viewer?.dispose();viewer=null;
      next=await createFacadeViewer(THREE,canvas,current.result);
      const valid=await agent.call('facade.validate',{resultId:result.resultId});
      if(disposed||token!==operation||!valid.fresh){next.dispose();return;}
      viewer=next;next=null;status.textContent='معاينة غير معتمدة بصريًا أو تنفيذيًا.';
    }catch(e){next?.dispose();if(!disposed&&token===operation)status.textContent='تعذّر عرض الواجهة: '+e.message;}
    finally{if(!disposed&&token===operation)controls.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };}
  return {agent,invalidate,dispose(){disposed=true;invalidate();host.replaceChildren();}};
}
