
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderBrandedEmailTemplate({
  contentHtml = '',
  subject = '',
  storeName = 'SECRATE',
  siteUrl = 'https://secrate.shop',
  phone = '',
  whatsapp = '',
  logoUrl = 'cid:store_logo',
  emblemUrl = 'cid:store_emblem',
}) {
  const brandName = escapeHtml(storeName || 'SECRATE');
  const cleanSubject = escapeHtml(subject || brandName);
  const cleanUrl = escapeHtml(siteUrl || 'https://secrate.shop');
  const cleanPhone = escapeHtml(phone);
  const cleanWa = escapeHtml(whatsapp);
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${cleanSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    ${cleanSubject} — ${brandName}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; width: 100%; margin: 0; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <!-- Branded Header with Store Logo -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #09090b 0%, #18181b 100%); padding: 26px 20px; border-bottom: 3px solid #d97706; text-align: center;">
              <a href="${cleanUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="${brandName}" width="190" border="0" style="display: block; margin: 0 auto; width: 190px; max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />
              </a>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 32px 28px; line-height: 1.65; font-size: 15px; color: #334155;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Branded Footer with Store Emblem & Details -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 24px; border-top: 1px solid #e2e8f0; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 10px;">
                    <a href="${cleanUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="${emblemUrl}" alt="${brandName} Icon" width="42" height="42" border="0" style="display: block; margin: 0 auto; width: 42px; height: 42px; border-radius: 50%; border: 0; outline: none;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 13.5px; font-weight: 700; color: #0f172a; padding-bottom: 6px;">
                    ${brandName} — Premium Customer Experience
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 12px; color: #64748b; padding-bottom: 14px; line-height: 1.6;">
                    Official Store: <a href="${cleanUrl}" target="_blank" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">${cleanUrl.replace(/^https?:\/\//, '')}</a>
                    ${cleanPhone ? ` &bull; Helpline: <a href="tel:${cleanPhone}" style="color: #475569; text-decoration: none; font-weight: 600;">${cleanPhone}</a>` : ''}
                    ${cleanWa ? ` &bull; WhatsApp: <a href="https://wa.me/${cleanWa.replace(/[^0-9]/g, '')}" style="color: #16a34a; text-decoration: none; font-weight: 600;">${cleanWa}</a>` : ''}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; color: #94a3b8; padding-top: 10px; border-top: 1px dashed #e2e8f0; line-height: 1.5;">
                    &copy; ${currentYear} ${brandName}. All Rights Reserved.<br/>
                    Designed &amp; Developed BY <a href="https://shakil.metrroma.com" target="_blank" style="color: #d97706; text-decoration: none; font-weight: 700;">Shakil [ shakil.metrroma.com ]</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMailboxes, saveMailboxes, getMailItems, saveMailItems } from './store.js';

let activeBulkCampaign = null;
let bulkStopRequested = false;

export function registerMailRoutes(app, { adminAuth, sendEmail, getCustomers, getOrders, uploadsDir }) {
  // 1. Get custom mailboxes / addresses
  app.get('/api/mail/addresses', adminAuth, (_req, res) => {
    try {
      const addresses = getMailboxes();
      res.json({ ok: true, addresses, list: addresses });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. Create or update custom address
  app.post('/api/mail/addresses', adminAuth, (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const label = String(req.body?.label || '').trim() || email.split('@')[0];
      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid email address (e.g. info@secrate.shop)' });
      }

      const list = getMailboxes();
      const existingIdx = list.findIndex((a) => a.email.toLowerCase() === email);
      if (existingIdx >= 0) {
        list[existingIdx].label = label;
      } else {
        list.push({ email, label, isDefault: list.length === 0 });
      }
      saveMailboxes(list);
      res.json({ ok: true, list, addresses: list });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Delete custom address
  app.delete('/api/mail/addresses/:email', adminAuth, (req, res) => {
    try {
      const target = decodeURIComponent(req.params.email || '').trim().toLowerCase();
      let list = getMailboxes();
      list = list.filter((a) => a.email.toLowerCase() !== target);
      if (list.length > 0 && !list.some((a) => a.isDefault)) {
        list[0].isDefault = true;
      }
      saveMailboxes(list);
      res.json({ ok: true, list, addresses: list });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 4. List emails by folder & search query
  app.get('/api/mail/list', adminAuth, (req, res) => {
    try {
      const rawFolder = String(req.query.folder || 'inbox').toLowerCase();
      const folder = rawFolder === 'drafts' ? 'draft' : rawFolder;
      const q = String(req.query.q || '').trim().toLowerCase();
      const allMails = getMailItems();

      const counts = {
        inbox: allMails.filter((m) => m.folder === 'inbox').length,
        unread: allMails.filter((m) => m.folder === 'inbox' && !m.isRead).length,
        sent: allMails.filter((m) => m.folder === 'sent').length,
        trash: allMails.filter((m) => m.folder === 'trash').length,
        draft: allMails.filter((m) => m.folder === 'draft').length,
      };

      let filtered = allMails.filter((m) => m.folder === folder);
      if (q) {
        filtered = filtered.filter((m) =>
          (m.subject && m.subject.toLowerCase().includes(q)) ||
          (m.from && m.from.toLowerCase().includes(q)) ||
          (m.fromName && m.fromName.toLowerCase().includes(q)) ||
          (m.to && m.to.toLowerCase().includes(q)) ||
          (m.snippet && m.snippet.toLowerCase().includes(q)) ||
          (m.body && m.body.toLowerCase().includes(q))
        );
      }
      filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      res.json({ ok: true, emails: filtered, counts });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. Bulk send status
  app.get('/api/mail/bulk-status', adminAuth, (_req, res) => {
    res.json({ ok: true, campaign: activeBulkCampaign });
  });

  // 6. Recipients preview for bulk campaign
  app.get('/api/mail/recipients-preview', adminAuth, (req, res) => {
    try {
      const segment = String(req.query.segment || 'all').toLowerCase();
      const manual = String(req.query.manual || '');
      const customers = (typeof getCustomers === 'function' ? getCustomers() : []) || [];
      const orders = (typeof getOrders === 'function' ? getOrders() : []) || [];

      let list = [];
      if (segment === 'manual') {
        const parts = manual.split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@'));
        list = Array.from(new Set(parts)).map((email) => ({ email, name: email.split('@')[0] }));
      } else {
        const emailMap = new Map();
        customers.forEach((c) => {
          const em = String(c.email || '').trim().toLowerCase();
          if (em && em.includes('@')) {
            emailMap.set(em, { email: em, name: c.name || em.split('@')[0], ordersCount: c.ordersCount || 0, totalSpent: c.totalSpent || 0 });
          }
        });
        orders.forEach((o) => {
          const em = String(o.customer?.email || '').trim().toLowerCase();
          if (em && em.includes('@') && !emailMap.has(em)) {
            emailMap.set(em, { email: em, name: o.customer?.name || em.split('@')[0], ordersCount: 1, totalSpent: o.total || 0 });
          }
        });

        const allCust = Array.from(emailMap.values());
        if (segment === 'orders') {
          list = allCust.filter((c) => c.ordersCount > 0);
        } else if (segment === 'vip') {
          list = allCust.filter((c) => c.totalSpent >= 5000 || c.ordersCount >= 2);
        } else if (segment === 'cart') {
          list = allCust.slice(0, 50);
        } else {
          list = allCust;
        }
      }

      res.json({ ok: true, count: list.length, preview: list.slice(0, 10) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, count: 0 });
    }
  });

  // 7. Purge demo / sample emails
  app.post('/api/mail/purge-demo', adminAuth, (_req, res) => {
    try {
      let allMails = getMailItems();
      allMails = allMails.filter((m) => !String(m.id || '').includes('demo'));
      saveMailItems(allMails);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. Upload email attachment
  app.post('/api/mail/upload-attachment', adminAuth, (req, res) => {
    try {
      const dataUrl = String(req.body?.dataUrl || '');
      const originalName = String(req.body?.name || 'attachment.bin');
      if (!dataUrl) return res.status(400).json({ ok: false, error: 'No data provided' });

      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(400).json({ ok: false, error: 'Invalid base64 data' });

      const type = match[1];
      const buf = Buffer.from(match[2], 'base64');
      const safeFilename = `attach_${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const savePath = join(uploadsDir, safeFilename);

      mkdirSync(uploadsDir, { recursive: true });
      writeFileSync(savePath, buf);

      res.json({
        ok: true,
        url: `/uploads/${safeFilename}`,
        name: originalName,
        filename: originalName,
        size: buf.length,
        type,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 9. Batch delete emails
  app.post('/api/mail/batch-delete', adminAuth, (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const permanent = !!req.body?.permanent;
      let allMails = getMailItems();

      if (permanent) {
        allMails = allMails.filter((m) => !ids.includes(m.id));
      } else {
        allMails.forEach((m) => {
          if (ids.includes(m.id)) m.folder = 'trash';
        });
      }
      saveMailItems(allMails);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 10. Empty trash
  app.post('/api/mail/empty-trash', adminAuth, (_req, res) => {
    try {
      let allMails = getMailItems();
      allMails = allMails.filter((m) => m.folder !== 'trash');
      saveMailItems(allMails);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 11. Send single email
  app.post('/api/mail/send', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const to = String(b.to || '').trim();
      const subject = String(b.subject || '').trim();
      const html = b.html || b.text || '';
      const text = b.text || html.replace(/<[^>]+>/g, '');
      const from = String(b.from || '').trim() || 'support@secrate.shop';
      const fromName = String(b.fromName || 'Secrate Support').trim();
      const cc = b.cc ? String(b.cc).trim() : null;
      const bcc = b.bcc ? String(b.bcc).trim() : null;
      const attachments = Array.isArray(b.attachments) ? b.attachments : [];

      if (!to || !to.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Valid recipient email required' });
      }
      if (!subject) {
        return res.status(400).json({ ok: false, error: 'Subject cannot be empty' });
      }

      // Deliver through integrated email provider
      let deliveryRes = { ok: true };
      if (typeof sendEmail === 'function') {
        deliveryRes = await sendEmail(to, subject, html, { from, fromName, cc, bcc, attachments });
      }

      // Store in sent folder
      const allMails = getMailItems();
      const newMail = {
        id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        folder: 'sent',
        category: 'primary',
        from: `"${fromName}" <${from}>`,
        fromName,
        fromEmail: from,
        to,
        toName: to.split('@')[0],
        toEmail: to,
        cc,
        bcc,
        subject,
        snippet: text.slice(0, 120),
        body: text,
        html,
        text,
        date: new Date().toISOString(),
        isRead: true,
        isStarred: false,
        attachments,
      };

      allMails.unshift(newMail);
      saveMailItems(allMails);

      res.json({ ok: true, id: newMail.id, delivery: deliveryRes });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 12. Bulk send campaign
  app.post('/api/mail/bulk-send', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const segment = String(b.segment || 'all').toLowerCase();
      const manualEmails = String(b.manualEmails || '');
      const subject = String(b.subject || '').trim();
      const htmlTpl = b.html || b.text || '';
      const textTpl = b.text || htmlTpl.replace(/<[^>]+>/g, '');
      const from = String(b.from || '').trim() || 'support@secrate.shop';
      const fromName = String(b.fromName || 'Secrate Official').trim();

      if (!subject) return res.status(400).json({ ok: false, error: 'Subject is required' });

      // Gather recipient targets
      const customers = (typeof getCustomers === 'function' ? getCustomers() : []) || [];
      const orders = (typeof getOrders === 'function' ? getOrders() : []) || [];
      const emailMap = new Map();

      if (segment === 'manual') {
        manualEmails.split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@')).forEach((em) => {
          emailMap.set(em, { email: em, name: em.split('@')[0] });
        });
      } else {
        customers.forEach((c) => {
          const em = String(c.email || '').trim().toLowerCase();
          if (em && em.includes('@')) emailMap.set(em, { email: em, name: c.name || em.split('@')[0], ordersCount: c.ordersCount || 0, totalSpent: c.totalSpent || 0 });
        });
        orders.forEach((o) => {
          const em = String(o.customer?.email || '').trim().toLowerCase();
          if (em && em.includes('@') && !emailMap.has(em)) emailMap.set(em, { email: em, name: o.customer?.name || em.split('@')[0], ordersCount: 1, totalSpent: o.total || 0 });
        });
      }

      const recipients = Array.from(emailMap.values());
      if (recipients.length === 0) return res.status(400).json({ ok: false, error: 'No recipients found' });

      bulkStopRequested = false;
      activeBulkCampaign = {
        id: 'camp_' + Date.now(),
        subject,
        from,
        fromName,
        total: recipients.length,
        sent: 0,
        failed: 0,
        status: 'sending',
        startedAt: new Date().toISOString(),
      };

      res.json({ ok: true, count: recipients.length, campaignId: activeBulkCampaign.id });

      // Process in background asynchronously
      (async () => {
        const allMails = getMailItems();
        for (let i = 0; i < recipients.length; i++) {
          if (bulkStopRequested) {
            if (activeBulkCampaign) activeBulkCampaign.status = 'stopped';
            break;
          }
          const rc = recipients[i];
          const personalizedHtml = htmlTpl.replace(/\{name\}/gi, rc.name || 'Valued Customer');
          const personalizedText = textTpl.replace(/\{name\}/gi, rc.name || 'Valued Customer');

          try {
            if (typeof sendEmail === 'function') {
              await sendEmail(rc.email, subject, personalizedHtml, { from, fromName });
            }
            if (activeBulkCampaign) activeBulkCampaign.sent++;
          } catch (_) {
            if (activeBulkCampaign) activeBulkCampaign.failed++;
          }

          // Anti-spam safe pacing delay (400ms between sends)
          await new Promise((r) => setTimeout(r, 400));
        }

        // Record a batch sent entry in sent mail folder
        allMails.unshift({
          id: 'mail_bulk_' + Date.now(),
          folder: 'sent',
          category: 'updates',
          from: `"${fromName}" <${from}>`,
          fromName,
          fromEmail: from,
          to: `Bulk Campaign (${recipients.length} recipients)`,
          toName: 'Bulk Recipients',
          toEmail: `${recipients.length} recipients`,
          subject,
          snippet: `[Bulk Campaign] ${textTpl.slice(0, 100)}`,
          body: textTpl,
          html: htmlTpl,
          text: textTpl,
          date: new Date().toISOString(),
          isRead: true,
          isStarred: false,
          attachments: [],
        });
        saveMailItems(allMails);

        if (activeBulkCampaign && activeBulkCampaign.status !== 'stopped') {
          activeBulkCampaign.status = 'completed';
          activeBulkCampaign.completedAt = new Date().toISOString();
        }
      })();
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 13. Stop bulk campaign
  app.post('/api/mail/bulk-stop', adminAuth, (_req, res) => {
    bulkStopRequested = true;
    if (activeBulkCampaign) activeBulkCampaign.status = 'stopped';
    res.json({ ok: true });
  });

  // 14. Single email detail
  app.get('/api/mail/:id', adminAuth, (req, res) => {
    try {
      const allMails = getMailItems();
      const item = allMails.find((m) => m.id === req.params.id);
      if (!item) return res.status(404).json({ ok: false, error: 'Email not found' });
      item.isRead = true;
      saveMailItems(allMails);
      res.json({ ok: true, email: item });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 15. Single email update (star, read, move folder)
  app.patch('/api/mail/:id', adminAuth, (req, res) => {
    try {
      const allMails = getMailItems();
      const item = allMails.find((m) => m.id === req.params.id);
      if (!item) return res.status(404).json({ ok: false, error: 'Email not found' });
      if (req.body.isStarred !== undefined) item.isStarred = !!req.body.isStarred;
      if (req.body.isRead !== undefined) item.isRead = !!req.body.isRead;
      if (req.body.folder !== undefined) item.folder = req.body.folder;
      if (req.body.category !== undefined) item.category = req.body.category;
      saveMailItems(allMails);
      res.json({ ok: true, email: item });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 16. Single email delete
  app.delete('/api/mail/:id', adminAuth, (req, res) => {
    try {
      const id = req.params.id;
      const permanent = req.query.permanent === 'true';
      let allMails = getMailItems();
      const item = allMails.find((m) => m.id === id);
      if (!item) return res.json({ ok: true });

      if (permanent || item.folder === 'trash') {
        allMails = allMails.filter((m) => m.id !== id);
      } else {
        item.folder = 'trash';
      }
      saveMailItems(allMails);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}
