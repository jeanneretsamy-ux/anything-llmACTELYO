const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
test('local Actelyo configuration is named without mislabelling optional providers',async()=>{
 const {llmProviderDisplayName}=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/actelyo-llm.js')));
 const generic={value:'generic-openai',name:'Generic OpenAI'};
 assert.equal(llmProviderDisplayName(generic,{GenericOpenAiBasePath:'http://127.0.0.1:1235/v1'}),'Actelyo LLM');
 assert.equal(llmProviderDisplayName(generic,{GenericOpenAiBasePath:'https://example.invalid/v1'}),'Generic OpenAI');
 assert.equal(llmProviderDisplayName({value:'openai',name:'OpenAI'},{GenericOpenAiBasePath:'http://127.0.0.1:1235/v1'}),'OpenAI');
 assert.equal(llmProviderDisplayName(generic,null),'Generic OpenAI');
});
