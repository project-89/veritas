import { Controller, Get } from '@nestjs/common';
import { getInstalledPluginManifests } from '../../../../../libs/shared/src/lib/plugins/plugin-registry';

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
