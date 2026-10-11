import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSiteSolar as solar} from '../dist/site-solar.mjs';
const input={latitude:39.742476,longitude:-105.1786,instant:'2003-10-17T12:30:30-07:00',northAngleDeg:0};
const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} ±${t}`);
test('independent published NREL SPA example: geometric elevation and navigator azimuth',()=>{
 const p=solar(input);
 // NREL/TP-560-34302 Table A5.1: latitude39.742476, topocentric
 // declination -9.316179, hour angle11.10629. Equation41 gives geometric
 // e0=39.8720419048. Published50.11162 zenith INCLUDES refraction; not oracle.
 near(p.altitude,39.872041904796866,.01);near(p.azimuth,194.34024,.01);
 near(p.equationOfTime,14.641503,.02);assert.equal(p.provenance.refraction,false);
});
test('explicit offset and equivalent UTC instant produce identical physical values',()=>{
 const a=solar(input),b=solar({...input,instant:'2003-10-17T19:30:30Z'});
 assert.deepEqual(a.enu,b.enu);assert.deepEqual(a.world,b.world);assert.equal(a.provenance.instant,b.provenance.instant);
});
test('coordinates zero are valid and missing/nonfinite values never default',()=>{
 assert.ok(Number.isFinite(solar({...input,latitude:0,longitude:0}).altitude));
 for(const name of ['latitude','longitude','northAngleDeg'])for(const value of [undefined,null,'',NaN,Infinity,'0'])assert.throws(()=>solar({...input,[name]:value}));
 for(const [name,value] of [['latitude',90.01],['longitude',180.01],['wallHeight',0],['wallHeight',Infinity]])assert.throws(()=>solar({...input,[name]:value}));
});
test('strict ISO parser rejects unknown offset, impossible calendars and local time',()=>{
 for(const instant of ['2024-01-01T12:00','2024-01-01','2024-01-01T12:00-00:00','2023-02-29T12:00Z','2024-04-31T12:00Z','2024-13-01T12:00Z','2024-00-01T12:00Z','2024-01-00T12:00Z','2024-01-01T24:00Z','2024-01-01T12:60Z','2024-01-01T12:00:60Z','2024-01-01T12:00+24:00','2024-01-01T12:00+03:60','1900-12-31T12:00Z','2100-01-01T00:00Z','1901-01-01T00:00+01:00','2099-12-31T23:59-01:00'])assert.throws(()=>solar({...input,instant}),instant);
 assert.ok(Number.isFinite(solar({...input,instant:'2000-02-29T12:00:00.123+00:00'}).altitude));
});
test('clockwise surveyed north rotation is applied once to actual ENU',()=>{
 const a=solar(input),b=solar({...input,northAngleDeg:90});assert.deepEqual(a.enu,b.enu);
 near(b.plan.x,a.enu.north);near(b.plan.y,-a.enu.east);near(b.world.z,a.enu.east);
 near(b.shadowPerMeter.x,-b.world.x/b.world.y);near(b.shadowPerMeter.y,b.world.z/b.world.y);
 const wrap=solar({...input,northAngleDeg:360});near(wrap.world.x,a.world.x);near(wrap.world.z,a.world.z);
});
test('vertical sun is valid with null azimuth, finite direction and near-zero shadow',()=>{
 const instant='2024-03-20T12:00:00Z',seed=solar({...input,instant});
 const p=solar({latitude:seed.declination,longitude:-seed.equationOfTime/4,instant,northAngleDeg:17});
 assert.equal(p.azimuth,null);assert.equal(p.visible,true);near(p.altitude,90);near(p.world.y,1);assert.ok(p.shadowLength<1e-10);
});
test('night and polar winter turn off direct sun; polar summer remains valid',()=>{
 const night=solar({latitude:0,longitude:0,instant:'2024-03-20T00:00Z',northAngleDeg:0});assert.equal(night.visible,false);assert.equal(night.shadowLength,null);assert.equal(night.shadowPerMeter,null);
 for(const latitude of [-90,90])for(const instant of ['2024-06-21T12:00Z','2024-12-21T12:00Z']){const p=solar({...input,latitude,instant});near(Math.hypot(...Object.values(p.world)),1);assert.equal(p.visible,latitude===90?instant.includes('06-21'):instant.includes('12-21'));}
});
test('low positive elevation retains unrounded direction and very long shadow',()=>{
 const instant='2024-03-20T12:00Z',seed=solar({...input,instant});
 const p=solar({latitude:0,longitude:(89.9999*4-seed.equationOfTime)/4,instant,northAngleDeg:0});
 assert.ok(p.altitude>0&&p.altitude<.001);assert.ok(p.shadowLength>1000000);
 near(p.shadowLength,Math.hypot(p.shadowPerMeter.x,p.shadowPerMeter.y)*p.wallHeight,1e-6);
});
test('input remains unchanged and caller provenance is never a verification claim',()=>{
 const a=Object.freeze({...input,source:'explicit-user'}),p=solar(a);assert.equal(p.status,'approximate-site');assert.equal(p.provenance.inputVerified,false);assert.equal(p.provenance.source,'explicit-user');assert.equal(a.instant,input.instant);
});

test('method regression preserves NOAA/Meeus sample values (not an independent oracle)',()=>{
 const p=solar(input);near(p.altitude,39.87207442406391,1e-9);near(p.azimuth,194.34258286147943,1e-9);
});
for(const [angle,signE,signN] of [[180,-1,-1],[270,-1,1]])test(`explicit ${angle} degree north rotation preserves true ENU and maps plan axes`,()=>{
 const p=solar({...input,northAngleDeg:angle}),{east,north,up}=p.enu;
 if(angle===180){near(p.plan.x,signE*east);near(p.plan.y,signN*north);}
 else{near(p.plan.x,signE*north);near(p.plan.y,signN*east);}
 near(p.world.x,p.plan.x);near(p.world.y,up);near(p.world.z,-p.plan.y);
 near(p.shadowPerMeter.x,-p.plan.x/up);near(p.shadowPerMeter.y,-p.plan.y/up);
});
test('near-polar latitudes remain finite across winter/summer with honest night visibility',()=>{
 for(const latitude of [-89.999,89.999])for(const month of ['06','12']){
  const p=solar({...input,latitude,instant:`2024-${month}-21T12:00:00Z`});
  for(const value of [...Object.values(p.enu),...Object.values(p.world),p.altitude,p.azimuth])assert.ok(Number.isFinite(value));
  near(Math.hypot(...Object.values(p.world)),1);
  assert.equal(p.visible,latitude>0?month==='06':month==='12');
  assert.equal(p.shadowLength===null,!p.visible);
 }
});
test('both valid UTC range endpoints are included, with millisecond precision',()=>{
 for(const instant of ['1901-01-01T00:00:00.000Z','2099-12-31T23:59:59.999Z']){
  const p=solar({...input,instant});assert.equal(p.provenance.instant,instant);assert.ok(Number.isFinite(p.altitude));near(Math.hypot(...Object.values(p.world)),1);
 }
});
