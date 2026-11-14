import { SHOWCASE_EXAMPLES } from './showcaseCatalog';

export const STARTUP_PRESETS = SHOWCASE_EXAMPLES.map(example => ({
  id: example.id,
  title: example.title,
  description: example.description,
  showcaseId: example.id,
}));

export type StartupPresetId = (typeof STARTUP_PRESETS)[number]['id'];
