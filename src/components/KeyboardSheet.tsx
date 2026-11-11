import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyCode } from '../constants/keycodes';
import TvRemote, { errorCode } from '../native/TvRemote';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { textDiff } from './textDiff';

interface Props {
  visible: boolean;
  /** Text already in the TV's field when its keyboard opened */
  initialText?: string;
  onClose: () => void;
}

const SEND_DELAY_MS = 150;

/**
 * Type on the phone, text appears on the TV.
 *
 * The TV inserts received text at its cursor rather than replacing the field, so only the
 * change since the last send goes out (see textDiff): Delete presses for removed
 * characters, then the new characters. Sends are queued so they reach the TV in order.
 */
export function KeyboardSheet({ visible, initialText = '', onClose }: Props) {
  const { styles, colors } = useStyles();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What the TV's field contains, as far as we know */
  const sent = useRef(initialText);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (visible) {
      setText(initialText);
      sent.current = initialText;
      setError(undefined);
    }
  }, [visible, initialText]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job).then(
      () => setError(undefined),
      e =>
        setError(
          errorCode(e) === 'NOT_CONNECTED'
            ? 'Not connected to the TV.'
            : `Couldn't send text: ${(e as Error).message}`,
        ),
    );
  };

  const sync = (value: string) =>
    enqueue(async () => {
      const { deletes, insert } = textDiff(sent.current, value);
      for (let i = 0; i < deletes; i++) {
        await TvRemote.sendKey(KeyCode.DEL);
      }
      if (insert) {
        await TvRemote.sendText(insert);
      }
      sent.current = value;
    });

  const onChange = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sync(value), SEND_DELAY_MS);
  };

  const submit = () => {
    if (timer.current) clearTimeout(timer.current);
    sync(text);
    enqueue(() => TvRemote.sendKey(KeyCode.ENTER));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close keyboard" />
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Type on TV</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.help}>
            Select a search box or text field on the TV first. What you type here appears there.
          </Text>
          <TextInput
            value={text}
            onChangeText={onChange}
            autoFocus
            placeholder="Type here…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={submit}
            accessibilityLabel="Text to send to the TV"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttons}>
            <Button
              label="Clear"
              onPress={() => onChange('')}
              style={styles.flex}
            />
            <Button label="Enter ⏎" variant="primary" onPress={submit} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(colors => ({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 28,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  help: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  input: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 18,
    backgroundColor: colors.bg,
  },
  error: { color: colors.danger, marginTop: 10, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  flex: { flex: 1 },
}));
