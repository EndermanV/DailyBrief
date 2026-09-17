require('./_env');
const fs = require('node:fs');
const path = require('node:path');
const { todayKey } = require('../lib/utils');
const { setTimeout: delay } = require('node:timers/promises');

const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;
const MAX_CARD_BYTES = 24000;
const en = process.env.REPORT_LOCALE === 'en';
const STR = en ? {
    title: 'DailyBrief Daily Brief', overview: 'Today', tech: 'Technology',
    finance: 'Finance', politics: 'World Affairs', editor: 'Editor Note', original: 'Read source',
} : {
    title: 'DailyBrief 每日简报', overview: '今日概览', tech: '科技动态',
    finance: '财经速递', politics: '时政观察', editor: '编辑观察', original: '原文',
};

if (!FEISHU_WEBHOOK) {
    console.error("错误：环境变量 FEISHU_WEBHOOK 未设置");
    process.exit(1);
}

async function main() {
    const date = process.argv[2] || todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Expected date in YYYY-MM-DD format');
    }
    const reportPath = path.join('daily_reports', date, `${date}.json`);
    if (!fs.existsSync(reportPath)) {
        throw new Error(`Report not found: ${reportPath}. Run npm run daily first.`);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const sections = [
        [STR.tech, report.tech_briefs],
        [STR.finance, report.finance_briefs],
        [STR.politics, report.politics_briefs],
    ];
    for (const [name, briefs] of sections) {
        if (!Array.isArray(briefs) || briefs.some(item => !item ||
            ['title', 'summary', 'source', 'url'].some(key => typeof item[key] !== 'string'))) {
            throw new Error(`Invalid report section: ${name}`);
        }
    }
    const elements = [];
    function addText(content, url, bold = false) {
        if (!content) return;
        if (typeof content !== 'string') throw new Error('Invalid report text');
        // Plain text prevents news punctuation from becoming broken Markdown.
        // Split exceptionally long fields by Unicode code point, never by bytes.
        const characters = Array.from(content);
        for (let i = 0; i < characters.length; i += 1800) {
            const text = characters.slice(i, i + 1800).join('');
            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/([\\`*_\[\]~])/g, '\\$1');
            const element = { tag: 'div', text: { tag: bold ? 'lark_md' : 'plain_text', content: bold ? `**${escaped}**` : text } };
            if (i === 0 && url) {
                try {
                    const target = new URL(url);
                    if (['https:', 'http:'].includes(target.protocol)) {
                        element.extra = { tag: 'button', text: { tag: 'plain_text', content: STR.original }, url: target.href };
                    }
                } catch { /* Invalid source links are omitted; the summary is still readable. */ }
            }
            elements.push(element);
        }
    }
    function heading(title) {
        elements.push({ tag: 'hr' }, { tag: 'div', text: { tag: 'lark_md', content: `**${title}**` } });
    }
    addText(report.hero_headline, undefined, true);
    if (report.daily_overview) {
        heading(STR.overview);
        addText(report.daily_overview);
    }
    for (const [name, briefs] of sections) {
        if (!briefs.length) continue;
        heading(`${name} · ${briefs.length}`);
        briefs.forEach((item, index) => {
            if (index > 0) elements.push({ tag: 'hr' });
            addText(`${String(index + 1).padStart(2, '0')} · ${item.title}`, item.url, true);
            addText(item.summary);
            elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: item.source }] });
        });
    }
    if (report.editor_note) {
        heading(STR.editor);
        addText(report.editor_note);
    }
    if (Array.isArray(report.keywords) && report.keywords.length) {
        elements.push({ tag: 'hr' });
        addText(report.keywords.map(word => `#${word}`).join('  '));
    }
    if (!elements.length) throw new Error('Report is empty');

    const payload = (items, page) => ({
        msg_type: "interactive",
        card: {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: "plain_text", content: `${STR.title}${page}` },
                subtitle: { tag: 'plain_text', content: date },
                template: "blue",
            },
            elements: items,
        },
    });
    const pages = [[]];
    // Leave room below Feishu's message limit, including UTF-8 and JSON overhead.
    for (const element of elements) {
        let page = pages[pages.length - 1];
        if (page.length >= 40 || Buffer.byteLength(JSON.stringify(payload([...page, element], ' (999/999)'))) > MAX_CARD_BYTES) {
            page = [];
            pages.push(page);
        }
        page.push(element);
    }
    const cards = pages.map((page, i) => payload(page, pages.length > 1 ? ` (${i + 1}/${pages.length})` : ''));
    if (cards.some(card => Buffer.byteLength(JSON.stringify(card)) > MAX_CARD_BYTES)) {
        throw new Error('A report element exceeds the Feishu card size limit');
    }

    for (const [index, cardPayload] of cards.entries()) {
        if (index > 0) await delay(300);
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
        console.log(`飞书推送完成：${date} (${index + 1}/${cards.length})`);
    }
}

main().catch(err => {
    console.error("推送失败：", String(err.message).replaceAll(FEISHU_WEBHOOK || '\0', '[REDACTED]'));
    process.exit(1);
});
