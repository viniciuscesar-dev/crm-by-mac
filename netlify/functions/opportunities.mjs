
import {db,json,body,auth,uid,requireSameOrigin,legacyEvent} from './_db.mjs';

async function settings(cid){
 const [s]=await db.sql`SELECT * FROM campaign_settings WHERE company_id=${cid}`;
 return s||{stale_lead_days:3,analysis_followup_days:3,proposal_followup_days:2,coupon_suggestion_days:5,activation_repeat_days:2,max_activation_attempts:3};
}
const days=n=>Math.max(1,Number(n)||1);
export default async req=>{const e=await legacyEvent(req);try{
 const u=await auth(e);if(!u||!['admin','consultant'].includes(u.role))return json({message:'Não autenticado.'},401);
 const b=await body(e),action=e.queryStringParameters?.action||b.action||'list';
 if(e.httpMethod==='GET'&&action==='list'){
  const s=await settings(u.company_id),consult=u.role==='consultant'?u.id:null;
  const rows=await db.sql`
   WITH act AS (
     SELECT lead_id,COUNT(*)::int activation_count,MAX(created_at) last_activation_at
     FROM lead_activations WHERE company_id=${u.company_id} GROUP BY lead_id
   ), an AS (
     SELECT DISTINCT ON (lead_id) lead_id,id,status,created_at
     FROM analyses WHERE company_id=${u.company_id} AND lead_id IS NOT NULL ORDER BY lead_id,created_at DESC
   ), pr AS (
     SELECT DISTINCT ON (analysis_id) analysis_id,id,status,expires_at,last_viewed_at,views
     FROM proposals WHERE company_id=${u.company_id} ORDER BY analysis_id,created_at DESC
   ), pe AS (
     SELECT p.id proposal_id,COUNT(*) FILTER(WHERE e.event_type='expired_view')::int expired_reaccess_count,
       MAX(e.created_at) FILTER(WHERE e.event_type='expired_view') expired_reaccess_at
     FROM proposals p LEFT JOIN proposal_events e ON e.proposal_id=p.id
     WHERE p.company_id=${u.company_id} GROUP BY p.id
   ), cv AS (
     SELECT DISTINCT ON (lead_id) lead_id,id,status,expires_at,last_viewed_at,expired_reaccess_count
     FROM campaign_vouchers WHERE company_id=${u.company_id} ORDER BY lead_id,created_at DESC
   )
   SELECT l.id lead_id,l.client_id,l.consultant_id,l.name,l.phone,l.product,l.status,l.updated_at,
     COALESCE(act.activation_count,0)::int activation_count,act.last_activation_at,
     an.id analysis_id,an.status analysis_status,an.created_at analysis_created_at,
     pr.id proposal_id,pr.status proposal_status,pr.expires_at proposal_expires_at,pr.last_viewed_at proposal_last_viewed_at,COALESCE(pr.views,0)::int proposal_views,
     COALESCE(pe.expired_reaccess_count,0)::int proposal_expired_reaccess_count,pe.expired_reaccess_at,
     cv.id voucher_id,cv.status voucher_status,cv.expires_at voucher_expires_at,cv.last_viewed_at voucher_last_viewed_at,COALESCE(cv.expired_reaccess_count,0)::int voucher_expired_reaccess_count
   FROM leads l
   LEFT JOIN act ON act.lead_id=l.id
   LEFT JOIN an ON an.lead_id=l.id
   LEFT JOIN pr ON pr.analysis_id=an.id
   LEFT JOIN pe ON pe.proposal_id=pr.id
   LEFT JOIN cv ON cv.lead_id=l.id
   WHERE l.company_id=${u.company_id} AND (${consult}::uuid IS NULL OR l.consultant_id=${consult})
     AND l.status NOT IN ('Aceita','Recusada')
   ORDER BY l.updated_at ASC LIMIT 500`;
  const now=Date.now(),out=[];
  const age=(v)=>v?Math.floor((now-new Date(v).getTime())/86400000):999;
  for(const x of rows){
    let priority=0,type='',title='',next_action='',reason='';
    if(x.proposal_expired_reaccess_count>0 && x.expired_reaccess_at && age(x.expired_reaccess_at)<=7){
      priority=100;type='proposal_reaccess';title='🔥 Tentou acessar proposta expirada';next_action='Chamar cliente agora';reason=`Reacessou após a expiração • ${x.proposal_expired_reaccess_count} tentativa(s)`;
    } else if(x.voucher_expired_reaccess_count>0 && x.voucher_last_viewed_at && age(x.voucher_last_viewed_at)<=7){
      priority=95;type='voucher_reaccess';title='🎟️ Voltou ao cupom expirado';next_action='Reavaliar e reativar oferta';reason=`${x.voucher_expired_reaccess_count} tentativa(s) após a expiração`;
    } else if(x.proposal_views>=4 && !['Aceita','Recusada'].includes(x.proposal_status)){
      priority=90;type='hot_proposal';title='👀 Alto interesse na proposta';next_action='Fazer contato antes de oferecer desconto';reason=`${x.proposal_views} acessos registrados`;
    } else if(x.analysis_id && !x.proposal_id && age(x.analysis_created_at)>=days(s.analysis_followup_days)){
      priority=80;type='analysis_stalled';title='📑 Análise concluída sem avanço';next_action='Retomar atendimento e avaliar campanha';reason=`Análise sem proposta há ${age(x.analysis_created_at)} dia(s)`;
    } else if(x.proposal_id && !['Aceita','Recusada'].includes(x.proposal_status) && age(x.proposal_last_viewed_at||x.proposal_expires_at)>=days(s.proposal_followup_days)){
      priority=75;type='proposal_followup';title='📨 Proposta sem decisão';next_action='Realizar follow-up';reason='Cliente ainda não decidiu';
    } else if(x.activation_count===0){
      priority=70;type='never_activated';title='⚠️ Lead ainda não foi ativado';next_action='Fazer primeira ativação hoje';reason='Nenhuma ativação registrada';
    } else if(x.activation_count===1 && age(x.last_activation_at)>=days(s.activation_repeat_days)){
      priority=68;type='activate_again';title='🔔 Ativado somente uma vez';next_action='Ativar novamente';reason=`Última ativação há ${age(x.last_activation_at)} dia(s)`;
    } else if(x.activation_count<Number(s.max_activation_attempts||3) && age(x.last_activation_at)>=days(s.activation_repeat_days)){
      priority=60;type='followup_due';title='🔁 Nova ativação recomendada';next_action='Realizar nova tentativa';reason=`${x.activation_count} ativação(ões) realizadas`;
    } else if(age(x.updated_at)>=days(s.coupon_suggestion_days)){
      priority=55;type='coupon_candidate';title='🎟️ Lead elegível para campanha';next_action='Gerar cupom promocional';reason=`Sem avanço há ${age(x.updated_at)} dia(s)`;
    } else if(age(x.updated_at)>=days(s.stale_lead_days)){
      priority=45;type='stale';title='❄️ Lead esfriando';next_action='Retomar contato';reason=`Sem atualização há ${age(x.updated_at)} dia(s)`;
    }
    if(priority)out.push({...x,priority,type,title,next_action,reason});
  }
  out.sort((a,b)=>b.priority-a.priority);
  const summary={
   total:out.length,urgent:out.filter(x=>x.priority>=90).length,
   cooling:out.filter(x=>['stale','activate_again','followup_due'].includes(x.type)).length,
   coupons:out.filter(x=>x.type==='coupon_candidate').length,
   reaccess:out.filter(x=>['proposal_reaccess','voucher_reaccess'].includes(x.type)).length
  };
  return json({summary,items:out});
 }
 if(e.httpMethod==='POST'&&action==='dismiss'){
   const guard=requireSameOrigin(e);if(guard)return guard;
   // Dismissal is recorded as an activity rather than deleting lead state.
   const [l]=u.role==='admin'?await db.sql`SELECT * FROM leads WHERE id=${b.lead_id} AND company_id=${u.company_id}`:await db.sql`SELECT * FROM leads WHERE id=${b.lead_id} AND company_id=${u.company_id} AND consultant_id=${u.id}`;
   if(!l)return json({message:'Lead não encontrado.'},404);
   await db.sql`INSERT INTO activities(id,company_id,consultant_id,client_id,lead_id,type,title,details)
    VALUES(${uid()},${u.company_id},${l.consultant_id},${l.client_id},${l.id},'opportunity_reviewed','Oportunidade revisada',${JSON.stringify({reason:b.reason||null})})`;
   return json({ok:true});
 }
 return json({message:'Ação inválida.'},400);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
