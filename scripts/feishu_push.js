// feishu_push.js 独立推送脚本，新增文件，不修改原有项目代码
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;
const DIST_FOLDER = './dist';
const MAX_CONTENT_LEN = 2400;

if (!FEISHU_WEBHOOK) {
    console.error("错误：环境变量 FEISHU_WEBHOOK 未设置");
    process.exit(1);
}

function getLatestBriefMd() {
    if (!fs.existsSync(DIST_FOLDER)) return null;
    const allFiles = fs.readdirSync(DIST_FOLDER);
    const briefFiles = allFiles.filter(f => f.endsWith("-brief.md")).sort().reverse();
    if (briefFiles.length === 0) return null;
    return path.join(DIST_FOLDER, briefFiles[0]);
}

async function main() {
    const mdPath = getLatestBriefMd();
    if (!mdPath) {
        console.log("dist目录未找到*-brief.md简报文件，跳过推送");
        return;
    }
    let content = fs.readFileSync(mdPath, "utf-8");

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

    const resp = await axios.post(FEISHU_WEBHOOK, cardPayload);
    console.log("✅飞书推送完成：", resp.data);
}

main().catch(err => {
    console.error("❌推送失败：", err.response?.data || err.message);
    process.exit(1);
});
