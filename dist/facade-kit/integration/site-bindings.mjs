import {createFacadeAgentActions} from '../src/agent.mjs';
import {projectOptions,integrationReference} from '../src/project.mjs';
import {fail} from '../src/core.mjs';
function connect({getDocument,getBinding,getPolicy,getBuildInfo,getRoofSurfaces=()=>[],buildAllSides,sideTransform,validateDoc}){
  const getOptions=doc=>projectOptions({policy:getPolicy(),buildInfo:getBuildInfo(),...getBinding(),roofSurfaces:getRoofSurfaces(doc)});
  const actions=createFacadeAgentActions({getDocument,getOptions,buildAllSides,sideTransform,validateDoc});
  return {...actions,async reference(){const doc=getDocument();return integrationReference(doc,getOptions(doc));}};
}
/** Native design.mjs uses session.designs[session.current].doc, parsed by parseDoc. */
export function bindDesignSession({getSession,parseDoc,projectId,...config}){
  const current=()=>{const s=getSession();if(!s||!Number.isInteger(s.current)||!s.designs?.[s.current])fail('NO_ACTIVE_DESIGN','session');return s;};
  return connect({...config,getDocument:()=>{const s=current();return parseDoc(s.designs[s.current].doc);},getBinding:()=>{const s=current(),d=s.designs[s.current];return {projectId,designId:`${s.createdAt}:${s.current}:${d.version??s.current+1}:${d.alt??'base'}`};}});
}
/** Pass the existing Editor instance. No localStorage reads or automatic event polling. */
export function bindStudioEditor({editor,getProjectId,...config}){
  if(!editor||typeof getProjectId!=='function')fail('EDITOR_BINDING_REQUIRED','editor');
  return connect({...config,getDocument:()=>editor.doc,getBinding:()=>({projectId:getProjectId(),designId:'studio-document'})});
}
