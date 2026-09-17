# 飞书卡片推送

工作流：`.github/workflows/daily-brief-feishu-push.yml`，Actions 中名称为
`DailyBrief 每日简报推飞书`。默认每天北京时间 08:00 触发，也可手动运行。

在仓库 **Settings → Secrets and variables → Actions** 中配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `FEISHU_WEBHOOK` | 飞书群自定义机器人的完整 webhook URL |
| Secret | `DEEPSEEK_API_KEY` | 默认 DeepSeek 后端的 API Key |
| Variable | `LLM_BACKEND` | 可选，默认 `deepseek`；也支持 `anthropic`、`openai`、`minimax`、`zhipu` |
| Variable | `LLM_MODEL` | 可选，使用所选后端的默认模型 |
| Variable | `REPORT_TZ` | 推荐设置为自己的 IANA 时区，例如 `Asia/Shanghai`，用于报告日期 |
| Variable | `REPORT_LOCALE` | 默认 `zh`，也支持 `en` |

切换后端时，添加对应的 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、
`MINIMAX_API_KEY` 或 `ZHIPU_API_KEY` Secret。兼容服务还可使用
`LLM_API_KEY` Secret 和 `LLM_BASE_URL` Variable。
Actions 无法使用本机的 Claude CLI 登录状态，请选择 API 后端。

流程会开启 `OUTPUT_MARKDOWN=true`，生成
`daily_reports/<date>/<date>.md`，再发送飞书交互卡片。
卡片保留原脚本的 2400 字符上限，超出部分截断；完整 HTML、Markdown、JSON
可从本次 Actions 的 `brief-result` artifact 下载。推送失败时也会尝试保留产物。
机器人若开启关键词校验，关键词需出现在卡片中，例如“每日简报”。
当前脚本不支持机器人的签名校验。

本地重推已有报告（不重新调用 LLM）：

```sh
npm run feishu-push -- 2026-09-17
```

省略日期时使用 `todayKey()`，遵循 `REPORT_TZ`。`FEISHU_WEBHOOK`
可通过环境变量或 `.env.local` 提供。缺失报告会报错，不会回退发送旧报告。

回归测试：`node --test scripts/feishu_push.test.mjs`。

原有的 `Daily Brief` Pages 工作流仍独立运行；如果只需要飞书，
可在 Actions 中禁用它，避免两条工作流各自生成简报、重复消耗 API 额度。
