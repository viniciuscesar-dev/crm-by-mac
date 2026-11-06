import {db,json,requireSameOrigin,clientIp,uid,legacyEvent} from './_db.mjs';
import {hashIp} from './security.mjs';

const clamp=(n,min,max)=>Math.min(Math.max(Number(n)||0,min),max);
const sessionKey=v=>/^[a-zA-Z0-9_-]{16,120}$/.test(String(v||''))?String(v):null;

export default async req=>{const e=await legacyEvent(req);try{
 const token=String(e.queryStringParameters?.token||'');
 if(!/^[a-f0-9]{64}$/i.test(token))return json({message:'Token inválido.'},400);
 const [p]=await db.sql`SELECT p.id,p.company_id,p.consultant_id,p.client_id,p.code,p.client_name,p.product,p.value,p.status,p.expires_at,p.payload,p.views,p.accepted_at,p.first_viewed_at,p.total_active_seconds,p.max_scroll_percent,p.reached_end,a.product analysis_product,c.name company_name,c.trade_name,c.logo_url,c.proposal_logo_url,c.primary_color,c.whatsapp FROM proposals p LEFT JOIN analyses a ON a.id=p.analysis_id LEFT JOIN companies c ON c.id=p.company_id WHERE p.public_token=${token}`;
 if(!p)return json({message:'Proposta não encontrada.'},404);
 p.product=p.analysis_product||p.product;

 if(e.httpMethod==='GET'){
   const expired=p.expires_at&&new Date(p.expires_at)<=new Date();
   const sk=sessionKey(e.queryStringParameters?.session)||null;
   const newSession=sk||uid().replaceAll('-','');
   await db.sql`UPDATE proposals SET views=views+1,first_viewed_at=COALESCE(first_viewed_at,NOW()),last_viewed_at=NOW(),status=CASE WHEN ${expired} AND status<>'Aceita' THEN 'Expirada' ELSE status END WHERE id=${p.id}`;
   await db.sql`INSERT INTO proposal_sessions(id,company_id,proposal_id,session_key,metadata) VALUES(${uid()},${p.company_id},${p.id},${newSession},${JSON.stringify({ip_hash:hashIp(clientIp(e))})}) ON CONFLICT(proposal_id,session_key) DO UPDATE SET last_seen_at=NOW()`;
   await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${p.company_id},${p.id},${expired?'expired_view':'opened'},${JSON.stringify({ip_hash:hashIp(clientIp(e)),session_key:newSession})})`;
   if(p.consultant_id&&!expired)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${p.company_id},${p.consultant_id},'proposal_opened',${`Proposta ${p.code} visualizada`},${`${p.client_name} abriu a proposta.`},'proposals',${p.id})`;
   if(p.consultant_id&&expired){
     const [recent]=await db.sql`SELECT id FROM notifications WHERE company_id=${p.company_id} AND user_id=${p.consultant_id} AND type='proposal_expired_reaccess' AND resource_id=${String(p.id)} AND created_at>NOW()-INTERVAL '6 hours' LIMIT 1`;
     if(!recent)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${p.company_id},${p.consultant_id},'proposal_expired_reaccess','Cliente voltou à proposta expirada',${`${p.client_name} tentou acessar novamente a proposta ${p.code}, mesmo após a expiração. Entre em contato para aproveitar o interesse.`},'proposals',${String(p.id)})`;
   }
   return json({...p,views:Number(p.views||0)+1,first_viewed_at:p.first_viewed_at||new Date().toISOString(),expired,tracking_session:newSession});
 }

 if(e.httpMethod==='POST'){
   const guard=requireSameOrigin(e);if(guard)return guard;
   let b={};try{b=JSON.parse(e.body||'{}')}catch{}
   const sk=sessionKey(b.session);

   if(b.action==='track'){
     if(!sk)return json({message:'Sessão inválida.'},400);
     const delta=clamp(b.active_seconds,0,30),scroll=Math.round(clamp(b.scroll_percent,0,100)),ended=Boolean(b.reached_end||scroll>=95),closing=Boolean(b.closing);
     const [s]=await db.sql`INSERT INTO proposal_sessions(id,company_id,proposal_id,session_key,active_seconds,max_scroll_percent,reached_end,metadata) VALUES(${uid()},${p.company_id},${p.id},${sk},${delta},${scroll},${ended},${JSON.stringify({ip_hash:hashIp(clientIp(e))})}) ON CONFLICT(proposal_id,session_key) DO UPDATE SET last_seen_at=NOW(),closed_at=CASE WHEN ${closing} THEN NOW() ELSE proposal_sessions.closed_at END,active_seconds=proposal_sessions.active_seconds+${delta},max_scroll_percent=GREATEST(proposal_sessions.max_scroll_percent,${scroll}),reached_end=proposal_sessions.reached_end OR ${ended} RETURNING active_seconds,max_scroll_percent,reached_end`;
     await db.sql`UPDATE proposals SET total_active_seconds=(SELECT COALESCE(SUM(active_seconds),0)::int FROM proposal_sessions WHERE proposal_id=${p.id}),max_scroll_percent=GREATEST(max_scroll_percent,${scroll}),reached_end=reached_end OR ${ended},last_viewed_at=NOW() WHERE id=${p.id}`;
     if(scroll>=95)await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) SELECT ${uid()},${p.company_id},${p.id},'reached_end',${JSON.stringify({session_key:sk,scroll_percent:scroll})} WHERE NOT EXISTS (SELECT 1 FROM proposal_events WHERE proposal_id=${p.id} AND event_type='reached_end' AND metadata->>'session_key'=${sk})`;
     return json({ok:true,session:s});
   }

   if(b.action==='refuse'){
     if(p.expires_at&&new Date(p.expires_at)<=new Date())return json({message:'Esta proposta expirou.'},410);
     if(p.status==='Aceita')return json({message:'Esta proposta já foi aceita.'},409);
     if(p.status==='Recusada')return json({ok:true,status:'Recusada',alreadyRefused:true});
     const [updated]=await db.sql`UPDATE proposals SET status='Recusada',updated_at=NOW() WHERE id=${p.id} AND status<>'Aceita' AND (expires_at IS NULL OR expires_at>NOW()) RETURNING id`;
     if(!updated)return json({message:'Não foi possível registrar a recusa.'},409);
     if(sk)await db.sql`UPDATE proposal_sessions SET last_seen_at=NOW() WHERE proposal_id=${p.id} AND session_key=${sk}`;
     await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${p.company_id},${p.id},'refused',${JSON.stringify({ip_hash:hashIp(clientIp(e)),session_key:sk})})`;
     if(p.client_id)await db.sql`INSERT INTO activities(id,company_id,consultant_id,client_id,type,title,details) VALUES(${uid()},${p.company_id},${p.consultant_id},${p.client_id},'proposal_refused',${`Proposta ${p.code} recusada`},${JSON.stringify({value:p.value})})`;
     if(p.consultant_id)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${p.company_id},${p.consultant_id},'proposal_refused',${'Proposta recusada'},${`${p.client_name} recusou a proposta ${p.code}.`},'proposals',${p.id})`;
     return json({ok:true,status:'Recusada'});
   }

   if(b.action==='accept'){
     if(p.expires_at&&new Date(p.expires_at)<=new Date())return json({message:'Esta proposta expirou.'},410);
     if(p.status==='Aceita')return json({ok:true,status:'Aceita',alreadyAccepted:true});
     const [updated]=await db.sql`UPDATE proposals SET status='Aceita',accepted_at=NOW(),accepted_ip_hash=${hashIp(clientIp(e))},updated_at=NOW() WHERE id=${p.id} AND (expires_at IS NULL OR expires_at>NOW()) RETURNING id`;
     if(!updated)return json({message:'Esta proposta expirou.'},410);
     if(sk)await db.sql`UPDATE proposal_sessions SET accepted_at=NOW(),last_seen_at=NOW() WHERE proposal_id=${p.id} AND session_key=${sk}`;
     await db.sql`INSERT INTO proposal_events(id,company_id,proposal_id,event_type,metadata) VALUES(${uid()},${p.company_id},${p.id},'accepted',${JSON.stringify({ip_hash:hashIp(clientIp(e)),session_key:sk})})`;
     if(p.client_id)await db.sql`INSERT INTO activities(id,company_id,consultant_id,client_id,type,title,details) VALUES(${uid()},${p.company_id},${p.consultant_id},${p.client_id},'proposal_accepted',${`Proposta ${p.code} aceita`},${JSON.stringify({value:p.value})})`;
     if(p.consultant_id)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${p.company_id},${p.consultant_id},'proposal_accepted',${'Proposta aceita!'},${`${p.client_name} aceitou a proposta ${p.code}.`},'proposals',${p.id})`;
     return json({ok:true,status:'Aceita'});
   }

   return json({message:'Ação inválida.'},400);
 }
 return json({message:'Método não permitido.'},405);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
