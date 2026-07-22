import { AisStreamService, classifyShipType, parseAisMessage } from './ais-stream.service';

describe('classifyShipType', () => {
  it('maps AIS type ranges to classes', () => {
    expect(classifyShipType(70)).toBe('cargo');
    expect(classifyShipType(79)).toBe('cargo');
    expect(classifyShipType(80)).toBe('tanker');
    expect(classifyShipType(89)).toBe('tanker');
    expect(classifyShipType(60)).toBe('other'); // passenger
    expect(classifyShipType(undefined)).toBe('other');
  });
});

describe('parseAisMessage', () => {
  it('extracts position + speed from a PositionReport', () => {
    const u = parseAisMessage({
      MessageType: 'PositionReport',
      MetaData: { MMSI: 111, ShipName: 'PACIFIC TRADER ', latitude: 26.1, longitude: 56.3 },
      Message: { PositionReport: { Latitude: 26.1, Longitude: 56.3, Sog: 12.4, Cog: 210 } },
    });
    expect(u).toMatchObject({ mmsi: 111, name: 'PACIFIC TRADER', lat: 26.1, lng: 56.3, sog: 12.4, cog: 210 });
  });

  it('extracts ship type + destination from ShipStaticData', () => {
    const u = parseAisMessage({
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 222, ShipName: 'CRUDE HAULER' },
      Message: { ShipStaticData: { Type: 80, Destination: 'SGSIN' } },
    });
    expect(u).toMatchObject({ mmsi: 222, shipType: 80, destination: 'SGSIN' });
  });

  it('returns null without an MMSI', () => {
    expect(parseAisMessage({ MessageType: 'PositionReport', MetaData: {} })).toBeNull();
    expect(parseAisMessage(null)).toBeNull();
  });
});

describe('AisStreamService store', () => {
  it('keeps cargo/tankers and drops other vessel types', () => {
    const svc = new AisStreamService();
    svc.applyUpdate({ mmsi: 1, name: 'BOX SHIP', lat: 1, lng: 2, shipType: 70 }, 1000);
    svc.applyUpdate({ mmsi: 2, name: 'FERRY', lat: 3, lng: 4, shipType: 60 }, 1000);
    const v = svc.getVessels();
    expect(v).toHaveLength(1);
    expect(v[0]?.mmsi).toBe(1);
    expect(v[0]?.shipClass).toBe('cargo');
  });

  it('enriches an existing record from a later static-data message', () => {
    const svc = new AisStreamService();
    svc.applyUpdate({ mmsi: 5, lat: 10, lng: 20, shipType: 80 }, 1000);
    svc.applyUpdate({ mmsi: 5, destination: 'AEJEA', shipType: 80 }, 2000);
    const [v] = svc.getVessels();
    expect(v?.destination).toBe('AEJEA');
    expect(v?.shipClass).toBe('tanker');
  });

  it('drops a vessel once it is reclassified as non-cargo/tanker', () => {
    const svc = new AisStreamService();
    svc.applyUpdate({ mmsi: 9, lat: 1, lng: 1, shipType: 70 }, 1000);
    expect(svc.getVessels()).toHaveLength(1);
    svc.applyUpdate({ mmsi: 9, shipType: 30 }, 2000); // fishing
    expect(svc.getVessels()).toHaveLength(0);
  });

  it('returns most-recently-seen first, respecting the limit', () => {
    const svc = new AisStreamService();
    svc.applyUpdate({ mmsi: 1, lat: 1, lng: 1, shipType: 70 }, 1000);
    svc.applyUpdate({ mmsi: 2, lat: 2, lng: 2, shipType: 70 }, 3000);
    svc.applyUpdate({ mmsi: 3, lat: 3, lng: 3, shipType: 70 }, 2000);
    expect(svc.getVessels(2).map((v) => v.mmsi)).toEqual([2, 3]);
  });
});
