import {db,json,body,cookie,readCookie,auth,requireSameOrigin,clientIp,legacyEvent} from './_db.mjs';
import {hashPassword,randomToken,hashIp,newTotpSecret,verifyTotp,encryptSecret,decryptSecret,recoveryCodes,hashRecovery} from './security.mjs';
const audit=async(u,action,resource=null,id=null,e=null)=>{if(u)await db.sql`INSERT INTO audit_logs(company_id,user_id,action,resource,resource_id,ip_hash) VALUES(${u.company_id},${u.id},${action},${resource},${id},${e?hashIp(clientIp(e)):null})`};
const failKey=e=>hashIp(clientIp(e));
const emailKey=email=>hashIp(`email:${String(email||'').toLowerCase().trim()}`);
export default async req=>{const e=await legacyEvent(req);try{const b=await body(e),a=e.queryStringParameters?.action||b.action;
 if(a==='bootstrap-status'){const [x]=await db.sql`SELECT COUNT(*)::int count FROM users`;return json({initialized:Number(x?.count||0)>0,user_count:Number(x?.count||0)})}
 if(a==='bootstrap'){
   const guard=requireSameOrigin(e); if(guard)return guard;
   const [x]=await db.sql`SELECT id FROM users LIMIT 1`;if(x)return json({ok:false,message:'Sistema já inicializado.'},409);
   const email=String(b.email||process.env.ADMIN_EMAIL||'').toLowerCase().trim(),pass=String(b.password||process.env.ADMIN_PASSWORD||'');
   if(!email||pass.length<12)return json({ok:false,message:'Informe e-mail e senha com pelo menos 12 caracteres.'},400);
   const [u]=await db.sql`INSERT INTO users(name,email,password_hash,role,company_id) VALUES(${String(b.name||'Criador').slice(0,120)},${email},${await hashPassword(pass)},'creator',NULL) RETURNING id,name,email,role,company_id`;
   return json({ok:true,user:u},201)
 }
 if(a==='login'){
   const ip=failKey(e); const email=String(b.email||'').toLowerCase().trim(); const ek=emailKey(email);
   const [attemptIp]=await db.sql`SELECT COUNT(*)::int count FROM login_attempts WHERE key_hash=${ip} AND created_at>NOW()-INTERVAL '15 minutes' AND success=false`;
   const [attemptEmail]=await db.sql`SELECT COUNT(*)::int count FROM login_attempts WHERE key_hash=${ek} AND created_at>NOW()-INTERVAL '15 minutes' AND success=false`;
   if(Number(attemptIp?.count||0)>=10||Number(attemptEmail?.count||0)>=8)return json({ok:false,message:'Muitas tentativas. Aguarde 15 minutos.'},429);
   const [u]=await db.sql`SELECT id,name,email,password_hash,role,active,company_id,totp_enabled,totp_secret_enc,recovery_codes FROM users WHERE email=${email}`;
   let valid=false; try{const h=await hashPassword(b.password||'');valid=!!u&&u.active&&h===u.password_hash}catch{}
   await db.sql`INSERT INTO login_attempts(key_hash,email,success) VALUES(${ip},${email},${valid})`;await db.sql`INSERT INTO login_attempts(key_hash,email,success) VALUES(${ek},${email},${valid})`;
   if(!valid)return json({ok:false,message:'Usuário ou senha inválidos.'},401);
   if(u.role==='creator'&&u.totp_enabled){
     let second=verifyTotp(decryptSecret(u.totp_secret_enc),b.totp_code||'');
     if(!second&&b.recovery_code){
       const target=hashRecovery(b.recovery_code),codes=Array.isArray(u.recovery_codes)?u.recovery_codes:[];
       const idx=codes.indexOf(target);if(idx>=0){second=true;codes.splice(idx,1);await db.sql`UPDATE users SET recovery_codes=${JSON.stringify(codes)} WHERE id=${u.id}`}
     }
     if(!second)return json({ok:false,two_factor_required:true,message:'Digite o código de autenticação em duas etapas.'},401);
   }
   const sid=randomToken(32);await db.sql`DELETE FROM sessions WHERE user_id=${u.id} OR expires_at<=NOW()`;
   await db.sql`INSERT INTO sessions(id,user_id,expires_at,two_factor_verified_at) VALUES(${sid},${u.id},NOW()+INTERVAL '7 days',${u.role==='creator'&&u.totp_enabled?new Date():null})`;await audit(u,'login',null,null,e);
   return json({ok:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,company_id:u.company_id}},200,{'Set-Cookie':cookie('crm_session',sid,604800)})
 }
 if(a==='logout'){const guard=requireSameOrigin(e);if(guard)return guard;const u=await auth(e);const sid=readCookie(e,'crm_session');if(sid)await db.sql`DELETE FROM sessions WHERE id=${sid}`;await audit(u,'logout',null,null,e);return json({ok:true},200,{'Set-Cookie':cookie('crm_session','',0)})}
 if(a==='me'){const u=await auth(e);return json({user:u||null})}
 if(a==='2fa-status'){const u=await auth(e);if(!u||u.role!=='creator')return json({message:'Acesso restrito.'},403);const [x]=await db.sql`SELECT totp_enabled FROM users WHERE id=${u.id}`;return json({enabled:!!x?.totp_enabled})}
 if(a==='2fa-setup'){const guard=requireSameOrigin(e);if(guard)return guard;const u=await auth(e);if(!u||u.role!=='creator')return json({message:'Acesso restrito.'},403);const secret=newTotpSecret();await db.sql`UPDATE users SET totp_secret_enc=${encryptSecret(secret)},totp_enabled=false,recovery_codes='[]'::jsonb WHERE id=${u.id}`;const issuer=encodeURIComponent('CRM by mac'),account=encodeURIComponent(u.email);return json({secret,otpauth:`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`})}
 if(a==='2fa-enable'){const guard=requireSameOrigin(e);if(guard)return guard;const u=await auth(e);if(!u||u.role!=='creator')return json({message:'Acesso restrito.'},403);const [x]=await db.sql`SELECT totp_secret_enc FROM users WHERE id=${u.id}`;if(!x?.totp_secret_enc||!verifyTotp(decryptSecret(x.totp_secret_enc),b.code))return json({message:'Código inválido. Confira o aplicativo autenticador.'},400);const codes=recoveryCodes(),hashes=codes.map(hashRecovery);await db.sql`UPDATE users SET totp_enabled=true,recovery_codes=${JSON.stringify(hashes)} WHERE id=${u.id}`;const sid=readCookie(e,'crm_session');await db.sql`UPDATE sessions SET two_factor_verified_at=NOW(),elevated_until=NOW()+INTERVAL '10 minutes' WHERE id=${sid}`;await audit(u,'2fa_enabled',null,null,e);return json({ok:true,recovery_codes:codes})}
 if(a==='reauth'){const guard=requireSameOrigin(e);if(guard)return guard;const u=await auth(e);if(!u||u.role!=='creator')return json({message:'Acesso restrito.'},403);const [x]=await db.sql`SELECT password_hash,totp_enabled,totp_secret_enc FROM users WHERE id=${u.id}`;const pass=await hashPassword(b.password||'');if(pass!==x.password_hash)return json({message:'Senha incorreta.'},401);if(x.totp_enabled&&!verifyTotp(decryptSecret(x.totp_secret_enc),b.code))return json({message:'Código 2FA inválido.'},401);const sid=readCookie(e,'crm_session');await db.sql`UPDATE sessions SET elevated_until=NOW()+INTERVAL '10 minutes' WHERE id=${sid}`;return json({ok:true,elevated_minutes:10})}
 if(a==='privacy-consent'){const guard=requireSameOrigin(e);if(guard)return guard;const u=await auth(e);if(!u)return json({message:'Não autenticado.'},401);const purpose=String(b.purpose||'Gestão de relacionamento, análises e propostas solicitadas pelo titular').slice(0,500);const legal=String(b.legal_basis||'Execução de contrato/medidas pré-contratuais, quando aplicável').slice(0,300);await db.sql`INSERT INTO privacy_consents(company_id,user_id,subject_name,subject_contact,purpose,legal_basis,policy_version) VALUES(${u.company_id},${u.id},${String(b.subject_name||u.name).slice(0,200)},${String(b.subject_contact||u.email).slice(0,200)},${purpose},${legal},${String(b.policy_version||'1.0').slice(0,20)})`;await audit(u,'privacy_consent',null,null,e);return json({ok:true})}
 return json({ok:false,message:'Ação inválida.'},400)
}catch(err){console.error(err);return json({ok:false,message:'Erro interno.'},500)}};
