import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const local=JSON.parse(fs.readFileSync('test-results/local-supabase.json','utf8'));
assert.equal(local.API_URL,'http://127.0.0.1:54321');
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',ssl:false});
await db.connect();
const uid=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=uid(100),facility=uid(200),user=uid(300);
const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const actors={};
try{
 assert.equal((await db.query('select count(*)::int n from public.organizations where id=$1',[org])).rows[0].n,0,'Disposable fixture must not already exist');
 await db.query('insert into public.organizations(id,name) values($1,$2)',[org,'架空法人ブラウザー試験']);
 await db.query('insert into public.facilities(id,organization_id,name) values($1,$2,$3)',[facility,org,'架空事業所ブラウザー試験']);
 let n=1;
 for(const [name,roles] of Object.entries({admin:['business_admin'],specialist:['specialist'],worker:['worker'],system:['system_admin'],dual:['business_admin','specialist']})){
  const id=uid(n++),email=`browser-${name}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
  const created=await service.auth.admin.createUser({id,email,password,email_confirm:true});assert.ifError(created.error);
  actors[name]={id,email,password};
  await db.query('insert into public.staff(id,auth_user_id,name,organization_id,is_active) values($1,$1,$2,$3,true)',[id,'架空職員'+name,org]);
  for(const role of roles)await db.query('insert into public.staff_facility_roles(staff_id,facility_id,role_id) select $1,$2,id from public.roles where code=$3',[id,facility,role]);
 }
 await db.query("insert into public.users(id,name,kana,birth_date,facility_id,created_by,updated_by) values($1,'架空利用者ブラウザー','カクウ','2000-01-01',$2,$3,$3)",[user,facility,actors.specialist.id]);
 for(const name of ['specialist','worker','dual'])await db.query('insert into public.plan_assignments(user_id,staff_id) values($1,$2)',[user,actors[name].id]);
 fs.writeFileSync('test-results/browser-fixture.json',JSON.stringify({user,facility,actors}));
 console.log('Synthetic browser fixture prepared (5 accounts, no real data).');
}finally{await db.end();}
