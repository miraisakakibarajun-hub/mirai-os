import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
export async function formCases({db,actors:a,plan,user,revision,allow,deny,call,passed}){
 const key=randomUUID()+randomUUID();await db.query('insert into mirai_private.form_signer values(true,$1)',[key]);
 const bytes=Buffer.from('Synthetic file bytes for ledger integrity test');const hash=createHash('sha256').update(bytes).digest('hex');const id=randomUUID();
 const p={id,revision,kind:'plan',template:'nagoya-20120402-f1',bytes:bytes.toString('base64')};
 const sign=(actor,body)=>createHmac('sha256',key).update([actor,plan,body.revision,body.kind,body.template,body.id,createHash('sha256').update(Buffer.from(body.bytes,'base64')).digest('hex')].join('|')).digest('hex');
 await deny('3F unsigned registration',a.specialist,'form.register',plan,p);
 await deny('3F tampered signed bytes',a.specialist,'form.register',plan,{...p,bytes:Buffer.from('tamper').toString('base64'),signature:sign(a.specialist,p)});
 const saved=await allow('3F signed ledger registration',a.specialist,'form.register',plan,{...p,signature:sign(a.specialist,p)});assert.equal(saved.file_hash,hash);assert.equal(saved.actor_staff_id,a.specialist);assert.equal(saved.user_id,user);assert.ok(!('file_bytes' in saved));
 assert.equal((await call(a.specialist,'form.register',plan,{...p,signature:sign(a.specialist,p)})).code,'23505');passed.push('DENY 3F duplicate output ID');
 const read=await allow('3F immutable file retrieval',a.specialist,'form.read',id);assert.deepEqual(Buffer.from(read.bytes,'base64'),bytes);
 await allow('3F administrator ledger scope',a.admin,'form.list',plan);
 for(const name of ['worker','system','otherOrg','otherFacility','unassigned','stopped']){
  await deny('3F file read '+name,a[name],'form.read',id);await deny('3F file list '+name,a[name],'form.list',plan);
  const body={...p,id:randomUUID()};await deny('3F signed but unauthorized '+name,a[name],'form.register',plan,{...body,signature:sign(a[name],body)});
 }
 await db.query('update public.plan_assignments set ends_on=current_date where user_id=$1 and staff_id=$2',[user,a.specialist]);await deny('3F file access revoked next request',a.specialist,'form.read',id);await db.query('update public.plan_assignments set ends_on=null where user_id=$1 and staff_id=$2',[user,a.specialist]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a.specialist]);
 for(const sql of ['select * from mirai_private.form_signer','select * from mirai_private.form_outputs','delete from mirai_private.form_outputs',"select mirai_private.verify_form_signature('a','b')"]){await assert.rejects(db.query(sql),e=>e.code==='42501');passed.push('DENY 3F direct ledger/secret bypass');}await db.exec('reset role');
 await db.query('delete from mirai_private.form_signer');
}
