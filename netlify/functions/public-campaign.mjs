
import {db,json,requireSameOrigin,clientIp,uid,legacyEvent} from './_db.mjs';
import {hashIp} from './security.mjs';

async function notifyReaccess(v,expired){
 if(!v.consultant_id)return;
 const type=expired?'campaign_expired_reaccess':'campaign_opened';
 if(expired){
   const [recent]=await db.sql`SELECT id FROM notifications WHERE company_id=${v.company_id} AND user_id=${v.consultant_id} AND type='campaign_expired_reaccess' AND resource_id=${String(v.id)} AND created_at>NOW()-INTERVAL '6 hours' LIMIT 1`;
   if(recent)return;
 }
 await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id)
 VALUES(${uid()},${v.company_id},${v.consultant_id},${type},
 ${expired?'Cliente tentou acessar cupom expirado':'Cupom promocional visualizado'},
 ${expired?`${v.client_name} voltou a tentar acessar uma condição promocional que já expirou. Entre em contato para aproveitar o interesse.`:`${v.client_name} abriu a condição promocional.`},
 'campaign_vouchers',${String(v.id)})`;
}
export default async req=>{const e=await legacyEvent(req);try{
 const token=String(e.queryStringParameters?.token||'');
 if(!/^[a-f0-9]{64}$/i.test(token))return json({message:'Token inválido.'},400);
 const [v]=await db.sql`SELECT v.*,c.name company_name,c.trade_name,c.logo_url,c.proposal_logo_url,c.primary_color,c.whatsapp,u.name consultant_name
 FROM campaign_vouchers v LEFT JOIN companies c ON c.id=v.company_id LEFT JOIN users u ON u.id=v.consultant_id
 WHERE v.public_token=${token}`;
 if(!v)return json({message:'Condição promocional não encontrada.'},404);
 if(v.status==='Aguardando aprovação')return json({message:'Esta condição ainda aguarda aprovação.'},403);

 const expired=v.expires_at&&new Date(v.expires_at)<=new Date();
 if(e.httpMethod==='GET'){
   await db.sql`UPDATE campaign_vouchers SET views=views+1,first_viewed_at=COALESCE(first_viewed_at,NOW()),last_viewed_at=NOW(),
    expired_reaccess_count=expired_reaccess_count+CASE WHEN ${expired} THEN 1 ELSE 0 END,
    status=CASE WHEN ${expired} AND status<>'Aceito' THEN 'Expirado' ELSE status END,updated_at=NOW() WHERE id=${v.id}`;
   await db.sql`INSERT INTO campaign_voucher_events(id,company_id,voucher_id,event_type,metadata)
    VALUES(${uid()},${v.company_id},${v.id},${expired?'expired_view':'opened'},${JSON.stringify({ip_hash:hashIp(clientIp(e))})})`;
   await notifyReaccess(v,expired);
   return json({...v,expired,views:Number(v.views||0)+1,expired_reaccess_count:Number(v.expired_reaccess_count||0)+(expired?1:0)});
 }
 if(e.httpMethod==='POST'){
   const guard=requireSameOrigin(e);if(guard)return guard;
   let b={};try{b=JSON.parse(e.body||'{}')}catch{}
   if(b.action==='accept'){
     if(expired)return json({message:'Esta condição promocional expirou. Fale com seu consultor para verificar uma nova condição.'},410);
     if(v.status==='Aceito')return json({ok:true,status:'Aceito',alreadyAccepted:true});
     const [ok]=await db.sql`UPDATE campaign_vouchers SET status='Aceito',accepted_at=NOW(),updated_at=NOW()
       WHERE id=${v.id} AND expires_at>NOW() RETURNING id`;
     if(!ok)return json({message:'Esta condição expirou.'},410);
     await db.sql`INSERT INTO campaign_voucher_events(id,company_id,voucher_id,event_type,metadata)
       VALUES(${uid()},${v.company_id},${v.id},'accepted',${JSON.stringify({ip_hash:hashIp(clientIp(e))})})`;
     if(v.client_id)await db.sql`INSERT INTO activities(id,company_id,consultant_id,client_id,lead_id,type,title,details)
       VALUES(${uid()},${v.company_id},${v.consultant_id},${v.client_id},${v.lead_id},'campaign_accepted','Condição promocional aceita',${JSON.stringify({pix_value:v.pix_value,card_total_value:v.card_total_value})})`;
     if(v.consultant_id)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id)
       VALUES(${uid()},${v.company_id},${v.consultant_id},'campaign_accepted','Condição promocional aceita!',${`${v.client_name} aceitou o benefício promocional.`},'campaign_vouchers',${String(v.id)})`;
     return json({ok:true,status:'Aceito'});
   }
 }
 return json({message:'Método não permitido.'},405);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
