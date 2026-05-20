import {
  type WorkduckCatalogArtifactKind,
  type WorkduckEntityKind,
  type WorkduckRecordStatus,
  type WorkduckRepoKind,
  type WorkduckQueueReviewDecision,
  type WorkduckQueueWorkPriority,
  type WorkduckRiskLevel,
  type WorkduckServiceLevel,
  workduckCatalogArtifactKinds,
  workduckEntityKinds,
  workduckQueueReviewDecisions,
  workduckQueueWorkPriorities,
  workduckRecordStatuses,
  workduckRepoKinds,
  workduckRiskLevels,
  workduckServiceLevels
} from "@workduck/core";

export const workduckJsonSchemaDraft = "https://json-schema.org/draft/2020-12/schema" as const;

export const workduckSchemaIds = {
  agentBrief: "urn:workduck:schema:agent-brief:v1",
  artifact: "urn:workduck:schema:artifact:v1",
  catalogArtifact: "urn:workduck:schema:catalog-artifact:v1",
  entityRef: "urn:workduck:schema:entity-ref:v1",
  gate: "urn:workduck:schema:gate:v1",
  project: "urn:workduck:schema:project:v1",
  projectFolder: "urn:workduck:schema:project-folder:v1",
  projectRepoPlacement: "urn:workduck:schema:project-repo-placement:v1",
  queueProposal: "urn:workduck:schema:queue-proposal:v1",
  queueResultReport: "urn:workduck:schema:queue-result-report:v1",
  queueWorkOrder: "urn:workduck:schema:queue-work-order:v1",
  repo: "urn:workduck:schema:repo:v1",
  run: "urn:workduck:schema:run:v1",
  service: "urn:workduck:schema:service:v1"
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
  readonly $ref?: WorkduckSchemaId;
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
const workduckRecordStatusEnum: readonly WorkduckRecordStatus[] = workduckRecordStatuses;
const workduckRepoKindEnum: readonly WorkduckRepoKind[] = workduckRepoKinds;
const workduckCatalogArtifactKindEnum: readonly WorkduckCatalogArtifactKind[] =
  workduckCatalogArtifactKinds;
const workduckRiskLevelEnum: readonly WorkduckRiskLevel[] = workduckRiskLevels;
const workduckServiceLevelEnum: readonly WorkduckServiceLevel[] = workduckServiceLevels;
const workduckQueueReviewDecisionEnum: readonly WorkduckQueueReviewDecision[] =
  workduckQueueReviewDecisions;
const workduckQueueWorkPriorityEnum: readonly WorkduckQueueWorkPriority[] =
  workduckQueueWorkPriorities;

const entityRefReference = {
  $ref: workduckSchemaIds.entityRef
} satisfies WorkduckJsonSchemaProperty;

const nonEmptyString = {
  type: "string",
  minLength: 1
} satisfies WorkduckJsonSchemaProperty;

const stringArray = {
  type: "array",
  items: nonEmptyString
} satisfies WorkduckJsonSchemaProperty;

const recordStatus = {
  type: "string",
  enum: workduckRecordStatusEnum
} satisfies WorkduckJsonSchemaProperty;

const riskLevel = {
  type: "string",
  enum: workduckRiskLevelEnum
} satisfies WorkduckJsonSchemaProperty;

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

export const workduckProjectSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.project,
  title: "Workduck project",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    description: nonEmptyString
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckRepoSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.repo,
  title: "Workduck repo",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status", "kind", "localPath"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    kind: {
      type: "string",
      enum: workduckRepoKindEnum
    },
    localPath: nonEmptyString,
    remoteUrl: nonEmptyString,
    defaultBranch: nonEmptyString
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckProjectFolderSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.projectFolder,
  title: "Workduck project folder",
  type: "object",
  additionalProperties: false,
  required: ["ref", "project", "path"],
  properties: {
    ref: entityRefReference,
    project: entityRefReference,
    path: nonEmptyString,
    parent: entityRefReference
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckProjectRepoPlacementSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.projectRepoPlacement,
  title: "Workduck project repo placement",
  type: "object",
  additionalProperties: false,
  required: ["ref", "project", "folder", "repo", "path"],
  properties: {
    ref: entityRefReference,
    project: entityRefReference,
    folder: entityRefReference,
    repo: entityRefReference,
    path: nonEmptyString
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckArtifactSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.artifact,
  title: "Workduck artifact",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    project: entityRefReference,
    sourcePath: nonEmptyString
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckCatalogArtifactSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.catalogArtifact,
  title: "Workduck catalog artifact",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status", "catalogKind"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    catalogKind: {
      type: "string",
      enum: workduckCatalogArtifactKindEnum
    },
    project: entityRefReference,
    sourcePath: nonEmptyString
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckServiceSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.service,
  title: "Workduck service",
  type: "object",
  additionalProperties: false,
  required: [
    "ref",
    "status",
    "dataClasses",
    "datastores",
    "queues",
    "externalDependencies",
    "complianceScope"
  ],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    project: entityRefReference,
    repo: entityRefReference,
    runtime: nonEmptyString,
    framework: nonEmptyString,
    dataClasses: stringArray,
    datastores: stringArray,
    queues: stringArray,
    externalDependencies: stringArray,
    riskLevel,
    serviceLevel: {
      type: "string",
      enum: workduckServiceLevelEnum
    },
    complianceScope: {
      type: "object",
      additionalProperties: false,
      required: ["pii", "payment", "crypto", "aiUserData", "pci"],
      properties: {
        pii: {
          type: "boolean"
        },
        payment: {
          type: "boolean"
        },
        crypto: {
          type: "boolean"
        },
        aiUserData: {
          type: "boolean"
        },
        pci: {
          type: "boolean"
        }
      }
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckAgentBriefSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.agentBrief,
  title: "Workduck agent brief",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status", "project", "artifactRefs", "catalogArtifactRefs"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    project: entityRefReference,
    artifactRefs: {
      type: "array",
      items: entityRefReference
    },
    catalogArtifactRefs: {
      type: "array",
      items: entityRefReference
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckRunSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.run,
  title: "Workduck run",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status", "project", "repoRefs", "artifactRefs", "gateRefs"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    project: entityRefReference,
    repoRefs: {
      type: "array",
      items: entityRefReference
    },
    artifactRefs: {
      type: "array",
      items: entityRefReference
    },
    gateRefs: {
      type: "array",
      items: entityRefReference
    },
    brief: entityRefReference
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckGateSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.gate,
  title: "Workduck gate",
  type: "object",
  additionalProperties: false,
  required: ["ref", "status"],
  properties: {
    ref: entityRefReference,
    status: recordStatus,
    project: entityRefReference,
    riskLevel
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckQueueResultReportSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.queueResultReport,
  title: "Workduck queue result report",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "ref", "status", "createdAt", "tasks"],
  properties: {
    schemaVersion: {
      type: "string",
      enum: ["workduck.queue-result-report/v1"]
    },
    ref: entityRefReference,
    status: recordStatus,
    createdAt: nonEmptyString,
    agentName: nonEmptyString,
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "summary", "filesChanged", "verification", "risks"],
        properties: {
          id: nonEmptyString,
          title: nonEmptyString,
          summary: nonEmptyString,
          filesChanged: stringArray,
          verification: stringArray,
          risks: stringArray
        }
      }
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckQueueWorkOrderSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.queueWorkOrder,
  title: "Workduck queue work order",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "ref", "status", "createdAt", "tasks"],
  properties: {
    schemaVersion: {
      type: "string",
      enum: ["workduck.queue-work-order/v1"]
    },
    ref: entityRefReference,
    status: recordStatus,
    createdAt: nonEmptyString,
    agentName: nonEmptyString,
    sourceReport: entityRefReference,
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "body"],
        properties: {
          id: nonEmptyString,
          title: nonEmptyString,
          body: nonEmptyString,
          priority: {
            type: "string",
            enum: workduckQueueWorkPriorityEnum
          },
          skillIds: stringArray,
          agentIds: stringArray,
          referenceIds: stringArray,
          sourceReportTaskId: nonEmptyString,
          decision: {
            type: "string",
            enum: workduckQueueReviewDecisionEnum
          }
        }
      }
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckQueueProposalSchema = {
  $schema: workduckJsonSchemaDraft,
  $id: workduckSchemaIds.queueProposal,
  title: "Workduck queue proposal",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "ref",
    "status",
    "createdAt",
    "question",
    "summary",
    "options",
    "recommendation",
    "nextWorkOrders"
  ],
  properties: {
    schemaVersion: {
      type: "string",
      enum: ["workduck.queue-proposal/v1"]
    },
    ref: entityRefReference,
    status: recordStatus,
    createdAt: nonEmptyString,
    agentName: nonEmptyString,
    question: nonEmptyString,
    summary: nonEmptyString,
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "summary", "strengths", "risks"],
        properties: {
          id: nonEmptyString,
          name: nonEmptyString,
          summary: nonEmptyString,
          strengths: stringArray,
          risks: stringArray
        }
      }
    },
    recommendation: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["optionId", "reason"],
      properties: {
        optionId: nonEmptyString,
        reason: nonEmptyString
      }
    },
    nextWorkOrders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "body"],
        properties: {
          id: nonEmptyString,
          title: nonEmptyString,
          body: nonEmptyString,
          priority: {
            type: "string",
            enum: workduckQueueWorkPriorityEnum
          },
          skillIds: stringArray,
          agentIds: stringArray,
          referenceIds: stringArray,
          sourceReportTaskId: nonEmptyString,
          decision: {
            type: "string",
            enum: workduckQueueReviewDecisionEnum
          }
        }
      }
    }
  }
} satisfies WorkduckObjectJsonSchema;

export const workduckSchemas = {
  [workduckSchemaIds.agentBrief]: workduckAgentBriefSchema,
  [workduckSchemaIds.artifact]: workduckArtifactSchema,
  [workduckSchemaIds.catalogArtifact]: workduckCatalogArtifactSchema,
  [workduckSchemaIds.entityRef]: workduckEntityRefSchema,
  [workduckSchemaIds.gate]: workduckGateSchema,
  [workduckSchemaIds.project]: workduckProjectSchema,
  [workduckSchemaIds.projectFolder]: workduckProjectFolderSchema,
  [workduckSchemaIds.projectRepoPlacement]: workduckProjectRepoPlacementSchema,
  [workduckSchemaIds.queueProposal]: workduckQueueProposalSchema,
  [workduckSchemaIds.queueResultReport]: workduckQueueResultReportSchema,
  [workduckSchemaIds.queueWorkOrder]: workduckQueueWorkOrderSchema,
  [workduckSchemaIds.repo]: workduckRepoSchema,
  [workduckSchemaIds.run]: workduckRunSchema,
  [workduckSchemaIds.service]: workduckServiceSchema
} as const;

export type WorkduckSchema = (typeof workduckSchemas)[WorkduckSchemaId];

export function isWorkduckSchemaId(value: string): value is WorkduckSchemaId {
  return value in workduckSchemas;
}
