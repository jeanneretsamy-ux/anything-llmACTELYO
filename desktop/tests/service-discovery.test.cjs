const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {announce,withdraw}=require('../service-discovery.cjs');
test('service announcement follows real ports and preserves another owner',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'actelyo-rag-service-')),file=path.join(dir,'desktop-service.json');
 announce(dir,'http://127.0.0.1:23541');let record=JSON.parse(fs.readFileSync(file));assert.equal(record.apiBase,'http://127.0.0.1:23541/api/v1');assert.equal(record.pid,process.pid);assert.equal(record.product,'Actelyo RAG');assert(!JSON.stringify(record).includes('key'));
 announce(dir,'http://127.0.0.1:23542');assert.equal(JSON.parse(fs.readFileSync(file)).apiBase,'http://127.0.0.1:23542/api/v1');
 withdraw(dir,process.pid+1);assert.equal(JSON.parse(fs.readFileSync(file)).state,'ready');withdraw(dir);assert.equal(JSON.parse(fs.readFileSync(file)).state,'stopped');
 assert.throws(()=>announce(dir,'https://other.example'));assert.throws(()=>announce(dir,'http://127.0.0.1:1234',0));
});
