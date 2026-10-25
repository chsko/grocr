# grocr.io

Static pages for grocr.io (GRO-39): landing, privacy policy, account deletion request (required by
Google Play) and the invite link fallback `grocr.io/join/<code>`, which shows the code and opens
the app (`grocr://join?code=…`). Norwegian and English on each page; `lang.js` picks one.

No build step. `vercel.json` rewrites `/join/<code>` to the fallback page. Universal links
(`.well-known/apple-app-site-association`, `assetlinks.json`) come once the app has an Apple team
id and Android signing key.
