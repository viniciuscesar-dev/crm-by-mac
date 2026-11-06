import {db,json,body,auth,uid,code,requireSameOrigin,legacyEvent} from './_db.mjs';
import {randomToken} from './security.mjs';
const allowed=['leads','analyses','proposals','sales','tasks'];
async function scope(u,table){
 if(table==='leads') return u.role==='admin'?db.sql`SELECT * FROM leads WHERE company_id=${u.company_id} ORDER BY created_at DESC LIMIT 500`:db.sql`SELECT * FROM leads WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY created_at DESC LIMIT 500`;
 if(table==='analyses') return u.role==='admin'?db.sql`SELECT * FROM analyses WHERE company_id=${u.company_id} ORDER BY created_at DESC LIMIT 500`:db.sql`SELECT * FROM analyses WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY created_at DESC LIMIT 500`;
 if(table==='proposals') return u.role==='admin'?db.sql`SELECT * FROM proposals WHERE company_id=${u.company_id} ORDER BY created_at DESC LIMIT 500`:db.sql`SELECT * FROM proposals WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY created_at DESC LIMIT 500`;
 if(table==='sales') return u.role==='admin'?db.sql`SELECT * FROM sales WHERE company_id=${u.company_id} ORDER BY sold_at DESC LIMIT 500`:db.sql`SELECT * FROM sales WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY sold_at DESC LIMIT 500`;
 return u.role==='admin'?db.sql`SELECT * FROM tasks WHERE company_id=${u.company_id} ORDER BY created_at DESC LIMIT 500`:db.sql`SELECT * FROM tasks WHERE company_id=${u.company_id} AND consultant_id=${u.id} ORDER BY created_at DESC LIMIT 500`;
}
async function validConsultant(u,id){if(!id)return null;const [x]=await db.sql`SELECT id FROM users WHERE id=${id} AND company_id=${u.company_id} AND role='consultant' AND active=true`;return x?.id||null}
async function upsertClient(cid,consult,x){
 const phone=String(x.phone||'').trim()||null,cpf=String(x.cpf_cnpj||'').trim()||null,name=String(x.name||x.client_name||'').trim().slice(0,200);
 if(x.client_id){const [c]=await db.sql`SELECT id FROM clients WHERE id=${x.client_id} AND company_id=${cid}`;if(c)return c.id}
 let c=null;if(phone){[c]=await db.sql`SELECT id FROM clients WHERE company_id=${cid} AND phone=${phone} ORDER BY updated_at DESC LIMIT 1`}
 if(!c&&cpf){[c]=await db.sql`SELECT id FROM clients WHERE company_id=${cid} AND cpf_cnpj=${cpf} ORDER BY updated_at DESC LIMIT 1`}
 if(c){await db.sql`UPDATE clients SET name=COALESCE(NULLIF(${name},''),name),owner_id=COALESCE(owner_id,${consult}),product=COALESCE(${x.product||null},product),origin=COALESCE(${x.origin||null},origin),updated_at=NOW() WHERE id=${c.id}`;return c.id}
 if(!name)return null;const [n]=await db.sql`INSERT INTO clients(id,company_id,owner_id,name,phone,cpf_cnpj,city,state,origin,product) VALUES(${uid()},${cid},${consult},${name},${phone},${cpf},${x.city||null},${x.state||null},${x.origin||null},${x.product||null}) RETURNING id`;return n.id
}
async function activity(u,consult,client,lead,type,title,details={}){await db.sql`INSERT INTO activities(id,company_id,consultant_id,client_id,lead_id,type,title,details) VALUES(${uid()},${u.company_id},${consult},${client},${lead},${type},${String(title).slice(0,240)},${JSON.stringify(details)})`}
async function notify(u,userId,type,title,message,resource,id){await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${u.company_id},${userId||null},${type},${String(title).slice(0,240)},${String(message||'').slice(0,1000)},${resource||null},${id||null})`}

async function audit(u,resource,resourceId,action,before=null,after=null){
 try{await db.sql`INSERT INTO audit_log(id,company_id,user_id,resource,resource_id,action,before_data,after_data) VALUES(${uid()},${u.company_id},${u.id},${String(resource).slice(0,80)},${resourceId||null},${String(action).slice(0,80)},${before?JSON.stringify(before):null},${after?JSON.stringify(after):null})`}catch{}
}

async function runAutomations(u,consult,lead,oldStatus,newStatus){
 if(oldStatus===newStatus)return;
 const rules=await db.sql`SELECT * FROM automation_rules WHERE company_id=${u.company_id} AND active=true AND trigger_type='lead_status' AND (trigger_value=${newStatus} OR trigger_value IS NULL)`;
 for(const r of rules){
   const ap=r.action_payload||{};
   if(r.action_type==='create_task'){
     const title=String(ap.title||`Follow-up: ${lead.name}`).slice(0,300);const hours=Math.min(Math.max(Number(ap.due_hours||24),1),720);
     await db.sql`INSERT INTO tasks(id,company_id,consultant_id,client_id,title,due_at,priority,status,lead_id) VALUES(${uid()},${u.company_id},${consult},${lead.client_id||null},${title},NOW()+(${hours}*INTERVAL '1 hour'),${ap.priority||'Média'},'Pendente',${lead.id})`;
   }
   if(r.action_type==='notify')await notify(u,consult,'automation',String(ap.title||r.name),String(ap.message||`Lead ${lead.name} entrou em ${newStatus}`),'leads',lead.id);
 }
}
export default async req=>{const e=await legacyEvent(req);try{const u=await auth(e);if(!u)return json({message:'Não autenticado.'},401);const b=await body(e),r=e.queryStringParameters?.resource||b.resource;if(!allowed.includes(r))return json({message:'Recurso inválido.'},400);
 if(e.httpMethod==='GET')return json(await scope(u,r));
 if(e.httpMethod==='POST'){const guard=requireSameOrigin(e);if(guard)return guard;const x=b.data||b,cid=u.company_id;let consult=u.role==='consultant'?u.id:null;if(u.role==='admin'&&x.consultant_id){consult=await validConsultant(u,x.consultant_id);if(!consult)return json({message:'Consultor inválido.'},400)}
  if(r==='leads'){
   const client=await upsertClient(cid,consult,x);const [row]=await db.sql`INSERT INTO leads(id,company_id,consultant_id,client_id,name,phone,cpf_cnpj,city,state,origin,product,status,notes) VALUES(${uid()},${cid},${consult},${client},${String(x.name).slice(0,200)},${x.phone||null},${x.cpf_cnpj||null},${x.city||null},${x.state||null},${x.origin||null},${x.product||null},${x.status||'Novo lead'},${x.notes||null}) RETURNING *`;
   await activity(u,consult,client,row.id,'lead_created','Lead criado',{status:row.status,origin:row.origin,product:row.product});if(consult)await notify(u,consult,'new_lead',`Novo lead: ${row.name}`,'Lead atribuído ao seu atendimento.','leads',row.id);return json(row,201)
  }
  if(r==='analyses'){
   let client=x.client_id||null;if(!client&&x.lead_id){const [l]=await db.sql`SELECT client_id FROM leads WHERE id=${x.lead_id} AND company_id=${cid}`;client=l?.client_id||null}if(!client)client=await upsertClient(cid,consult,x);
   const [row]=await db.sql`INSERT INTO analyses(id,company_id,consultant_id,client_id,lead_id,code,client_name,product,status,payload) VALUES(${uid()},${cid},${consult},${client},${x.lead_id||null},${code('AN')},${String(x.client_name).slice(0,200)},${String(x.product).slice(0,80)},${x.status||'Em andamento'},${JSON.stringify(x.payload||{})}) RETURNING *`;await activity(u,consult,client,x.lead_id||null,'analysis_created',`Análise ${row.code} criada`,{product:row.product,status:row.status});await audit(u,'analyses',row.id,'created',null,{code:row.code,product:row.product,status:row.status});return json(row,201)
  }
  if(r==='proposals'){
   let parent=null;
   if(x.parent_proposal_id){
     [parent]=u.role==='admin'?await db.sql`SELECT * FROM proposals WHERE id=${x.parent_proposal_id} AND company_id=${cid}`:await db.sql`SELECT * FROM proposals WHERE id=${x.parent_proposal_id} AND company_id=${cid} AND consultant_id=${u.id}`;
     if(!parent)return json({message:'Proposta anterior não encontrada.'},404);
     consult=parent.consultant_id; x.analysis_id=x.analysis_id||parent.analysis_id; x.client_id=x.client_id||parent.client_id; x.client_name=x.client_name||parent.client_name; x.product=x.product||parent.product; x.payload={...(parent.payload||{}),...(x.payload||{})}; if(x.value===undefined||x.value===null||x.value==='')x.value=parent.value;
   }
   let client=x.client_id||null;if(!client&&x.analysis_id){const [a]=await db.sql`SELECT client_id FROM analyses WHERE id=${x.analysis_id} AND company_id=${cid}`;client=a?.client_id||null}if(!client)client=await upsertClient(cid,consult,x);
   const hours=Math.min(Math.max(Number(x.validity_hours||24),2),720);const token=randomToken(32);
   let versionNo=1,rootId=null;
   if(parent){rootId=parent.root_proposal_id||parent.id;const [v]=await db.sql`SELECT COALESCE(MAX(version_no),0)::int m FROM proposals WHERE company_id=${cid} AND (id=${rootId} OR root_proposal_id=${rootId})`;versionNo=Number(v?.m||1)+1}
   const [row]=await db.sql`INSERT INTO proposals(id,company_id,consultant_id,client_id,analysis_id,code,client_name,product,value,status,expires_at,public_token,payload,parent_proposal_id,root_proposal_id,version_no) VALUES(${uid()},${cid},${consult},${client},${x.analysis_id||null},${code('EA')},${String(x.client_name||parent?.client_name||'Cliente').slice(0,200)},${String(x.product||parent?.product||'Outros').slice(0,80)},${Math.max(0,Number(x.value||0))},'Enviada',NOW()+(${hours}*INTERVAL '1 hour'),${token},${JSON.stringify(x.payload||{})},${parent?.id||null},${rootId},${versionNo}) RETURNING *`;
   if(!parent)await db.sql`UPDATE proposals SET root_proposal_id=id WHERE id=${row.id}`;
   if(parent)await db.sql`UPDATE proposals SET status=CASE WHEN status='Aceita' THEN status ELSE 'Substituída' END,updated_at=NOW() WHERE id=${parent.id}`;
   await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${cid},${row.id},'sent',${JSON.stringify({validity_hours:hours,version_no:versionNo,parent_proposal_id:parent?.id||null})})`;await activity(u,consult,client,null,'proposal_sent',`Proposta ${row.code} enviada`,{value:row.value,expires_at:row.expires_at,version_no:versionNo});if(consult)await db.sql`INSERT INTO tasks(id,company_id,consultant_id,client_id,title,due_at,priority,status) VALUES(${uid()},${cid},${consult},${client},${`Follow-up da proposta ${row.code} — ${row.client_name}`},NOW()+INTERVAL '24 hours','Alta','Pendente')`;await audit(u,'proposals',row.id,parent?'version_created':'created',parent?{id:parent.id,version_no:parent.version_no}:null,{id:row.id,version_no:versionNo,value:row.value});return json(row,201)
  }
  if(r==='sales'){
   let client=x.client_id||null;if(!client&&x.proposal_id){const [p]=await db.sql`SELECT client_id FROM proposals WHERE id=${x.proposal_id} AND company_id=${cid}`;client=p?.client_id||null}if(!client)client=await upsertClient(cid,consult,x);
   const payload=x.payload||{},gross=Math.max(0,Number(payload.gross_value||x.value||0)),net=Math.max(0,Number(payload.net_value??x.value??0)),discount=Number(payload.discount_percent||0);if(!String(x.client_name||'').trim())return json({message:'Cliente obrigatório.'},400);if(gross<=0)return json({message:'Valor bruto obrigatório.'},400);if(net>gross)return json({message:'Valor líquido não pode ser maior que o bruto.'},400);if(discount<0||discount>100)return json({message:'Desconto inválido.'},400);if(payload.has_second_entry&&!payload.second_entry_date)return json({message:'Data da segunda entrada obrigatória.'},400);
   const [row]=await db.sql`INSERT INTO sales(id,company_id,consultant_id,client_id,proposal_id,code,client_name,value,payment_status,payload) VALUES(${uid()},${cid},${consult},${client},${x.proposal_id||null},${code('VD')},${String(x.client_name).slice(0,200)},${net},${x.payment_status||'Pendente'},${JSON.stringify({...payload,gross_value:gross,net_value:net,discount_percent:discount})}) RETURNING *`;
   if(payload.has_second_entry&&payload.second_entry_date){const due=String(payload.second_entry_date).slice(0,10);await db.sql`INSERT INTO tasks(id,company_id,consultant_id,client_id,title,due_at,priority,status) VALUES(${uid()},${cid},${consult},${client},${`Cobrar 2ª entrada — ${row.client_name}`},${due+'T12:00:00'},'Alta','Pendente')`}
   await activity(u,consult,client,null,'sale_created',`Venda ${row.code} registrada`,{gross_value:gross,discount_percent:discount,net_value:net,payment_status:row.payment_status,has_entry:!!payload.has_entry,second_entry_date:payload.second_entry_date||null});if(consult)await notify(u,consult,'sale',`Venda registrada: ${row.client_name}`,`Valor líquido ${net}`,'sales',row.id);return json(row,201)
  }
  if(r==='tasks'){
   let client=x.client_id||null;if(!client&&x.lead_id){const [l]=await db.sql`SELECT client_id FROM leads WHERE id=${x.lead_id} AND company_id=${cid}`;client=l?.client_id||null}
   const [row]=await db.sql`INSERT INTO tasks(id,company_id,consultant_id,client_id,title,due_at,priority,status,lead_id) VALUES(${uid()},${cid},${consult},${client},${String(x.title).slice(0,300)},${x.due_at||null},${x.priority||'Média'},'Pendente',${x.lead_id||null}) RETURNING *`;await activity(u,consult,client,x.lead_id||null,'task_created',row.title,{priority:row.priority,due_at:row.due_at});return json(row,201)
  }
 }

 if(e.httpMethod==='PATCH'){
  const guard=requireSameOrigin(e);if(guard)return guard;const x=b.data||b,id=String(x.id||b.id||'');if(!id)return json({message:'ID obrigatório.'},400);
  if(r==='leads'){
   const [old]=u.role==='admin'?await db.sql`SELECT * FROM leads WHERE id=${id} AND company_id=${cid}`:await db.sql`SELECT * FROM leads WHERE id=${id} AND company_id=${cid} AND consultant_id=${u.id}`;if(!old)return json({message:'Lead não encontrado.'},404);
   let owner=old.consultant_id;if(u.role==='admin'&&x.consultant_id!==undefined){owner=x.consultant_id?await validConsultant(u,x.consultant_id):null;if(x.consultant_id&&!owner)return json({message:'Consultor inválido.'},400)}
   const status=String(x.status||old.status).slice(0,100),notes=x.notes!==undefined?String(x.notes||'').slice(0,5000):old.notes;
   const [row]=await db.sql`UPDATE leads SET consultant_id=${owner},status=${status},notes=${notes},phone=${x.phone!==undefined?x.phone:old.phone},origin=${x.origin!==undefined?x.origin:old.origin},product=${x.product!==undefined?x.product:old.product},updated_at=NOW() WHERE id=${id} AND company_id=${cid} RETURNING *`;
   await activity(u,owner,row.client_id,row.id,'lead_updated',`Lead atualizado para ${status}`,{from:old.status,to:status});await runAutomations(u,owner,row,old.status,status);return json(row);
  }
  if(r==='analyses'){
   const [old]=u.role==='admin'?await db.sql`SELECT * FROM analyses WHERE id=${id} AND company_id=${cid}`:await db.sql`SELECT * FROM analyses WHERE id=${id} AND company_id=${cid} AND consultant_id=${u.id}`;if(!old)return json({message:'Análise não encontrada.'},404);
   const clientName=x.client_name!==undefined?String(x.client_name).slice(0,200):old.client_name,product=x.product!==undefined?String(x.product).slice(0,80):old.product,status=String(x.status||old.status).slice(0,80),payload=x.payload!==undefined?x.payload:old.payload;
   const [row]=await db.sql`UPDATE analyses SET client_name=${clientName},product=${product},status=${status},payload=${JSON.stringify(payload||{})},updated_at=NOW() WHERE id=${id} AND company_id=${cid} RETURNING *`;await audit(u,'analyses',id,'updated',{client_name:old.client_name,product:old.product},{client_name:row.client_name,product:row.product});return json(row);
  }
  if(r==='tasks'){
   const [old]=u.role==='admin'?await db.sql`SELECT * FROM tasks WHERE id=${id} AND company_id=${cid}`:await db.sql`SELECT * FROM tasks WHERE id=${id} AND company_id=${cid} AND consultant_id=${u.id}`;if(!old)return json({message:'Tarefa não encontrada.'},404);
   const [row]=await db.sql`UPDATE tasks SET status=${String(x.status||old.status).slice(0,80)},priority=${String(x.priority||old.priority).slice(0,40)},due_at=${x.due_at!==undefined?x.due_at:old.due_at} WHERE id=${id} AND company_id=${cid} RETURNING *`;return json(row);
  }
  if(r==='proposals'){
   const [old]=u.role==='admin'?await db.sql`SELECT * FROM proposals WHERE id=${id} AND company_id=${cid}`:await db.sql`SELECT * FROM proposals WHERE id=${id} AND company_id=${cid} AND consultant_id=${u.id}`;if(!old)return json({message:'Proposta não encontrada.'},404);
   const status=String(x.status||old.status).slice(0,80),value=x.value!==undefined?Math.max(0,Number(x.value||0)):old.value,payload=x.payload!==undefined?x.payload:old.payload,clientName=x.client_name!==undefined?String(x.client_name).slice(0,200):old.client_name,product=x.product!==undefined?String(x.product).slice(0,80):old.product,hours=x.validity_hours!==undefined?Math.min(Math.max(Number(x.validity_hours||2),2),720):null;
   const [row]=hours?await db.sql`UPDATE proposals SET status=${status},value=${value},payload=${JSON.stringify(payload||{})},client_name=${clientName},product=${product},accepted_at=CASE WHEN ${status}='Aceita' THEN COALESCE(accepted_at,NOW()) WHEN ${status}<>'Aceita' THEN NULL ELSE accepted_at END,expires_at=NOW()+(${hours}*INTERVAL '1 hour'),updated_at=NOW() WHERE id=${id} AND company_id=${cid} RETURNING *`:await db.sql`UPDATE proposals SET status=${status},value=${value},payload=${JSON.stringify(payload||{})},client_name=${clientName},product=${product},accepted_at=CASE WHEN ${status}='Aceita' THEN COALESCE(accepted_at,NOW()) WHEN ${status}<>'Aceita' THEN NULL ELSE accepted_at END,updated_at=NOW() WHERE id=${id} AND company_id=${cid} RETURNING *`;
   const evType=status==='Aceita'?'accepted':status==='Recusada'?'refused':'updated';await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${cid},${id},${evType},${JSON.stringify({manual:true,from_status:old.status,to_status:status,value})})`;return json(row);
  }
  return json({message:'Atualização não disponível para este recurso.'},405);
 }
 if(e.httpMethod==='DELETE'){
  const guard=requireSameOrigin(e);if(guard)return guard;const id=String(b.id||b.data?.id||'');if(!id)return json({message:'ID obrigatório.'},400);
  if(r==='analyses'){const [old]=u.role==='admin'?await db.sql`SELECT * FROM analyses WHERE id=${id} AND company_id=${cid}`:await db.sql`SELECT * FROM analyses WHERE id=${id} AND company_id=${cid} AND consultant_id=${u.id}`;if(!old)return json({message:'Análise não encontrada.'},404);const [sale]=await db.sql`SELECT s.id FROM sales s JOIN proposals p ON p.id=s.proposal_id WHERE p.analysis_id=${id} AND p.company_id=${cid} LIMIT 1`;if(sale)return json({message:'Esta análise possui venda registrada e não pode ser excluída.'},409);await db.sql`DELETE FROM proposals WHERE analysis_id=${id} AND company_id=${cid}`;await db.sql`DELETE FROM analyses WHERE id=${id} AND company_id=${cid}`;await audit(u,'analyses',id,'deleted',{code:old.code,client_name:old.client_name},null);return json({ok:true})}
  return json({message:'Exclusão não disponível para este recurso.'},405)
 }
 return json({message:'Método não implementado.'},405)}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
