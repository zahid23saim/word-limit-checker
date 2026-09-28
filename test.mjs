import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from './worker.js';

const SECRET = 'test-signing-secret';
const env = { SLACK_SIGNING_SECRET: SECRET };

function slackRequest(text, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const body = new URLSearchParams({ command: '/wordcount', text, channel_id: 'C123', user_id: 'U123' }).toString();
  const sig = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');
  return new Request('https://example.workers.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Slack-Request-Timestamp': String(timestamp), 'X-Slack-Signature': sig },
    body: tamper ? body.replace('wordcount', 'wordcounx') : body,
  });
}

async function call(text, opts) {
  const res = await worker.fetch(slackRequest(text, opts), env);
  return { status: res.status, json: res.status === 200 ? await res.json() : await res.text() };
}

// Original sample drafts: 82, 50 and 49 words by the Worker's counting rule.
const overDraft = "Our team ships a release note every Friday, and every Friday the note runs long. Somebody adds a paragraph about the new dashboard, somebody else explains the migration twice, and by the time it reaches the channel nobody reads past the second line. So we set a rule: fifty words, no exceptions. The first week, the draft came in far over, and its author insisted every sentence was essential. We cut the history, kept the change, and posted it before lunch, which";
const exactDraft = "At 7:15am the standup bot posted its summary: three blockers, two reviews, one outage follow-up. Nobody scrolled; the summary fit on one screen. That was the point of the limit. A short update gets read, a long one gets skimmed, and a skimmed update hides the line that mattered most.";
const underDraft = "The draft was ready—almost. It said everything twice, so we trimmed it. “Shorter is kinder,” the editor wrote in the margin, and nobody argued. A few edits later the note said what changed, why it mattered, and who to ask. It shipped on time, and people read it.";

const cases = [
  ['over limit', '50 ' + overDraft, 'in_channel', ':warning: *82 words*: 32 over the 50-word limit.'],
  ['exactly on limit', '50 ' + exactDraft, 'in_channel', ':white_check_mark: *50 words*: exactly on the 50-word limit.'],
  ['under limit', '50 ' + underDraft, 'in_channel', ':white_check_mark: *49 words*: within the 50-word limit, 1 to spare.'],
  ['no limit', 'hello world', 'in_channel', '*2 words*.'],
  ['one word', 'hello', 'in_channel', '*1 word*.'],
  ['entities and bare punctuation', 'Block &amp; Bell \u2014 ok', 'in_channel', '*3 words*.'],
  ['empty text', '', 'ephemeral', null],
  ['limit with no text', '50', 'ephemeral', null],
  ['zero limit is treated as text', '0 apples', 'in_channel', '*2 words*.'],
];
for (const [name, text, type, expected] of cases) {
  const { status, json } = await call(text);
  assert.equal(status, 200, name);
  assert.equal(json.response_type, type, name);
  if (expected) assert.equal(json.text, expected, name);
  else assert.match(json.text, /^Usage:/, name);
  console.log('ok  ', name.padEnd(32), JSON.stringify(json.text));
}

assert.equal((await call('hi', { secret: 'wrong' })).status, 401); console.log('ok   wrong secret -> 401');
assert.equal((await call('hi', { tamper: true })).status, 401); console.log('ok   tampered body -> 401');
assert.equal((await call('hi', { timestamp: Math.floor(Date.now() / 1000) - 600 })).status, 401); console.log('ok   10-minute-old timestamp -> 401');
assert.equal((await worker.fetch(slackRequest('hi'), {})).status, 401); console.log('ok   missing secret -> 401');
const unsigned = new Request('https://example.workers.dev/', { method: 'POST', body: 'text=hi' });
assert.equal((await worker.fetch(unsigned, env)).status, 401); console.log('ok   unsigned request -> 401');
const get = await worker.fetch(new Request('https://example.workers.dev/'), env);
assert.equal(get.status, 200); console.log('ok   GET ->', JSON.stringify(await get.text()));
console.log('all tests passed');
