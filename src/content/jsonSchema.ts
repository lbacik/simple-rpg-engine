// Editor JSON Schemas generated from the Zod definitions (see schema.ts).
//
// `buildJsonSchemas` converts each file kind with `z.toJSONSchema` and fixes
// one mismatch: Zod marks fields with `.default()` as required in the JSON
// Schema output, but an omitted key is valid (it resolves to its default),
// so defaulted keys are pruned from every `required` list. Refinements that
// only the loader enforces (the Template point sum, mutually exclusive keys,
// the narration rules) cannot be expressed here; the CLI remains their only
// enforcer (docs/spec/validation.md).

import { z } from 'zod';
import {
  CompanionsCatalogSchema,
  EncountersCatalogSchema,
  EnemiesCatalogSchema,
  EndingsCatalogSchema,
  ImagesCatalogSchema,
  ItemsCatalogSchema,
  LocationSchema,
  ManifestSchema,
  SceneSchema,
  TemplatesCatalogSchema,
  TranslationCompanionsCatalogSchema,
  TranslationEncountersCatalogSchema,
  TranslationEnemiesCatalogSchema,
  TranslationEndingsCatalogSchema,
  TranslationImagesCatalogSchema,
  TranslationItemsCatalogSchema,
  TranslationLocationSchema,
  TranslationManifestSchema,
  TranslationSceneSchema,
  TranslationTemplatesCatalogSchema,
} from './schema';
import { isRecord } from './structure';

const FILE_SCHEMAS = {
  manifest: ManifestSchema,
  location: LocationSchema,
  scene: SceneSchema,
  items: ItemsCatalogSchema,
  enemies: EnemiesCatalogSchema,
  encounters: EncountersCatalogSchema,
  companions: CompanionsCatalogSchema,
  templates: TemplatesCatalogSchema,
  endings: EndingsCatalogSchema,
  images: ImagesCatalogSchema,
  'translation-manifest': TranslationManifestSchema,
  'translation-location': TranslationLocationSchema,
  'translation-scene': TranslationSceneSchema,
  'translation-items': TranslationItemsCatalogSchema,
  'translation-enemies': TranslationEnemiesCatalogSchema,
  'translation-encounters': TranslationEncountersCatalogSchema,
  'translation-companions': TranslationCompanionsCatalogSchema,
  'translation-templates': TranslationTemplatesCatalogSchema,
  'translation-endings': TranslationEndingsCatalogSchema,
  'translation-images': TranslationImagesCatalogSchema,
} as const;

export type FileKind = keyof typeof FILE_SCHEMAS;
export const FILE_KINDS = Object.keys(FILE_SCHEMAS) as FileKind[];

/**
 * Remove defaulted keys from `required` lists, recursing through the whole
 * JSON Schema (properties, items, anyOf/oneOf/allOf/not and $defs).
 */
export function pruneDefaultedRequired(node: unknown): void {
  if (Array.isArray(node)) {
    for (const entry of node) pruneDefaultedRequired(entry);
    return;
  }
  if (!isRecord(node)) return;
  const properties = node['properties'];
  const required = node['required'];
  if (isRecord(properties) && Array.isArray(required)) {
    node['required'] = required.filter((key) => {
      const property = properties[String(key)];
      return !(isRecord(property) && property['default'] !== undefined);
    });
  }
  // Recurse into every child value (property schemas, items, $defs,
  // anyOf/oneOf/allOf branches, ...). Scalars and enums are no-ops.
  for (const value of Object.values(node)) pruneDefaultedRequired(value);
}

export function buildJsonSchemas(): Record<FileKind, Record<string, unknown>> {
  const out = {} as Record<FileKind, Record<string, unknown>>;
  for (const kind of FILE_KINDS) {
    const schema = z.toJSONSchema(FILE_SCHEMAS[kind]) as unknown as Record<string, unknown>;
    pruneDefaultedRequired(schema);
    out[kind] = schema;
  }
  return out;
}
