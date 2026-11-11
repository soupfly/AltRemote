/**
 * Android KeyEvent codes sent to the TV (remote_key_inject.key_code).
 * https://developer.android.com/reference/android/view/KeyEvent
 */
export const KeyCode = {
  HOME: 3,
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  ENTER: 66,
  DEL: 67,
  MENU: 82,
  SEARCH: 84,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_STOP: 86,
  MEDIA_NEXT: 87,
  MEDIA_PREVIOUS: 88,
  MEDIA_REWIND: 89,
  MEDIA_FAST_FORWARD: 90,
  VOLUME_MUTE: 164,
  TV_INPUT: 178,
  SETTINGS: 176,
  ASSIST: 219,
} as const;

export type KeyName = keyof typeof KeyCode;
