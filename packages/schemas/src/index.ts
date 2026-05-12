import { type WorkduckEntityKind, workduckEntityKinds } from "@workduck/core";

export const workduckJsonSchemaDraft = "https://json-schema.org/draft/2020-12/schema" as const;

export const workduckSchemaIds = {
  entityRef: "urn:workduck:schema:entity-ref:v1"
} as const;

export type WorkduckSchemaId = (typeof workduckSchemaIds)[keyof typeof workduckSchemaIds];

export type WorkduckJsonSchemaPrimitiveType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string";

export interface WorkduckJsonSchemaProperty {
  readonly type?: WorkduckJsonSchemaPrimitiveType | readonly WorkduckJsonSchemaPrimitiveType[];
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly description?: string;
  readonly items?: WorkduckJsonSchemaProperty;
  readonly properties?: Record<string, WorkduckJsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | WorkduckJsonSchemaProperty;
}

export interface WorkduckObjectJsonSchema extends WorkduckJsonSchemaProperty {
  readonly $schema: typeof workduckJsonSchemaDraft;
  readonly $id: WorkduckSchemaId;
  readonly title: string;
  readonly type: "object";
  readonly properties: Record<string, WorkduckJsonSchemaProperty>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

const workduckEntityKindEnum: readonly WorkduckEntityKind[] = workduckEntityKinds;

export const workduckEntityRefSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.entityRef,
  title: "Workduck entity reference",
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "label"],
  properties: {
    id: {
      type: "string",
      minLength: 1
    },
    kind: {
      type: "string",
      enum: workduckEntityKindEnum
    },
    label: {
      type: "string",
      minLength: 1
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckSchemas = {
  [workduckSchemaIds.entityRef]: workduckEntityRefSchema
} as const;

export type WorkduckSchema = (typeof workduckSchemas)[WorkduckSchemaId];

export function isWorkduckSchemaId(value: string): value is WorkduckSchemaId {
  return value in workduckSchemas;
}
