const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const asar=require('@electron/asar');
const [installed,out]=process.argv.slice(2);
assert(installed && out,'Usage: installed-api-upload.cjs installed-dir proof-dir');
fs.mkdirSync(out,{recursive:true});
const archive=path.join(installed,'resources','app.asar');
const version=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8')).version;
assert.equal(version,require('../package.json').version,'Installed app version differs from built version');
const runtimeCode=asar.extractFile(archive,'runtime.cjs');
assert.deepEqual(runtimeCode,fs.readFileSync(path.join(__dirname,'../runtime.cjs')),'Installed runtime differs from source under test');
const moduleFile=path.join(out,'installed-runtime.cjs');fs.writeFileSync(moduleFile,runtimeCode);
const runtime=require(moduleFile).createRuntime(path.join(installed,'resources','runtime'),path.join(out,'profile'),console.log);
const marker='ACTELYO-API-'+crypto.randomUUID();
(async()=>{
 try{
  const {origin}=await runtime.start();
  const keyResponse=await fetch(origin+'/api/system/generate-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert(keyResponse.ok,'QA API key creation failed');
  const key=(await keyResponse.json()).apiKey?.secret;assert(key,'QA API key missing');
  const form=new FormData();form.set('file',new Blob([`Document synthetique ${marker}. Montant 7429 euros, date 03/11/2026.`],{type:'text/plain'}),'piece-api-qa.txt');
  const response=await fetch(origin+'/api/v1/document/upload',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(120000)});
  const body=await response.text();assert(response.ok,'Real installed API upload failed '+response.status+': '+body.slice(0,1500));
  const result=JSON.parse(body);assert(result.success && result.documents?.length,'Collector returned no document');
  const storage=path.resolve(out,'profile','storage','documents');
  const document=path.resolve(storage,result.documents[0].location);
  assert(document.startsWith(storage+path.sep),'Collector document location escaped storage');
  assert(fs.readFileSync(document,'utf8').includes(marker),'Processed document lost its original text');
  fs.writeFileSync(path.join(out,'api-upload-proof.json'),JSON.stringify({passed:true,version,endpoint:'/api/v1/document/upload',httpStatus:response.status,collectorTextVerified:true},null,2));
  console.log('PASS actual installed API upload and collector text preservation');
 }finally{runtime.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
