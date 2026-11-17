# 星图达人批量抓取（本地 Mac 运行）

用 Playwright 驱动本机 Chrome，**复用巨量星图「服务商」控制台的已登录态**，
批量抓取存量达人数据（粉丝量 / 内容形式 / 擅长行业 / 近期代表视频 Top3 / 合作报价），
结果回写飞书多维表格「星川产品分析任务台」存量达人库，**只补空白字段，不覆盖已有值**。

## 抓取原理（服务商控制台 API）

登录账号是星图**服务商**身份（深圳市正阳网络科技有限公司），客户侧达人详情页无资质不可见。
脚本进入服务商控制台「达人广场」，在已登录的页面上下文里直接调官方接口：

| 阶段 | 接口 | 说明 |
|---|---|---|
| Phase 1 | `aggregator/multi_get_author_info` | 每批 50 个星图ID，批量拿粉丝量/行业标签/报价/地域 |
| Phase 2 | `gsearch/search_for_author_square` | 按星图ID精查，拿内容主题/互动指标/报价等广场完整字段 |
| Phase 3 | UI 详情抽屉（前 3 个） | 真实点开达人详情，捕获「代表视频」接口原始响应存 `raw-samples/` |

## 一、环境准备（只需一次）

```bash
# 1. 安装 Node.js（要求 node 18+；Mac 上 Aime 已帮你装好便携版 node22）
#    若自己装：brew install node

# 2. 进入脚本目录
cd /private/tmp/aime-agent-shared-dir/cb2f2a4c6229/xingtu-scrape

# 3. 安装依赖（playwright）
npm install
# 若用 Aime 装的便携 node：
# export PATH="$HOME/.local/node22/bin:$PATH" 后再 npm install
```

> 脚本调用本机已安装的 **Google Chrome**，无需额外下载浏览器。

## 二、先跑 3 个达人测试

```bash
node scrape-influencers-test.js
```

- 首次运行会弹出 Chrome 窗口：若未登录，点右上角「登录」→ 选「服务商/客户」→ **抖音扫码**（账号是深圳市正阳网络科技有限公司服务商主体）。登录态保存在 `./.xingtu-chrome-profile`，以后免登录。
- 测试结果写入 `scrape-results-test.json`，前 3 个达人的详情接口原始响应存到 `raw-samples/`（反馈给 Aime 核对代表视频字段映射）。

## 三、全量跑 233 个达人

```bash
node scrape-influencers.js
```

- 并发 3 路，每人间随机停顿 2–5 秒防频控；预计 10–20 分钟。
- 实时进度：`[w1] 第 12/233 个 7071…（是多多呀）… ✅ 粉丝4.8万｜短视频｜母婴亲子｜💰短视频…`
- **断点续跑**：结果实时落盘 `scrape-results.json`，中断后重跑同一命令自动跳过已成功的；`--force` 强制重抓。
- 失败的达人记录错误原因并跳过，不影响整体。
- 若中途提示「登录态失效」，重跑脚本并在弹出窗口重新扫码即可。

跑完后结果 JSON 通过共享目录同步回 Aime，由 Aime 回写多维表格（只补空白字段），无需手动操作。

## 四、常用参数

| 参数 | 说明 |
|---|---|
| `--limit 10` | 只处理前 10 个 |
| `--concurrency 5` | 调整并发数（默认 3，不建议超过 5） |
| `--headless` | 无头模式（登录成功后后台静默跑） |
| `--calibrate 0` | 关闭前 N 个达人的 UI 详情校准（默认 3） |
| `--force` | 已成功的也重新抓取 |
| `--input / --output <文件>` | 自定义输入/输出文件路径 |

## 五、可选：脚本直接回写飞书（一般不用）

默认走「共享目录 → Aime 回写」离线模式。若有自己的飞书自建应用（需有该 Base 编辑权限）：

```bash
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
node scrape-influencers.js --feishu
```

缺失字段（内容形式/擅长行业/代表视频/合作报价）自动创建为文本字段；「粉丝量」为已有数字字段；所有字段**只补空白，不覆盖**。

## 六、文件说明

| 文件 | 说明 |
|---|---|
| `scrape-influencers.js` | 主脚本（服务商控制台 API 版） |
| `scrape-influencers-test.js` | 测试脚本（前 3 个达人） |
| `influencers-input.json` | 达人输入清单（record_id / 达人ID / 昵称，Aime 从多维表格导出） |
| `scrape-results.json` | 抓取结果（自动生成，断点续跑依据） |
| `raw-samples/` | 前 3 个达人详情接口的原始响应（供 Aime 核对字段映射） |
| `.xingtu-chrome-profile/` | 浏览器登录态目录（自动生成，勿删） |

## 常见问题

- **弹出窗口但提示未登录 / 接口报「用户未登录」**：在弹出的 Chrome 里点右上角「登录」，选服务商/客户身份抖音扫码；脚本会自动检测并继续。
- **登录后很快又掉线**：不要同时开多个跑该脚本的 Chrome；确认扫码登录的是服务商主体账号。
- **大量失败/报频控**：等 10–30 分钟，`--concurrency 1` 降速重跑（已成功的不重抓）。
- **node 版本太低**：`node -v` 低于 18 → `brew upgrade node`，或用 Aime 装的便携版 `export PATH="$HOME/.local/node22/bin:$PATH"`。
