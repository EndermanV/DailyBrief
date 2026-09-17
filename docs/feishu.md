# 飞书卡片推送

飞书推送已接入原版 `.github/workflows/daily.yml`，Actions 中名称为
`Daily Brief`。同一次运行只生成一次简报，发布 GitHub Pages 后再发送飞书卡片。
沿用原版的定时、时区、补跑和手动触发机制，不再运行独立飞书工作流。

在仓库 **Settings → Secrets and variables → Actions** 中配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `FEISHU_WEBHOOK` | 飞书群自定义机器人的完整 webhook URL；未配置时跳过推送 |
| Secret | `DEEPSEEK_API_KEY` | 默认 DeepSeek 后端的 API Key |
| Variable | `LLM_BACKEND` | 可选，默认 `deepseek`；也支持 `anthropic`、`openai`、`minimax`、`zhipu` |
| Variable | `LLM_MODEL` | 可选，使用所选后端的默认模型 |
| Variable | `REPORT_TZ` | 推荐设置为自己的 IANA 时区，例如 `Asia/Shanghai`，用于报告日期 |
| Variable | `REPORT_LOCALE` | 默认 `zh`，也支持 `en` |

切换后端时，添加对应的 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、
`MINIMAX_API_KEY` 或 `ZHIPU_API_KEY` Secret。兼容服务还可使用
`LLM_API_KEY` Secret 和 `LLM_BASE_URL` Variable。
Actions 无法使用本机的 Claude CLI 登录状态，请选择 API 后端。

推送直接读取 `daily_reports/<date>/<date>.json`，不依赖 Markdown 或 HTML。
卡片包含日期、头条、今日概览、科技动态、财经速递、时政观察、编辑观察和关键词；
空板块自动省略，每条新闻保留标题、完整摘要、来源及可直接打开的“原文”按钮。
内容来自已生成的精选简报，不额外调用模型，也不附带网页中的原始新闻列表或行情表。

通常发送一张卡片。长报告按内容拆成带页码的多张卡片，每张限制在 24 KB 内，
超长文本分段保留，不截断内容，也不要求读者访问 HTML 报告。
飞书推送遵循 `REPORT_LOCALE` 的中英文设置。
推送失败会使本次 Actions 标记为失败，但不撤销已经完成的 Pages 发布。
机器人若开启关键词校验，关键词需出现在卡片中，例如“每日简报”。
当前脚本不支持机器人的签名校验。

本地重推已有报告（不重新调用 LLM）：

```sh
npm run feishu-push -- 2026-09-17
```

省略日期时使用 `todayKey()`，遵循 `REPORT_TZ`。`FEISHU_WEBHOOK`
可通过环境变量或 `.env.local` 提供。缺失报告会报错，不会回退发送旧报告。

回归测试：`node --test scripts/feishu_push.test.mjs`。

使用前按 README 配好 GitHub Pages（从 `gh-pages` 分支根目录部署）和模型 API Key，
再添加 `FEISHU_WEBHOOK` Secret。在 Actions 中启用并手动运行 `Daily Brief` 即可。
