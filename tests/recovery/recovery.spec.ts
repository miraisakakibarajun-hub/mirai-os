import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('restored Auth login and business records through the browser',async({page})=>{
 const f=JSON.parse(fs.readFileSync('test-results/browser-fixture.json','utf8'));
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto('/login');await page.getByLabel('メールアドレス').fill(f.actors.specialist.email);await page.getByLabel('パスワード').fill(f.actors.specialist.password);
 await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.waitForURL('**/dashboard');
 await expect(page.getByRole('heading',{name:'業務・期限一覧'})).toBeVisible();
 for(const [route,label] of [['records','支援記録'],['assessments','アセスメント'],['monitoring','モニタリング'],['meetings','担当者会議記録']]){
  await page.goto(`/users/${f.user}/${route}`);await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/の記録（第/}).first()).toBeVisible();
 }
 await page.goto(`/users/${f.user}/plans`);await expect(page.getByRole('status')).toContainText('承認済み');
 await page.screenshot({path:'test-results/evidence/recovery.png',fullPage:true});
});
