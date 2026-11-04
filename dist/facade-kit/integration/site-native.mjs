// This module is resolved AFTER copying the package to dist/facade-kit/ in Almizan-alhandasi.
import {buildAllSides,sideTransform} from '../../facade-realism/model.mjs';
import {validateDoc,parseDoc} from '../../draw/doc.mjs';
import {bindDesignSession,bindStudioEditor} from './site-bindings.mjs';
import {BUILD_INFO} from '../config/build-info.mjs';
export const connectDesignFacade=opts=>bindDesignSession({...opts,buildAllSides,sideTransform,validateDoc,parseDoc,getBuildInfo:opts.getBuildInfo||(()=>BUILD_INFO)});
export const connectStudioFacade=opts=>bindStudioEditor({...opts,buildAllSides,sideTransform,validateDoc,getBuildInfo:opts.getBuildInfo||(()=>BUILD_INFO)});
