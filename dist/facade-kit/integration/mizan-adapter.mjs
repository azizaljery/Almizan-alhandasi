import {createFacadeAgentActions} from '../src/agent.mjs';
/** Pass the EXISTING functions from the site. Do not import the research page. */
export function connectMizanFacadeAgent({getDocument,buildAllSides,sideTransform,validateDoc,getFacadeOptions}){
  return createFacadeAgentActions({getDocument,buildAllSides,sideTransform,validateDoc,getOptions:getFacadeOptions});
}
