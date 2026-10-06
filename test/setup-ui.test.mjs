import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { PASSKEY_PROVIDERS } from '../src/providers.js';
import { WALLET_DOMAINS } from '../src/domains.js';
const compiled = await readFile(new URL('../dist/setup.js', import.meta.url), 'utf8');
for (const provider of PASSKEY_PROVIDERS) for (const domain of WALLET_DOMAINS) {
  test(`built setup ${provider.id} UI sends only the account for lookup and freezes ${domain.rpId} at preparation`, async () => {
    const elements = new Map();
    for (const id of ['domain-select', 'lookup-form', 'lookup', 'result', 'setup-status', 'account-input', 'selected-account', 'key-select', 'selected-snapshot', 'continue', 'provider-name', 'provider-instructions', 'provider-help']) {
      elements.set(id, { value: '', options: [], hidden: false, disabled: false, handlers: {}, textContent: '', addEventListener(type, handler) { this.handlers[type] = handler; }, append(option) { this.options.push(option); if (!this.value) this.value = option.value; }, replaceChildren() { this.options = []; this.value = ''; } });
    }
    const calls = [], navigations = [];
    const publicKey = 'ed25519:' + '1'.repeat(32);
    vm.runInNewContext(compiled, {
      window: { RECOVERY_PROVIDER: provider.id },
      document: { getElementById: id => elements.get(id), createElement: () => ({ value: '', textContent: '' }) },
      location: { assign(url) { navigations.push(url); } },
      fetch: async (url, options) => {
        const data = JSON.parse(options.body); calls.push({ url, data });
        return { ok: true, json: async () => url === '/lookup' ? { accountId: 'synthetic.near', publicKeys: [publicKey], blockHeight: 1, retrievedAt: '2026-10-06T00:00:00Z' } : { url: domain.origin + '/' } };
      },
    });
    assert.equal(elements.get('provider-name').textContent, provider.label);
    assert.equal(elements.get('provider-help').hidden, !provider.helpUrl);
    if (provider.helpUrl) assert.equal(elements.get('provider-help').href, provider.helpUrl);
    assert.deepEqual(elements.get('domain-select').options.map(o => o.value), WALLET_DOMAINS.map(d => d.rpId));
    elements.get('account-input').value = 'synthetic.near';
    elements.get('domain-select').value = domain.rpId;
    await elements.get('lookup-form').handlers.submit({ preventDefault() {} });
    assert.deepEqual(calls[0], { url: '/lookup', data: { accountId: 'synthetic.near' } });
    await elements.get('continue').handlers.click();
    assert.deepEqual(calls[1], { url: '/prepare', data: { publicKey, rpId: domain.rpId } });
    assert.deepEqual(navigations, [domain.origin + '/']);
    assert(elements.get('lookup').disabled);
  });
}
