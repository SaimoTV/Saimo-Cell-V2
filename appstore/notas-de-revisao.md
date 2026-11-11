# Notas para a revisao (cole em "App Review Information > Notes")

**Saimo TV is a media player. It does not include, host, sell or link to any channels, movies or series.**
On first launch the app is empty. The user adds a playlist they already have (an M3U link, or an Xtream-style
server + username + password) in the "Add list" screen. The app then only plays the streams in that playlist.
No account or sign-in is required to use the app.

## How to test (1 minute)
1. Open the app. On the TV tab tap **"Adicionar lista"** (Add list).
2. Paste this link and confirm:
   `https://REPLACE-WITH-YOUR-PUBLIC-URL/lista-teste.m3u`
   (It contains 4 public demo streams: Big Buck Bunny, Tears of Steel and two Apple sample streams.)
3. Tap any channel to play it. The first picture can take up to a minute on a live stream.

You can also try a plain `http://` playlist: the list URL may be http or https.

## Why App Transport Security allows arbitrary loads (NSAllowsArbitraryLoads)
The playlists and streams belong to the user and are hosted on the user's own servers or provider.
Many of these servers only offer plain `http://` (often with a port number and no TLS certificate), and the address is
typed by the user, so we cannot know the domains in advance. The app only connects to addresses the user enters
plus a few fixed HTTPS services (metadata and subtitles). We cannot list per-domain exceptions.

## Permissions
- **Photos (add only)**: to save a downloaded video to the user's gallery, only when the user asks for it.
- **Local network**: Saimo Connect finds the user's own Saimo TV box on the Wi-Fi, and Chromecast devices.
- **Background audio**: audio keeps playing when the screen locks.

## Other notes
- No third-party advertising, no tracking, no data sold. Analytics are disabled.
- The app has no in-app purchases and no donation links on iOS.
- The "Saimo Connect" feature needs a Saimo TV box on the same network; it is optional and the rest of the app works without it.
