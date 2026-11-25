#!/usr/bin/env node
/**
 * Inbound Email Pipe for Postfix & Webhooks
 * Reads raw RFC 822 email from stdin and injects into mail_items.json (Inbox)
 */
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/root/metrroma-data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MAIL_ITEMS_FILE = path.join(DATA_DIR, 'mail_items.json');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const rawEmail = Buffer.concat(chunks);
  if (!rawEmail || rawEmail.length === 0) {
    process.exit(0);
  }

  try {
    const parsed = await simpleParser(rawEmail);

    const fromVal = parsed.from?.value?.[0] || {};
    const toVal = parsed.to?.value?.[0] || {};
    const fromName = fromVal.name || fromVal.address?.split('@')[0] || 'Unknown';
    const fromEmail = fromVal.address || '';
    const toName = toVal.name || toVal.address?.split('@')[0] || 'Shakil';
    const toEmail = toVal.address || 'shakil@secrate.shop';

    const attachments = [];
    if (Array.isArray(parsed.attachments)) {
      try {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        for (const att of parsed.attachments) {
          const safeName = 'att_' + Date.now() + '_' + (att.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          const diskPath = path.join(UPLOADS_DIR, safeName);
          fs.writeFileSync(diskPath, att.content);
          attachments.push({
            name: att.filename || safeName,
            filename: att.filename || safeName,
            path: diskPath,
            url: '/uploads/' + safeName,
            size: att.size || att.content.length,
            contentType: att.contentType
          });
        }
      } catch (e) {
        console.warn('[Attachment write warning]:', e.message);
      }
    }

    const text = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '') || '';
    const html = parsed.html || parsed.textAsHtml || `<pre>${text}</pre>`;
    const subject = parsed.subject || '(No Subject)';
    const date = parsed.date ? parsed.date.toISOString() : new Date().toISOString();

    let category = 'primary';
    if (/order|invoice|receipt|ডেলিভারি|অর্ডার/i.test(subject) || /order|invoice/i.test(text.slice(0, 300))) {
      category = 'orders';
    }

    const newMail = {
      id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      folder: 'inbox',
      category,
      from: `"${fromName}" <${fromEmail}>`,
      fromName,
      fromEmail,
      to: `"${toName}" <${toEmail}>`,
      toName,
      toEmail,
      cc: parsed.cc?.text || null,
      bcc: null,
      subject,
      snippet: text.trim().slice(0, 140).replace(/\s+/g, ' '),
      body: text,
      html,
      text,
      date,
      isRead: false,
      isStarred: false,
      attachments
    };

    // Primary: Deliver via internal server API (avoids permission issues with shakil user)
    const PORT = process.env.PORT || 3001;
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/mail/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMail)
      });
      if (res.ok) {
        console.log(`[Inbound Mail] Delivered via internal API "${subject}" from ${fromEmail} (Status ${res.status})`);
        process.exit(0);
      }
    } catch (apiErr) {
      console.warn('[Internal API delivery failed, trying file fallback]:', apiErr.message);
    }

    // Fallback: Direct file write
    let items = [];
    if (fs.existsSync(MAIL_ITEMS_FILE)) {
      try {
        items = JSON.parse(fs.readFileSync(MAIL_ITEMS_FILE, 'utf8'));
        if (!Array.isArray(items)) items = [];
      } catch (_) {
        items = [];
      }
    }

    items.unshift(newMail);
    fs.writeFileSync(MAIL_ITEMS_FILE, JSON.stringify(items, null, 2));

    console.log(`[Inbound Mail] Delivered directly to disk "${subject}" from ${fromEmail} to Inbox (ID: ${newMail.id})`);
    process.exit(0);
  } catch (err) {
    console.error('[Inbound Mail Error]:', err);
    process.exit(0); // Exit 0 to prevent bouncing legitimate emails
  }
}

main().catch(err => {
  console.error('[Fatal Inbound Error]:', err);
  process.exit(0);
});
