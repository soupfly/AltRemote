import {
  isValidIPv4,
  manualTv,
  mergeDevices,
  tvFromService,
} from '../src/store/deviceUtils';

const livingRoom = {
  name: 'Living Room TV',
  host: '192.168.0.31',
  port: 6466,
  attributes: { bt: 'aa:bb:cc:dd:ee:01', isDeviceInStandbyMode: 'false' },
};

describe('isValidIPv4', () => {
  it.each(['192.168.0.31', '10.0.0.1', '255.255.255.255', ' 192.168.0.31 '])('accepts %s', ip =>
    expect(isValidIPv4(ip)).toBe(true),
  );
  it.each(['', '192.168.0', '192.168.0.256', '192.168.00.1', 'abc.def.ghi.jkl', '1.2.3.4.5'])(
    'rejects %s',
    ip => expect(isValidIPv4(ip)).toBe(false),
  );
});

describe('tvFromService', () => {
  it('uses the Bluetooth MAC as a stable id', () => {
    const tv = tvFromService(livingRoom);
    expect(tv.id).toBe('bt:AA:BB:CC:DD:EE:01');
    expect(tv.btMac).toBe('AA:BB:CC:DD:EE:01');
    expect(tv.source).toBe('mdns');
  });

  it('falls back to the IP when there is no MAC', () => {
    expect(tvFromService({ ...livingRoom, attributes: {} }).id).toBe('ip:192.168.0.31');
  });
});

describe('mergeDevices', () => {
  it('lists saved TVs first, then new ones, without duplicates', () => {
    const saved = [manualTv('Bedroom', '192.168.0.50'), manualTv('', '192.168.0.31')];
    const discovered = [tvFromService(livingRoom), tvFromService({ ...livingRoom, name: 'Den', host: '192.168.0.40', attributes: { bt: 'aa' } })];

    const rows = mergeDevices(saved, discovered);

    expect(rows.map(r => [r.name, r.saved, r.online])).toEqual([
      ['Bedroom', true, false],
      ['TV at 192.168.0.31', true, true], // matched to the discovered TV by IP
      ['Den', false, true],
    ]);
  });

  it("follows a saved TV to its new IP when it's discovered by MAC", () => {
    const saved = [{ ...tvFromService(livingRoom), name: 'Living room' }];
    const moved = tvFromService({ ...livingRoom, host: '192.168.0.77' });

    const [row] = mergeDevices(saved, [moved]);

    expect(row).toMatchObject({ name: 'Living room', host: '192.168.0.77', online: true, saved: true });
  });
});
