import test from 'node:test';
import assert from 'node:assert';
import { load } from './load.mjs';
const { STEPW } = load();
const box=(x0,y0,z0,x1,y1,z1)=>{const V=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const Fq=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];const t=[];for(const q of Fq)for(const k of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]])for(const i of k)t.push(...V[i]);return t;};
test('STEP: closed box → one solid with 6 planar faces, shared edges', () => {
  const r=STEPW.write([{name:'b',tris:box(0,0,0,10,20,5)}],{name:'t',date:new Date(0)});
  assert.equal(r.stats.solids,1);assert.equal(r.stats.faces,6);assert.deepEqual(r.stats.skipped,[]);
  assert.equal((r.text.match(/ADVANCED_FACE/g)||[]).length,6);
  assert.equal((r.text.match(/EDGE_CURVE/g)||[]).length,12,'12 shared edges');
  assert.equal((r.text.match(/VERTEX_POINT/g)||[]).length,8);
  assert.ok(r.text.startsWith('ISO-10303-21;'));assert.ok(/AUTOMOTIVE_DESIGN/.test(r.text));assert.ok(/MANIFOLD_SOLID_BREP\('b'/.test(r.text));assert.ok(/END-ISO-10303-21;/.test(r.text));
});
test('STEP: open mesh is skipped, plate with a hole keeps the inner loop', () => {
  const open=box(0,0,0,1,1,1).slice(0,9*4);
  const r=STEPW.write([{name:'open',tris:open}],{name:'t'});assert.equal(r.stats.solids,0);assert.deepEqual(r.stats.skipped,['open']);
  // ring plate 30x30x2 with 10x10 hole
  const o=[[0,0],[30,0],[30,30],[0,30]],ii=[[10,10],[20,10],[20,20],[10,20]],P=[];
  const quad=(a,b,c,d,rev)=>{const t=[[a,b,c],[a,c,d]];for(const q of (rev?t.map(x=>x.slice().reverse()):t))for(const p of q)P.push(...p);};
  for(let k=0;k<4;k++){const a=o[k],b=o[(k+1)%4],c=ii[(k+1)%4],d=ii[k];
    quad([a[0],a[1],2],[b[0],b[1],2],[c[0],c[1],2],[d[0],d[1],2]);quad([a[0],a[1],0],[b[0],b[1],0],[c[0],c[1],0],[d[0],d[1],0],true);
    quad([a[0],a[1],0],[b[0],b[1],0],[b[0],b[1],2],[a[0],a[1],2],true);quad([d[0],d[1],0],[c[0],c[1],0],[c[0],c[1],2],[d[0],d[1],2]);}
  const r2=STEPW.write([{name:'plate',tris:P}],{name:'t'});assert.equal(r2.stats.solids,1);assert.equal(r2.stats.faces,10);
  assert.equal((r2.text.match(/FACE_BOUND\(/g)||[]).length,2,'top and bottom each carry a hole loop');
});
