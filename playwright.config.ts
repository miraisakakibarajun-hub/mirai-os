import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',outputDir:'./test-results/playwright',fullyParallel:false,workers:1,timeout:45000,
 reporter:[['list'],['json',{outputFile:'test-results/browser-results.json'}]],
 use:{baseURL:'http://127.0.0.1:3100',headless:true,trace:'off',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/start-browser-app.mjs',url:'http://127.0.0.1:3100/login',reuseExistingServer:false,timeout:180000},
});
