import type { ScanProgressEvent } from '../../src/lib/services/scan-events.service';
import { ScanEventsService } from '../../src/lib/services/scan-events.service';

describe('ScanEventsService', () => {
  let service: ScanEventsService;

  beforeEach(() => {
    service = new ScanEventsService();
  });

  it('delivers emitted events to subscribers of the same scan', () => {
    const received: ScanProgressEvent[] = [];
    const subscription = service.streamFor('scan-1').subscribe((event) => received.push(event));

    service.emit({
      kind: 'scan-status',
      scanId: 'scan-1',
      connector: 'reddit',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      kind: 'scan-status',
      scanId: 'scan-1',
      connector: 'reddit',
      status: 'running',
    });

    subscription.unsubscribe();
  });

  it('filters out events for other scans', () => {
    const received: ScanProgressEvent[] = [];
    const subscription = service.streamFor('scan-1').subscribe((event) => received.push(event));

    service.emit({
      kind: 'scan-status',
      scanId: 'scan-2',
      connector: 'reddit',
      status: 'done',
      postCount: 5,
      timestamp: new Date().toISOString(),
    });
    service.emit({
      kind: 'analysis-job',
      scanId: 'scan-3',
      jobId: 'job-1',
      jobType: 'propaganda',
      status: 'completed',
      timestamp: new Date().toISOString(),
    });

    expect(received).toHaveLength(0);

    subscription.unsubscribe();
  });

  it('streams both scan-status and analysis-job events for the same scan', () => {
    const received: ScanProgressEvent[] = [];
    const subscription = service.streamFor('scan-1').subscribe((event) => received.push(event));

    service.emit({
      kind: 'scan-status',
      scanId: 'scan-1',
      connector: 'twitter',
      status: 'failed',
      error: 'boom',
      timestamp: new Date().toISOString(),
    });
    service.emit({
      kind: 'analysis-job',
      scanId: 'scan-1',
      jobId: 'job-1',
      jobType: 'investigation',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    expect(received.map((event) => event.kind)).toEqual(['scan-status', 'analysis-job']);

    subscription.unsubscribe();
  });

  it('supports multiple independent subscribers', () => {
    const first: ScanProgressEvent[] = [];
    const second: ScanProgressEvent[] = [];
    const subA = service.streamFor('scan-1').subscribe((event) => first.push(event));
    const subB = service.streamFor('scan-1').subscribe((event) => second.push(event));

    service.emit({
      kind: 'scan-status',
      scanId: 'scan-1',
      connector: 'bluesky',
      status: 'done',
      postCount: 3,
      insightCount: 3,
      timestamp: new Date().toISOString(),
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);

    subA.unsubscribe();
    subB.unsubscribe();
  });
});
