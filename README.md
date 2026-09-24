# Shuō ba 说吧

Speak Mandarin every day with Lìlì (丽丽), an AI tutor avatar. You talk, she answers out loud and corrects you. Answer in English whenever you're stuck and she'll teach you how to say it in Chinese.

- Daily lesson plus about 40 scenarios in Everyday, Travel, Social and **Business**
- Voice in (phone microphone, Mandarin speech recognition) and voice out (the phone's Chinese voice)
- Corrections with tone-coloured pinyin, plus pronunciation tips when the speech recogniser misheard you
- End-of-lesson summary, a day streak and minutes spoken
- Hands-free mode: Lìlì listens again automatically after she speaks

It's a web app (PWA). Chrome on Android installs it to your home screen like a normal app.

## What you need

1. **A free Google AI key**, for Lìlì's brain (Google Gemini, free plan). Open https://aistudio.google.com/apikey, sign in with Google, tap **Create API key**, and paste the key into the app. There's no payment and no card. On the free plan, Google may use conversations to improve its products.
   Other brains are available in Settings: an experimental AI that runs on the phone itself (free, but it crashes on many phones), or Claude (smartest, but needs a paid Anthropic API key).
2. **HTTPS hosting.** The phone only lets the app use the microphone over `https://`. GitHub Pages is free.

## Put it online (GitHub Pages)

1. Create a new **public** repository on github.com, e.g. `shuoba`.
2. Upload every file in this folder (`index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`).
3. In the repository, go to **Settings → Pages**. Set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After about a minute the app is live at `https://<your-username>.github.io/shuoba/`.

The code contains no secrets. Your API key never leaves your phone, except when it's sent to Anthropic.

## Install it on your Android phone

1. Open the link in **Chrome**.
2. Tap **⋮ → Add to Home screen → Install**.
3. Open Shuō ba from the home screen and paste your API key.
4. Tap the mic. Chrome asks for microphone permission the first time. Tap **Allow**.
5. If Lìlì has no voice: go to **Settings → System → Languages → Text-to-speech output → Google → Install voice data → Chinese (Mandarin)**.

## Run it on this PC (for testing)

```bash
python -m http.server 8123
```

Then open http://localhost:8123 in Chrome. The microphone works on `localhost` without HTTPS.

## Test on your phone (same Wi-Fi as this PC)

The home screen on the PC shows a QR code for `http://192.168.0.49:8123/`, and so does `install-qr.png`.

1. Keep the server running on the PC (`python -m http.server 8123` in this folder). If Windows asks whether Python may use private networks, click **Allow**.
2. Scan the QR code with the phone camera and open the link in Chrome.
3. Over plain `http://`, Chrome blocks the microphone and the install option. To allow them for this one address, on the phone open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://192.168.0.49:8123`, set the flag to **Enabled** and tap **Relaunch**.
4. Now tap **⋮ → Add to Home screen → Install**.

This only works while the PC is on and on the same Wi-Fi. For an app that works anywhere, use GitHub Pages (above) and scan the QR code the app shows there.

## Models and cost

Choose the model under Settings:

| Model | Good for |
|---|---|
| Claude Opus 5 (default) | the best corrections and explanations |
| Claude Sonnet 5 | faster and cheaper |
| Claude Haiku 4.5 | fastest and cheapest |

A lesson is roughly 10–15 short requests. On Opus 5, if a request is declined, the API retries it automatically on a recommended fallback model.
