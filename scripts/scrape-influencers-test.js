#!/usr/bin/env node
/**
 * 测试脚本：只抓前 3 个达人，验证登录态 / 页面结构 / 字段提取是否正常
 * 用法：node scrape-influencers-test.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { main } from './scrape-influencers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

main([
  'node', 'scrape-influencers-test.js',
  '--limit', '3',
  '--concurrency', '1',
  '--output', path.join(__dirname, 'scrape-results-test.json'),
]).catch((e) => {
  console.error('❌ 测试运行失败：', e.message);
  process.exit(1);
});
