
import {db,json,body,auth,requireSameOrigin,legacyEvent} from './_db.mjs';
export default async req=>{const e=await legacyEvent(req);try{
 const u=await auth(e);if(!u||!['admin','consultant'].includes(u.role))return json({message:'Não autenticado.'},401);
 const b=await body(e),action=e.queryStringParameters?.action||b.action||'list';
 if(e.httpMethod==='GET'&&action==='list'){
  const rows=u.role==='admin'
    ?await db.sql`SELECT n.*,u.name user_name FROM notifications n LEFT JOIN users u ON u.id=n.user_id WHERE n.company_id=${u.company_id} AND n.created_at>NOW()-INTERVAL '30 days' ORDER BY n.created_at DESC LIMIT 150`
    :await db.sql`SELECT * FROM notifications WHERE company_id=${u.company_id} AND user_id=${u.id} AND created_at>NOW()-INTERVAL '30 days' ORDER BY created_at DESC LIMIT 150`;
  return json(rows);
 }
 if(e.httpMethod==='POST'&&action==='read'){
  const guard=requireSameOrigin(e);if(guard)return guard;
  if(b.id){
   if(u.role==='admin')await db.sql`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=${b.id} AND company_id=${u.company_id}`;
   else await db.sql`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=${b.id} AND company_id=${u.company_id} AND user_id=${u.id}`;
  }else{
   if(u.role==='admin')await db.sql`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE company_id=${u.company_id}`;
   else await db.sql`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE company_id=${u.company_id} AND user_id=${u.id}`;
  }
  return json({ok:true});
 }
 return json({message:'Ação inválida.'},400);
}catch(err){console.error(err);return json({message:'Erro interno.'},500)}};
