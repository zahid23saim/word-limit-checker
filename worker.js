// /wordcount: a Slack slash command that counts the words in a draft and checks
// them against an optional limit, e.g. `/wordcount 50 The toaster woke up...`.
//
// The reply goes back in the command's own HTTP response with response_type
// "in_channel", so Slack posts it to the channel without a bot token. The app
// needs only the `commands` scope.
//
// Every request must carry a valid Slack signature, checked against the
// SLACK_SIGNING_SECRET Worker secret. Requests with a bad signature, or a
// timestamp more than five minutes old, are rejected.

const MAX_AGE_SECONDS = 5 * 60;
const USAGE = 'Usage: `/wordcount [limit] your text`, for example `/wordcount 50 The toaster woke up one morning...`';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('This endpoint answers the /wordcount Slack command.');
    }
    const body = await request.text();
    if (!(await isFromSlack(request, body, env.SLACK_SIGNING_SECRET))) {
      return new Response('Invalid Slack signature.', { status: 401 });
    }
    const text = new URLSearchParams(body).get('text') || '';
    return Response.json(reply(text));
  },
};

function reply(input) {
  const { limit, draft } = parse(input);
  if (!draft) return { response_type: 'ephemeral', text: USAGE };

  const words = countWords(draft);
  const count = `*${words} ${words === 1 ? 'word' : 'words'}*`;
  let text;
  if (limit === null) text = `${count}.`;
  else if (words > limit) text = `:warning: ${count}: ${words - limit} over the ${limit}-word limit.`;
  else if (words === limit) text = `:white_check_mark: ${count}: exactly on the ${limit}-word limit.`;
  else text = `:white_check_mark: ${count}: within the ${limit}-word limit, ${limit - words} to spare.`;
  return { response_type: 'in_channel', text };
}

// A leading whole number is the limit, but only when some text follows it.
function parse(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,6})\s+([\s\S]+)$/);
  if (match && Number(match[1]) > 0) return { limit: Number(match[1]), draft: match[2] };
  if (/^\d+$/.test(trimmed)) return { limit: null, draft: '' };
  return { limit: null, draft: trimmed };
}

// Words are runs separated by whitespace or em/en dashes; bare punctuation
// doesn't count. Slack sends &, < and > as HTML entities, so decode them first.
function countWords(draft) {
  const decoded = draft.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return decoded.split(/[\s–—]+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

// https://api.slack.com/authentication/verifying-requests-from-slack
async function isFromSlack(request, body, secret) {
  const timestamp = request.headers.get('X-Slack-Request-Timestamp');
  const signature = request.headers.get('X-Slack-Signature');
  if (!secret || !timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!(age <= MAX_AGE_SECONDS)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`v0:${timestamp}:${body}`));
  const expected = 'v0=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected, signature);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
