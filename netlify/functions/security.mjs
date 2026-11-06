import crypto from 'node:crypto';

function pepper(){
  const p=process.env.PASSWORD_PEPPER;
  if(!p || p.length < 32) throw new Error('PASSWORD_PEPPER ausente ou fraco: use um segredo aleatório com pelo menos 32 caracteres.');
  return p;
}
export const hashPassword = async (password) => new Promise((resolve,reject)=>crypto.scrypt(String(password), pepper(), 32, {N:16384,r:8,p:1}, (e,k)=>e?reject(e):resolve(k.toString('hex'))));
export const randomToken = (bytes=32) => crypto.randomBytes(bytes).toString('hex');
export const hashIp = (ip='') => crypto.createHash('sha256').update(`${pepper()}:${ip}`).digest('hex');
export const safeEqual = (a,b) => { try { const A=Buffer.from(String(a)); const B=Buffer.from(String(b)); return A.length===B.length && crypto.timingSafeEqual(A,B); } catch { return false; } };

const b32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf){let bits=0,val=0,out='';for(const byte of buf){val=(val<<8)|byte;bits+=8;while(bits>=5){out+=b32[(val>>>(bits-5))&31];bits-=5}}if(bits>0)out+=b32[(val<<(5-bits))&31];return out}
export function base32Decode(s){s=String(s||'').toUpperCase().replace(/[^A-Z2-7]/g,'');let bits=0,val=0,arr=[];for(const ch of s){val=(val<<5)|b32.indexOf(ch);bits+=5;if(bits>=8){arr.push((val>>>(bits-8))&255);bits-=8}}return Buffer.from(arr)}
export function newTotpSecret(){return base32Encode(crypto.randomBytes(20))}
export function totp(secret,time=Date.now(),step=30,digits=6){const counter=Math.floor(time/1000/step),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',base32Decode(secret)).update(buf).digest(),o=h[h.length-1]&15,n=(h.readUInt32BE(o)&0x7fffffff)%(10**digits);return String(n).padStart(digits,'0')}
export function verifyTotp(secret,code,window=1){code=String(code||'').replace(/\D/g,'');if(code.length!==6)return false;for(let w=-window;w<=window;w++)if(totp(secret,Date.now()+w*30000)===code)return true;return false}
function encKey(){return crypto.createHash('sha256').update(String(process.env.PASSWORD_PEPPER||'')).digest()}
export function encryptSecret(text){if(!process.env.PASSWORD_PEPPER)throw new Error('PASSWORD_PEPPER não configurado.');const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',encKey(),iv),ct=Buffer.concat([c.update(String(text),'utf8'),c.final()]),tag=c.getAuthTag();return [iv,tag,ct].map(x=>x.toString('base64url')).join('.')}
export function decryptSecret(v){const [a,b,c]=String(v||'').split('.');const d=crypto.createDecipheriv('aes-256-gcm',encKey(),Buffer.from(a,'base64url'));d.setAuthTag(Buffer.from(b,'base64url'));return Buffer.concat([d.update(Buffer.from(c,'base64url')),d.final()]).toString('utf8')}
export function recoveryCodes(){return Array.from({length:8},()=>crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'))}
export function hashRecovery(code){return crypto.createHash('sha256').update(String(process.env.PASSWORD_PEPPER||'')+'|recovery|'+String(code).toUpperCase().replace(/\s/g,'')).digest('hex')}
