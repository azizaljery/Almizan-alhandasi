// Explicit integration seam; not connected to live flow.
import * as native from '../sharaa/brief.mjs';
import {toEngineInput} from '../sharaa/adapter.mjs';
import {projectNative} from './core.mjs';
export function previewProjection(v3,v2){const p=projectNative(v3,v2,native);return {...p,engineInput:toEngineInput(p.brief)};}
