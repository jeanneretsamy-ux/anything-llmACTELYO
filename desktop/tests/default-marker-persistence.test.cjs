const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {initializeDefaultLlm}=require('../llm-defaults.cjs');
test('the actual backend ENV serializer preserves the first-run marker after an intentional provider removal',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'actelyo-rag-marker-')),'.env');
 fs.writeFileSync(file,'');initializeDefaultLlm(file);
 const sandbox={module:{exports:{}},process:{env:{ACTELYO_ENV_PATH:file,ACTELYO_DEFAULT_LLM_INITIALIZED:'1',LLM_PROVIDER:''}},console,
  require:name=>{
   if(name==='fs'||name==='path')return require(name);
   // These unrelated services are never called by dumpENV; no provider or filesystem behavior is stubbed.
   if(name==='../../models/telemetry')return {Telemetry:{}};
   if(name==='../vectorStore/resetAllVectorStores')return {resetAllVectorStores:()=>{throw Error('Unexpected vector-store mutation');}};
   throw Error('Unexpected import: '+name);
  }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime-overrides/server/utils/helpers/updateENV.js'),'utf8'),sandbox);
 sandbox.module.exports.dumpENV();
 assert.match(fs.readFileSync(file,'utf8'),/^ACTELYO_DEFAULT_LLM_INITIALIZED=['"]?1['"]?$/m);
 assert.equal(initializeDefaultLlm(file,{environment:{}}).initialized,false);
});
