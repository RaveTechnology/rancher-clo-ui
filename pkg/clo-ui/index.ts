import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

export default function(plugin: IPlugin): void {
  importTypes(plugin);
  plugin.addLocale('ru-ru', 'Русский');
  plugin.metadata = require('./package.json');
  plugin.register('image', 'providers/clo.svg', require('./clo.svg'));
}
