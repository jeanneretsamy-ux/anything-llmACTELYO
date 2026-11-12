const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {initializeDefaultLlm}=require('../llm-defaults.cjs');
const profile=text=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'actelyo-rag-default-'));const file=path.join(root,'.env');fs.writeFileSync(file,text);return file;};

test('fresh profiles A → B → A use local Actelyo without changing the RAG configuration',()=>{
 const a=profile('# Cabinet A\nVECTOR_DB=lancedb\nEMBEDDING_ENGINE=native\n'),b=profile('# Cabinet B\n');
 for(const file of [a,b]){
  assert.equal(initializeDefaultLlm(file).initialized,true);
  const text=fs.readFileSync(file,'utf8');
  assert.match(text,/LLM_PROVIDER=generic-openai/);
  assert.match(text,/GENERIC_OPEN_AI_BASE_PATH=http:\/\/127.0.0.1:1235\/v1/);
  assert.match(text,/GENERIC_OPEN_AI_MODEL_PREF=auto/);
 }
 const before=fs.readFileSync(a,'utf8');assert.match(before,/EMBEDDING_ENGINE=native/);
 assert.equal(initializeDefaultLlm(a).initialized,false);assert.equal(fs.readFileSync(a,'utf8'),before);
 assert(!fs.readFileSync(b,'utf8').includes('Cabinet A'));
});
test('an explicit provider or custom compatible endpoint remains byte-identical',()=>{
 for(const text of ['LLM_PROVIDER=ollama\nOLLAMA_BASE_PATH=http://127.0.0.1:11434\n',
   'LLM_PROVIDER="openai"\nOPEN_AI_KEY=test-only-not-a-secret\n',
   'GENERIC_OPEN_AI_BASE_PATH=https://example.invalid/v1\n']){
  const file=profile(text);assert.equal(initializeDefaultLlm(file).initialized,false);
  assert.equal(fs.readFileSync(file,'utf8'),text);
 }
});
test('explicit clearing after initialization does not resurrect a provider',()=>{
 const file=profile('');initializeDefaultLlm(file);
 fs.writeFileSync(file,'ACTELYO_DEFAULT_LLM_INITIALIZED=1\nLLM_PROVIDER=\n');
 assert.equal(initializeDefaultLlm(file).initialized,false);
 assert.equal(fs.readFileSync(file,'utf8'),'ACTELYO_DEFAULT_LLM_INITIALIZED=1\nLLM_PROVIDER=\n');
});
