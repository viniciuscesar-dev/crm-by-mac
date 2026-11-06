import {json,body,auth,requireSameOrigin,db,uid,legacyEvent} from './_db.mjs';

const schema={
 client_name:'string|null',bank:'string|null',amortization_system:'string|null',
 total_installments:'number|null',paid_installments:'number|null',remaining_installments:'number|null',
 financed_value:'number|null',current_balance:'number|null',current_installment:'number|null',
 contract_interest_rate:'number|null',contract_interest_period:'a.m.|a.a.|null'
};

const normalize=o=>({
 fields:o.fields||{},
 readable:o.readable!==false,
 legibility:o.legibility||'readable',
 legibility_score:Number(o.legibility_score??1),
 field_confidence:o.field_confidence||{},
 provider:o.provider||'configured'
});

const prompt=`Você é um leitor documental para contratos financeiros brasileiros.
Avalie primeiro a legibilidade. Se o documento estiver desfocado, cortado, escuro ou os números não puderem ser lidos com segurança, marque readable=false e legibility="unreadable".
Se apenas parte estiver legível, use legibility="partial".
Extraia SOMENTE dados explicitamente visíveis. Não invente, não estime e não calcule taxa de juros.
A taxa contratual só pode ser retornada quando estiver escrita e legível, com periodicidade se aparecer.
Para cada campo extraído, informe confiança de 0 a 1.
Retorne somente JSON válido, sem markdown, com:
{"readable":true,"legibility":"readable|partial|unreadable","legibility_score":0.0,"fields":${JSON.stringify(schema)},"field_confidence":{"bank":0.0}}`;

async function openAIExtract({base64,mime,fileName,product}){
 const key=process.env.OPENAI_API_KEY;if(!key)return null;
 const model=process.env.DOCUMENT_EXTRACT_MODEL||'gpt-5.6-luna';
 const isImage=mime.startsWith('image/');
 const content=[{type:'input_text',text:`Tipo informado pelo consultor: ${product||'Outros'}.\n${prompt}`}];
 if(isImage)content.push({type:'input_image',image_url:`data:${mime};base64,${base64}`,detail:'high'});
 else content.push({type:'input_file',filename:fileName||'documento.pdf',file_data:base64});
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],max_output_tokens:1800})});
 if(!r.ok){const err=await r.text();console.error('OpenAI document extract',r.status,err.slice(0,500));throw new Error('O serviço de leitura documental não conseguiu processar o arquivo.')}
 const out=await r.json();
 let text=out.output_text||'';
 if(!text&&Array.isArray(out.output))for(const item of out.output)for(const c of item.content||[])if(c.type==='output_text')text+=c.text||'';
 text=text.trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
 const parsed=JSON.parse(text);
 return normalize({...parsed,provider:'openai'});
}

async function genericExtract({url,token,base64,mime,fileName,product}){
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({
   file_name:fileName,mime_type:mime,base64,product,language:'pt-BR',expected_schema:schema,
   instructions:'Primeiro avalie a legibilidade. Se ilegível, retorne readable=false e não invente campos. Se parcialmente legível, retorne confiança individual. Extraia somente informações explícitas. Não calcule taxa de juros. A taxa contratual só deve ser extraída quando estiver escrita e legível.'
 })});
 if(!r.ok)throw new Error('O serviço de leitura documental não conseguiu processar o arquivo.');
 const out=await r.json();return normalize({...out,fields:out.fields||out,provider:'custom'});
}

export default async req=>{const e=await legacyEvent(req);try{
 const u=await auth(e);if(!u)return json({message:'Não autenticado.'},401);
 if(e.httpMethod!=='POST')return json({message:'Método não permitido.'},405);
 const guard=requireSameOrigin(e);if(guard)return guard;
 const b=await body(e),base64=String(b.base64||''),mime=String(b.mime_type||'application/octet-stream');
 if(!base64)return json({message:'Documento obrigatório.'},400);
 if(base64.length>14_000_000)return json({message:'Documento muito grande. Limite aproximado: 10 MB.'},413);
 const args={base64,mime,fileName:String(b.file_name||'documento').slice(0,240),product:String(b.product||'Outros').slice(0,80)};
 let result=null;
 if(process.env.OPENAI_API_KEY)result=await openAIExtract(args);
 else if(process.env.DOCUMENT_EXTRACT_URL)result=await genericExtract({...args,url:process.env.DOCUMENT_EXTRACT_URL,token:process.env.DOCUMENT_EXTRACT_TOKEN});
 else return json({message:'Leitura automática ainda não foi configurada. Adicione OPENAI_API_KEY no Netlify ou configure DOCUMENT_EXTRACT_URL para outro provedor.'},503);
 try{await db.sql`INSERT INTO integration_usage(id,company_id,user_id,integration,operation,status,metadata) VALUES(${uid()},${u.company_id},${u.id},'document_ai','extract','success',${JSON.stringify({provider:result.provider||'configured',legibility:result.legibility||null})})`}catch{}
 return json(result);
}catch(err){console.error(err);return json({message:err?.message||'Erro interno na leitura documental.'},500)}};