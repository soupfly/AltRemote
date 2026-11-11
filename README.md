# AltRemote

An Android app (React Native + Kotlin) that replaces the Google TV remote.
It finds TVs on your Wi-Fi, pairs using the code shown on the TV, and sends
D-pad, media, volume, power, text input and app-launch commands.

It uses Google's **Android TV Remote protocol v2**, the same one the official
Google TV app uses, so the TV needs no ADB, developer mode or root, and nothing
goes through the cloud.

> **Status:** all 7 build steps done (v1.0). Tested end to end on a Galaxy A15 5G
> with a Skyworth Google TV: discovery, pairing, D-pad / touchpad, media keys, live volume,
> app shortcuts, typing on the TV, haptics, themes, auto-reconnect, notification and
> lock-screen controls, and a signed release APK.

## Features

- Automatic TV discovery (mDNS `_androidtvremote2._tcp`) or add by IP
- Pairing with the 6-character code on the TV
- D-pad ring or swipe touchpad, Back, Home, Power, Assistant, Settings, Input
- Volume and mute with a live volume bar from the TV
- Media controls, a keyboard for sending text, and editable app shortcuts
  (YouTube, Netflix, Disney+, Prime Video, Plex, Spotify)
- Haptics, dark/light themes, and lock-screen and notification controls

## How it works

| Port | Purpose |
|------|---------|
| 6467 | Pairing ("polo" protocol). TLS with a client certificate. The TV shows a code, and the app proves it knows the code with a SHA-256 secret built from both certificates. |
| 6466 | Remote session. TLS with the same certificate. Varint length-prefixed protobuf `RemoteMessage`s for keys, volume, app launch, IME text and pings. |

The networking lives in a native Kotlin module (`android/.../tvremote/`)
because JavaScript TLS libraries don't handle client-certificate auth reliably.
The React Native UI talks to it through a typed wrapper in `src/native/TvRemote.ts`.

## Tech stack

- React Native + TypeScript (strict), Android only (minSdk 26)
- Kotlin native module: TLS, protobuf-lite, coroutines, Android Keystore
- Zustand (state), React Navigation (screens)

## Project structure

```
android/app/src/main/java/.../tvremote/   Kotlin: TlsClient, PairingManager, RemoteSession, CertManager, Module
android/app/src/main/proto/               polo.proto, remotemessage.proto
src/native/TvRemote.ts                    typed JS wrapper + event emitter
src/store/                                devices, connection, settings
src/screens/                              DeviceList, Pairing, Remote, Settings
src/components/                           DPad, Touchpad, VolumeBar, AppRow, KeyButton
src/constants/keycodes.ts                 Android KeyEvent codes
docs/                                     spec and notes
```

## Development setup (Linux Mint / Ubuntu)

1. Install the toolchain (JDK 17, Node.js LTS via nvm, Android SDK, adb USB rules):

   ```bash
   ./setup-altremote-dev.sh
   ```

   Add `--with-emulator` for the Android emulator (needs KVM and at least 4 GB of RAM)
   or `--with-studio` for Android Studio. Log out and back in afterwards.

2. Connect a phone with wireless debugging:
   - Phone: **Settings → Developer options → Wireless debugging → On**
   - First time only: **Pair device with pairing code**, then run `./adb-phone.sh pair`
   - After that, reconnect with:

     ```bash
     ./adb-phone.sh
     ```

     The script finds the phone's current port automatically. Set `PHONE_IP=<ip>`
     if the phone's address isn't 192.168.0.22.

3. Run the app (once the project exists):

   ```bash
   npm install
   npx react-native run-android
   ```

   If more than one device is connected, add `--deviceId <id from adb devices>`.

   Build notes:
   - Requires `JAVA_HOME` (JDK 17) and `ANDROID_HOME` (`~/Android/Sdk`), which
     `setup-altremote-dev.sh` adds to `~/.bashrc`.
   - The build only targets `arm64-v8a` (real phones) to save time and memory. For the
     x86_64 emulator, run with `-PreactNativeArchitectures=x86_64` or edit
     `android/gradle.properties`.
   - Gradle is capped at 1.5 GB of heap, and Kotlin compiles in-process, so it fits a
     machine with 4 GB of RAM. Close the emulator while building.

## Testing step 1 (client identity)

1. Run the app on the phone. The screen shows **"New identity created"** with an
   RSA 2048-bit certificate, where the key is stored (TEE or StrongBox on most phones),
   and its SHA-256 fingerprint.
2. Close the app fully, then reopen it. It should say **"Identity loaded from Keystore"**
   with the **same fingerprint**.
3. **Reset identity** creates a new certificate with a different fingerprint. Later, that
   means every TV has to be paired again.
4. Unit tests: `npm test`.

The identity screen is now opened from **Identity** at the top right of the device list.

## Testing step 2 (discovery and device list)

1. Open the app with the TV on. Within a few seconds your TV appears under
   **On this network** with a green dot and its IP.
2. Tap it to see the details: IP, port and the TV's Bluetooth MAC (used as a stable id).
   **Check connection** should show both ports (6466 and 6467) open. **Save to My TVs**
   moves it to the **My TVs** section, and the list keeps it after restarting the app.
3. Turn the TV fully off, or unplug it, and pull down to refresh: the saved TV stays
   listed, marked "not seen on network".
4. **Add TV by IP**: enter the TV's IP. The app checks that the ports answer before saving.
   An address with nothing on it offers "Save anyway".

Discovery uses Android's `NsdManager` (`android/.../tvremote/TvDiscovery.kt`), so no
extra library or permission is needed. It pauses while the app is in the background.

## Testing step 3 (pairing)

1. Open a TV from the list and tap **Pair with this TV**. The TV shows a 6-character code.
2. Type it on the app's keypad. After the 6th character the app checks it:
   - A typo is caught on the phone before anything is sent ("doesn't match"), and you
     can retry with the same code.
   - On success: **Paired with …** ✓. The TV is saved with its certificate fingerprint,
     and the list shows "· paired". The pairing record survives restarting the app.
3. Debug builds log the whole exchange: `adb logcat -s AltRemote.Pairing`.
4. Kotlin unit tests (pairing secret known-answer test, varint framing):
   `./build-debug.sh app:testDebugUnitTest`.

Protocol: [polo.proto](android/app/src/main/proto/polo.proto) (TLS on 6467):
PairingRequest → Options → Configuration → *(TV shows code)* → Secret → SecretAck.
The secret is SHA-256 of client modulus, client exponent, server modulus, server
exponent and the last 4 hex characters of the code; the first byte of the hash must
equal the first 2 hex characters.

Builds: use `./build-debug.sh`. It stops the build if free RAM gets below 300 MB, so the
machine doesn't freeze. If it trips, stop Metro and close the browser, then retry.

## Testing step 4 (remote control)

1. Tap a paired TV in the list: the remote opens and connects. The banner shows
   **Connected** and the TV's current app.
2. Press the D-pad, OK, Back and Home: the TV should react right away. Hold OK for a long
   press (opens context menus). Hold − / + to repeat volume.
3. Leave the remote open for more than 20 seconds: it stays connected, because the app
   answers the TV's pings (every ~5 s; the connection drops after 16 s of silence).
4. Watch the traffic: `adb logcat -s AltRemote.Remote` shows the handshake
   (Configure → SetActive → Start / Volume / current app) and every key sent.

Protocol: [remotemessage.proto](android/app/src/main/proto/remotemessage.proto) on TLS
port 6466 with the same client certificate. `key_code` is an Android `KeyEvent` code
(see `src/constants/keycodes.ts`). The TV's certificate fingerprint saved at pairing is
checked on every connection. A mismatch, or a TV that refuses the certificate, shows
**Pair again**.

## Testing step 5 (TV state, apps, keyboard)

1. **Current app:** the banner shows the app open on the TV by name (e.g. "Connected ·
   YouTube"). Unknown apps get a name made from their package.
2. **Volume bar:** shows the level the TV reports, and updates as you press − / + (or use
   the TV's own remote). Holding − / + repeats.
3. **App row:** tap a tile to open that app on the TV. Long-press a tile, or tap **Edit**,
   to reorder, remove, add more known apps, or add a custom app by deep link
   (`https://…`, `plex://`) or package name (opened with `market://launch?id=<package>`).
4. **Keyboard:** select a search box on the TV, then tap ⌨. The app also opens the
   keyboard by itself when the TV shows its own. Letters appear on the TV as you type, and
   backspace removes them. **Enter ⏎** submits. The TV inserts text at its cursor, so the
   app sends only the changes (new characters, or Delete presses). **Clear** removes
   what you typed from the phone. The TV doesn't report text already in its field.
5. Buttons send on release, so scrolling the remote with your thumb on a button sends
   nothing.

## Testing step 6 (touchpad, haptics, settings, reconnect)

1. **Touchpad:** on the remote, switch **D-pad | Touchpad**. Swipe to move (one arrow
   per finger-width, so a long swipe moves several items), tap for OK, hold for a long
   OK. The page doesn't scroll while your finger is on the pad.
2. **Haptics:** every button press gives a short vibration. Turn it off in
   **Settings → Haptic feedback**. It also follows the phone's own "touch feedback"
   setting and still works with Do Not Disturb on (it uses Android's touch-vibration
   channel, in `android/.../tvremote/Haptics.kt`).
3. **Settings** (top right of the TV list): haptics, which control the remote opens
   with, theme (System / Dark / Light), your TVs, and the client identity.
4. **Rename a TV:** open it (Settings → My TVs, or Details on the remote) and edit
   **Name**.
5. **Reconnect:** with the remote open, turn the phone's Wi-Fi off for a few seconds and
   back on. The banner shows "Reconnecting in N s…" and connects again by itself
   (backoff 1, 2, 4 … 30 s, and right away when Wi-Fi returns or the app comes back to
   the front). Pairing problems aren't retried; they show **Pair again**.

## Testing step 7 (notification controls, release build)

1. **Notification and lock-screen remote:** while connected, pull down the notification
   shade. Collapsed it shows Vol −, Play/Pause and Vol +. Expand it for Back / Up / Home,
   Left / OK / Right, Vol − / Down / Vol +, Play/Pause, Mute and ✕ (disconnect). The same
   controls show on the lock screen. Turn it off in **Settings → Notification controls**.
2. The first time, Android 13+ asks for notification permission. The notification
   appears as soon as you allow it.
3. The notification runs as a foreground service (`RemoteControlService`). This also keeps
   the connection alive in the background; without it, Samsung phones freeze the app and
   block its network within about a minute. Swiping the app away from Recents disconnects.
4. Losing Wi-Fi now drops the connection within a second (instead of after the 16 s idle
   timeout) and reconnects when Wi-Fi returns.

## Release build (install without the computer)

```bash
./build-debug.sh app:assembleRelease
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk` (about 26 MB,
arm64). The JavaScript is bundled inside, so it doesn't need Metro. Install it with
`adb install -r android/app/build/outputs/apk/release/app-release.apk`, or copy it to the
phone and open it.

Signing:
- The release key is `android/app/altremote-release.keystore`, and its passwords are in
  `android/keystore.properties`. Both are git-ignored. **Back both up somewhere safe.**
  Every update must be signed with the same key, or Android refuses to install it over
  the existing app.
- Without `keystore.properties`, release builds fall back to the debug key, so the project
  still builds on another machine.
- Debug builds use the app ID `com.altremote.debug`, so the development and release
  versions can be installed side by side. Each has its own pairing with the TV.

The first release build on a 4 GB machine can trip the memory watchdog during
`mergeExtDexRelease`. Run it again: finished steps are cached, and the retry completes.

## Roadmap

1. [x] Project scaffold, native module stub, client certificate generation and storage
2. [x] mDNS discovery and the device list screen
3. [x] Pairing flow, end to end against a real Google TV
4. [x] Remote session: key injection, ping handling, basic remote screen
5. [x] Volume/app/power state, app launcher, text input
6. [x] Touchpad mode, haptics, settings, reconnect logic
7. [x] Notification and lock-screen controls, polish, signed release APK

## Troubleshooting

- **TV not discovered:** the phone and TV must be on the same Wi-Fi network.
  Guest networks and routers with "AP/client isolation" block discovery.
  Use **Add by IP** as a fallback.
- **The emulator can't discover TVs:** it sits behind its own NAT, so mDNS
  doesn't reach it. Use Add by IP, or test on a real phone.
- **Pairing fails or the TV rejects the app:** forget the TV in the app and pair again.
  On the TV you can also remove old devices under Settings → Remotes & Accessories.
- **USB connection fails with `error -71` in `dmesg`:** the cable or port is bad.
  Use another cable, or use wireless debugging.
- **Samsung phones:** turn off **Auto Blocker** (Settings → Security and privacy),
  or USB debugging is blocked.

- **adb-phone.sh can't connect after Wi-Fi changes:** the phone may still advertise an
  old wireless-debugging port. The script tries every advertised port. If none answer,
  turn **Wireless debugging** off and on again.
- **No notification controls:** check **Settings → Notification controls** in the app,
  and that notifications for AltRemote are allowed in Android's settings.

## References

- [`androidtvremote2`](https://github.com/tronikos/androidtvremote2) (Python)
- [`androidtv-remote`](https://github.com/louis49/androidtv-remote) (Node)

## License

[MIT](LICENSE). Not affiliated with or endorsed by Google. "Google TV" and "Android TV"
are trademarks of Google LLC.
