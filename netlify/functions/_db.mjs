import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function sql(strings, ...values) {
  let text = '';

  for (let i = 0; i < strings.length; i++) {
    text += strings[i];

    if (i < values.length) {
      text += `$${i + 1}`;;
    }
  }

  const result = await pool.query(text, values);
  return result.rows;
}

export const db = { sql };
export const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
export async function body(e){try{if(typeof e?.body==='string')return JSON.parse(e.body||'{}');if(typeof e?.json==='function')return await e.clone().json();return {}}catch{return {}}}
export function cookie(n,v,max=86400){return `${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`}
export function readCookie(e,n){const s=header(e,'cookie')||'';return s.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1)||null}
export async function auth(e){const sid=readCookie(e,'crm_session');if(!sid||sid.length<40)return null;const [u]=await db.sql`SELECT u.id,u.name,u.email,u.role,u.active,u.company_id
FROM sessions s JOIN users u ON u.id=s.user_id
LEFT JOIN companies c ON c.id=u.company_id
WHERE s.id=${sid} AND s.expires_at>NOW() AND u.active=true
AND (u.role IN ('creator','platform_staff') OR COALESCE(c.active,true)=true)`;return u||null}
export const uid=()=>crypto.randomUUID();
export const code=(p='EA')=>p+crypto.randomBytes(6).toString('hex').toUpperCase();
export function sameOrigin(e){const origin=header(e,'origin');if(!origin)return false;try{const o=new URL(origin),host=(header(e,'host')||new URL(e.url||'http://localhost').host).split(':')[0];return (o.protocol==='https:'||o.protocol==='http:')&&o.hostname===host}catch{return false}}
export function requireSameOrigin(e){return sameOrigin(e)?null:json({message:'Origem não autorizada.'},403)}
export function clientIp(e){return header(e,'cf-connecting-ip')||header(e,'x-nf-client-connection-ip')||header(e,'client-ip')||'unknown'}

export function header(e,n){try{if(e?.headers?.get)return e.headers.get(n)||e.headers.get(n.toLowerCase())||null;return e?.headers?.[n]||e?.headers?.[n.toLowerCase()]||e?.headers?.[n.replace(/(^|-)([a-z])/g,(_,a,b)=>a+b.toUpperCase())]||null}catch{return null}}
export async function legacyEvent(req){if(!req||req.httpMethod)return req;const u=new URL(req.url);let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await req.clone().text()}catch{};const headers={};try{for(const [k,v] of req.headers.entries())headers[k]=v}catch{};return {httpMethod:req.method,queryStringParameters:Object.fromEntries(u.searchParams.entries()),headers,body:raw,url:req.url};}
