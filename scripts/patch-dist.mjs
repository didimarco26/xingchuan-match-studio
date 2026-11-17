#!/usr/bin/env node
/**
 * postbuild 补丁：拆掉内联 bundle 中残留的「字面 HTML 标签」字符串
 *
 * 背景：AIME 静态托管的部署链路会用自定义（非标准）HTML 转换器处理
 * dist/index.html，会把内联 <script> 里的 JS 文本当成 HTML 扫描：
 *
 *   事故 1（react-dom 生产包 createElement fallback）：
 *       y.innerHTML="<script><\/script>"
 *     其中字面 <script> 被误判为真实脚本开标签，主 bundle 被截断 →
 *     浏览器 "Unexpected token" → 白屏。
 *
 *   事故 2（SheetJS sheet_to_html 的导出模板，2026-10-21 白屏）：
 *       var KN='<html><head>...<title>SheetJS Table Export</title></head><body>'
 *     转换器会在「文档中第一个 </head>」前注入宿主运行时（一段 Solid UMD）。
 *     bundle 里这处字符串位于真实 </head> 之前，注入物落进 JS 字符串内部，
 *     其 </script> 提前终止主模块脚本 → 整包语法错误 → 白屏。
 *
 * 标准浏览器均不受影响（script raw text 只认 </script>），但 AIME 部署必须规避。
 *
 * 做法（仅改写内联 <script> 块内部，不碰文档骨架）：
 *   1. 未转义的结构闭合标签 </head|body|html|title|script> → <\/xxx>
 *      JS 字符串与正则中 '\/' === '/'，运行时语义完全不变；
 *   2. 未转义的 <script 开标签 → <scr\u0069pt（字符串/正则中均等价）。
 * 转换后做一次断言扫描，发现残留即 fail 构建，防止后续新依赖再次引入。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'dist/index.html';
let src = readFileSync(FILE, 'utf8');

const CLOSE_TAGS = /<\/(head|body|html|title|script)>/gi;
const OPEN_SCRIPT = /<script(?=[\s/>])/gi;

function escapeInsideJs(code) {
  let n = 0;
  code = code.replace(CLOSE_TAGS, (m) => { n++; return '<\\/' + m.slice(2); });
  code = code.replace(OPEN_SCRIPT, (m) => { n++; return '<scr\\u0069pt'; });
  return { code, n };
}

let blocks = 0;
let totalChanges = 0;
src = src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (full, open, code, close) => {
  blocks++;
  const { code: next, n } = escapeInsideJs(code);
  totalChanges += n;
  return open + next + close;
});

// 断言：除文档骨架（head/body 末尾、title）外，不应再有任何未转义结构标签。
// 直接在整文件里数：未转义 </head|body|html> 各只允许 1 次（真实骨架），
// </title> 只允许 1 次（真实 <title>），</script> 数量等于脚本块数量。
const checks = [
  { tag: '</head>', allow: 1 },
  { tag: '</body>', allow: 1 },
  { tag: '</html>', allow: 1 },
  { tag: '</title>', allow: 1 },
];
for (const { tag, allow } of checks) {
  const re = new RegExp(tag.replace('/', '\\/'), 'gi');
  const cnt = (src.match(re) || []).length;
  if (cnt !== allow) {
    console.error(`[patch-dist] 断言失败：字面 ${tag} 剩余 ${cnt} 处（预期 ${allow}），请把新增字面量改写为 <\\/xxx> 形式`);
    process.exit(1);
  }
}
const scriptCloses = (src.match(/<\/script>/gi) || []).length;
if (scriptCloses !== blocks) {
  console.error(`[patch-dist] 断言失败：</script> 数 ${scriptCloses} !== 脚本块数 ${blocks}`);
  process.exit(1);
}

writeFileSync(FILE, src);
console.log(`[patch-dist] 扫描 ${blocks} 个内联脚本块，转义 ${totalChanges} 处字面 HTML 标签（head/body/html/title/script）`);
