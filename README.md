# Word Limit Checker

<img src="icon.png" alt="Word Limit Checker icon: a navy page with a lime 50 badge" width="96" align="right">

[![CI](https://github.com/zahid23saim/word-limit-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/zahid23saim/word-limit-checker/actions/workflows/ci.yml)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Slack API](https://img.shields.io/badge/Slack-slash%20command-4A154B?logo=slack&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Slack slash command that counts the words in a draft and checks it against a limit.

```
/wordcount 50 Our team ships a release note every Friday, and every Friday the note runs long...
```

> ⚠️ **82 words**: 32 over the 50-word limit.

Handy wherever a channel has a word budget: release notes, standup summaries,
abstracts, and posts with strict caps.

## How it works

1. Slack sends the slash command to a Cloudflare Worker as a signed `POST`.
2. The Worker checks the signature: HMAC-SHA256 over `v0:timestamp:body` with the
   app's signing secret, compared in constant time, inside a 5-minute window so an
   old request can't be replayed. Anything else gets `401`.
3. It counts the words and replies in the command's own HTTP response with
   `response_type: "in_channel"`, so the whole channel sees it.

Because the reply rides on the slash command's response, the app needs **only the
`commands` scope**: no `chat:write`, and no bot token to store or leak.

| You type | The channel sees |
|---|---|
| `/wordcount 50` + an 82-word draft | ⚠️ **82 words**: 32 over the 50-word limit. |
| `/wordcount 50` + a 50-word draft | ✅ **50 words**: exactly on the 50-word limit. |
| `/wordcount 50` + a 49-word draft | ✅ **49 words**: within the 50-word limit, 1 to spare. |
| `/wordcount hello world` | **2 words**. |
| `/wordcount` | Only you see the usage hint. |

Counting rules: whitespace and en or em dashes separate words, bare punctuation
isn't a word, and the `&amp;`, `&lt;` and `&gt;` entities Slack sends are decoded
first. A leading number is the limit only when text follows it.

## Run the tests

```bash
npm test
```

`test.mjs` calls the Worker with signed requests and uses only Node's built-in
`assert` and `crypto`. It covers the three limit cases, entity decoding, dash
handling and usage replies, plus the security cases: a wrong secret, a tampered
body, a 10-minute-old timestamp, a missing secret and an unsigned request.
[CI](.github/workflows/ci.yml) runs it on every push.

## Deploy your own

1. Deploy the Worker: `npx wrangler deploy`
2. Create a Slack app from [`manifest.yml`](manifest.yml), with the slash command
   URL pointing at your Worker.
3. Store the app's **Signing Secret** as a Worker secret:
   `npx wrangler secret put SLACK_SIGNING_SECRET`
4. Install the app to your workspace and try `/wordcount 50 your draft`.

## Files

| File | What it is |
|---|---|
| [`worker.js`](worker.js) | The Worker: signature check, parsing, counting and the reply |
| [`test.mjs`](test.mjs) | Tests, with no dependencies |
| [`manifest.yml`](manifest.yml) | Slack app manifest: one slash command, `commands` scope only |
| [`wrangler.jsonc`](wrangler.jsonc) | Worker configuration |

## License

MIT, see [LICENSE](LICENSE).
