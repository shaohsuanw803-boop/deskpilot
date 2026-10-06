import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const source = (name) =>
  ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const localeCode = source('i18n');
const apiCode = source('api');

function apiFixture(fetch) {
  const f = fixture();
  const exports = {};
  vm.runInContext(
    apiCode,
    vm.createContext({
      exports,
      module: { exports },
      require: (name) => (name === './i18n' ? f.locale : f.react),
      Headers,
      FormData,
      Response,
      fetch,
      crypto: { randomUUID },
    }),
  );
  return exports;
}

function fixture({ saved, blocked = false, storage: existing } = {}) {
  const storage = existing || new Map(saved ? [['deskpilot.locale', saved]] : []);
  const writes = [];
  const meta = new Map();
  const document = {
    title: '',
    documentElement: { lang: '' },
    querySelector: () => ({ setAttribute: (key, value) => meta.set(key, value) }),
  };
  let subscriber;
  const react = {
    useSyncExternalStore: (subscribe, getSnapshot) => {
      subscriber = subscribe;
      return getSnapshot();
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    module: { exports },
    require: (name) => {
      assert.equal(name, 'react');
      return react;
    },
    localStorage: {
      getItem: (key) => {
        if (blocked) throw new Error('Storage is blocked');
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (blocked) throw new Error('Storage is blocked');
        writes.push([key, value]);
        storage.set(key, value);
      },
    },
    navigator: { language: 'zh-CN', languages: ['zh-CN', 'zh'] },
    document,
  });
  vm.runInContext(localeCode, context);
  return {
    locale: exports,
    storage,
    writes,
    document,
    meta,
    react,
    subscribe: (...args) => subscriber(...args),
  };
}

test('starts in English despite a Chinese browser and does not persist an implicit choice', () => {
  const f = fixture();
  assert.equal(f.locale.getLocale(), 'en');
  assert.equal(f.locale.translate('中文文案', 'English copy'), 'English copy');
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(f.document.title, 'DeskPilot · IT Service Desk');
  assert.equal(f.writes.length, 0);
});

test('only an explicit Chinese selection persists, and explicit English restores the default', () => {
  const f = fixture();
  f.locale.setLocale('zh-CN');
  assert.equal(f.locale.getLocale(), 'zh-CN');
  assert.equal(f.locale.translate('中文文案', 'English copy'), '中文文案');
  assert.equal(f.document.documentElement.lang, 'zh-CN');
  assert.equal(f.document.title, 'DeskPilot · IT 服务工作台');
  assert.equal(fixture({ storage: f.storage }).locale.getLocale(), 'zh-CN');
  f.locale.setLocale('en');
  assert.equal(fixture({ storage: f.storage }).locale.getLocale(), 'en');
  assert.deepEqual(f.writes, [
    ['deskpilot.locale', 'zh-CN'],
    ['deskpilot.locale', 'en'],
  ]);
  assert.match(f.meta.get('content'), /enterprise IT service desk/);
});

test('invalid stored values and invalid runtime choices cannot select an unsupported language', () => {
  for (const saved of ['zh', 'fr', 'undefined', '{"locale":"zh-CN"}']) {
    const f = fixture({ saved });
    assert.equal(f.locale.getLocale(), 'en');
    f.locale.setLocale('fr');
    assert.equal(f.locale.getLocale(), 'en');
    assert.equal(f.writes.length, 0);
  }
});

test('blocked storage falls back to English and still allows in-memory switching', () => {
  const f = fixture({ saved: 'zh-CN', blocked: true });
  assert.equal(f.locale.getLocale(), 'en');
  assert.doesNotThrow(() => f.locale.setLocale('zh-CN'));
  assert.equal(f.locale.getLocale(), 'zh-CN');
  assert.equal(f.document.documentElement.lang, 'zh-CN');
  assert.doesNotThrow(() => f.locale.setLocale('en'));
  assert.equal(f.locale.getLocale(), 'en');
});

test('subscribed consumers are notified on actual locale changes and can unsubscribe', () => {
  const f = fixture();
  assert.equal(f.locale.useI18n().locale, 'en');
  let notifications = 0;
  const unsubscribe = f.subscribe(() => notifications++);
  f.locale.setLocale('zh-CN');
  f.locale.setLocale('zh-CN');
  f.locale.setLocale('en');
  assert.equal(notifications, 2);
  unsubscribe();
  f.locale.setLocale('zh-CN');
  assert.equal(notifications, 2);
});

test('JSON and multipart requests carry the explicit locale without overwriting form boundaries', async () => {
  const f = fixture();
  const calls = [];
  const exports = {};
  const context = vm.createContext({
    exports,
    module: { exports },
    require: (name) => (name === './i18n' ? f.locale : f.react),
    Headers,
    FormData,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    },
  });
  vm.runInContext(apiCode, context);
  const demoUser = {
    id: 'alice',
    name: '小艾',
    name_en: 'Alice',
    role: 'employee',
    department: 'IT',
  };
  assert.equal(exports.displayUserName(demoUser), 'Alice');
  assert.equal(
    exports.displayUserName({ ...demoUser, name: '用户提供的名字', name_en: undefined }),
    '用户提供的名字',
  );
  await exports.post('/runs', { message: 'original user text' });
  assert.equal(calls[0].options.headers.get('Accept-Language'), 'en');
  assert.equal(calls[0].options.headers.get('Content-Type'), 'application/json');
  assert.equal(JSON.parse(calls[0].options.body).message, 'original user text');
  f.locale.setLocale('zh-CN');
  assert.equal(exports.displayUserName(demoUser), '小艾');
  const form = new FormData();
  form.append('metadata', '{"title":"Original document title"}');
  await exports.request('/knowledge', {
    method: 'POST',
    body: form,
    headers: { 'X-Test': 'kept' },
  });
  assert.equal(calls[1].options.headers.get('Accept-Language'), 'zh-CN');
  assert.equal(calls[1].options.headers.has('Content-Type'), false);
  assert.equal(calls[1].options.headers.get('X-Test'), 'kept');
  assert.equal(calls[1].options.body, form);
});

test('a run submission retries a lost response with the same key, then rotates after success', async () => {
  const keys = [];
  const api = apiFixture(async (url, options) => {
    assert.equal(url, '/api/runs');
    keys.push(options.headers.get('Idempotency-Key'));
    if (keys.length === 1) throw new Error('Response lost after server accepted the task');
    return new Response('{"id":"run_one"}', { headers: { 'Content-Type': 'application/json' } });
  });
  const submit = api.createRunSubmitter();
  const body = { message: 'VPN 809', locale: 'en', cloud_allowed: false };
  await assert.rejects(submit('alice', body));
  assert.equal((await submit('alice', body)).id, 'run_one');
  await submit('alice', body);
  assert.match(keys[0], /^[a-f0-9-]{36}$/);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('changed intent, locale or identity gets a new request key after a failed submission', async () => {
  const keys = [];
  const api = apiFixture(async (_url, options) => {
    keys.push(options.headers.get('Idempotency-Key'));
    throw new Error('Connection lost');
  });
  const submit = api.createRunSubmitter();
  for (const [user, body] of [
    ['alice', { message: 'VPN 809', locale: 'en' }],
    ['alice', { message: 'VPN 809', locale: 'zh-CN' }],
    ['alice', { message: 'Office issue', locale: 'zh-CN' }],
    ['bob', { message: 'Office issue', locale: 'zh-CN' }],
  ])
    await assert.rejects(submit(user, body));
  assert.equal(new Set(keys).size, 4);
});

test('overload keeps the pending submission key and does not retry automatically', async () => {
  const keys = [];
  const api = apiFixture(async (_url, options) => {
    keys.push(options.headers.get('Idempotency-Key'));
    return new Response('{"detail":"Busy"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '1' },
    });
  });
  const submit = api.createRunSubmitter();
  const body = { message: 'I need standard access to Visio.' };
  await assert.rejects(submit('alice', body), { status: 503 });
  assert.equal(keys.length, 1);
  await assert.rejects(submit('alice', body), { status: 503 });
  assert.equal(keys[0], keys[1]);
});
