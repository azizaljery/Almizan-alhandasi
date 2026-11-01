import { copy, number, identifier, issue, InputError } from './core.mjs';
import { point, inRoom } from './geometry.mjs';
import { routeOrthogonal } from './routing.mjs';
export function device(ctx, out, spec, layer, kind = spec.kind) {
  try {
    identifier(spec.id, 'device.id'); point(spec.position, spec.id, true);
    const level = ctx.project.architecture.levels.find(l => l.id === spec.levelId);
    if (!level) throw new InputError('UNKNOWN_LEVEL', spec.id);
    if (spec.roomId) {
      const room = ctx.project.architecture.rooms.find(r => r.id === spec.roomId && r.levelId === spec.levelId);
      if (!room || !inRoom(spec.position, room)) throw new InputError('DEVICE_OUTSIDE_ROOM', spec.id);
    }
    const d = { ...copy(spec), discipline: out.id, layer, kind };
    out.devices.push(d); return d;
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    out.issues.push(issue(out.id, e.code, 'تعذر تثبيت عنصر بسبب موقع أو مرجع غير صالح.', { id: spec.id, path: e.path }, 'error')); return null;
  }
}
export function makeRoute(ctx, out, spec) {
  try {
    const cfg = ctx.project.rules.routingByLevel?.[spec.levelId];
    const level = ctx.project.architecture.levels.find(l => l.id === spec.levelId);
    if (!cfg || !level) throw new InputError('ROUTING_DOMAIN_REQUIRED', spec.levelId);
    number(spec.routeHeightM, 'routeHeightM');
    const geometry = routeOrthogonal({ start: spec.start, end: spec.end, domain: cfg, zM: level.elevationM + spec.routeHeightM, obstacles: ctx.project.architecture.obstacles, stepM: cfg.stepM, clearanceM: spec.clearanceM, widthM: spec.widthM, heightM: spec.heightM });
    const route = { ...copy(spec), discipline: out.id, ...geometry };
    delete route.start; delete route.end;
    out.routes.push(route);
    if (route.status === 'BLOCKED') out.issues.push(issue(out.id, 'ROUTE_BLOCKED', 'لم يوجد مسار ضمن الحيز والعوائق المعلنة؛ لم يُرسم اتصال وهمي.', { id: spec.id, reason: route.reason }, 'error'));
    return route;
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    out.issues.push(issue(out.id, e.code, 'بيانات المسار أو أبعاده غير مكتملة.', { id: spec.id, path: e.path })); return null;
  }
}
export function requiredReview(out, text, code = 'SPECIALIST_REVIEW_REQUIRED') { out.issues.push(issue(out.id, code, text)); }
export const schedule = (id, columns, rows) => ({ id, columns, rows });
