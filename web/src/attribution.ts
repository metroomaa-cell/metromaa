// Traffic Attribution Engine: Tracks & identifies visitor traffic source
// Supports: Facebook (Meta Ads/fbclid), TikTok (ttclid), Google (gclid/gad_source/search),
// Yahoo, AI Chatbots (ChatGPT, Claude, Perplexity, Copilot, Gemini), YouTube, Instagram, WhatsApp, Direct.

export interface TrafficAttribution {
  channel: 'facebook' | 'tiktok' | 'google' | 'instagram' | 'youtube' | 'yahoo' | 'chatgpt' | 'claude' | 'perplexity' | 'copilot' | 'gemini' | 'whatsapp' | 'direct' | 'referral';
  source: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landingPath?: string;
  clickId?: string;
  capturedAt?: string;
}

const STORAGE_KEY = 'dot_traffic_attribution';
const SRC_KEY = 'dot_src';

export function parseTrafficSource(): TrafficAttribution {
  if (typeof window === 'undefined') {
    return { channel: 'direct', source: 'direct' };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const ref = document.referrer ? new URL(document.referrer, window.location.origin) : null;
    const refHost = ref ? ref.hostname.replace(/^www\./, '').toLowerCase() : '';
    const currentHost = window.location.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = window.location.pathname;

    const utmSource = (params.get('utm_source') || params.get('source') || params.get('ref') || '').toLowerCase();
    const utmMedium = (params.get('utm_medium') || '').toLowerCase();
    const utmCampaign = params.get('utm_campaign') || '';
    const utmTerm = params.get('utm_term') || '';
    const utmContent = params.get('utm_content') || '';

    const fbclid = params.get('fbclid') || '';
    const ttclid = params.get('ttclid') || '';
    const gclid = params.get('gclid') || params.get('gad_source') || params.get('gbraid') || params.get('wbraid') || '';

    // 1. Paid Ad Click IDs (Highest accuracy)
    if (fbclid) {
      return {
        channel: 'facebook',
        source: 'facebook_ad',
        medium: utmMedium || 'cpc',
        campaign: utmCampaign || 'meta_ads',
        term: utmTerm,
        content: utmContent,
        referrer: document.referrer || '',
        landingPath: pathname,
        clickId: fbclid,
        capturedAt: new Date().toISOString(),
      };
    }

    if (ttclid) {
      return {
        channel: 'tiktok',
        source: 'tiktok_ad',
        medium: utmMedium || 'paid_video',
        campaign: utmCampaign || 'tiktok_ads',
        term: utmTerm,
        content: utmContent,
        referrer: document.referrer || '',
        landingPath: pathname,
        clickId: ttclid,
        capturedAt: new Date().toISOString(),
      };
    }

    if (gclid) {
      return {
        channel: 'google',
        source: 'google_ad',
        medium: utmMedium || 'cpc',
        campaign: utmCampaign || 'google_ads',
        term: utmTerm,
        content: utmContent,
        referrer: document.referrer || '',
        landingPath: pathname,
        clickId: gclid,
        capturedAt: new Date().toISOString(),
      };
    }

    // 2. Explicit UTM Source parameters
    if (utmSource) {
      let channel: TrafficAttribution['channel'] = 'referral';
      if (utmSource.includes('facebook') || utmSource === 'fb') channel = 'facebook';
      else if (utmSource.includes('instagram') || utmSource === 'ig') channel = 'instagram';
      else if (utmSource.includes('tiktok') || utmSource === 'tt') channel = 'tiktok';
      else if (utmSource.includes('google')) channel = 'google';
      else if (utmSource.includes('youtube')) channel = 'youtube';
      else if (utmSource.includes('yahoo')) channel = 'yahoo';
      else if (utmSource.includes('chatgpt') || utmSource.includes('openai')) channel = 'chatgpt';
      else if (utmSource.includes('claude') || utmSource.includes('anthropic')) channel = 'claude';
      else if (utmSource.includes('perplexity')) channel = 'perplexity';
      else if (utmSource.includes('copilot') || utmSource.includes('bing')) channel = 'copilot';
      else if (utmSource.includes('gemini')) channel = 'gemini';
      else if (utmSource.includes('whatsapp') || utmSource === 'wa') channel = 'whatsapp';

      return {
        channel,
        source: utmSource,
        medium: utmMedium || (channel === 'facebook' || channel === 'tiktok' || channel === 'google' ? 'cpc' : 'social'),
        campaign: utmCampaign,
        term: utmTerm,
        content: utmContent,
        referrer: document.referrer || '',
        landingPath: pathname,
        capturedAt: new Date().toISOString(),
      };
    }

    // 3. Document Referrer inspection (if incoming from external site)
    if (refHost && refHost !== currentHost) {
      if (refHost.includes('facebook.com') || refHost.includes('fb.me')) {
        return {
          channel: 'facebook',
          source: 'facebook_referral',
          medium: 'social',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('instagram.com')) {
        return {
          channel: 'instagram',
          source: 'instagram_referral',
          medium: 'social',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('tiktok.com')) {
        return {
          channel: 'tiktok',
          source: 'tiktok_referral',
          medium: 'social',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('google.com') || refHost.includes('google.')) {
        return {
          channel: 'google',
          source: 'google_organic',
          medium: 'organic',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('yahoo.com')) {
        return {
          channel: 'yahoo',
          source: 'yahoo_organic',
          medium: 'organic',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('chatgpt.com') || refHost.includes('openai.com')) {
        return {
          channel: 'chatgpt',
          source: 'chatgpt_ai',
          medium: 'ai_referral',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('claude.ai') || refHost.includes('anthropic.com')) {
        return {
          channel: 'claude',
          source: 'claude_ai',
          medium: 'ai_referral',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('perplexity.ai')) {
        return {
          channel: 'perplexity',
          source: 'perplexity_ai',
          medium: 'ai_referral',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('copilot.microsoft.com') || refHost.includes('bing.com')) {
        return {
          channel: 'copilot',
          source: 'copilot_ai',
          medium: 'ai_referral',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('gemini.google.com')) {
        return {
          channel: 'gemini',
          source: 'gemini_ai',
          medium: 'ai_referral',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('youtube.com') || refHost.includes('youtu.be')) {
        return {
          channel: 'youtube',
          source: 'youtube_referral',
          medium: 'social_video',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }
      if (refHost.includes('whatsapp.com') || refHost.includes('wa.me')) {
        return {
          channel: 'whatsapp',
          source: 'whatsapp_chat',
          medium: 'direct_msg',
          referrer: document.referrer,
          landingPath: pathname,
          capturedAt: new Date().toISOString(),
        };
      }

      return {
        channel: 'referral',
        source: refHost,
        medium: 'referral',
        referrer: document.referrer,
        landingPath: pathname,
        capturedAt: new Date().toISOString(),
      };
    }

    return { channel: 'direct', source: 'direct', landingPath: pathname };
  } catch {
    return { channel: 'direct', source: 'direct' };
  }
}

/**
 * Initializes and retrieves traffic attribution.
 * Persists in sessionStorage & localStorage so full funnel attribution is preserved.
 * If user arrives via Facebook/TikTok/Google ad, that attribution sticks throughout the checkout session.
 */
export function getTrafficAttribution(): TrafficAttribution {
  if (typeof window === 'undefined') {
    return { channel: 'direct', source: 'direct' };
  }

  try {
    const currentParsed = parseTrafficSource();

    // If current request has an explicit ad click or non-direct source, record and prioritize it!
    if (currentParsed.channel !== 'direct') {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentParsed));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentParsed));
        localStorage.setItem(SRC_KEY, currentParsed.channel);
      } catch {}
      return currentParsed;
    }

    // Otherwise, check session storage (active browsing session)
    const sessionSaved = sessionStorage.getItem(STORAGE_KEY);
    if (sessionSaved) {
      try {
        const parsed = JSON.parse(sessionSaved);
        if (parsed && parsed.channel) return parsed;
      } catch {}
    }

    // Otherwise, check local storage (past 30 days)
    const localSaved = localStorage.getItem(STORAGE_KEY);
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        if (parsed && parsed.channel) return parsed;
      } catch {}
    }

    // Default: Direct
    return currentParsed;
  } catch {
    return { channel: 'direct', source: 'direct' };
  }
}
