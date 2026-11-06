import {db,json,body,auth,uid,requireSameOrigin,legacyEvent} from './_db.mjs';

async function ownsClient(u,id){if(!id)return null;const [c]=u.role==='admin'?await db.sql`SELECT * FROM clients WHERE id=${id} AND company_id=${u.company_id}`:await db.sql`SELECT * FROM clients WHERE id=${id} AND company_id=${u.company_id} AND owner_id=${u.id}`;return c||null}

export default async req=>{const e=await legacyEvent(req);try{
 const u=await auth(e); if(!u)return json({message:'Não autenticado.'},401);
 const b=await body(e); const action=e.queryStringParameters?.action||b.action||'overview';
 if(e.httpMethod==='GET'&&action==='overview'){
   const [l]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c FROM leads WHERE company_id=${u.company_id}`:await db.sql`SELECT COUNT(*)::int c FROM leads WHERE company_id=${u.company_id} AND consultant_id=${u.id}`;
   const [a]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c FROM analyses WHERE company_id=${u.company_id}`:await db.sql`SELECT COUNT(*)::int c FROM analyses WHERE company_id=${u.company_id} AND consultant_id=${u.id}`;
   const [p]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c FROM proposals WHERE company_id=${u.company_id}`:await db.sql`SELECT COUNT(*)::int c FROM proposals WHERE company_id=${u.company_id} AND consultant_id=${u.id}`;
   const [s]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c,COALESCE(SUM(value),0)::numeric total FROM sales WHERE company_id=${u.company_id} AND sold_at>=date_trunc('month',NOW())`:await db.sql`SELECT COUNT(*)::int c,COALESCE(SUM(value),0)::numeric total FROM sales WHERE company_id=${u.company_id} AND consultant_id=${u.id} AND sold_at>=date_trunc('month',NOW())`;
   const [stale]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c FROM leads WHERE company_id=${u.company_id} AND updated_at<NOW()-INTERVAL '48 hours' AND status NOT IN ('Aceita','Recusada')`:await db.sql`SELECT COUNT(*)::int c FROM leads WHERE company_id=${u.company_id} AND consultant_id=${u.id} AND updated_at<NOW()-INTERVAL '48 hours' AND status NOT IN ('Aceita','Recusada')`;
   const [exp]=u.role==='admin'?await db.sql`SELECT COUNT(*)::int c FROM proposals WHERE company_id=${u.company_id} AND status NOT IN ('Aceita','Expirada') AND expires_at BETWEEN NOW() AND NOW()+INTERVAL '6 hours'`:await db.sql`SELECT COUNT(*)::int c FROM proposals WHERE company_id=${u.company_id} AND consultant_id=${u.id} AND status NOT IN ('Aceita','Expirada') AND expires_at BETWEEN NOW() AND NOW()+INTERVAL '6 hours'`;
   return json({leads:l.c,analyses:a.c,proposals:p.c,sales:s.c,revenue:Number(s.total||0),conversion:l.c?Number(((s.c/l.c)*100).toFixed(1)):0,opportunities:{stale_leads:stale.c,expiring_proposals:exp.c}});
 }
 if(e.httpMethod==='GET'&&action==='clients'){
   const rows=u.role==='admin'?await db.sql`SELECT * FROM clients WHERE company_id=${u.company_id} ORDER BY updated_at DESC LIMIT 500`:await db.sql`SELECT * FROM clients WHERE company_id=${u.company_id} AND owner_id=${u.id} ORDER BY updated_at DESC LIMIT 500`;return json(rows);
 }
 if(e.httpMethod==='GET'&&action==='timeline'){
   const id=e.queryStringParameters?.client_id; const c=await ownsClient(u,id); if(!c)return json({message:'Cliente não encontrado.'},404);
   const [acts,comms,analyses,props,sales,tasks]=await Promise.all([
     db.sql`SELECT 'activity' kind,type,title,details payload,occurred_at at FROM activities WHERE company_id=${u.company_id} AND client_id=${id} ORDER BY occurred_at DESC LIMIT 200`,
     db.sql`SELECT 'communication' kind,channel type,message title,jsonb_build_object('direction',direction,'status',status) payload,sent_at at FROM communications WHERE company_id=${u.company_id} AND client_id=${id} ORDER BY sent_at DESC LIMIT 200`,
     db.sql`SELECT 'analysis' kind,status type,code title,payload,created_at at FROM analyses WHERE company_id=${u.company_id} AND client_id=${id}`,
     db.sql`SELECT 'proposal' kind,status type,code title,jsonb_build_object('value',value,'views',views,'expires_at',expires_at) payload,created_at at FROM proposals WHERE company_id=${u.company_id} AND client_id=${id}`,
     db.sql`SELECT 'sale' kind,payment_status type,code title,jsonb_build_object('value',value) payload,sold_at at FROM sales WHERE company_id=${u.company_id} AND client_id=${id}`,
     db.sql`SELECT 'task' kind,status type,title,jsonb_build_object('priority',priority,'due_at',due_at) payload,created_at at FROM tasks WHERE company_id=${u.company_id} AND client_id=${id}`
   ]);
   return json({client:c,timeline:[...acts,...comms,...analyses,...props,...sales,...tasks].sort((x,y)=>new Date(y.at)-new Date(x.at))});
 }
 if(e.httpMethod==='GET'&&action==='goals'){
   const rows=u.role==='admin'?await db.sql`SELECT g.*,usr.name consultant_name FROM goals g LEFT JOIN users usr ON usr.id=g.consultant_id WHERE g.company_id=${u.company_id} ORDER BY period_start DESC`:await db.sql`SELECT g.*,usr.name consultant_name FROM goals g LEFT JOIN users usr ON usr.id=g.consultant_id WHERE g.company_id=${u.company_id} AND (g.consultant_id=${u.id} OR g.consultant_id IS NULL) ORDER BY period_start DESC`;
   return json(rows);
 }
 if(e.httpMethod==='GET'&&action==='proposal-detail'){
   const id=String(e.queryStringParameters?.proposal_id||'');
   const [p]=u.role==='admin'?await db.sql`SELECT p.*,usr.name consultant_name FROM proposals p LEFT JOIN users usr ON usr.id=p.consultant_id WHERE p.id=${id} AND p.company_id=${u.company_id}`:await db.sql`SELECT p.*,usr.name consultant_name FROM proposals p LEFT JOIN users usr ON usr.id=p.consultant_id WHERE p.id=${id} AND p.company_id=${u.company_id} AND p.consultant_id=${u.id}`;
   if(!p)return json({message:'Proposta não encontrada.'},404);
   const [sessions,events]=await Promise.all([
     db.sql`SELECT id,opened_at,last_seen_at,closed_at,active_seconds,max_scroll_percent,reached_end,accepted_at FROM proposal_sessions WHERE proposal_id=${p.id} ORDER BY opened_at DESC LIMIT 100`,
     db.sql`SELECT event_type,metadata,created_at FROM proposal_events WHERE proposal_id=${p.id} ORDER BY created_at DESC LIMIT 200`
   ]);
   const totalSeconds=sessions.reduce((n,x)=>n+Number(x.active_seconds||0),0), maxScroll=sessions.reduce((n,x)=>Math.max(n,Number(x.max_scroll_percent||0)),0), reached=sessions.some(x=>x.reached_end), distinctSessions=sessions.length;
   let interest='Não abriu';
   if(p.status==='Aceita')interest='Aceitou';
   else if(p.status==='Recusada')interest='Recusou';
   else if(Number(p.views||0)>=4||totalSeconds>=180||maxScroll>=90)interest='Muito interessado';
   else if(Number(p.views||0)>0)interest='Visualizou';
   return json({proposal:p,summary:{views:Number(p.views||0),sessions:distinctSessions,total_active_seconds:totalSeconds,max_scroll_percent:maxScroll,reached_end:reached,interest,first_viewed_at:p.first_viewed_at,last_viewed_at:p.last_viewed_at,accepted_at:p.accepted_at},sessions,events});
 }
 if(e.httpMethod==='GET'&&action==='notifications'){
   const rows=await db.sql`SELECT * FROM notifications WHERE company_id=${u.company_id} AND (user_id=${u.id} OR user_id IS NULL) ORDER BY created_at DESC LIMIT 100`;return json(rows);
 }
 if(e.httpMethod==='GET'&&action==='insights'){
   const stale=u.role==='admin'?await db.sql`SELECT id,name,status,updated_at,consultant_id FROM leads WHERE company_id=${u.company_id} AND updated_at<NOW()-INTERVAL '48 hours' AND status NOT IN ('Aceita','Recusada') ORDER BY updated_at ASC LIMIT 20`:await db.sql`SELECT id,name,status,updated_at,consultant_id FROM leads WHERE company_id=${u.company_id} AND consultant_id=${u.id} AND updated_at<NOW()-INTERVAL '48 hours' AND status NOT IN ('Aceita','Recusada') ORDER BY updated_at ASC LIMIT 20`;
   const exp=u.role==='admin'?await db.sql`SELECT id,code,client_name,expires_at,status FROM proposals WHERE company_id=${u.company_id} AND status NOT IN ('Aceita','Expirada') AND expires_at BETWEEN NOW() AND NOW()+INTERVAL '24 hours' ORDER BY expires_at ASC LIMIT 20`:await db.sql`SELECT id,code,client_name,expires_at,status FROM proposals WHERE company_id=${u.company_id} AND consultant_id=${u.id} AND status NOT IN ('Aceita','Expirada') AND expires_at BETWEEN NOW() AND NOW()+INTERVAL '24 hours' ORDER BY expires_at ASC LIMIT 20`;
   const hot=u.role==='admin'?await db.sql`SELECT p.id,p.code,p.client_name,p.views,p.last_viewed_at,p.expires_at FROM proposals p WHERE p.company_id=${u.company_id} AND p.views>=2 AND p.accepted_at IS NULL AND p.expires_at>NOW() ORDER BY p.views DESC,p.last_viewed_at DESC LIMIT 20`:await db.sql`SELECT p.id,p.code,p.client_name,p.views,p.last_viewed_at,p.expires_at FROM proposals p WHERE p.company_id=${u.company_id} AND p.consultant_id=${u.id} AND p.views>=2 AND p.accepted_at IS NULL AND p.expires_at>NOW() ORDER BY p.views DESC,p.last_viewed_at DESC LIMIT 20`;
   return json({priority:[...exp.map(x=>({type:'proposal_expiring',priority:'alta',title:`Proposta ${x.code} expira em breve`,resource_id:x.id,next_action:'Entrar em contato com o cliente'})),...hot.map(x=>({type:'proposal_hot',priority:'alta',title:`${x.client_name} abriu a proposta ${x.views} vezes`,resource_id:x.id,next_action:'Fazer follow-up agora'})),...stale.map(x=>({type:'lead_stale',priority:'média',title:`${x.name} está sem movimentação`,resource_id:x.id,next_action:'Retomar atendimento'}))]});
 }
 if(e.httpMethod==='POST'){
   const guard=requireSameOrigin(e); if(guard)return guard;
   if(action==='communication'){
     const c=await ownsClient(u,b.client_id);if(!c)return json({message:'Cliente não encontrado.'},404);
     const [row]=await db.sql`INSERT INTO communications(id,company_id,consultant_id,client_id,lead_id,channel,direction,message,status) VALUES(${uid()},${u.company_id},${u.id},${c.id},${b.lead_id||null},${String(b.channel||'WhatsApp').slice(0,40)},${b.direction==='in'?'in':'out'},${String(b.message||'').slice(0,5000)},${String(b.status||'registrada').slice(0,50)}) RETURNING *`;
     await db.sql`UPDATE clients SET last_contact_at=NOW(),updated_at=NOW() WHERE id=${c.id}`;return json(row,201);
   }
   if(action==='goal'){
     if(u.role!=='admin'&&b.consultant_id&&b.consultant_id!==u.id)return json({message:'Acesso restrito.'},403);
     const consultant=u.role==='admin'?(b.consultant_id||null):u.id;
     const start=String(b.period_start||`${new Date().toISOString().slice(0,7)}-01`),end=String(b.period_end||new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().slice(0,10));
     const [row]=await db.sql`INSERT INTO goals(id,company_id,consultant_id,period_start,period_end,revenue_target,sales_target,proposals_target,analyses_target) VALUES(${uid()},${u.company_id},${consultant},${start},${end},${Number(b.revenue_target||0)},${Number(b.sales_target||0)},${Number(b.proposals_target||0)},${Number(b.analyses_target||0)}) ON CONFLICT(company_id,consultant_id,period_start,period_end) DO UPDATE SET revenue_target=EXCLUDED.revenue_target,sales_target=EXCLUDED.sales_target,proposals_target=EXCLUDED.proposals_target,analyses_target=EXCLUDED.analyses_target,updated_at=NOW() RETURNING *`;return json(row,201);
   }
   
   if(action==='proposal-refusal'){
     const id=String(b.proposal_id||''),reason=String(b.reason||'Outro').slice(0,120),note=String(b.note||'').slice(0,1000);
     const [p]=u.role==='admin'?await db.sql`SELECT * FROM proposals WHERE id=${id} AND company_id=${u.company_id}`:await db.sql`SELECT * FROM proposals WHERE id=${id} AND company_id=${u.company_id} AND consultant_id=${u.id}`;
     if(!p)return json({message:'Proposta não encontrada.'},404);
     const [row]=await db.sql`UPDATE proposals SET status='Recusada',decline_reason=${reason},decline_note=${note||null},declined_at=NOW(),updated_at=NOW() WHERE id=${p.id} RETURNING *`;
     await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${u.company_id},${p.id},'declined',${JSON.stringify({reason,note})})`;
     await db.sql`INSERT INTO audit_log(id,company_id,user_id,resource,resource_id,action,before_data,after_data) VALUES(${uid()},${u.company_id},${u.id},'proposals',${p.id},'declined',${JSON.stringify({status:p.status})},${JSON.stringify({status:'Recusada',reason,note})})`;
     return json(row);
   }
if(action==='notification-read') {await db.sql`UPDATE notifications SET read_at=NOW() WHERE id=${b.id} AND company_id=${u.company_id} AND (user_id=${u.id} OR user_id IS NULL)`;return json({ok:true});}
   if(action==='automation') {if(u.role!=='admin')return json({message:'Acesso restrito.'},403);const [row]=await db.sql`INSERT INTO automation_rules(id,company_id,name,trigger_type,trigger_value,action_type,action_payload,active) VALUES(${uid()},${u.company_id},${String(b.name||'Regra').slice(0,160)},${String(b.trigger_type||'lead_status').slice(0,80)},${b.trigger_value||null},${String(b.action_type||'create_task').slice(0,80)},${JSON.stringify(b.action_payload||{})},${b.active!==false}) RETURNING *`;return json(row,201);}
 }
 return json({message:'Ação inválida.'},400);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
