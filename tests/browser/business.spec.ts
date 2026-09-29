import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const loadPg=createRequire(process.cwd()+'/package.json');
const {Client}=loadPg('pg');
const fixture=JSON.parse(fs.readFileSync('test-results/browser-fixture.json','utf8'));
const user=fixture.user;
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus&&!new URL(page.url()).pathname.startsWith('/login'))console.log('Synthetic page diagnostic:',await page.locator('main').innerText().catch(()=>''));
});
async function login(page:Page,role:string){
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
 await page.goto('/login');await page.getByLabel('メールアドレス').fill(fixture.actors[role].email);await page.getByLabel('パスワード').fill(fixture.actors[role].password);
 await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.waitForURL('**/dashboard');await expect(page.getByRole('heading',{name:'業務・期限一覧'})).toBeVisible();await page.getByRole('link',{name:'利用者一覧',exact:true}).click();await page.waitForURL('**/users');
 const context=await api(page,'session.context',null);expect(context.status,JSON.stringify(context.body)).toBe(200);
}
async function api(page:Page,operation:string,target:string|null,payload:object={},version:number|null=null){
 return page.evaluate(async input=>{const r=await fetch('/api/authorized',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:r.status,body:await r.json()};},{operation,target,payload,version});
}
async function database(sql:string,args:unknown[]=[]){
 const db=new Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',ssl:false});
 await db.connect();try{return await db.query(sql,args);}finally{await db.end();}
}
test('specialist saves and reloads all four record types; worker and system boundaries',async({browser,page})=>{
 await login(page,'specialist');await page.getByRole('link',{name:'架空利用者ブラウザー',exact:true}).click();
 await expect(page.getByText('生年月日：2000-01-01')).toBeVisible();
 for(const [path,label,field] of [['records','支援記録','相談内容'],['assessments','アセスメント','本人の希望'],['monitoring','モニタリング','本人の生活状況'],['meetings','担当者会議記録','議題（必須）']]){
  await page.goto(`/users/${user}/${path}`);await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
  await page.getByLabel(path==='records'?'日時（日本時間）':'実施日',{exact:true}).fill(path==='records'?'2026-09-28T10:00':'2026-09-28');
  if(path==='records')await page.getByLabel('対応方法').selectOption('訪問');
  await page.getByLabel(field,{exact:true}).fill('架空テスト本文-'+path);
  if(path==='meetings'){await page.getByLabel('決定事項（必須）',{exact:true}).fill('架空決定');await page.getByLabel('自分を参加職員として記録').check();}
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
  await page.reload();await page.getByRole('button',{name:/の記録（第1版）/}).click();await expect(page.getByLabel(field,{exact:true})).toHaveValue('架空テスト本文-'+path);
  if(path==='assessments')await page.screenshot({path:'test-results/evidence/assessment.png',fullPage:true});
 }
 const worker=await browser.newPage();await login(worker,'worker');
 const list=await api(worker,'user.list',null);expect(Object.keys(list.body.data[0]).sort()).toEqual(['id','name','status']);
 await worker.goto(`/users/${user}`);await expect(worker.getByRole('link',{name:'支援記録',exact:true})).toBeVisible();await expect(worker.getByRole('link',{name:'アセスメント',exact:true})).toHaveCount(0);await expect(worker.getByText('生年月日：2000-01-01')).toHaveCount(0);
 await worker.goto(`/users/${user}/records`);await expect(worker.getByText('記録はまだありません。')).toBeVisible();
 await worker.getByLabel('日時（日本時間）').fill('2026-09-28T11:00');await worker.getByLabel('対応方法').selectOption('電話');await worker.getByLabel('相談内容',{exact:true}).fill('架空一般職員記録');await worker.getByRole('button',{name:'保存',exact:true}).click();await expect(worker.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 await worker.reload();await worker.getByRole('button',{name:/の記録（第1版）/}).click();await expect(worker.getByLabel('相談内容',{exact:true})).toHaveValue('架空一般職員記録');
 await worker.goto(`/users/${user}/plans`);await expect(worker.getByText('計画本文を閲覧する権限がありません。')).toBeVisible();expect((await api(worker,'plan.list',user)).status).toBe(403);
 await worker.screenshot({path:'test-results/evidence/worker-denied.png'});
 const system=await browser.newPage();await login(system,'system');await expect(system.getByText('閲覧できる利用者はいません。')).toBeVisible();expect((await api(system,'user.read',user)).status).toBe(403);expect((await api(system,'technical.read',null)).status).toBe(200);
 await worker.close();await system.close();
});
test('manual plan -> submit -> reject -> resubmit -> separate approval -> immutable -> revise',async({browser,page})=>{
 await login(page,'specialist');await page.goto(`/users/${user}/plans`);await page.getByLabel('計画更新期限').fill('2027-01-01');await page.getByRole('button',{name:'新しい計画を作成'}).click();
 for(const field of ['本人の希望','総合的援助方針','長期目標','短期目標'])await page.getByLabel(field,{exact:true}).fill('架空'+field);
 await page.getByRole('button',{name:'計画を保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 await page.getByRole('button',{name:'計画を提出',exact:true}).click();await expect(page.getByRole('status')).toContainText('承認待ち');
 const admin=await browser.newPage();await login(admin,'admin');await admin.goto(`/users/${user}/plans`);
 await expect(admin.getByRole('button',{name:'理由を付けて差戻し'})).toBeDisabled();await admin.getByLabel('差戻し理由',{exact:true}).fill('架空の差戻し理由');await admin.getByRole('button',{name:'理由を付けて差戻し'}).click();await expect(admin.getByRole('status')).toContainText('差戻し');
 await page.getByRole('button',{name:'最新の計画を再読込'}).click();await expect(page.getByText('差戻し理由：架空の差戻し理由')).toBeVisible();
 await page.getByLabel('短期目標',{exact:true}).fill('架空修正目標');await page.getByRole('button',{name:'計画を保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');await page.getByRole('button',{name:'計画を提出',exact:true}).click();await expect(page.getByRole('status')).toContainText('承認待ち');
 await admin.getByRole('button',{name:'最新の計画を再読込'}).click();await admin.getByRole('button',{name:'計画を承認',exact:true}).click();await expect(admin.getByRole('status')).toContainText('承認済み');
 await page.getByRole('button',{name:'最新の計画を再読込'}).click();await expect(page.getByLabel('短期目標',{exact:true})).toBeDisabled();
 const current=(await api(page,'plan.list',user)).body.data[0];expect((await api(page,'plan.save',current.id,{content:current.content},current.content_version)).status).toBe(403);
 // Reopen after refusal (the page itself has not received this external test request).
 await page.getByRole('button',{name:'改訂を開始'}).click();await expect(page.getByRole('status')).toContainText('下書き');await expect(page.getByLabel('短期目標',{exact:true})).toBeEnabled();
 await page.screenshot({path:'test-results/evidence/plan-revision.png',fullPage:true});
 await page.getByText(/承認済み第.*版を確認/).click();await expect(page.getByText('短期目標：架空修正目標',{exact:true})).toBeVisible();
 await page.getByLabel('短期目標',{exact:true}).fill('架空改訂後の目標');await page.getByRole('button',{name:'計画を保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 await page.getByRole('button',{name:'計画を提出',exact:true}).click();await expect(page.getByRole('status')).toContainText('承認待ち');
 await admin.getByRole('button',{name:'最新の計画を再読込'}).click();await admin.getByRole('button',{name:'計画を承認',exact:true}).click();await expect(admin.getByRole('status')).toContainText('承認済み');
 const approvedRevision=current.review.approved_revision;expect(approvedRevision).toBeGreaterThan(0);
 const exported=await page.request.get(`/api/forms/nagoya?plan=${current.id}&revision=${approvedRevision}`);
 expect(exported.status()).toBe(200);expect(exported.headers()['content-type']).toContain('spreadsheetml');expect((await exported.body()).subarray(0,2).toString()).toBe('PK');
 await page.goto(`/users/${user}/plans/print?plan=${current.id}&revision=${approvedRevision}`);await expect(page.getByText(`承認済みの第${approvedRevision}版を表示しています。`)).toBeVisible();
 const worker=await browser.newPage();await login(worker,'worker');expect((await worker.request.get(`/api/forms/nagoya?plan=${current.id}&revision=${approvedRevision}`)).status()).toBe(403);await worker.close();
 const unauth=await browser.newContext();expect((await unauth.request.get(`http://127.0.0.1:3100/api/forms/nagoya?plan=${current.id}&revision=${approvedRevision}`)).status()).toBe(401);await unauth.close();
 await admin.close();
});
test('same signed session immediately loses access after assignment, membership, role removal and staff stop',async({page})=>{
 await login(page,'specialist');const id=fixture.actors.specialist.id;
 const before=(await page.context().cookies()).filter(c=>c.name.includes('auth-token'));
 for(const [change,restore] of [
  ["update public.plan_assignments set ends_on=current_date where staff_id=$1","update public.plan_assignments set ends_on=null where staff_id=$1"],
  ["update public.staff_facility_roles set ends_at=now() where staff_id=$1","update public.staff_facility_roles set ends_at=null where staff_id=$1"],
  ["update public.staff_facility_roles set role_id=(select id from public.roles where code='system_admin') where staff_id=$1","update public.staff_facility_roles set role_id=(select id from public.roles where code='specialist') where staff_id=$1"],
  ["update public.staff set is_active=false where id=$1","update public.staff set is_active=true where id=$1"]
 ]){
  await page.goto(`/users/${user}/records`);await page.getByRole('button',{name:'2026-09-28 10:00 の記録（第1版）',exact:true}).click();await expect(page.getByLabel('相談内容',{exact:true})).toHaveValue('架空テスト本文-records');await expect(page.getByRole('button',{name:'2026-09-28 10:00 の記録（第1版）',exact:true})).toBeEnabled();
  try{await database(change,[id]);await page.getByRole('button',{name:'2026-09-28 10:00 の記録（第1版）',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('許可されていません');await expect(page.getByLabel('相談内容',{exact:true})).toHaveCount(0);expect((await api(page,'user.read',user)).status).toBe(403);}
  finally{await database(restore,[id]);}
 }
 // Never put session tokens into assertion diffs or CI artifacts.
 expect(JSON.stringify((await page.context().cookies()).filter(c=>c.name.includes('auth-token')))===JSON.stringify(before)).toBe(true);
});
test('anonymous rejected and stale record editor gets business conflict without overwriting',async({page})=>{
 await page.goto('/login');expect((await api(page,'user.list',null)).status).toBe(401);
 await login(page,'specialist');await page.goto(`/users/${user}/records`);
 await page.getByRole('button',{name:'2026-09-28 10:00 の記録（第1版）',exact:true}).click();
 await expect(page.getByLabel('相談内容',{exact:true})).toHaveValue('架空テスト本文-records');
 const records=(await api(page,'record.list',user,{kind:'support'})).body.data;
 const r=records.find((x:{created_by:string})=>x.created_by===fixture.actors.specialist.id);
 expect((await api(page,'record.save',r.id,{kind:'support',user_id:user,date:r.occurred_at,content:{...r.content,consultation:'別画面の架空更新'}},r.version)).status).toBe(200);
 await page.getByLabel('相談内容',{exact:true}).fill('古い画面の架空更新');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('内容が更新されています');
 expect((await api(page,'record.read',r.id,{kind:'support'})).body.data.content.consultation).toBe('別画面の架空更新');
 await expect(page.getByLabel('相談内容',{exact:true})).toHaveValue('古い画面の架空更新');
});
test('dual-role self approval is hidden and rejected; anonymous and forged IDs rejected',async({page})=>{
 await login(page,'dual');
 await page.getByRole('link',{name:'新規登録',exact:true}).click();
 await page.getByLabel('氏名',{exact:true}).fill('架空自己承認試験');await page.getByLabel('フリガナ',{exact:true}).fill('カクウ');await page.getByLabel('生年月日',{exact:true}).fill('2000-01-01');await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('heading',{name:'架空自己承認試験',exact:true})).toBeVisible();
 const createdId=new URL(page.url()).pathname.split('/').at(-1)!;
 await page.getByRole('link',{name:'基本情報を編集'}).click();await page.getByLabel('フリガナ',{exact:true}).fill('カクウヘンコウ');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('フリガナ：カクウヘンコウ',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'サービス等利用計画',exact:true}).click();await page.getByLabel('計画更新期限').fill('2027-01-01');await page.getByRole('button',{name:'新しい計画を作成'}).click();
 for(const field of ['本人の希望','総合的援助方針','長期目標','短期目標'])await page.getByLabel(field,{exact:true}).fill('架空自己承認試験');
 await page.getByRole('button',{name:'計画を保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');await page.getByRole('button',{name:'計画を提出',exact:true}).click();await expect(page.getByRole('status')).toContainText('承認待ち');await expect(page.getByRole('button',{name:'計画を承認',exact:true})).toHaveCount(0);
 const p=(await api(page,'plan.list',createdId)).body.data[0];expect((await api(page,'plan.approve',p.id,{epoch:p.review.epoch},p.content_version)).status).toBe(403);
 expect((await api(page,'user.read',user,{organization_id:fixture.facility})).status).toBe(403);
 expect((await api(page,'user.read','60000000-0000-4000-8000-999999999999')).status).toBe(403);
 const r=await page.request.post('/api/authorized',{headers:{Origin:'http://evil.invalid'},data:{operation:'user.list'}});expect(r.status()).toBe(403);
});

test('3D staff roles, suspension and membership scope through UI',async({page,browser})=>{
 await login(page,'admin');await page.getByRole('link',{name:'職員・ロール管理'}).click();
 await expect(page.getByRole('heading',{name:'職員・ロール管理'})).toBeVisible();
 const card=page.getByRole('region',{name:'架空職員specialist',exact:true});
 await expect(card.getByText('職員状態：有効')).toBeVisible();
 await expect(page.getByRole('region',{name:'架空職員outside',exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'架空職員admin',exact:true}).getByRole('button')).toHaveCount(0);
 const specialist=await browser.newPage();await login(specialist,'specialist');
 await card.getByRole('button',{name:'職員を停止'}).click();await expect(card.getByText('職員状態：停止')).toBeVisible();
 await specialist.goto(`/users/${user}`);await expect(specialist.getByRole('main').getByRole('alert')).toContainText('許可されていません');
 await card.getByRole('button',{name:'職員を再開'}).click();await expect(card.getByText('職員状態：有効')).toBeVisible();
 await card.getByLabel('業務ロール').selectOption('specialist');await card.getByLabel('所属開始日').fill('2020-01-01');await card.getByLabel('所属終了日',{exact:true}).fill('2020-01-02');await card.getByRole('button',{name:'ロール・期間を保存'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 expect((await api(specialist,'user.read',user)).status).toBe(403);
 await card.getByLabel('所属終了日',{exact:true}).fill('');await card.getByRole('button',{name:'ロール・期間を保存'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 expect((await api(specialist,'user.read',user)).status).toBe(200);await expect(card.getByText('相談支援専門員：2020-01-01 〜 終了なし',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/evidence/staff-management.png',fullPage:true});
 const system=await browser.newPage();await login(system,'system');await system.goto('/staff');await expect(system.getByText('管理できる事業所はありません。')).toBeVisible();
 expect((await api(system,'staff.role',fixture.facility,{staff_id:fixture.actors.worker.id,role_code:'business_admin',starts_at:'2020-01-01T00:00:00Z'})).status).toBe(403);
 await specialist.close();await system.close();
});

test('3D assignment handover, newly assigned access and former assignee revocation',async({page,browser})=>{
 await login(page,'admin');const old=await browser.newPage(),next=await browser.newPage();await login(old,'specialist');await login(next,'replacement');
 expect((await api(next,'user.read',user)).status).toBe(403);
 await page.goto(`/users/${user}/assignments`);await page.getByLabel('担当職員',{exact:true}).selectOption(fixture.actors.replacement.id);await page.getByLabel('引継ぎ元',{exact:true}).selectOption(fixture.actors.specialist.id);
 await page.getByRole('button',{name:'選択した職員へ引継ぎ'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 await old.goto(`/users/${user}`);await expect(old.getByRole('main').getByRole('alert')).toContainText('許可されていません');
 await next.goto(`/users/${user}`);await expect(next.getByRole('link',{name:'アセスメント',exact:true})).toBeVisible();
 await page.getByLabel('担当職員',{exact:true}).selectOption(fixture.actors.specialist.id);await page.getByLabel('引継ぎ元',{exact:true}).selectOption(fixture.actors.replacement.id);await page.getByRole('button',{name:'選択した職員へ引継ぎ'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 expect((await api(next,'user.read',user)).status).toBe(403);
 // Exercise scheduled assignment creation as well as atomic handover.
 await page.getByLabel('担当職員',{exact:true}).selectOption(fixture.actors.replacement.id);await page.getByLabel('担当開始日').fill('2020-01-01');await page.getByRole('button',{name:'担当を保存'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 expect((await api(next,'user.read',user)).status).toBe(200);
 const item=page.getByRole('listitem').filter({hasText:'架空職員replacement'});await item.getByRole('button',{name:'担当解除'}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');expect((await api(next,'user.read',user)).status).toBe(403);
 await old.close();await next.close();
});

test('3D basic information, scoped meeting directory, deadlines and waiting approvals',async({page,browser})=>{
 await login(page,'specialist');await page.goto(`/users/${user}/edit`);await expect(page.getByLabel('氏名',{exact:true})).toHaveValue('架空利用者ブラウザー');
 await page.getByLabel('利用状態').selectOption('利用中');await page.getByLabel('利用者更新期限').fill('2026-12-31');await page.getByLabel('生年月日',{exact:true}).fill('2000-01-01');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('状態：利用中')).toBeVisible();
 await page.goto(`/users/${user}/meetings`);await page.getByLabel('実施日',{exact:true}).fill('2026-09-29');await page.getByLabel('議題（必須）',{exact:true}).fill('架空運用会議');await page.getByLabel('決定事項（必須）',{exact:true}).fill('架空の対応確認');await page.getByLabel('自分を参加職員として記録').check();await page.getByLabel('架空職員worker',{exact:true}).check();
 await expect(page.getByLabel('架空職員outside',{exact:true})).toHaveCount(0);await expect(page.getByLabel('架空職員system',{exact:true})).toHaveCount(0);
 await page.getByLabel('対応担当者',{exact:true}).selectOption(fixture.actors.worker.id);await page.getByLabel('対応期限',{exact:true}).fill('2026-12-01');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 const content={participantIds:[fixture.actors.outside.id],responsibleId:'',deadline:'',actionStatus:'unconfirmed',actionNote:'',agenda:'架空',decisions:'架空',role:'',discussion:'',userFamilyWishes:''};
 expect((await api(page,'record.save',randomUUID(),{kind:'meeting',user_id:user,date:'2026-09-29',content},0)).status).toBe(403);
 await page.goto(`/users/${user}/monitoring`);await page.getByLabel('実施日',{exact:true}).fill('2026-09-29');await page.getByLabel('本人の生活状況',{exact:true}).fill('架空期限検証');await page.getByLabel('次回予定日',{exact:true}).fill('2026-11-30');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('保存しました。');
 await page.goto('/dashboard');await expect(page.getByText(/利用者更新期限：2026-12-31/)).toBeVisible();await expect(page.getByText(/次回モニタリング：2026-11-30/)).toBeVisible();await expect(page.getByText(/対応期限：2026-12-01/)).toBeVisible();
 const admin=await browser.newPage();await login(admin,'admin');await admin.goto('/dashboard');await expect(admin.getByText('計画状態：承認待ち',{exact:true})).toBeVisible();await admin.screenshot({path:'test-results/evidence/deadlines.png',fullPage:true});
 const worker=await browser.newPage();await login(worker,'worker');await worker.goto('/dashboard');await expect(worker.getByRole('link',{name:'架空利用者ブラウザー',exact:true})).toBeVisible();await expect(worker.getByText(/次回モニタリング：/)).toHaveCount(0);expect((await api(worker,'staff.directory',user)).status).toBe(403);
 await admin.close();await worker.close();
});

test('3D audit scope and redacted technical view',async({page,browser})=>{
 await login(page,'admin');await page.goto('/audit');await expect(page.getByRole('table')).toBeVisible();const adminAudit=(await api(page,'audit.list',null)).body.data;expect(adminAudit.some((e:{operation:string})=>e.operation==='assignment.handover')).toBe(true);expect(adminAudit.every((e:{facility_id:string;actor_staff_id:string})=>e.facility_id===fixture.facility||e.actor_staff_id===fixture.actors.admin.id)).toBe(true);
 await expect(page.getByRole('cell',{name:'assignment.handover',exact:true}).first()).toBeVisible();await page.screenshot({path:'test-results/evidence/audit.png',fullPage:true});
 const worker=await browser.newPage();await login(worker,'worker');await worker.goto('/audit');const own=(await api(worker,'audit.list',null)).body.data;expect(own.every((e:{actor_staff_id:string})=>e.actor_staff_id===fixture.actors.worker.id)).toBe(true);
 const system=await browser.newPage();await login(system,'system');await system.goto('/audit');await system.getByLabel('個人識別情報を含まない技術監査').check();await expect(system.getByRole('columnheader',{name:'職員ID'})).toHaveCount(0);
 const tech=(await api(system,'audit.technical',null)).body.data;expect(tech.length).toBeGreaterThan(0);expect(tech.every((e:object)=>Object.keys(e).sort().join(',')==='code,happened_at,operation,outcome')).toBe(true);
 await system.goto('/dashboard');await expect(system.getByText('閲覧できる業務はありません。')).toBeVisible();await worker.close();await system.close();
});
