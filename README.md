# 星川达人匹配工作台（服务商版）

面向服务商的独立 GitHub Pages 站点，仅保留原星川决策工作台中的「达人匹配」板块，并将匹配池限定为三个新增达人库。

## 匹配池

1. 优质星川达人（增量达人库，994 人）
2. 潜力星川达人推荐（规则测算与分层）
3. 星图达人推荐（精选联盟激励候选，筛选后 AI 评分）

存量星川达人库、服务商自有/本机存量库及 xc-tagger 自助打标入口均已隐藏，匹配请求固定传 `local_stock: []` 且 `stock_count: 0`。

## 功能范围

- 商品信息录入与内容偏好标签
- 三池达人智能匹配、AI 相关性评分与规则分层
- 数量调整、优化筛选、重新匹配
- 分池展开、分页查看、主页与代表视频链接
- 单池导出与全量 CSV 导出
- 对外版服务商访问授权、历史记录与使用留痕

## 技术栈

React 19、TypeScript、Vite、Tailwind CSS、Framer Motion。生产构建通过 `vite-plugin-singlefile` 将主程序内联为单个 `index.html`，另保留 `xlsx.full.min.js` 作为按需加载资源。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

构建产物位于 `dist/`，可直接部署到 GitHub Pages。
