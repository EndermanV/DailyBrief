require('./_env');
const fs = require('node:fs');
const path = require('node:path');
const { todayKey } = require('../lib/utils');

const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;
const MAX_CONTENT_LEN = 2400;

if (!FEISHU_WEBHOOK) {
    console.error("错误：环境变量 FEISHU_WEBHOOK 未设置");
    process.exit(1);
}

async function main() {
    const date = process.argv[2] || todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Expected date in YYYY-MM-DD format');
    }
    const mdPath = path.join('daily_reports', date, `${date}.md`);
    if (!fs.existsSync(mdPath)) {
        throw new Error(`Report not found: ${mdPath}. Generate it with OUTPUT_MARKDOWN=true first.`);
    }
    let content = fs.readFileSync(mdPath, "utf-8");
    if (!content.trim()) throw new Error(`Report is empty: ${mdPath}`);
    // Feishu lark_md does not support Markdown heading syntax.
    content = content.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');

    // 如果你的飞书机器人开启关键词校验，请把关键词加在这里，例如"简报"
    // content = "简报\n" + content;

    if (content.length > MAX_CONTENT_LEN) {
        content = content.slice(0, MAX_CONTENT_LEN) + "\n\n……内容过长已截断，请查看完整HTML报告";
    }

    const cardPayload = {
        msg_type: "interactive",
        card: {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: "plain_text", content: "📰 DailyBrief 每日简报" },
                template: "blue"
            },
            elements: [
                {
                    tag: "div",
                    text: {
                        tag: "lark_md",
                        content: content
                    }
                }
            ]
        }
    };

    const resp = await fetch(FEISHU_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardPayload),
        signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) throw new Error(`Feishu HTTP ${resp.status}`);
    const result = await resp.json();
    const code = result.code ?? result.StatusCode;
    if (code !== 0) throw new Error(`Feishu rejected card (code=${code ?? 'missing'})`);
    console.log(`飞书推送完成：${date}`);
}

main().catch(err => {
    console.error("推送失败：", String(err.message).replaceAll(FEISHU_WEBHOOK || '\0', '[REDACTED]'));
    process.exit(1);
});
