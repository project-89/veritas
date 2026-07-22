import { Controller, Get, Query } from '@nestjs/common';
import { AisStreamService, type VesselRecord } from '@veritas/analysis';

/**
 * Live commercial-vessel positions (cargo + tankers) from AISStream, filtered
 * to the major shipping chokepoints. Separate from the global event feed:
 * these are continuous position telemetry, not discrete events. Empty until
 * AISSTREAM_API_KEY is configured (see /capabilities.maritime).
 */
@Controller('maritime')
export class MaritimeController {
  constructor(private readonly ais: AisStreamService) {}

  @Get('vessels')
  getVessels(@Query('limit') limit?: string): {
    available: boolean;
    count: number;
    vessels: VesselRecord[];
  } {
    const vessels = this.ais.available
      ? this.ais.getVessels(Math.min(Number(limit) || 500, 2000))
      : [];
    return { available: this.ais.available, count: vessels.length, vessels };
  }
}
