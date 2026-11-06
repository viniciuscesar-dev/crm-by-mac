
import {db,json,body,auth,uid,requireSameOrigin,legacyEvent} from './_db.mjs';
import {randomToken} from './security.mjs';

const money=n=>Number(n||0);
const safeInt=(n,min=1,max=120)=>Math.min(max,Math.max(min,Math.round(Number(n)||min)));
const saoDate=()=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value;
  const wd={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0}[get('weekday')];
  return {year:Number(get('year')),month:Number(get('month')),day:Number(get('day')),weekday:wd};
};
const isoWeek=()=>{
 const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));
 return Math.ceil((((d-y)/86400000)+1)/7);
};
const weeklyThemes=[
 ['Semana da Economia Contratual','💰 Menos custo, mais controle sobre o seu contrato.'],
 ['Semana da Revisão Inteligente','📑 Entenda melhor o que você está pagando.'],
 ['Semana do Contrato em Dia','🔎 Uma nova leitura pode revelar oportunidades.'],
 ['Semana da Oportunidade','✨ Retome sua análise com uma condição especial.']
];
function renderTemplate(t,data={}){
 let s=String(t||'').replaceAll('%0A','\n');
 const map={
  cliente:data.client_name||'Cliente',pix:fmt(data.pix_value),cartao_total:fmt(data.card_total_value),
  parcelas:String(data.card_installments||1),parcela:fmt(data.card_installment_value),
  validade:data.validity_label||'hoje',produto:data.product||'seu contrato'
 };
 for(const [k,v] of Object.entries(map))s=s.replaceAll(`{{${k}}}`,v);
 return s;
}
function fmt(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
async function settings(cid){
 const [s]=await db.sql`SELECT * FROM campaign_settings WHERE company_id=${cid}`;
 return s||{stale_lead_days:3,analysis_followup_days:3,proposal_followup_days:2,coupon_suggestion_days:5,activation_repeat_days:2,max_activation_attempts:3,max_discount_without_approval:30,max_campaign_discount:50};
}
async function scopedLead(u,id){
 const [l]=u.role==='admin'
  ?await db.sql`SELECT l.*,c.name client_name FROM leads l LEFT JOIN clients c ON c.id=l.client_id WHERE l.id=${id} AND l.company_id=${u.company_id}`
  :await db.sql`SELECT l.*,c.name client_name FROM leads l LEFT JOIN clients c ON c.id=l.client_id WHERE l.id=${id} AND l.company_id=${u.company_id} AND l.consultant_id=${u.id}`;
 return l||null;
}
async function currentSuggestion(cid){
 const d=saoDate();
 let rows=await db.sql`SELECT * FROM campaign_templates
 WHERE active=true AND (company_id=${cid} OR company_id IS NULL)
 AND ((special_month=${d.month} AND special_day=${d.day}) OR (special_month IS NULL AND special_day IS NULL AND weekday=${d.weekday}))
 ORDER BY CASE WHEN company_id=${cid} THEN 1 ELSE 0 END DESC, priority DESC LIMIT 1`;
 let t=rows[0];
 if(!t){
   const fallback=[
    {headline:'📑 Seu contrato também merece atenção no fim de semana',message_template:'📑✨ *CONDIÇÃO ESPECIAL PARA SUA REVISÃO CONTRATUAL!*\n\nOi, {{cliente}}! Seu atendimento possui uma condição promocional disponível.\n\n💰 *{{pix}} à vista via PIX*\n💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*\n\n⏰ Válida até {{validade}}.',art_headline:'CONDIÇÃO ESPECIAL • REVISÃO CONTRATUAL',name:'Campanha de revisão',theme:'Revisão contratual'}
   ];
   t=fallback[0];
 }
 const wt=weeklyThemes[isoWeek()%weeklyThemes.length];
 return {daily:t,weekly:{name:wt[0],headline:wt[1],message_template:`📑💰 *${wt[0].toUpperCase()}*\n\nEssa semana nossa campanha é para clientes que já iniciaram uma análise contratual e ainda não deram continuidade.\n\n✨ Seu atendimento pode receber uma condição comercial diferenciada. Quer que eu verifique o benefício disponível para você hoje?`},date:d};
}
export default async req=>{const e=await legacyEvent(req);try{
 const u=await auth(e);if(!u||!['admin','consultant'].includes(u.role))return json({message:'Não autenticado.'},401);
 const b=await body(e),action=e.queryStringParameters?.action||b.action||'today';

 if(e.httpMethod==='GET'&&action==='today'){
   const [sug,set,company]=await Promise.all([
     currentSuggestion(u.company_id),settings(u.company_id),
     db.sql`SELECT name,trade_name,logo_url,proposal_logo_url,campaign_spokesperson_url,primary_color FROM companies WHERE id=${u.company_id}`.then(x=>x[0]||{})
   ]);
   return json({...sug,settings:set,company});
 }
 if(e.httpMethod==='GET'&&action==='special-dates'){
   const rows=await db.sql`SELECT id,name,special_month,special_day,headline,message_template,art_headline,active,scope
    FROM campaign_templates WHERE active=true AND special_month IS NOT NULL AND special_day IS NOT NULL
    AND (company_id=${u.company_id} OR company_id IS NULL)
    ORDER BY special_month,special_day,priority DESC`;
   return json(rows);
 }
 if(e.httpMethod==='GET'&&action==='vouchers'){
   const rows=u.role==='admin'
    ?await db.sql`SELECT v.*,u.name consultant_name,l.name lead_name FROM campaign_vouchers v LEFT JOIN users u ON u.id=v.consultant_id LEFT JOIN leads l ON l.id=v.lead_id WHERE v.company_id=${u.company_id} ORDER BY v.created_at DESC LIMIT 300`
    :await db.sql`SELECT v.*,u.name consultant_name,l.name lead_name FROM campaign_vouchers v LEFT JOIN users u ON u.id=v.consultant_id LEFT JOIN leads l ON l.id=v.lead_id WHERE v.company_id=${u.company_id} AND v.consultant_id=${u.id} ORDER BY v.created_at DESC LIMIT 300`;
   return json(rows);
 }
 if(e.httpMethod==='GET'&&action==='eligible-leads'){
   const set=await settings(u.company_id);
   const rows=u.role==='admin'
    ?await db.sql`SELECT l.id,l.name,l.phone,l.product,l.status,l.updated_at,l.client_id,u.name consultant_name,
      COUNT(a.id)::int activation_count,MAX(a.created_at) last_activation_at
      FROM leads l LEFT JOIN users u ON u.id=l.consultant_id LEFT JOIN lead_activations a ON a.lead_id=l.id
      WHERE l.company_id=${u.company_id} AND l.status NOT IN ('Aceita','Recusada')
      GROUP BY l.id,u.name HAVING l.updated_at<NOW()-(${set.coupon_suggestion_days}*INTERVAL '1 day') OR COUNT(a.id)<=1
      ORDER BY l.updated_at ASC LIMIT 150`
    :await db.sql`SELECT l.id,l.name,l.phone,l.product,l.status,l.updated_at,l.client_id,u.name consultant_name,
      COUNT(a.id)::int activation_count,MAX(a.created_at) last_activation_at
      FROM leads l LEFT JOIN users u ON u.id=l.consultant_id LEFT JOIN lead_activations a ON a.lead_id=l.id
      WHERE l.company_id=${u.company_id} AND l.consultant_id=${u.id} AND l.status NOT IN ('Aceita','Recusada')
      GROUP BY l.id,u.name HAVING l.updated_at<NOW()-(${set.coupon_suggestion_days}*INTERVAL '1 day') OR COUNT(a.id)<=1
      ORDER BY l.updated_at ASC LIMIT 150`;
   return json(rows);
 }
 if(e.httpMethod==='POST'){
   const guard=requireSameOrigin(e);if(guard)return guard;

   if(action==='activation'){
     const l=await scopedLead(u,b.lead_id);if(!l)return json({message:'Lead não encontrado.'},404);
     const consultant=u.role==='consultant'?u.id:(l.consultant_id||u.id);
     await db.sql`INSERT INTO lead_activations(id,company_id,consultant_id,lead_id,client_id,activation_type,note)
       VALUES(${uid()},${u.company_id},${consultant},${l.id},${l.client_id||null},${b.activation_type||'followup'},${String(b.note||'').slice(0,1000)||null})`;
     await db.sql`UPDATE leads SET updated_at=NOW() WHERE id=${l.id}`;
     return json({ok:true});
   }

   if(action==='create-voucher'){
     const l=await scopedLead(u,b.lead_id);if(!l)return json({message:'Lead não encontrado.'},404);
     const set=await settings(u.company_id);
     const normal=money(b.normal_value),pix=money(b.pix_value),card=money(b.card_total_value);
     const inst=safeInt(b.card_installments,1,24),instValue=money(b.card_installment_value)||Number((card/inst).toFixed(2));
     if(normal<=0||pix<=0||card<=0)return json({message:'Preencha valor normal, PIX e cartão.'},400);
     if(pix>normal||card>normal)return json({message:'O valor promocional não pode ser maior que o valor normal.'},400);
     const disc=Number((((normal-Math.min(pix,card))/normal)*100).toFixed(2));
     if(disc>Number(set.max_campaign_discount||50))return json({message:`Desconto acima do limite da empresa (${set.max_campaign_discount}%).`},400);
     const needsApproval=u.role==='consultant'&&disc>Number(set.max_discount_without_approval||30);
     const token=randomToken(32),hours=safeInt(b.validity_hours||24,1,168);
     const sug=await currentSuggestion(u.company_id);
     const values={client_name:l.name,product:l.product,pix_value:pix,card_total_value:card,card_installments:inst,card_installment_value:instValue,validity_label:hours<=24?'hoje':'o prazo informado'};
     const template=b.message_template||sug.daily.message_template;
     const msg=renderTemplate(template,values);
     const [v]=await db.sql`INSERT INTO campaign_vouchers(id,company_id,consultant_id,client_id,lead_id,client_name,product,normal_value,pix_value,card_total_value,card_installments,card_installment_value,discount_percent,status,public_token,expires_at,message_used,metadata)
      VALUES(${uid()},${u.company_id},${u.role==='consultant'?u.id:(l.consultant_id||u.id)},${l.client_id||null},${l.id},${l.name},${l.product||null},${normal},${pix},${card},${inst},${instValue},${disc},${needsApproval?'Aguardando aprovação':'Liberado'},${token},NOW()+(${hours}*INTERVAL '1 hour'),${msg},${JSON.stringify({headline:b.headline||sug.daily.headline,art_headline:b.art_headline||sug.daily.art_headline})})} RETURNING *`;
     if(needsApproval){
       const admins=await db.sql`SELECT id FROM users WHERE company_id=${u.company_id} AND role='admin' AND active=true`;
       for(const a of admins)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${u.company_id},${a.id},'campaign_approval','Cupom aguardando aprovação',${`${l.name} recebeu solicitação de ${disc}% de desconto.`},'campaign_vouchers',${v.id})`;
     }
     return json({...v,message:msg,public_url:needsApproval?null:`/?campaign=${token}`});
   }

   if(action==='approve-voucher'){
     if(u.role!=='admin')return json({message:'Somente o administrador pode aprovar.'},403);
     const [v]=await db.sql`UPDATE campaign_vouchers SET status='Liberado',updated_at=NOW() WHERE id=${b.id} AND company_id=${u.company_id} AND status='Aguardando aprovação' RETURNING *`;
     if(!v)return json({message:'Cupom não encontrado ou já processado.'},404);
     if(v.consultant_id)await db.sql`INSERT INTO notifications(id,company_id,user_id,type,title,message,resource,resource_id) VALUES(${uid()},${u.company_id},${v.consultant_id},'campaign_approved','Cupom aprovado',${`O cupom de ${v.client_name} foi aprovado.`},'campaign_vouchers',${v.id})`;
     return json({...v,public_url:`/?campaign=${v.public_token}`});
   }

   if(action==='special-date-create'){
     if(u.role!=='admin')return json({message:'Somente o administrador pode criar datas especiais.'},403);
     const month=safeInt(b.month,1,12),day=safeInt(b.day,1,31);
     const name=String(b.name||'Data especial').slice(0,120),headline=String(b.headline||'Condição especial para sua revisão contratual').slice(0,240);
     const message=String(b.message_template||`✨📑 *${name.toUpperCase()} — CONDIÇÃO ESPECIAL!*\n\nOi, {{cliente}}! Hoje liberamos uma condição promocional vinculada à sua revisão contratual.\n\n💰 *{{pix}} à vista via PIX*\n💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*\n\n⏰ Válida até {{validade}}.`).slice(0,5000);
     const [row]=await db.sql`INSERT INTO campaign_templates(id,company_id,scope,name,theme,special_month,special_day,headline,message_template,art_headline,priority)
      VALUES(${uid()},${u.company_id},'company',${name},'Data especial',${month},${day},${headline},${message},${String(b.art_headline||headline).slice(0,240)},200) RETURNING *`;
     return json(row,201);
   }

   if(action==='save-settings'){
     if(u.role!=='admin')return json({message:'Somente o administrador pode alterar regras.'},403);
     const fields={
      stale_lead_days:safeInt(b.stale_lead_days,1,60),
      analysis_followup_days:safeInt(b.analysis_followup_days,1,60),
      proposal_followup_days:safeInt(b.proposal_followup_days,1,60),
      coupon_suggestion_days:safeInt(b.coupon_suggestion_days,1,90),
      activation_repeat_days:safeInt(b.activation_repeat_days,1,30),
      max_activation_attempts:safeInt(b.max_activation_attempts,1,10),
      max_discount_without_approval:Math.min(100,Math.max(0,Number(b.max_discount_without_approval)||30)),
      max_campaign_discount:Math.min(100,Math.max(0,Number(b.max_campaign_discount)||50))
     };
     await db.sql`INSERT INTO campaign_settings(company_id,stale_lead_days,analysis_followup_days,proposal_followup_days,coupon_suggestion_days,activation_repeat_days,max_activation_attempts,max_discount_without_approval,max_campaign_discount)
       VALUES(${u.company_id},${fields.stale_lead_days},${fields.analysis_followup_days},${fields.proposal_followup_days},${fields.coupon_suggestion_days},${fields.activation_repeat_days},${fields.max_activation_attempts},${fields.max_discount_without_approval},${fields.max_campaign_discount})
       ON CONFLICT(company_id) DO UPDATE SET stale_lead_days=EXCLUDED.stale_lead_days,analysis_followup_days=EXCLUDED.analysis_followup_days,proposal_followup_days=EXCLUDED.proposal_followup_days,coupon_suggestion_days=EXCLUDED.coupon_suggestion_days,activation_repeat_days=EXCLUDED.activation_repeat_days,max_activation_attempts=EXCLUDED.max_activation_attempts,max_discount_without_approval=EXCLUDED.max_discount_without_approval,max_campaign_discount=EXCLUDED.max_campaign_discount,updated_at=NOW()`;
     return json({ok:true,...fields});
   }
 }
 return json({message:'Ação inválida.'},400);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
