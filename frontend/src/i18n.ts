import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'zh-CN';
export const LOCALE_STORAGE_KEY = 'deskpilot.locale';
const listeners = new Set<() => void>();

function initialLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return saved === 'zh-CN' ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}

let locale: Locale = initialLocale();

export function getLocale(): Locale {
  return locale;
}

export function translate(zh: string, en: string): string {
  return locale === 'zh-CN' ? zh : en;
}

function syncDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = translate('DeskPilot · IT 服务工作台', 'DeskPilot · IT Service Desk');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      translate(
        'DeskPilot 企业 IT 服务台：知识问答、服务工单与审批协作。',
        'DeskPilot enterprise IT service desk: grounded answers, service tickets, and approvals.',
      ),
    );
}

export function setLocale(next: Locale) {
  // Only explicit supported selections are stored. Never infer language from the browser.
  if (next !== 'en' && next !== 'zh-CN') return;
  const changed = next !== locale;
  locale = next;
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Private browsing / blocked storage still allows switching for this page session.
  }
  syncDocument();
  if (changed) listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useI18n() {
  const current = useSyncExternalStore(subscribe, getLocale, () => 'en' as Locale);
  return { locale: current, t: translate, setLocale };
}

syncDocument();
