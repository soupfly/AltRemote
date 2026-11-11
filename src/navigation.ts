import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Devices: undefined;
  TvDetail: { id: string };
  Pairing: { id: string };
  Remote: { id: string };
  Identity: undefined;
  Settings: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
