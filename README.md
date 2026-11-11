# AltRemote

An Android app that replaces your Google TV remote. It finds TVs on your Wi-Fi, pairs
with the code shown on the TV, and controls it from your phone.

It talks to the TV with Google's own **Android TV Remote protocol v2** (the one the
official Google TV app uses), so the TV needs no ADB, developer mode or root, and nothing
goes through the cloud.

## Features

- Finds TVs automatically, or add one by IP
- D-pad or swipe touchpad, Back, Home, Power, Assistant, Settings, Input
- Media keys, plus volume with a live level from the TV
- Type on the TV from your phone's keyboard
- One-tap app shortcuts (YouTube, Netflix, Disney+, Prime Video, Plex, Spotify, or your own)
- Remote buttons in the notification shade and on the lock screen
- Haptics, dark / light / system theme, automatic reconnect

Tested on a Samsung Galaxy A15 5G (Android 16) with a Skyworth Google TV.

## Download

Get the APK from the [latest release](https://github.com/soupfly/AltRemote/releases/latest)
and open it on your phone. Android asks you to allow installing apps from your browser or
file manager the first time. It needs Android 8 or newer on a 64-bit phone (arm64), which
covers most phones from the last several years.

Then open AltRemote, tap your TV, and enter the code the TV shows.

## Build and run

You need JDK 17, Node.js 22+, the Android SDK and an Android phone (Android 8+) with
USB or wireless debugging. On Linux Mint / Ubuntu, a script installs all of it:

```bash
./setup-altremote-dev.sh
```

Then connect the phone and start the app:

```bash
./adb-phone.sh          # connects over wireless debugging (or plug in USB)
npm install
npx react-native run-android
```

### Release APK

```bash
./build-debug.sh app:assembleRelease
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Release builds are signed with the key in `android/keystore.properties` (git-ignored). If
that file is missing, they fall back to the debug key. Keep your release key backed up:
updates must be signed with the same key. Debug builds install separately as
`com.altremote.debug`.

`build-debug.sh` wraps Gradle with a memory watchdog for low-RAM machines (4 GB). If the
watchdog stops a build, run it again.

## How it works

| Port | What |
|------|------|
| 6467 | **Pairing.** TLS with the app's client certificate. The TV shows a code, and the app sends a SHA-256 secret built from both certificates and the code. |
| 6466 | **Remote session.** TLS with the same certificate. Length-prefixed protobuf messages for keys, volume, app links, text and pings. |

- The networking is a Kotlin native module (`android/app/src/main/java/com/altremote/tvremote/`).
  JavaScript TLS libraries don't handle client certificates well.
- The client key lives in Android Keystore and never leaves the phone. The TV's certificate
  is remembered at pairing and checked on every connection.
- Protocol schemas: [`polo.proto`](android/app/src/main/proto/polo.proto) and
  [`remotemessage.proto`](android/app/src/main/proto/remotemessage.proto).
- The React Native UI (`src/`) talks to the native module through `src/native/TvRemote.ts`.

Tests: `npm test` (JS) and `./build-debug.sh app:testDebugUnitTest` (Kotlin, including a
known-answer test for the pairing secret).

## Troubleshooting

- **TV not found:** the phone and TV must be on the same Wi-Fi. Guest networks and "AP
  isolation" block discovery. Use **Add TV by IP** instead.
- **Pairing fails, or the app says "Pair again":** pair again from the TV's details. You
  can remove old entries on the TV under Settings → Remotes & Accessories.
- **No notification controls:** check **Settings → Notification controls** in the app, and
  that Android allows AltRemote's notifications.
- **Samsung + USB debugging:** turn off **Auto Blocker** (Settings → Security and
  privacy). A USB `error -71` means a bad cable or port, so try wireless debugging.

## Credits

Protocol details were checked against
[`androidtvremote2`](https://github.com/tronikos/androidtvremote2) (Python) and
[`androidtv-remote`](https://github.com/louis49/androidtv-remote) (Node).

## License

[MIT](LICENSE). Not affiliated with or endorsed by Google. "Google TV" and "Android TV"
are trademarks of Google LLC.
