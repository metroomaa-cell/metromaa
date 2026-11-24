import React, { useEffect, useState, useMemo, useRef } from 'react';

const ADMIN_TOKEN_KEY = 'dot_admin';

async function adminApi(path: string, opts: RequestInit = {}) {
  const tok = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': tok,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.dispatchEvent(new Event('admin-logout'));
  }
  return res;
}

export interface CustomMailAddress {
  email: string;
  label: string;
  isDefault?: boolean;
}

export interface EmailAttachment {
  filename: string;
  url?: string;
  path?: string;
  size?: number;
  type?: string;
  name?: string;
}

export interface EmailItem {
  id: string;
  folder: 'inbox' | 'sent' | 'trash' | 'draft';
  category?: 'primary' | 'orders' | 'updates';
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  toName?: string;
  toEmail?: string;
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
  subject: string;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: EmailAttachment[];
  isRead: boolean;
  isStarred: boolean;
  isSnoozed?: boolean;
  threadId?: string;
  replyToId?: string | null;
  createdAt: string;
  via?: string;
  orderInfo?: {
    id: string;
    customerName: string;
    phone: string;
    status: string;
    total: number;
    totalOrders?: number;
  } | null;
}

export interface EmailsAdminProps {
  onUnreadChange?: (unread: number) => void;
}

export function EmailsAdmin({ onUnreadChange }: EmailsAdminProps) {
  const [folder, setFolder] = useState<'inbox' | 'starred' | 'sent' | 'drafts' | 'trash'>('inbox');
  const [inboxTab, setInboxTab] = useState<'primary' | 'orders' | 'updates'>('primary');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [counts, setCounts] = useState({ inbox: 0, unread: 0, sent: 0, starred: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterChip, setFilterChip] = useState<'all' | 'unread' | 'starred' | 'orders'>('all');
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Logo & Branding Customization State
  const [workspaceLogo, setWorkspaceLogo] = useState<string>(() => {
    return localStorage.getItem('secrate_mail_workspace_logo') || '';
  });
  const [workspaceTitle, setWorkspaceTitle] = useState<string>(() => {
    return localStorage.getItem('secrate_mail_workspace_title') || 'Secrate Workspace';
  });
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');
  const [tempTitle, setTempTitle] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoSaveSuccess, setLogoSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Mailbox Addresses
  const [customAddresses, setCustomAddresses] = useState<CustomMailAddress[]>([]);
  const [manageAddressesOpen, setManageAddressesOpen] = useState(false);
  const [newAddressEmail, setNewAddressEmail] = useState('');
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState('');

  // Floating Compose Window
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeMaximized, setComposeMaximized] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeFrom, setComposeFrom] = useState('support@secrate.shop');
  const [showCc, setShowCc] = useState(false);
  const [composeCc, setComposeCc] = useState('');
  const [showBcc, setShowBcc] = useState(false);
  const [composeBcc, setComposeBcc] = useState('');
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [composeSuccess, setComposeSuccess] = useState('');

  // Attachments in Compose
  const [composeAttachments, setComposeAttachments] = useState<Array<{ id: string; name: string; size: number; type: string; url: string }>>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const attachFileInputRef = useRef<HTMLInputElement>(null);
  const attachImageInputRef = useRef<HTMLInputElement>(null);

  // Bulk Email Campaign Modal State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSegment, setBulkSegment] = useState<'all' | 'delivered' | 'pending' | 'manual'>('all');
  const [bulkManualEmails, setBulkManualEmails] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkBody, setBulkBody] = useState('');
  const [bulkFrom, setBulkFrom] = useState('support@secrate.shop');
  const [bulkFromName, setBulkFromName] = useState('Secrate Official');
  const [bulkCc, setBulkCc] = useState('');
  const [bulkBcc, setBulkBcc] = useState('');
  const [bulkRecipientsCount, setBulkRecipientsCount] = useState(0);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkCampaignStatus, setBulkCampaignStatus] = useState<any>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');

  // Inline Reply state in reader view
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyCc, setReplyCc] = useState('');
  const [showReplyCc, setShowReplyCc] = useState(false);
  const [replySending, setReplySending] = useState(false);

  // Setup Guide & Account Info Modals
  const [guideOpen, setGuideOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Refresh & Purge animation state
  const [refreshing, setRefreshing] = useState(false);
  const [actionNotice, setActionNotice] = useState('');

  // Fetch store settings for default logo if not set locally
  useEffect(() => {
    adminApi('/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.logo && !localStorage.getItem('secrate_mail_workspace_logo')) {
          setWorkspaceLogo(data.logo);
        }
      })
      .catch(() => {});
  }, []);

  // Load custom addresses from backend
  const loadCustomAddresses = async () => {
    try {
      const res = await adminApi('/mail/addresses');
      const data = await res.json();
      if (data.ok && Array.isArray(data.addresses) && data.addresses.length > 0) {
        setCustomAddresses(data.addresses);
        if (!composeFrom || !data.addresses.some((a: CustomMailAddress) => a.email === composeFrom)) {
          setComposeFrom(data.addresses[0].email);
        }
      }
    } catch (e) {
      console.error('Failed to load custom mail addresses:', e);
    }
  };

  useEffect(() => {
    loadCustomAddresses();
  }, []);

  // Fetch emails from backend
  const loadEmails = async (currentFolder = folder, q = search) => {
    try {
      setLoading(true);
      const res = await adminApi(`/mail/list?folder=${currentFolder === 'drafts' ? 'draft' : currentFolder}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.ok) {
        setEmails(data.emails || []);
        if (data.counts) {
          setCounts(data.counts);
          onUnreadChange?.(data.counts.unread || 0);
        }
      }
    } catch (e) {
      console.error('Failed to load emails:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEmails(folder, search);
  }, [folder]);

  // Periodic polling for fresh emails
  useEffect(() => {
    const timer = setInterval(() => {
      loadEmails(folder, search);
    }, 25000);
    return () => clearInterval(timer);
  }, [folder, search]);

  // Bulk status polling
  useEffect(() => {
    let timer: any;
    if (bulkOpen || bulkSending) {
      const checkStatus = async () => {
        try {
          const res = await adminApi('/mail/bulk-status');
          const data = await res.json();
          if (data.ok && data.campaign) {
            setBulkCampaignStatus(data.campaign);
            if (data.campaign.status === 'running') {
              setBulkSending(true);
            } else if (data.campaign.status === 'completed' || data.campaign.status === 'stopped' || data.campaign.status === 'failed') {
              setBulkSending(false);
            }
          }
        } catch (_) {}
      };
      checkStatus();
      timer = setInterval(checkStatus, 1800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [bulkOpen, bulkSending]);

  // Preview recipients count when segment changes
  useEffect(() => {
    if (!bulkOpen) return;
    const fetchPreview = async () => {
      try {
        setBulkPreviewLoading(true);
        const res = await adminApi(`/mail/recipients-preview?segment=${bulkSegment}&manual=${encodeURIComponent(bulkManualEmails)}`);
        const data = await res.json();
        if (data.ok) {
          setBulkRecipientsCount(data.count || 0);
        }
      } catch (_) {
      } finally {
        setBulkPreviewLoading(false);
      }
    };
    const debounce = setTimeout(fetchPreview, 350);
    return () => clearTimeout(debounce);
  }, [bulkOpen, bulkSegment, bulkManualEmails]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEmails(folder, search);
  };

  // Purge Demo Emails & Switch to 100% Live Mode
  const handlePurgeDemo = async () => {
    if (!window.confirm('Clear all demo emails and switch to live mailbox mode?')) return;
    try {
      const res = await adminApi('/mail/purge-demo', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setEmails(data.emails || []);
        if (data.counts) setCounts(data.counts);
        setSelectedEmail(null);
        setSelectedIds(new Set());
        setActionNotice('Demo data cleared! Mailbox is now 100% live.');
        setTimeout(() => setActionNotice(''), 3500);
      }
    } catch (e: any) {
      alert(e.message || 'Error clearing demo emails');
    }
  };

  // Logo & Branding Handlers
  const handleOpenLogoModal = () => {
    setTempLogoUrl(workspaceLogo);
    setTempTitle(workspaceTitle);
    setLogoSaveSuccess(false);
    setLogoModalOpen(true);
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLogoUploading(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await adminApi('/upload', {
            method: 'POST',
            body: JSON.stringify({ dataUrl })
          });
          const data = await res.json();
          if (data.url) {
            setTempLogoUrl(data.url);
          } else {
            alert(data.error || 'Upload failed');
          }
        } catch (err: any) {
          alert(err.message || 'Error uploading file');
        } finally {
          setLogoUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setLogoUploading(false);
      alert(err.message || 'File read error');
    }
  };

  const handleSaveBranding = async () => {
    const finalLogo = tempLogoUrl.trim();
    const finalTitle = tempTitle.trim() || 'Secrate Workspace';
    setWorkspaceLogo(finalLogo);
    setWorkspaceTitle(finalTitle);
    localStorage.setItem('secrate_mail_workspace_logo', finalLogo);
    localStorage.setItem('secrate_mail_workspace_title', finalTitle);

    // Persist to store settings
    try {
      await adminApi('/settings', {
        method: 'POST',
        body: JSON.stringify({
          mailLogo: finalLogo,
          mailWorkspaceTitle: finalTitle
        })
      });
    } catch (_) {}

    setLogoSaveSuccess(true);
    setTimeout(() => {
      setLogoModalOpen(false);
      setLogoSaveSuccess(false);
    }, 1000);
  };

  const handleResetBranding = () => {
    setWorkspaceLogo('');
    setWorkspaceTitle('Secrate Workspace');
    localStorage.removeItem('secrate_mail_workspace_logo');
    localStorage.removeItem('secrate_mail_workspace_title');
    setTempLogoUrl('');
    setTempTitle('Secrate Workspace');
    setLogoModalOpen(false);
  };

  const handleOpenEmail = async (em: EmailItem) => {
    setSelectedEmail(em);
    setReplyOpen(false);
    setReplyText('');
    setReplyCc('');
    setShowReplyCc(false);
    if (!em.isRead) {
      try {
        await adminApi(`/mail/${em.id}`, { method: 'GET' });
        em.isRead = true;
        setCounts((prev) => {
          const nextUnread = Math.max(0, prev.unread - 1);
          onUnreadChange?.(nextUnread);
          return { ...prev, unread: nextUnread };
        });
      } catch (_) {}
    }
  };

  const toggleStar = async (e: React.MouseEvent, em: EmailItem) => {
    e.stopPropagation();
    const next = !em.isStarred;
    try {
      await adminApi(`/mail/${em.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred: next })
      });
      setEmails((prev) => prev.map((x) => (x.id === em.id ? { ...x, isStarred: next } : x)));
      if (selectedEmail?.id === em.id) {
        setSelectedEmail({ ...selectedEmail, isStarred: next });
      }
      setCounts((prev) => ({
        ...prev,
        starred: next ? prev.starred + 1 : Math.max(0, prev.starred - 1)
      }));
    } catch (_) {}
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedEmails.map((e) => e.id)));
    }
  };

  const toggleSelectOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchTrash = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const isTrash = folder === 'trash';
    if (isTrash) {
      if (!window.confirm(`Permanently delete ${ids.length} selected email(s)? This cannot be undone.`)) return;
    }
    setSelectedIds(new Set());
    setEmails((prev) => prev.filter((x) => !ids.includes(x.id)));
    if (selectedEmail && ids.includes(selectedEmail.id)) setSelectedEmail(null);
    try {
      await adminApi('/mail/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids, permanent: isTrash })
      });
      loadEmails(folder, search);
    } catch (_) {
      loadEmails(folder, search);
    }
  };

  const handleBatchRestore = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    setEmails((prev) => prev.filter((x) => !ids.includes(x.id)));
    if (selectedEmail && ids.includes(selectedEmail.id)) setSelectedEmail(null);
    for (const id of ids) {
      try {
        await adminApi(`/mail/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ folder: 'inbox' })
        });
      } catch (_) {}
    }
    loadEmails(folder, search);
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Empty entire trash? All trashed emails will be permanently deleted.')) return;
    setSelectedIds(new Set());
    setEmails([]);
    setSelectedEmail(null);
    try {
      await adminApi('/mail/empty-trash', { method: 'POST' });
      loadEmails(folder, search);
    } catch (_) {
      loadEmails(folder, search);
    }
  };

  const handleBatchMarkRead = async (isRead: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    for (const id of ids) {
      try {
        await adminApi(`/mail/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isRead })
        });
      } catch (_) {}
    }
    loadEmails(folder, search);
  };

  const moveToTrash = async (e: React.MouseEvent | null, id: string) => {
    e?.stopPropagation();
    if (folder === 'trash') {
      deletePermanently(e, id);
      return;
    }
    try {
      setEmails((prev) => prev.filter((x) => x.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
      await adminApi(`/mail/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folder: 'trash' })
      });
      loadEmails(folder, search);
    } catch (_) {}
  };

  const restoreFromTrash = async (e: React.MouseEvent | null, id: string) => {
    e?.stopPropagation();
    try {
      setEmails((prev) => prev.filter((x) => x.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
      await adminApi(`/mail/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folder: 'inbox' })
      });
      loadEmails(folder, search);
    } catch (_) {}
  };

  const deletePermanently = async (e: React.MouseEvent | null, id: string) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this email permanently from trash?')) return;
    try {
      setEmails((prev) => prev.filter((x) => x.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
      await adminApi(`/mail/${id}?permanent=true`, { method: 'DELETE' });
      loadEmails(folder, search);
    } catch (_) {}
  };

  const handleAddCustomAddress = async () => {
    if (!newAddressEmail.trim() || !newAddressEmail.includes('@')) {
      setAddressError('Please enter a valid email address (e.g. billing@secrate.shop)');
      return;
    }
    setAddressLoading(true);
    setAddressError('');
    try {
      const res = await adminApi('/mail/addresses', {
        method: 'POST',
        body: JSON.stringify({
          email: newAddressEmail.trim(),
          label: newAddressLabel.trim() || newAddressEmail.split('@')[0],
        })
      });
      const data = await res.json();
      if (data.ok) {
        setCustomAddresses(data.list || []);
        setNewAddressEmail('');
        setNewAddressLabel('');
      } else {
        setAddressError(data.error || 'Failed to add address');
      }
    } catch (e: any) {
      setAddressError(e.message || 'Network error');
    } finally {
      setAddressLoading(false);
    }
  };

  const handleRemoveCustomAddress = async (emailToRemove: string) => {
    // Instant optimistic update with zero lag
    const previous = customAddresses;
    const nextList = customAddresses.filter((a) => a.email.toLowerCase() !== emailToRemove.toLowerCase());
    setCustomAddresses(nextList);
    setActionNotice(`Deleted "${emailToRemove}"`);
    setTimeout(() => setActionNotice(''), 3000);

    try {
      const res = await adminApi(`/mail/addresses/${encodeURIComponent(emailToRemove)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.list)) {
        setCustomAddresses(data.list);
      }
    } catch (e: any) {
      setCustomAddresses(previous);
      alert(e.message || 'Error deleting address');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (files: FileList | null, isImage = false) => {
    if (!files || files.length === 0) return;
    setAttachUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) {
          alert(`File "${file.name}" is too large (max 25MB).`);
          continue;
        }
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await adminApi('/mail/upload-attachment', {
          method: 'POST',
          body: JSON.stringify({
            dataUrl,
            filename: file.name,
            mimeType: file.type || (isImage ? 'image/jpeg' : 'application/octet-stream')
          })
        });
        const data = await res.json();
        if (data.ok) {
          setComposeAttachments((prev) => [
            ...prev,
            {
              id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              name: data.filename || file.name,
              size: data.size || file.size,
              type: data.mimeType || file.type,
              url: data.url
            }
          ]);
        } else {
          alert(data.error || 'Failed to upload attachment');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error uploading file');
    } finally {
      setAttachUploading(false);
      if (attachFileInputRef.current) attachFileInputRef.current.value = '';
      if (attachImageInputRef.current) attachImageInputRef.current.value = '';
    }
  };

  const handleSendCompose = async () => {
    if (!composeTo.trim()) {
      setComposeError('Please enter at least one recipient email');
      return;
    }
    if (!composeSubject.trim()) {
      setComposeError('Subject line cannot be blank');
      return;
    }
    setSending(true);
    setComposeError('');
    setComposeSuccess('');
    try {
      const res = await adminApi('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: composeTo.trim(),
          cc: showCc && composeCc.trim() ? composeCc.trim() : undefined,
          bcc: showBcc && composeBcc.trim() ? composeBcc.trim() : undefined,
          subject: composeSubject.trim(),
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; color: #1e293b; line-height: 1.6;">${composeBody.replace(/\n/g, '<br/>')}</div>`,
          text: composeBody,
          from: composeFrom,
          fromName: 'Secrate Support',
          attachments: composeAttachments.map((a) => ({
            filename: a.name,
            url: a.url,
            size: a.size,
            type: a.type
          }))
        })
      });
      const data = await res.json();
      if (data.ok) {
        setComposeSuccess('Message sent successfully! ✓');
        setTimeout(() => {
          setComposeOpen(false);
          setComposeTo('');
          setComposeCc('');
          setComposeBcc('');
          setShowCc(false);
          setShowBcc(false);
          setComposeSubject('');
          setComposeBody('');
          setComposeAttachments([]);
          setComposeSuccess('');
          if (folder === 'sent') loadEmails('sent');
        }, 1200);
      } else {
        setComposeError(data.error || 'Failed to send message');
      }
    } catch (e: any) {
      setComposeError(e.message || 'Delivery error');
    } finally {
      setSending(false);
    }
  };

  const handleStartBulkCampaign = async () => {
    if (!bulkSubject.trim()) {
      setBulkError('Please provide a campaign subject');
      return;
    }
    if (!bulkBody.trim()) {
      setBulkError('Please write the campaign content');
      return;
    }
    if (bulkRecipientsCount === 0) {
      setBulkError('No recipients found for this audience selection');
      return;
    }
    setBulkSending(true);
    setBulkError('');
    setBulkSuccess('');
    try {
      const res = await adminApi('/mail/bulk-send', {
        method: 'POST',
        body: JSON.stringify({
          segment: bulkSegment,
          manualEmails: bulkManualEmails,
          subject: bulkSubject.trim(),
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; color: #1e293b; line-height: 1.7;">${bulkBody.replace(/\n/g, '<br/>')}</div>`,
          text: bulkBody,
          from: bulkFrom,
          fromName: bulkFromName.trim() || 'Secrate Official',
          cc: bulkCc.trim() || undefined,
          bcc: bulkBcc.trim() || undefined,
        })
      });
      const data = await res.json();
      if (data.ok) {
        setBulkSuccess('Campaign initiated! Anti-spam engine delivering safely in background.');
      } else {
        setBulkError(data.error || 'Failed to start campaign');
        setBulkSending(false);
      }
    } catch (e: any) {
      setBulkError(e.message || 'Network error');
      setBulkSending(false);
    }
  };

  const handleStopBulkCampaign = async () => {
    if (!window.confirm('Are you sure you want to stop this bulk email campaign?')) return;
    try {
      const res = await adminApi('/mail/bulk-stop', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert('Bulk campaign stopped.');
        setBulkSending(false);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to stop campaign');
    }
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !replyText.trim()) return;
    setReplySending(true);
    try {
      const targetTo = selectedEmail.fromEmail || selectedEmail.from;
      const targetSubject = selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`;
      const res = await adminApi('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: targetTo,
          cc: showReplyCc && replyCc.trim() ? replyCc.trim() : undefined,
          subject: targetSubject,
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; color: #1e293b; line-height: 1.6;">
            ${replyText.replace(/\n/g, '<br/>')}
            <br/><br/>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <div style="color: #64748b; font-size: 12.5px;">
              <b>On ${new Date(selectedEmail.createdAt).toLocaleString()}, ${selectedEmail.from} wrote:</b>
              <blockquote style="margin: 8px 0 0 10px; padding-left: 10px; border-left: 2px solid #cbd5e1; color: #64748b;">
                ${selectedEmail.bodyHtml || selectedEmail.bodyText || ''}
              </blockquote>
            </div>
          </div>`,
          text: replyText,
          from: composeFrom || 'support@secrate.shop',
          fromName: 'Secrate Support',
          replyToId: selectedEmail.id
        })
      });
      const data = await res.json();
      if (data.ok) {
        setReplyText('');
        setReplyCc('');
        setShowReplyCc(false);
        setReplyOpen(false);
        alert('Reply sent successfully! ✓');
        loadEmails(folder, search);
      } else {
        alert(data.error || 'Failed to send reply');
      }
    } catch (e: any) {
      alert(e.message || 'Network error');
    } finally {
      setReplySending(false);
    }
  };

  const formatMailDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return '';
    }
  };

  // Filtered emails based on Inbox Tab and Chips
  const displayedEmails = useMemo(() => {
    let list = emails;
    if (folder === 'inbox') {
      if (inboxTab === 'orders') {
        list = list.filter((e) => e.orderInfo != null || /order|ডেলিভারি|পার্সেল|invoice/i.test(e.subject + ' ' + (e.snippet || '')));
      } else if (inboxTab === 'updates') {
        list = list.filter((e) => /system|notice|update|cloudflare|alert/i.test(e.from + ' ' + e.subject));
      }
    }
    if (filterChip === 'unread') list = list.filter((e) => !e.isRead);
    if (filterChip === 'starred') list = list.filter((e) => e.isStarred);
    if (filterChip === 'orders') list = list.filter((e) => e.orderInfo != null);
    return list;
  }, [emails, folder, inboxTab, filterChip]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0b0a12', color: '#f3f4f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Action Notification Toast */}
      {actionNotice && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 99999, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(139, 92, 246, 0.45)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 1. TOP BAR: SECRATE OBSIDIAN-VIOLET WORKSPACE HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'linear-gradient(180deg, #13111c 0%, #0e0c18 100%)', borderBottom: '1px solid rgba(139, 92, 246, 0.16)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        {/* Left: Brand, Logo & Service Name with Upgrade Option */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div
            onClick={handleOpenLogoModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '5px 10px',
              borderRadius: 12,
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.22)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            title="Click to upgrade or change workspace logo"
          >
            {workspaceLogo ? (
              <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: '#181528', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={workspaceLogo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 900, boxShadow: '0 2px 10px rgba(139, 92, 246, 0.4)' }}>
                ✉️
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2, color: '#f8fafc' }}>
                  {workspaceTitle}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', letterSpacing: 0.3 }}>
                  LIVE
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#a78bfa' }}>
                <span>@secrate.shop</span>
                <span>&bull;</span>
                <span style={{ textDecoration: 'underline', color: '#c4b5fd', fontWeight: 600 }}>Change Logo 🎨</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Universal Search Bar */}
        <div style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 440, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#161426', borderRadius: 28, padding: '7px 14px', gap: 8, border: '1px solid rgba(139, 92, 246, 0.22)', transition: 'border-color 0.2s' }}>
            <span style={{ fontSize: 14, color: '#a78bfa' }}>🔍</span>
            <input
              type="text"
              placeholder="Search all mail, customers, orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadEmails(folder, search)}
              style={{ flex: 1, minWidth: 100, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); loadEmails(folder, ''); }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right: Quick Actions, Logo Upgrade, Bulk Engine, Cloudflare, Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Logo Upgrade Button */}
          <button
            onClick={handleOpenLogoModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 20,
              padding: '6px 12px',
              color: '#c4b5fd',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
            title="Upload or change workspace logo"
          >
            <span>🎨</span>
            <span>Logo Upgrade</span>
          </button>

          {/* Purge Demo Data Button */}
          <button
            onClick={handlePurgeDemo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#161426',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: 20,
              padding: '6px 11px',
              color: '#94a3b8',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="Clean out demo messages and stay 100% live"
          >
            <span>🧹</span>
            <span>Purge Demo</span>
          </button>

          {/* Bulk Campaign Engine */}
          <button
            onClick={() => setBulkOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              borderRadius: 20,
              padding: '6px 13px',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 3px 12px rgba(139, 92, 246, 0.35)'
            }}
          >
            <span>🚀</span>
            <span>Bulk Campaign</span>
            {bulkSending && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1s infinite' }} />}
          </button>

          {/* Mailboxes */}
          <button
            onClick={() => setManageAddressesOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#161426',
              border: '1px solid rgba(139, 92, 246, 0.22)',
              borderRadius: 20,
              padding: '6px 11px',
              color: '#c4b5fd',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="Manage Custom Mailboxes"
          >
            <span>⚙️</span>
            <span>Mailboxes ({customAddresses.length})</span>
          </button>

          {/* Free Routing */}
          <button
            onClick={() => setGuideOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: '#161426',
              border: '1px solid rgba(139, 92, 246, 0.22)',
              borderRadius: 20,
              padding: '6px 11px',
              color: '#a78bfa',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <span>☁️</span>
            <span>Free Routing</span>
          </button>

          {/* Account Avatar */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                color: '#fff',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(139, 92, 246, 0.35)'
              }}
              title="Secrate Account Info"
            >
              S
            </button>

            {accountMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  right: 0,
                  width: 270,
                  background: '#13111c',
                  borderRadius: 16,
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  padding: 16,
                  boxShadow: '0 12px 36px rgba(0,0,0,0.75)',
                  zIndex: 9999
                }}
              >
                <div style={{ textAlign: 'center', paddingBottom: 12, borderBottom: '1px solid rgba(139, 92, 246, 0.16)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)' }}>
                    S
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#f8fafc' }}>Secrate Admin Mail</div>
                  <div style={{ fontSize: 12, color: '#a78bfa' }}>support@secrate.shop</div>
                </div>
                <div style={{ padding: '10px 0', fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>Domain: <b style={{ color: '#fff' }}>secrate.shop</b></div>
                  <div>Inbound: <b style={{ color: '#34d399' }}>Cloudflare Active</b></div>
                  <div>Status: <b style={{ color: '#a78bfa' }}>100% Live Mode</b></div>
                </div>
                <button
                  onClick={() => { setAccountMenuOpen(false); setGuideOpen(true); }}
                  style={{ width: '100%', padding: '7px 0', borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  Manage Email Routing
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. BODY: LEFT SIDEBAR + MAIN EMAIL CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR (Ultra-Sleek Obsidian-Violet) */}
        <div style={{ width: 235, background: '#0e0c18', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid rgba(139, 92, 246, 0.12)', flexShrink: 0 }}>
          {/* Big Shimmering Violet Compose Button */}
          <button
            onClick={() => {
              setComposeOpen(true);
              setComposeMinimized(false);
              setComposeError('');
              setComposeSuccess('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 22px',
              borderRadius: 24,
              border: 'none',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(139, 92, 246, 0.38)',
              transition: 'all 0.15s ease',
              width: 'fit-content',
              marginBottom: 4
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 6px 24px rgba(139, 92, 246, 0.55)')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 4px 18px rgba(139, 92, 246, 0.38)')}
          >
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
              <path fill="#ffffff" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
            <span>Compose</span>
          </button>

          {/* Navigation Folders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { id: 'inbox', label: 'Inbox', icon: '📥', count: counts.unread },
              { id: 'starred', label: 'Starred', icon: '⭐', count: counts.starred },
              { id: 'sent', label: 'Sent', icon: '📤', count: counts.sent },
              { id: 'drafts', label: 'Drafts', icon: '📝', count: 0 },
              { id: 'trash', label: 'Trash', icon: '🗑️', count: counts.trash },
            ].map((f) => {
              const active = folder === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFolder(f.id as any); setSelectedEmail(null); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    borderRadius: '0 18px 18px 0',
                    border: 'none',
                    borderLeft: active ? '3px solid #8b5cf6' : '3px solid transparent',
                    background: active ? 'linear-gradient(90deg, rgba(139, 92, 246, 0.22) 0%, rgba(139, 92, 246, 0.04) 100%)' : 'transparent',
                    color: active ? '#ffffff' : '#94a3b8',
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16 }}>{f.icon}</span>
                    <span>{f.label}</span>
                  </div>
                  {f.count > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: active ? '#8b5cf6' : '#1f1b33', color: active ? '#ffffff' : '#c4b5fd' }}>
                      {f.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ height: 1, background: 'rgba(139, 92, 246, 0.12)', margin: '6px 0' }} />

          {/* Custom Mailboxes Quick Switcher */}
          <div style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: 0.5, textTransform: 'uppercase' }}>Mailboxes</span>
              <button
                onClick={() => setManageAddressesOpen(true)}
                style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                title="Manage custom addresses"
              >
                +
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {customAddresses.slice(0, 5).map((addr) => (
                <div
                  key={addr.email}
                  onClick={() => { setSearch(addr.email); loadEmails(folder, addr.email); }}
                  style={{
                    fontSize: 11.5,
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#c4b5fd';
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title={addr.email}
                >
                  ✉️ {addr.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT MAIN CONTAINER: EMAIL LIST OR READER */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#110f1c' }}>
          {selectedEmail ? (
            /* =========================================================================
               3. EMAIL DETAIL VIEW (EXACT GMAIL READER WITH ORDER PROFILE & CC BADGES)
               ========================================================================= */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {/* Top Detail Action Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(139, 92, 246, 0.16)', background: '#13111c' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    style={{ background: 'none', border: 'none', color: '#c4b5fd', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Back to list"
                  >
                    <span>←</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Back</span>
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(139, 92, 246, 0.2)' }} />
                  <button
                    onClick={(e) => toggleStar(e, selectedEmail)}
                    style={{ background: 'none', border: 'none', fontSize: 17, cursor: 'pointer' }}
                    title={selectedEmail.isStarred ? 'Unstar' : 'Star'}
                  >
                    {selectedEmail.isStarred ? '⭐' : '☆'}
                  </button>
                  {selectedEmail.folder === 'trash' || folder === 'trash' ? (
                    <>
                      <button
                        onClick={(e) => restoreFromTrash(e, selectedEmail.id)}
                        style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 15, cursor: 'pointer' }}
                        title="Restore to Inbox"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={(e) => deletePermanently(e, selectedEmail.id)}
                        style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 15, cursor: 'pointer' }}
                        title="Delete Permanently"
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => moveToTrash(e, selectedEmail.id)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 15, cursor: 'pointer' }}
                      title="Move to Trash"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8' }}>
                  <span>{new Date(selectedEmail.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </div>

              {/* Subject Title */}
              <div style={{ padding: '16px 24px 8px 24px' }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f3f4f6' }}>
                  {selectedEmail.subject || '(No Subject)'}
                </h1>
              </div>

              {/* Matched Customer Order Profile Card */}
              {selectedEmail.orderInfo && (
                <div style={{ margin: '0 24px 16px', padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)', border: '1px solid rgba(16, 185, 129, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>
                      🛍️
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                        Customer Order #{selectedEmail.orderInfo.id}
                      </div>
                      <div style={{ fontSize: 12, color: '#d1d5db' }}>
                        Customer: <b style={{ color: '#fff' }}>{selectedEmail.orderInfo.customerName}</b> &bull; Phone: <b style={{ color: '#fff' }}>{selectedEmail.orderInfo.phone}</b> &bull; Total: <b style={{ color: '#34d399' }}>৳{selectedEmail.orderInfo.total}</b>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#059669', color: '#fff' }}>
                      {selectedEmail.orderInfo.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}

              {/* Sender & Recipient Details Row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 24px 16px 24px', borderBottom: '1px solid rgba(139, 92, 246, 0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff' }}>
                    {(selectedEmail.fromName || selectedEmail.from || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f9fafb' }}>
                      {selectedEmail.fromName || selectedEmail.from}
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                        &lt;{selectedEmail.fromEmail || selectedEmail.from}&gt;
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#a78bfa' }}>
                      to {selectedEmail.to}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setReplyOpen(!replyOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <span>↩</span>
                  <span>Reply</span>
                </button>
              </div>

              {/* Email Content Body */}
              <div style={{ padding: '24px', flex: 1, color: '#e2e8f0', fontSize: 14.5, lineHeight: 1.7, overflowY: 'auto' }}>
                {selectedEmail.bodyHtml ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                    style={{ background: '#161426', padding: 20, borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.14)' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', background: '#161426', padding: 20, borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.14)' }}>
                    {selectedEmail.bodyText || '(Empty message body)'}
                  </div>
                )}

                {/* Render Attachments in Reader View if any */}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div style={{ marginTop: 24, padding: 18, background: '#13111c', borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.22)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
                      <span>📎</span>
                      <span>Attachments ({selectedEmail.attachments.length})</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {selectedEmail.attachments.map((att, idx) => {
                        const name = att.filename || att.name || `file_${idx + 1}`;
                        const isImg = /\.(jpe?g|png|webp|gif|svg)$/i.test(name) || (att.type && att.type.startsWith('image/'));
                        const fileUrl = att.url || (att.path && att.path.startsWith('/uploads/') ? att.path : '');
                        return (
                          <div
                            key={idx}
                            style={{
                              background: '#181528',
                              border: '1px solid rgba(139, 92, 246, 0.2)',
                              borderRadius: 10,
                              padding: 10,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            {isImg && fileUrl && (
                              <a href={fileUrl} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: 6, overflow: 'hidden', height: 110, background: '#0f0d18' }}>
                                <img src={fileUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </a>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                                {att.size ? <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{formatFileSize(att.size)}</div> : null}
                              </div>
                              {fileUrl && (
                                <a
                                  href={fileUrl}
                                  download={name}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    background: '#241e3d',
                                    border: '1px solid rgba(139, 92, 246, 0.35)',
                                    color: '#c4b5fd',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  ⬇️ Download
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Inline Reply Panel */}
              {replyOpen && (
                <div style={{ margin: '0 24px 24px', padding: 18, background: '#13111c', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>
                      Replying to {selectedEmail.from}
                    </span>
                    <button
                      onClick={() => setShowReplyCc(!showReplyCc)}
                      style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showReplyCc ? 'Hide Cc' : '+ Add Cc'}
                    </button>
                  </div>

                  {showReplyCc && (
                    <input
                      type="text"
                      placeholder="cc@example.com"
                      value={replyCc}
                      onChange={(e) => setReplyCc(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, background: '#161426', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none', marginBottom: 10 }}
                    />
                  )}

                  <textarea
                    rows={4}
                    placeholder="Type your reply here..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: '#161426', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 13.5, lineHeight: 1.6, outline: 'none', resize: 'vertical' }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                    <button
                      onClick={() => setReplyOpen(false)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: 12.5, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendReply}
                      disabled={replySending}
                      style={{
                        padding: '6px 20px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: replySending ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {replySending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               4. EMAIL LIST VIEW (WITH BATCH ACTIONS, TABS, EMPTY STATE, CHIPS)
               ========================================================================= */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(139, 92, 246, 0.14)', background: '#13111c' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input
                    type="checkbox"
                    checked={displayedEmails.length > 0 && selectedIds.size === displayedEmails.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#8b5cf6' }}
                    title="Select All"
                  />
                  <button
                    onClick={handleRefresh}
                    style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 14, padding: 4 }}
                    title="Refresh"
                  >
                    🔄
                  </button>

                  {selectedIds.size > 0 && (
                    <>
                      <div style={{ width: 1, height: 16, background: 'rgba(139, 92, 246, 0.2)' }} />
                      <button
                        onClick={handleBatchTrash}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        🗑️ {folder === 'trash' ? `Delete Permanently (${selectedIds.size})` : `Delete (${selectedIds.size})`}
                      </button>
                      {folder === 'trash' && (
                        <button
                          onClick={handleBatchRestore}
                          style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          ↩️ Restore ({selectedIds.size})
                        </button>
                      )}
                      <button
                        onClick={() => handleBatchMarkRead(true)}
                        style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 12 }}
                      >
                        Mark as read
                      </button>
                      <button
                        onClick={() => handleBatchMarkRead(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                      >
                        Mark as unread
                      </button>
                    </>
                  )}
                  {folder === 'trash' && selectedIds.size === 0 && displayedEmails.length > 0 && (
                    <>
                      <div style={{ width: 1, height: 16, background: 'rgba(139, 92, 246, 0.2)' }} />
                      <button
                        onClick={handleEmptyTrash}
                        style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        🗑️ Empty Trash
                      </button>
                    </>
                  )}
                </div>

                {/* Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(['all', 'unread', 'starred', 'orders'] as const).map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setFilterChip(chip)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 12,
                        border: '1px solid',
                        borderColor: filterChip === chip ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)',
                        background: filterChip === chip ? 'rgba(139, 92, 246, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                        color: filterChip === chip ? '#c4b5fd' : '#94a3b8',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {chip.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Tabs (Primary, Orders, Updates) */}
              {folder === 'inbox' && (
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(139, 92, 246, 0.14)', background: '#0e0c18' }}>
                  {[
                    { id: 'primary', label: 'Primary', icon: '📥' },
                    { id: 'orders', label: 'Customer Orders', icon: '🛍️' },
                    { id: 'updates', label: 'Updates & Alerts', icon: '🔔' },
                  ].map((tab) => {
                    const active = inboxTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setInboxTab(tab.id as any)}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '12px 16px',
                          background: active ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                          border: 'none',
                          borderBottom: active ? '2.5px solid #8b5cf6' : '2.5px solid transparent',
                          color: active ? '#c4b5fd' : '#94a3b8',
                          fontSize: 13,
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Email List Rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && emails.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#a78bfa', gap: 10 }}>
                    <div style={{ fontSize: 24, animation: 'spin 1.5s infinite linear' }}>⏳</div>
                    <div>Synchronizing Secrate Mailbox...</div>
                  </div>
                ) : displayedEmails.length === 0 ? (
                  /* Ultra-Premium Live Mailbox Empty State */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: 16 }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(124, 58, 237, 0.1))', border: '1px solid rgba(139, 92, 246, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, boxShadow: '0 0 25px rgba(139, 92, 246, 0.25)' }}>
                        📬
                      </div>
                      <span style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#10b981', border: '2px solid #0b0a12' }} />
                    </div>

                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
                        Your {folder === 'inbox' ? 'Live Inbox' : folder.toUpperCase()} is Clean & Synchronized!
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 460, lineHeight: 1.6 }}>
                        Demo data removed. Active mailboxes (<span style={{ color: '#c4b5fd', fontWeight: 600 }}>@secrate.shop</span>) are listening live for customer questions, order notifications, and support tickets.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        onClick={() => {
                          setComposeTo('');
                          setComposeSubject('');
                          setComposeBody('');
                          setComposeOpen(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 22px',
                          borderRadius: 20,
                          background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                          border: 'none',
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)'
                        }}
                      >
                        <span>✉️</span>
                        <span>Compose Live Email</span>
                      </button>

                      <button
                        onClick={() => {
                          setComposeTo('support@secrate.shop');
                          setComposeSubject('Live Mailbox Verification · ' + new Date().toLocaleTimeString());
                          setComposeBody(`Assalamu Alaikum,\n\nThis is a live test email from Secrate Business Mail Workspace to verify inbound & outbound message routing.\n\nTime: ${new Date().toLocaleString()}\nDomain: secrate.shop\nStatus: Operational 🌸`);
                          setComposeOpen(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 18px',
                          borderRadius: 20,
                          background: 'rgba(139, 92, 246, 0.12)',
                          border: '1px solid rgba(139, 92, 246, 0.28)',
                          color: '#c4b5fd',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <span>🧪</span>
                        <span>Send Test Email</span>
                      </button>

                      <button
                        onClick={handleRefresh}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '10px 16px',
                          borderRadius: 20,
                          background: '#161426',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#94a3b8',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <span>🔄</span>
                        <span>Refresh Inbox</span>
                      </button>
                    </div>

                    {/* Live Status Indicators */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, padding: '8px 18px', borderRadius: 999, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(139, 92, 246, 0.15)', fontSize: 11.5, color: '#94a3b8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                        <span>Inbound Routing: <b style={{ color: '#34d399' }}>Active</b></span>
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>&bull;</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b5cf6' }} />
                        <span>SMTP Delivery: <b style={{ color: '#c4b5fd' }}>Ready</b></span>
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>&bull;</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8' }} />
                        <span>Anti-Spam Shield: <b style={{ color: '#93c5fd' }}>RFC 8058</b></span>
                      </span>
                    </div>
                  </div>
                ) : (
                  displayedEmails.map((em) => {
                    const isSelected = selectedIds.has(em.id);
                    return (
                      <div
                        key={em.id}
                        onClick={() => handleOpenEmail(em)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 16px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          background: isSelected ? 'rgba(139, 92, 246, 0.16)' : em.isRead ? '#0e0c18' : '#161426',
                          cursor: 'pointer',
                          transition: 'background 0.12s ease',
                          gap: 12
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#1e1933';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = em.isRead ? '#0e0c18' : '#161426';
                        }}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleSelectOne(e as any, em.id)}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#8b5cf6' }}
                        />

                        {/* Star */}
                        <button
                          onClick={(e) => toggleStar(e, em)}
                          style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: 2 }}
                        >
                          {em.isStarred ? '⭐' : '☆'}
                        </button>

                        {/* Sender */}
                        <div style={{ width: 180, fontWeight: em.isRead ? 400 : 700, color: em.isRead ? '#9ca3af' : '#f9fafb', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {em.fromName || em.fromEmail || em.from}
                        </div>

                        {/* Order Badge if linked */}
                        {em.orderInfo && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#059669', color: '#fff', flexShrink: 0 }}>
                            ORDER #{em.orderInfo.id}
                          </span>
                        )}

                        {/* Subject + Snippet */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', fontSize: 13.5 }}>
                          <span style={{ fontWeight: em.isRead ? 400 : 700, color: em.isRead ? '#d1d5db' : '#fff', flexShrink: 0 }}>
                            {em.subject || '(No Subject)'}
                          </span>
                          <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            - {em.snippet || (em.bodyText ? em.bodyText.slice(0, 90) : '')}
                          </span>
                        </div>

                        {/* Date */}
                        <div style={{ fontSize: 12, color: em.isRead ? '#9ca3af' : '#a78bfa', fontWeight: em.isRead ? 400 : 700, width: 75, textAlign: 'right', flexShrink: 0 }}>
                          {formatMailDate(em.createdAt)}
                        </div>

                        {/* Hover Quick Delete / Restore */}
                        {folder === 'trash' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button
                              onClick={(e) => restoreFromTrash(e, em.id)}
                              style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                              title="Restore to Inbox"
                            >
                              ↩️
                            </button>
                            <button
                              onClick={(e) => deletePermanently(e, em.id)}
                              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                              title="Delete Permanently"
                            >
                              🗑️
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => moveToTrash(e, em.id)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}
                            title="Move to Trash"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
         5. GMAIL EXACT FLOATING COMPOSE WINDOW (VIOLET OBSIDIAN LUXURY THEMED)
         ========================================================================= */}
      {composeOpen && (
        <div
          style={{
            position: 'fixed',
            right: 30,
            bottom: 0,
            width: composeMaximized ? '75vw' : 580,
            height: composeMinimized ? 44 : composeMaximized ? '84vh' : 520,
            maxWidth: '94vw',
            background: '#13111c',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            borderRadius: composeMaximized ? '14px 14px 0 0' : '12px 12px 0 0',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.85)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'height 0.2s ease, width 0.2s ease'
          }}
        >
          {/* Header Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', background: '#181528', borderBottom: '1px solid rgba(139, 92, 246, 0.2)', cursor: 'pointer' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f3f4f6' }}>New Message</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setComposeMinimized(!composeMinimized)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}
                title={composeMinimized ? 'Restore' : 'Minimize'}
              >
                _
              </button>
              <button
                onClick={() => setComposeMaximized(!composeMaximized)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}
                title={composeMaximized ? 'Exit Full Screen' : 'Full Screen'}
              >
                ⤢
              </button>
              <button
                onClick={() => setComposeOpen(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}
                title="Save and close"
              >
                ✕
              </button>
            </div>
          </div>

          {!composeMinimized && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '8px 16px', overflowY: 'auto' }}>
              {/* From Selector */}
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: '#a78bfa', width: 50 }}>From</span>
                <select
                  value={composeFrom}
                  onChange={(e) => setComposeFrom(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
                >
                  {customAddresses.map((addr) => (
                    <option key={addr.email} value={addr.email} style={{ background: '#13111c' }}>
                      {addr.email} ({addr.label})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setManageAddressesOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#c4b5fd', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  + Add Address
                </button>
              </div>

              {/* To (Recipients) Field */}
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: '#a78bfa', width: 50 }}>To</span>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  {!showCc && (
                    <button
                      onClick={() => setShowCc(true)}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Cc
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      onClick={() => setShowBcc(true)}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Bcc
                    </button>
                  )}
                </div>
              </div>

              {/* Cc Field */}
              {showCc && (
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: '#a78bfa', width: 50 }}>Cc</span>
                  <input
                    type="text"
                    placeholder="cc@example.com, accounts@secrate.shop"
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <button
                    onClick={() => { setShowCc(false); setComposeCc(''); }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Bcc Field */}
              {showBcc && (
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: '#a78bfa', width: 50 }}>Bcc</span>
                  <input
                    type="text"
                    placeholder="bcc@example.com"
                    value={composeBcc}
                    onChange={(e) => setComposeBcc(e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <button
                    onClick={() => { setShowBcc(false); setComposeBcc(''); }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Subject Field */}
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', padding: '6px 0', fontSize: 13 }}>
                <input
                  type="text"
                  placeholder="Subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none', fontWeight: 600 }}
                />
              </div>

              {/* Quick Template Buttons Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid rgba(139, 92, 246, 0.12)' }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Templates:</span>
                <button
                  type="button"
                  onClick={() => {
                    setComposeSubject('Your Secrate Order Confirmation');
                    setComposeBody(`Assalamu Alaikum,\n\nThank you for shopping with Secrate. We are processing your parcel with premium care.\n\nDelivery timeline: 24-48 hours nationwide.\n\nWarm regards,\nSecrate Team`);
                  }}
                  style={{ padding: '2px 8px', borderRadius: 4, background: '#1c1830', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#c4b5fd', fontSize: 11, cursor: 'pointer' }}
                >
                  Order Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposeSubject('Your Secrate Parcel Has Been Dispatched');
                    setComposeBody(`Hello,\n\nYour order has been handed over to our express courier partner. Please keep your phone reachable so the delivery agent can contact you.\n\nThank you,\nSecrate Support`);
                  }}
                  style={{ padding: '2px 8px', borderRadius: 4, background: '#1c1830', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399', fontSize: 11, cursor: 'pointer' }}
                >
                  Courier Dispatch
                </button>
              </div>

              {/* Body Text Editor */}
              <textarea
                placeholder="Write your email here..."
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                style={{
                  flex: 1,
                  minHeight: 140,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  outline: 'none',
                  resize: 'none',
                  padding: '8px 0'
                }}
              />

              {/* Attachments Preview Area */}
              {composeAttachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0', borderTop: '1px solid rgba(139, 92, 246, 0.15)', maxHeight: 110, overflowY: 'auto' }}>
                  {composeAttachments.map((att) => {
                    const isImg = att.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(att.name);
                    return (
                      <div
                        key={att.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 10px',
                          background: '#1c1830',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: '#e2e8f0',
                          maxWidth: 240
                        }}
                      >
                        {isImg ? (
                          <img src={att.url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                        ) : (
                          <span style={{ fontSize: 16 }}>📎</span>
                        )}
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{formatFileSize(att.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setComposeAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                          title="Remove attachment"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {attachUploading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: '#c4b5fd' }}>
                  <span>⏳</span> Uploading attachment...
                </div>
              )}

              {composeError && <div style={{ color: '#f87171', fontSize: 12, padding: '4px 0' }}>⚠️ {composeError}</div>}
              {composeSuccess && <div style={{ color: '#34d399', fontSize: 12, padding: '4px 0' }}>✓ {composeSuccess}</div>}

              {/* Bottom Send Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(139, 92, 246, 0.16)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={handleSendCompose}
                    disabled={sending || attachUploading}
                    style={{
                      padding: '8px 24px',
                      borderRadius: 20,
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      border: 'none',
                      color: '#fff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: (sending || attachUploading) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 4px 14px rgba(139, 92, 246, 0.35)'
                    }}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>

                  {/* Attachment Hidden Inputs */}
                  <input
                    ref={attachFileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e.target.files, false)}
                  />
                  <input
                    ref={attachImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e.target.files, true)}
                  />

                  <button
                    type="button"
                    onClick={() => attachFileInputRef.current?.click()}
                    disabled={attachUploading}
                    style={{
                      background: '#1c1830',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: '#c4b5fd',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: attachUploading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    title="Attach file (PDF, Docs, Zip...)"
                  >
                    <span>📎</span>
                    <span>Attach</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => attachImageInputRef.current?.click()}
                    disabled={attachUploading}
                    style={{
                      background: '#1c1830',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: '#c4b5fd',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: attachUploading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    title="Insert image / picture"
                  >
                    <span>🖼️</span>
                    <span>Picture</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setComposeOpen(false);
                    setComposeTo('');
                    setComposeSubject('');
                    setComposeBody('');
                    setComposeAttachments([]);
                  }}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}
                  title="Discard draft"
                >
                  🗑️
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
         6. LOGO & BRANDING UPGRADE MODAL (NEW FEATURE)
         ========================================================================= */}
      {logoModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 520, maxWidth: '100%', background: '#13111c', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 20, padding: 24, color: '#f3f4f6', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.85)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 92, 246, 0.18)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🎨</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Workspace Logo & Branding</div>
                  <div style={{ fontSize: 12, color: '#a78bfa' }}>Upload custom logo and customize workspace title</div>
                </div>
              </div>
              <button
                onClick={() => setLogoModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Current Logo Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', borderRadius: 14, background: '#181528', border: '1px dashed rgba(139, 92, 246, 0.35)', gap: 10 }}>
              <div style={{ width: 80, height: 80, borderRadius: 16, background: '#13111c', border: '2px solid rgba(139, 92, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' }}>
                {tempLogoUrl ? (
                  <img src={tempLogoUrl} alt="Workspace Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 36 }}>✉️</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#c4b5fd', fontWeight: 600 }}>
                {tempLogoUrl ? 'Custom Logo Loaded' : 'Default Workspace Badge'}
              </span>
            </div>

            {/* Upload File Button */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, display: 'block' }}>
                Upload Logo Image (PNG, JPG, WEBP, SVG)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 10,
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  color: '#c4b5fd',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: logoUploading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <span>📁</span>
                <span>{logoUploading ? 'Uploading Image...' : 'Choose Logo File from Computer'}</span>
              </button>
            </div>

            {/* Direct Image URL Input */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, display: 'block' }}>
                Or Paste Image URL
              </label>
              <input
                type="text"
                placeholder="https://example.com/logo.png or /uploads/..."
                value={tempLogoUrl}
                onChange={(e) => setTempLogoUrl(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#fff', fontSize: 13, outline: 'none' }}
              />
            </div>

            {/* Custom Workspace Title Input */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, display: 'block' }}>
                Workspace Title
              </label>
              <input
                type="text"
                placeholder="Secrate Workspace"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#fff', fontSize: 13, outline: 'none' }}
              />
            </div>

            {logoSaveSuccess && (
              <div style={{ color: '#34d399', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                ✓ Logo & Title updated successfully!
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <button
                type="button"
                onClick={handleResetBranding}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
              >
                Reset Default
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setLogoModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#181528', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBranding}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         7. BULK EMAIL CAMPAIGN MODAL (VIOLET OBSIDIAN LUXURY THEMED)
         ========================================================================= */}
      {bulkOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 720, maxWidth: '100%', maxHeight: '92vh', background: '#13111c', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 20, overflowY: 'auto', padding: 24, color: '#f3f4f6', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.85)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 92, 246, 0.18)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🚀</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Bulk Email Marketing & Notifications</div>
                  <div style={{ fontSize: 12, color: '#a78bfa' }}>Send safe, throttled emails without getting banned or landing in spam</div>
                </div>
              </div>
              <button
                onClick={() => setBulkOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Anti-Spam Safety Shield Banner */}
            <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(139, 92, 246, 0.15) 100%)', border: '1px solid rgba(139, 92, 246, 0.35)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🛡️</span>
              <div style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>
                <b style={{ color: '#c4b5fd' }}>Gmail & Yahoo Anti-Ban Shield Active:</b> Delivery is automatically throttled with a 1.8s jitter delay. Dynamic recipient tags prevent duplicate spam hash flags. Includes RFC 8058 One-Click Unsubscribe headers.
              </div>
            </div>

            {/* Live Campaign Status if Running */}
            {bulkCampaignStatus && bulkCampaignStatus.status === 'running' && (
              <div style={{ background: '#181528', border: '1px solid #8b5cf6', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1s infinite' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>Campaign In Progress...</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    Sent: <b style={{ color: '#34d399' }}>{bulkCampaignStatus.sent}</b> / {bulkCampaignStatus.total} ({bulkCampaignStatus.failed} failed)
                  </span>
                </div>
                {/* Progress Bar */}
                <div style={{ width: '100%', height: 8, background: '#110f1c', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #10b981)',
                      width: `${bulkCampaignStatus.total > 0 ? (bulkCampaignStatus.sent / bulkCampaignStatus.total) * 100 : 0}%`,
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: '#9ca3af' }}>
                  <span>Currently delivering to: <b>{bulkCampaignStatus.currentEmail || '...'}</b></span>
                  <button
                    onClick={handleStopBulkCampaign}
                    style={{ background: '#ef4444', border: 'none', borderRadius: 6, padding: '3px 10px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⏹ Stop Campaign
                  </button>
                </div>
              </div>
            )}

            {/* Campaign Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Audience Selector */}
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#cbd5e1', marginBottom: 6, display: 'block' }}>
                  Select Target Audience
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { id: 'all', label: 'All Customers', icon: '👥' },
                    { id: 'delivered', label: 'Delivered Buyers', icon: '✅' },
                    { id: 'pending', label: 'Pending Orders', icon: '⏳' },
                    { id: 'manual', label: 'Custom List', icon: '📋' },
                  ].map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => setBulkSegment(seg.id as any)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 10,
                        border: '1px solid',
                        borderColor: bulkSegment === seg.id ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)',
                        background: bulkSegment === seg.id ? 'rgba(139, 92, 246, 0.2)' : '#181528',
                        color: bulkSegment === seg.id ? '#c4b5fd' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{seg.icon}</span>
                      <span>{seg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual emails input if segment is manual */}
              {bulkSegment === 'manual' && (
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' }}>
                    Paste recipient emails (separated by commas or newlines):
                  </label>
                  <textarea
                    rows={3}
                    placeholder="shakil@example.com, customer2@gmail.com"
                    value={bulkManualEmails}
                    onChange={(e) => setBulkManualEmails(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
              )}

              {/* Audience Count Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#34d399' }}>
                <span>✓</span>
                <span>Audience Ready: <b>{bulkPreviewLoading ? 'Calculating...' : `${bulkRecipientsCount} recipients will receive this campaign`}</b></span>
              </div>

              {/* Sender & CC Rows */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>From Address</label>
                  <select
                    value={bulkFrom}
                    onChange={(e) => setBulkFrom(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  >
                    {customAddresses.map((addr) => (
                      <option key={addr.email} value={addr.email}>
                        {addr.email} ({addr.label})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>Sender Name</label>
                  <input
                    type="text"
                    value={bulkFromName}
                    onChange={(e) => setBulkFromName(e.target.value)}
                    placeholder="Secrate Official"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
              </div>

              {/* CC & BCC (Optional) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>Cc (Optional notification)</label>
                  <input
                    type="text"
                    value={bulkCc}
                    onChange={(e) => setBulkCc(e.target.value)}
                    placeholder="management@secrate.shop"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>Bcc (Optional)</label>
                  <input
                    type="text"
                    value={bulkBcc}
                    onChange={(e) => setBulkBcc(e.target.value)}
                    placeholder="archive@secrate.shop"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Subject with Dynamic Tag Chips */}
              <div>
                <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>Campaign Subject</label>
                <input
                  type="text"
                  placeholder="Special Exclusive Offer for You, {name}!"
                  value={bulkSubject}
                  onChange={(e) => setBulkSubject(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 13, outline: 'none', fontWeight: 600 }}
                />
              </div>

              {/* Dynamic Tag Insertion Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>Insert Dynamic Tag:</span>
                {[
                  { tag: '{name}', label: 'Customer Name' },
                  { tag: '{phone}', label: 'Phone' },
                  { tag: '{order_id}', label: 'Order ID' },
                  { tag: '{product}', label: 'Product Name' },
                  { tag: '{date}', label: "Today's Date" },
                ].map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => setBulkBody((prev) => prev + ' ' + t.tag)}
                    style={{ padding: '3px 8px', borderRadius: 6, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#c4b5fd', fontSize: 11, cursor: 'pointer' }}
                  >
                    + {t.label} ({t.tag})
                  </button>
                ))}
              </div>

              {/* Content Body Editor */}
              <div>
                <label style={{ fontSize: 12, color: '#a78bfa', marginBottom: 4, display: 'block' }}>Email Content (Plain text or HTML)</label>
                <textarea
                  rows={6}
                  placeholder={`Assalamu Alaikum {name},\n\nWe have added new exclusive products to our Secrate collection!\n\nAs a valued customer, enjoy free express delivery on your next purchase.\n\nWarm regards,\nSecrate Team`}
                  value={bulkBody}
                  onChange={(e) => setBulkBody(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 8, background: '#181528', border: '1px solid rgba(139, 92, 246, 0.22)', color: '#fff', fontSize: 13, lineHeight: 1.6, outline: 'none', resize: 'vertical' }}
                />
              </div>

              {bulkError && <div style={{ color: '#f87171', fontSize: 12.5 }}>⚠️ {bulkError}</div>}
              {bulkSuccess && <div style={{ color: '#34d399', fontSize: 12.5 }}>✓ {bulkSuccess}</div>}

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  style={{ padding: '8px 18px', borderRadius: 8, background: '#181528', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartBulkCampaign}
                  disabled={bulkSending || bulkRecipientsCount === 0}
                  style={{
                    padding: '8px 24px',
                    borderRadius: 8,
                    background: bulkSending ? '#475569' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: bulkSending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  {bulkSending ? 'Sending in progress...' : `Start Safe Campaign (${bulkRecipientsCount} recipients)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         8. MANAGE CUSTOM MAILBOXES MODAL (VIOLET OBSIDIAN LUXURY THEMED)
         ========================================================================= */}
      {manageAddressesOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 560, maxWidth: '100%', maxHeight: '90vh', background: '#13111c', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 20, overflowY: 'auto', padding: 24, color: '#f3f4f6', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.85)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 92, 246, 0.18)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>⚙️</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Custom Mailboxes & Addresses</div>
                  <div style={{ fontSize: 12, color: '#a78bfa' }}>Add unlimited mailboxes (e.g. sales@, billing@, info@, vip@secrate.shop)</div>
                </div>
              </div>
              <button
                onClick={() => setManageAddressesOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Add New Mailbox Form */}
            <div style={{ background: '#181528', padding: 14, borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.22)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>Create New Custom Address</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <div>
                  <input
                    type="email"
                    placeholder="e.g. billing@secrate.shop"
                    value={newAddressEmail}
                    onChange={(e) => setNewAddressEmail(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#110f1c', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Label (e.g. Accounts & Billing)"
                    value={newAddressLabel}
                    onChange={(e) => setNewAddressLabel(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: '#110f1c', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
              </div>
              {addressError && <div style={{ color: '#f87171', fontSize: 12 }}>⚠️ {addressError}</div>}
              <button
                onClick={handleAddCustomAddress}
                disabled={addressLoading}
                style={{ width: 'fit-content', padding: '7px 18px', borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: addressLoading ? 'not-allowed' : 'pointer' }}
              >
                {addressLoading ? 'Adding...' : '+ Add Mailbox'}
              </button>
            </div>

            {/* Active Mailboxes List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>Active Mailboxes ({customAddresses.length})</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customAddresses.map((addr) => (
                  <div
                    key={addr.email}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#181528',
                      border: '1px solid rgba(139, 92, 246, 0.16)'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f9fafb' }}>
                        {addr.email} {addr.isDefault && <span style={{ fontSize: 10, background: '#059669', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>DEFAULT</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#a78bfa' }}>{addr.label}</div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomAddress(addr.email)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                          e.currentTarget.style.borderColor = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        }}
                        title={`Delete ${addr.email}`}
                      >
                        <span>🗑️</span>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         9. CLOUDFLARE SETUP GUIDE MODAL (VIOLET OBSIDIAN LUXURY THEMED)
         ========================================================================= */}
      {guideOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 620, maxWidth: '100%', maxHeight: '90vh', background: '#13111c', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 20, overflowY: 'auto', padding: 24, color: '#f3f4f6', boxShadow: '0 20px 60px rgba(0,0,0,0.85)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid rgba(139, 92, 246, 0.18)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>☁️</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Cloudflare Free Custom Email Setup</span>
              </div>
              <button
                onClick={() => setGuideOpen(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.65, color: '#d1d5db', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#181528', padding: 14, borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.22)' }}>
                <b style={{ color: '#c4b5fd' }}>Webhook Endpoint for secrate.shop:</b>
                <div style={{ marginTop: 6, padding: '8px 12px', background: '#0b0a12', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, color: '#34d399', wordBreak: 'break-all', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  https://secrate.shop/api/mail/inbound
                </div>
              </div>

              <div>
                <b style={{ color: '#fff' }}>1. Cloudflare Dashboard এ যান:</b>
                <p style={{ margin: '4px 0 0 0', color: '#9ca3af' }}>Cloudflare &gt; secrate.shop &gt; <b>Email Routing</b> এ ক্লিক করুন।</p>
              </div>

              <div>
                <b style={{ color: '#fff' }}>2. Routing Rule তৈরি করুন:</b>
                <p style={{ margin: '4px 0 0 0', color: '#9ca3af' }}>Custom Address এ <code>*@secrate.shop</code> অথবা <code>support@secrate.shop</code> সিলেক্ট করে অ্যাকশনে আপনার জিমেইল ফরোয়ার্ড অথবা ইমেইল ওয়ার্কার কনফিগার করুন।</p>
              </div>

              <div>
                <b style={{ color: '#fff' }}>3. আউটবাউন্ড পাঠানো:</b>
                <p style={{ margin: '4px 0 0 0', color: '#9ca3af' }}>আমাদের ড্যাশবোর্ড সরাসরি SMTP বা Resend দিয়ে যেকোনো ডোমেইনে ১০০% ইনবক্স ডেলিভারি দেয়।</p>
              </div>
            </div>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button
                onClick={() => setGuideOpen(false)}
                style={{ padding: '8px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Understood, Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
