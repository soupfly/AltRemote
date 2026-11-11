import { useDevices } from '../src/store/devices';
import { manualTv, tvFromService } from '../src/store/deviceUtils';

const livingRoom = {
  name: 'Living Room TV',
  host: '192.168.0.31',
  port: 6466,
  attributes: { bt: 'AA:BB:CC:DD:EE:01' },
};

beforeEach(() => {
  useDevices.setState({ saved: [], discovered: {}, reachability: {} });
});

describe('saveTv', () => {
  it('adding a saved TV again by IP keeps the original record', () => {
    const store = useDevices.getState();
    const firstId = store.saveTv(tvFromService(livingRoom));

    const againId = store.saveTv(manualTv('Other name', '192.168.0.31'));

    const { saved } = useDevices.getState();
    expect(againId).toBe(firstId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: 'bt:AA:BB:CC:DD:EE:01',
      name: 'Living Room TV',
      btMac: 'AA:BB:CC:DD:EE:01',
      source: 'mdns',
    });
  });

  it('markPaired saves the TV with its certificate fingerprint and keeps it on re-save', () => {
    const tv = tvFromService(livingRoom);
    const id = useDevices.getState().markPaired(tv, 'AB:CD');
    useDevices.getState().saveTv(manualTv('', '192.168.0.31'));

    const [saved] = useDevices.getState().saved;
    expect(saved.id).toBe(id);
    expect(saved.pairing?.serverCertFingerprint).toBe('AB:CD');
    expect(saved.pairing?.pairedAt).toEqual(expect.any(Number));
  });

  it('a manually added TV picks up its MAC and new IP from discovery', () => {
    useDevices.getState().saveTv(manualTv('Living room', '192.168.0.31'));
    useDevices.getState().upsertDiscovered(livingRoom);
    useDevices.getState().upsertDiscovered({ ...livingRoom, host: '192.168.0.77' });

    expect(useDevices.getState().saved[0]).toMatchObject({
      name: 'Living room',
      host: '192.168.0.77',
      btMac: 'AA:BB:CC:DD:EE:01',
    });
  });
});
