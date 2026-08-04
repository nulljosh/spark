// Self-check for env-value sanitising. Run: node api/_lib/supabase.selfcheck.js
//
// Guards the bug that took Sparkjar's production down and caused an App Review
// 2.1(a) rejection: env vars set with `echo` carry a literal backslash-n, which
// String.trim() does NOT strip because it is not whitespace.
const assert = require('assert');
const { cleanEnv } = require('./supabase');

const URL = 'https://tjsxsqlxjmanwvmywwvw.supabase.co';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig';

const cases = [
  ['literal \\n on url', URL + '\\n', URL],
  ['literal \\n on jwt', JWT + '\\n', JWT],
  ['literal \\r\\n', URL + '\\r\\n', URL],
  ['repeated literal \\n', URL + '\\n\\n', URL],
  ['real newline', URL + '\n', URL],
  ['surrounding spaces', '  ' + URL + '  ', URL],
  ['KEY=value prefix', 'SUPABASE_URL=' + URL, URL],
  ['clean value untouched', URL, URL],
  ['base64 padding preserved', 'abc==', 'abc=='],
  ['empty', '', ''],
  ['undefined', undefined, '']
];

let failed = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.strictEqual(cleanEnv(input), expected);
    console.log('ok   ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, '->', JSON.stringify(cleanEnv(input)), 'expected', JSON.stringify(expected));
  }
}

// A JWT must survive intact -- a single stray char invalidates the signature.
assert.strictEqual(cleanEnv(JWT + '\\n').split('.').length, 3, 'jwt structure preserved');

console.log(failed ? `\n${failed} FAILED` : `\n${cases.length}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
