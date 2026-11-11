/**
 * AltRemote: an alternative Google TV remote.
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TvRemote from './src/native/TvRemote';
import type { RootStackParamList } from './src/navigation';
import { DeviceListScreen } from './src/screens/DeviceListScreen';
import { IdentityScreen } from './src/screens/IdentityScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { RemoteScreen } from './src/screens/RemoteScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TvDetailScreen } from './src/screens/TvDetailScreen';
import { ThemeProvider, navTheme, useColors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  useEffect(() => {
    // Make sure the client certificate exists before any pairing happens.
    TvRemote.generateIdentityIfNeeded().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const colors = useColors();
  return (
    <>
      <StatusBar barStyle={colors.dark ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme(colors)}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}>
          <Stack.Screen
            name="Devices"
            component={DeviceListScreen}
            options={{ title: 'AltRemote' }}
          />
          <Stack.Screen name="TvDetail" component={TvDetailScreen} options={{ title: 'TV' }} />
          <Stack.Screen name="Pairing" component={PairingScreen} options={{ title: 'Pair' }} />
          <Stack.Screen name="Remote" component={RemoteScreen} options={{ title: 'Remote' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen
            name="Identity"
            component={IdentityScreen}
            options={{ title: 'Client identity' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default App;
