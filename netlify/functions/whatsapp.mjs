import crypto from 'node:crypto';
import {db,json,body,auth,requireSameOrigin} from './_db.mjs';
const digits=v=>String(v||'').replace(/\D/g,'');
const allowed=u=>u&&['admin','consultant'].includes(u.role)&&u.company_id;
const isAdmin=u=>u.role==='admin';
const err=(m,s=400)=>json({message:m},s);
const metaVersion='v23.0';
async function sendMeta(numberId,payload){
 const token=process.env.WHATSAPP_ACCESS_TOKEN;
 if(!token)throw new Error('WHATSAPP_ACCESS_TOKEN não configurado no Worker.');
 const r=await fetch(`https://graph.facebook.com/${metaVersion}/${encodeURIComponent(numberId)}/messages`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',...payload})});
 const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||'Erro da API da Meta');return data;
}
async function verifySignature(req,raw){
 const secret=process.env.META_APP_SECRET;
 if(!secret)return false;
 const signature=req.headers.get('x-hub-signature-256')||'';
 const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
async function webhook(req){
 const url=new URL(req.url);
 if(req.method==='GET'){
  const ok=url.searchParams.get('hub.mode')==='subscribe'&&url.searchParams.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN;
  return ok&&process.env.WHATSAPP_VERIFY_TOKEN?new Response(url.searchParams.get('hub.challenge')||''):new Response('Forbidden',{status:403});
 }
 if(req.method!=='POST')return err('Método inválido',405);
 const raw=await req.text();if(!await verifySignature(req,raw))return err('Assinatura inválida',403);
 const data=JSON.parse(raw);
 for(const entry of data.entry||[])for(const change of entry.changes||[]){
  const value=change.value||{},phoneId=value.metadata?.phone_number_id;
  if(!phoneId)continue;
  const [num]=await db.sql`SELECT * FROM wa_numbers WHERE phone_number_id=${phoneId} AND active=true`;
  if(!num)continue;
  for(const item of value.messages||[]){
   const phone=digits(item.from);if(!phone)continue;
   const [contact]=await db.sql`INSERT INTO wa_contacts(company_id,phone,consultant_id) VALUES (${num.company_id},${phone},${num.consultant_id}) ON CONFLICT(company_id,phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING *`;
   const content=item.text?.body||item.button?.text||item.interactive?.button_reply?.title||`[${item.type||'mensagem'}]`;
   const [saved]=await db.sql`INSERT INTO wa_messages(company_id,number_id,contact_id,provider_message_id,direction,message_type,content,status) VALUES (${num.company_id},${num.id},${contact.id},${item.id},'in',${item.type||'text'},${content},'received') ON CONFLICT(provider_message_id) DO NOTHING RETURNING id`;
   if(!saved)continue;
   if(/^(parar|sair|cancelar|stop|não quero receber|nao quero receber)$/i.test(content.trim())){
    await db.sql`UPDATE wa_contacts SET opted_in=false,opted_out_at=NOW() WHERE id=${contact.id}`;continue;
   }
   // Triagem automática opcional: regras transparentes, sem simular IA generativa.
   const [settings]=await db.sql`SELECT * FROM wa_ai_settings WHERE company_id=${num.company_id}`;
   if(settings?.enabled&&item.type==='text'&&/^(oi|olá|ola|bom dia|boa tarde|boa noite)$/i.test(content.trim())){
    try{const out=await sendMeta(num.phone_number_id,{to:phone,type:'text',text:{body:settings.greeting}});
     await db.sql`INSERT INTO wa_messages(company_id,number_id,contact_id,provider_message_id,direction,message_type,content,status) VALUES (${num.company_id},${num.id},${contact.id},${out.messages?.[0]?.id||null},'out','text',${settings.greeting},'sent')`;
    }catch(e){console.error('Auto-reply failed',e.message)}
   }
  }
  for(const s of value.statuses||[]){
   await db.sql`UPDATE wa_messages SET status=${s.status||'unknown'} WHERE provider_message_id=${s.id} AND company_id=${num.company_id}`;
  }
 }
 return json({ok:true});
}
export default async function whatsapp(req){
 try{
  const url=new URL(req.url),action=url.searchParams.get('action')||'numbers';
  if(action==='webhook')return await webhook(req);
  const u=await auth(req);if(!allowed(u))return err('Não autenticado',401);
  const b=req.method==='POST'?await body(req):{};
  if(req.method==='POST'&&requireSameOrigin(req))return err('Origem não autorizada',403);
  if(action==='numbers'&&req.method==='GET'){
   const rows=isAdmin(u)?await db.sql`SELECT id,display_phone,label,consultant_id,active FROM wa_numbers WHERE company_id=${u.company_id} ORDER BY created_at DESC`:await db.sql`SELECT id,display_phone,label,consultant_id,active FROM wa_numbers WHERE company_id=${u.company_id} AND (consultant_id=${u.id} OR consultant_id IS NULL) ORDER BY created_at DESC`;
   return json({numbers:rows});
  }
  if(action==='register'&&req.method==='POST'){
   if(!isAdmin(u))return err('Somente administrador',403);
   if(!/^\d{8,30}$/.test(String(b.phone_number_id||''))||!digits(b.display_phone))return err('Dados do número inválidos');
   const [n]=await db.sql`INSERT INTO wa_numbers(company_id,phone_number_id,display_phone,label,consultant_id) VALUES (${u.company_id},${b.phone_number_id},${b.display_phone},${b.label||null},${b.consultant_id||null}) RETURNING id,display_phone,label`;
   return json({number:n});
  }
  if(action==='contacts'&&req.method==='GET'){
   const rows=isAdmin(u)?await db.sql`SELECT * FROM wa_contacts WHERE company_id=${u.company_id} ORDER BY created_at DESC LIMIT 300`:await db.sql`SELECT * FROM wa_contacts WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY created_at DESC LIMIT 300`;
   return json({contacts:rows});
  }
  if(action==='contact'&&req.method==='POST'){
   const phone=digits(b.phone);if(phone.length<10||phone.length>15)return err('Telefone inválido');
   if(b.opted_in!==true)return err('É necessário registrar o consentimento para campanhas');
   const consultant=isAdmin(u)&&b.consultant_id?b.consultant_id:u.id;
   const [c]=await db.sql`INSERT INTO wa_contacts(company_id,phone,name,consultant_id,opted_in,opted_in_at) VALUES (${u.company_id},${phone},${b.name||null},${consultant},true,NOW()) ON CONFLICT(company_id,phone) DO UPDATE SET name=EXCLUDED.name,consultant_id=EXCLUDED.consultant_id,opted_in=true,opted_in_at=NOW(),opted_out_at=NULL RETURNING *`;
   return json({contact:c});
  }
  if(action==='messages'&&req.method==='GET'){
   const contactId=url.searchParams.get('contact_id'),numberId=url.searchParams.get('number_id');
   if(!contactId||!numberId)return err('Selecione contato e número');
   const rows=await db.sql`SELECT m.* FROM wa_messages m JOIN wa_contacts c ON c.id=m.contact_id JOIN wa_numbers n ON n.id=m.number_id WHERE m.company_id=${u.company_id} AND m.contact_id=${contactId} AND m.number_id=${numberId} AND n.company_id=${u.company_id} AND (${isAdmin(u)} OR c.consultant_id=${u.id} OR n.consultant_id=${u.id}) ORDER BY m.created_at ASC LIMIT 200`;
   return json({messages:rows});
  }
  if(action==='send'&&req.method==='POST'){
   const [n]=await db.sql`SELECT * FROM wa_numbers WHERE id=${b.number_id} AND company_id=${u.company_id} AND active=true AND (${isAdmin(u)} OR consultant_id=${u.id} OR consultant_id IS NULL)`;
   const [c]=await db.sql`SELECT * FROM wa_contacts WHERE id=${b.contact_id} AND company_id=${u.company_id} AND (${isAdmin(u)} OR consultant_id=${u.id})`;
   if(!n||!c)return err('Número ou contato não autorizado',403);
   let payload,content,type;
   if(b.template_name){
    if(!c.opted_in||c.opted_out_at)return err('Contato sem consentimento ativo',403);
    if(!/^[a-z0-9_]{1,512}$/.test(b.template_name))return err('Nome do template inválido');
    type='template';content=b.template_name;
    payload={to:c.phone,type:'template',template:{name:b.template_name,language:{code:b.language||'pt_BR'}}};
   }else{
    // Só permite texto livre se o cliente escreveu nas últimas 24h.
    const [last]=await db.sql`SELECT created_at FROM wa_messages WHERE company_id=${u.company_id} AND number_id=${n.id} AND contact_id=${c.id} AND direction='in' ORDER BY created_at DESC LIMIT 1`;
    if(!last||Date.now()-new Date(last.created_at).getTime()>24*3600*1000)return err('Fora da janela de 24h: use template aprovado');
    content=String(b.text||'').trim();if(!content||content.length>4096)return err('Texto inválido');
    type='text';payload={to:c.phone,type:'text',text:{body:content}};
   }
   const result=await sendMeta(n.phone_number_id,payload);
   const [m]=await db.sql`INSERT INTO wa_messages(company_id,number_id,contact_id,provider_message_id,direction,message_type,content,status) VALUES (${u.company_id},${n.id},${c.id},${result.messages?.[0]?.id||null},'out',${type},${content},'sent') RETURNING *`;
   return json({message:m});
  }
  if(action==='assistant'&&req.method==='GET'){
   const [s]=await db.sql`SELECT * FROM wa_ai_settings WHERE company_id=${u.company_id}`;return json({enabled:s?.enabled||false,greeting:s?.greeting||'Olá! Você gostaria de informações sobre revisão contratual?',mode:'rules_only'});
  }
  if(action==='assistant'&&req.method==='POST'){
   if(!isAdmin(u))return err('Somente administrador',403);
   const greeting=String(b.greeting||'').trim();if(!greeting||greeting.length>1000)return err('Mensagem inválida');
   await db.sql`INSERT INTO wa_ai_settings(company_id,enabled,greeting) VALUES (${u.company_id},${b.enabled===true},${greeting}) ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,greeting=EXCLUDED.greeting,updated_at=NOW()`;
   return json({ok:true,mode:'rules_only'});
  }
  return err('Ação não encontrada',404);
 }catch(e){console.error('WhatsApp',e);return err(e.message||'Erro interno',500)}
}
