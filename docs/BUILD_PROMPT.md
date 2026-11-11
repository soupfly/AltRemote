# Build: "AltRemote" — a React Native Android app that controls Google TV

## Goal
Build an Android phone app in React Native (TypeScript) that works as a full replacement
for the Google TV remote. It should find TVs on the local Wi-Fi, pair with one using the
on-screen code, and send D-pad, media, volume, power, text input and app-launch commands.
It must use Google's own Android TV Remote protocol v2, the same one the official
Google TV app uses. No ADB, no developer mode, no root, no cloud services.

## Tech stack
- React Native (bare workflow or Expo with a custom dev client, not Expo Go), TypeScript strict mode
- Android only (minSdk 26). Keep the code structured so iOS could be added later
- A native Kotlin module for the TLS and protobuf networking. JS TLS libraries don't handle
  client-certificate auth reliably, so don't rely on them
- `react-native-zeroconf` (or an NSD-based native module) for mDNS discovery
- Zustand for state, React Navigation for screens
- Secure storage for the client certificate/key (Android Keystore through the native module)
- Haptics (`react-native-haptic-feedback`)

## Protocol requirements (implement exactly)
1. **Discovery**: browse mDNS for `_androidtvremote2._tcp`. Show the TV name, IP and port.
   Also let the user add a TV manually by IP.
2. **Client identity**: on first launch, generate an RSA 2048 key pair and a self-signed X.509
   certificate. Store them in Android Keystore and reuse them for every connection.
3. **Pairing (port 6467, TLS with client cert)**:
   - Send PairingRequest (service name, client name), then Options (hexadecimal encoding,
     6 symbols, role input), then Configuration
   - The TV displays a 6-character hex code, which the user types into the app
   - Compute the secret as SHA-256 over: client cert modulus, client exponent, server cert
     modulus, server exponent, and the bytes of the last 4 hex characters of the code.
     The first byte of the hash must equal the first byte of the code. Check this before
     sending, and show an error if it doesn't match
   - Send PairingSecret and wait for the ACK. Save the paired TV (name, IP, cert fingerprint)
4. **Remote session (port 6466, TLS with the same client cert)**:
   - All messages are varint length-prefixed protobuf (`RemoteMessage`)
   - Handle the configure/set-active handshake
   - Reply to `remote_ping_request` with `remote_ping_response`, or the TV drops the connection
   - Send key events with `remote_key_inject` (KeyCode plus direction SHORT / START_LONG / END_LONG)
   - Read volume level and muted state from `remote_set_volume_level`. Read the current app and
     power state from the incoming messages
   - Launch apps with `remote_app_link_launch_request` (deep link URL)
   - Send text with the IME messages (`remote_ime_batch_edit`)
5. Include the `.proto` definitions (pairing message and remote message) in the repo and
   generate Kotlin classes with the protobuf-lite Gradle plugin.
6. Reconnect automatically with exponential backoff when the network changes or the app
   returns to the foreground. If the TV rejects the cert, ask the user to pair again.

## Native module API (exposed to JS)
```ts
generateIdentityIfNeeded(): Promise<void>
startPairing(host: string): Promise<void>        // TV shows code
finishPairing(code: string): Promise<void>
connect(host: string): Promise<void>
disconnect(): Promise<void>
sendKey(keyCode: number, direction: 'SHORT'|'START_LONG'|'END_LONG'): Promise<void>
launchApp(url: string): Promise<void>
sendText(text: string): Promise<void>
// Events: onConnectionState, onVolume, onCurrentApp, onPowerState, onError
```

## Screens and UX
1. **Device list**: discovered and saved TVs, connection status dots, pull to refresh,
   "Add by IP"
2. **Pairing**: instructions, a large 6-character code input with an auto-uppercase hex
   keypad, clear error states
3. **Remote (main screen)**:
   - A D-pad ring with a center OK button, plus a toggle for a **swipe touchpad mode**
     (swipe = direction, tap = OK, long-press = long OK)
   - Back, Home, Power, Google Assistant/Search, Settings, Input
   - Volume +/−, Mute, with a live volume bar from the TV's reported level.
     Holding volume repeats the key
   - Media: play/pause, rewind, fast-forward, previous, next
   - A keyboard button that opens a text field and sends text to the TV
   - An app shortcut row (YouTube, Netflix, Disney+, Prime Video, Plex, Spotify) using deep
     links. The user can edit the row
   - Haptic feedback on every press
4. **Settings**: forget TV, rename TV, haptics on/off, D-pad vs touchpad default, dark/light/system theme
5. **Extras**: a persistent notification and a lock-screen media-style control with
   volume, play/pause and D-pad. Optionally a Quick Settings tile

Design: dark-first, big touch targets (min 56dp), works one-handed, follows Material 3 styling.

## Project structure
```
/android/app/src/main/java/.../tvremote/   (Kotlin: TlsClient, PairingManager, RemoteSession, CertManager, Module)
/android/app/src/main/proto/               (polo.proto, remotemessage.proto)
/src/native/TvRemote.ts                    (typed JS wrapper + event emitter)
/src/store/                                (devices, connection, settings)
/src/screens/                              (DeviceList, Pairing, Remote, Settings)
/src/components/                           (DPad, Touchpad, VolumeBar, AppRow, KeyButton)
/src/constants/keycodes.ts                 (Android KeyEvent codes used)
```

## Build order (pause after each step and show me how to test it)
1. Project scaffold, a native module stub, and certificate generation and storage
2. mDNS discovery plus the device list screen
3. Pairing flow, end to end against a real Google TV
4. Remote session with key injection and ping handling, then the basic remote screen
5. Volume/app/power state events, the app launcher, text input
6. Touchpad mode, haptics, settings, reconnect logic
7. Notification/lock-screen controls, polish, a release APK build

## Quality bar
- Unit tests for the pairing secret computation (known-answer test) and the varint framing
- No blocking calls on the UI thread. All socket I/O runs in coroutines
- Log all protocol traffic in debug builds only
- A README covering setup, `npx react-native run-android`, how to build a signed APK,
  and troubleshooting (same Wi-Fi network, AP/client isolation, re-pairing)
- If any protocol detail is uncertain, check it against the open-source
  `androidtvremote2` (Python) and `androidtv-remote` (Node) implementations rather than guessing
