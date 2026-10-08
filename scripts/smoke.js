const c=require('../lib/content');
for(const p of c.PAGES){const d=c.defaults(p);console.log(p,'|',d.title,'|',d.description.length,'| schema',d.schema.length)}
console.log('slots',c.slots().length);
