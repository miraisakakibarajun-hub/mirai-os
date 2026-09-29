import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testDir:'./tests/recovery',reporter:[['list'],['json',{outputFile:'test-results/recovery-browser-results.json'}]]});
