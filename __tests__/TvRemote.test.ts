import { NativeModules } from 'react-native';

const fakeIdentity = {
  subject: 'CN=AltRemote',
  serialNumber: 'abc',
  notBefore: 0,
  notAfter: 1,
  keySizeBits: 2048,
  sha256Fingerprint: 'AA:BB',
  securityLevel: 'TEE',
  created: true,
};

describe('TvRemote wrapper', () => {
  afterEach(() => {
    jest.resetModules();
    delete (NativeModules as Record<string, unknown>).TvRemote;
  });

  it('forwards identity calls to the native module', async () => {
    NativeModules.TvRemote = {
      generateIdentityIfNeeded: jest.fn().mockResolvedValue(fakeIdentity),
      sendKey: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    const { TvRemote } = require('../src/native/TvRemote');

    await expect(TvRemote.generateIdentityIfNeeded()).resolves.toEqual(fakeIdentity);
    await TvRemote.sendKey(19);
    expect(NativeModules.TvRemote.sendKey).toHaveBeenCalledWith(19, 'SHORT');
  });

  it('rejects with a clear error when the native module is missing', async () => {
    const { TvRemote } = require('../src/native/TvRemote');
    await expect(TvRemote.getIdentityInfo()).rejects.toThrow(/native module not found/);
  });
});
