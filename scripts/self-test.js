const assert = require('assert');
process.env.APP_SECRET = process.env.APP_SECRET || 'self-test-secret-that-is-long-enough-123456';
const { encryptJson, decryptJson } = require('../src/vault');
const { buildSourceSequence } = require('../src/utils');
const { templateMetadata } = require('../src/ai');
const { dateKey, localClock, localDateTimeKey } = require('../src/utils');

const encrypted = encryptJson({ access_token: 'abc', refresh_token: 'def' });
assert.notStrictEqual(encrypted.includes('abc'), true, 'Token ochiq ko‘rinmasligi kerak');
assert.deepStrictEqual(decryptJson(encrypted), { access_token: 'abc', refresh_token: 'def' });

const seq = buildSourceSequence(['a.mp4','b.mp4','c.mp4'], 20);
assert.strictEqual(seq.length, 20);
for (let i = 1; i < seq.length; i++) assert.notStrictEqual(seq[i], seq[i-1], 'Yonma-yon bir xil klip bo‘lmasin');

const meta = templateMetadata({
  songName: 'My Song.mp3',
  channel: { title: 'Test', titleTemplate: '{song} | Music', descriptionTemplate: '{song} on {channel}', tags: ['music'] },
  settings: {}
});
assert.strictEqual(meta.title, 'My Song | Music');
assert(meta.description.includes('Test'));

assert(/^\d{4}-\d{2}-\d{2}$/.test(dateKey(new Date(), 'Asia/Samarkand')));
assert(Number.isInteger(localClock(new Date(), 'Asia/Samarkand').hour));
assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTimeKey(new Date(), 'Asia/Samarkand')));
console.log('SELF TEST: OK');
