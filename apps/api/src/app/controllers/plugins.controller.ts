import { Controller, Get } from '@nestjs/common';
/* eslint-disable-next-line @nx/enforce-module-boundaries -- plugin manifest endpoint reads the shared runtime registry */
import { getInstalledPluginManifests } from '@veritas/shared/plugins';

@Controller('plugins')
export class PluginsController {
  @Get('manifest')
  getManifest() {
    return {
      plugins: getInstalledPluginManifests(),
      generatedAt: new Date().toISOString(),
    };
  }
}
