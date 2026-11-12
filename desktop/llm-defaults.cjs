const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');

function values(text){
 const result=new Map();
 for(const line of text.split(/\r?\n/)){
  const match=line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if(!match)continue;
  let value=match[2].replace(/\s+#.*$/,'').trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  result.set(match[1],value);
 }
 return result;
}

function initializeDefaultLlm(file,{environment=process.env}={}){
 const text=fs.readFileSync(file,'utf8'),saved=values(text);
 if(saved.get('ACTELYO_DEFAULT_LLM_INITIALIZED')==='1'||saved.get('LLM_PROVIDER')||environment.LLM_PROVIDER)
  return {initialized:false};
 // A partially configured compatible endpoint is a user choice, too.
 if(saved.get('GENERIC_OPEN_AI_BASE_PATH')||environment.GENERIC_OPEN_AI_BASE_PATH)
  return {initialized:false};
 const defaults={
  LLM_PROVIDER:'generic-openai',
  GENERIC_OPEN_AI_BASE_PATH:'http://127.0.0.1:1235/v1',
  GENERIC_OPEN_AI_MODEL_PREF:'auto',
  GENERIC_OPEN_AI_MODEL_TOKEN_LIMIT:'4096',
  GENERIC_OPEN_AI_MAX_TOKENS:'1024',
  // The OpenAI-compatible SDK requires a nonempty label. This is not a secret;
  // Actelyo's loopback API does not require a user credential by default.
  GENERIC_OPEN_AI_API_KEY:'actelyo-local',
  ACTELYO_DEFAULT_LLM_INITIALIZED:'1',
 };
 const additions=Object.entries(defaults).filter(([key])=>!saved.get(key))
  .map(([key,value])=>`${key}=${value}`).join('\n');
 const next=text+(text.endsWith('\n')?'':'\n')+'# Actelyo LLM — local default provider\n'+additions+'\n';
 const temporary=path.join(path.dirname(file),`.actelyo-llm-${randomUUID()}.tmp`);
 try{
  fs.writeFileSync(temporary,next,{flag:'wx',mode:0o600});
  fs.renameSync(temporary,file);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return {initialized:true,provider:'actelyo',baseUrl:defaults.GENERIC_OPEN_AI_BASE_PATH};
}
module.exports={initializeDefaultLlm};
