import { createDoc, applyCommand } from '../../dist/draw/doc.mjs';
export function architectVilla({ longHall = false, diningDoor = true, femaleEntry = true } = {}) {
  let doc = createDoc();
  const command = c => { const r = applyCommand(doc, c); doc = r.doc; return r.ids; };
  const rooms = [
    ['men', 'مجلس الرجال', 'majlis', 0, 0, 5, 5], ['dining', 'صالة الطعام', 'dining', 5, 0, 10, 5], ['kitchen', 'المطبخ', 'kitchen', 10, 0, 15, 5],
    ['women', 'مجلس النساء', 'majlis', 0, 5, 5, 10], ['hall', 'الصالة', 'living', 5, 5, 10, longHall ? 19 : 10], ['bed', 'غرفة النوم', 'bedroom', 10, 5, 15, 10],
  ];
  const ids = {}, walls = {};
  for (const [id, name, type, x, y, X, Y] of rooms) {
    command({ type: 'add-rect', level: 'L1', a: { x, y }, b: { x: X, y: Y }, t: .2 });
    const points = [{x,y},{x:X,y},{x:X,y:Y},{x,y:Y}];
    walls[id] = points.map((a,i) => {const b=points[(i+1)%4];return doc.walls.find(w => (w.a.x===a.x&&w.a.y===a.y&&w.b.x===b.x&&w.b.y===b.y)||(w.a.x===b.x&&w.a.y===b.y&&w.b.x===a.x&&w.b.y===a.y))?.id;});
    ids[id] = command({ type: 'add-label', level: 'L1', seed: { x: (x + X) / 2, y: (y + Y) / 2 }, name, roomType: type })[0];
  }
  const door = (wall, at, entry = false) => command({ type: 'add-opening', wall, at, kind: 'door', w: .9, h: 2.1, entry })[0];
  const entries = { men: door(walls.men[0], 2.5, true) };
  if (femaleEntry) entries.women = door(walls.women[3], 2.5, true);
  if (diningDoor) door(walls.men[1], 2.5);
  door(walls.dining[1], 2.5);
  door(walls.women[1], 2.5); door(walls.bed[3] || walls.hall[1], 2.5);
  return { doc, ids, walls, entries };
}
