const fs=require('node:fs'),path=require('node:path');
const FILE='desktop-service.json';
function announce(dataDir,origin,pid=process.pid){
 const url=new URL(origin);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!Number.isInteger(pid)||pid<=0)throw Error('Invalid desktop service');
 const record={schemaVersion:1,product:'Actelyo RAG',state:'ready',pid,apiBase:url.origin+'/api/v1',startedAt:new Date().toISOString()};
 fs.mkdirSync(dataDir,{recursive:true});
 const file=path.join(dataDir,FILE),pending=file+'.'+pid+'.tmp';
 fs.writeFileSync(pending,JSON.stringify(record),{mode:0o600});fs.renameSync(pending,file);
 return record;
}
function withdraw(dataDir,pid=process.pid){
 const file=path.join(dataDir,FILE);
 try{const record=JSON.parse(fs.readFileSync(file,'utf8'));if(record.pid===pid){const pending=file+'.'+pid+'.tmp';fs.writeFileSync(pending,JSON.stringify({...record,state:'stopped',stoppedAt:new Date().toISOString()}),{mode:0o600});fs.renameSync(pending,file);}}catch(error){if(error.code!=='ENOENT')throw error;}
}
module.exports={announce,withdraw};
