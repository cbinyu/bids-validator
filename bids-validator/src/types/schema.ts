/**
 * Schema structure returned by loadSchema
 */

export interface Format {
  pattern: string
}

export interface Entity {
  name: string
  type: string
  format: string
}

export interface SchemaObjects {
  files: Record<string, unknown>
  formats: Record<string, Format>
  entities: Record<string, Entity>
}

export interface SchemaRules {
  files: SchemaFiles
  modalities: Record<string, unknown>
}

export interface SchemaFiles {
  common: Record<string, unknown>
  deriv: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface Schema {
  objects: SchemaObjects
  rules: SchemaRules
}

export interface SchemaIssue {
  code: string
  message: string
  level?: string
}

export type GenericSchema = { [key: string]: GenericRule | GenericSchema }

export interface GenericRule {
  selectors?: string[]
  checks?: string[]
  columns?: Record<string, string>
  additional_columns?: string
  initial_columns?: string[]
  fields: Record<string, SchemaFields>
  issue?: SchemaIssue
  extensions?: string[]
  suffixes?: string[]
  stem?: string
  path?: string
  datatypes?: string[]
  pattern?: string
  name?: string
  format?: string
  required?: string
  index_columns?: string[]
}

export interface SchemaFields {
  level: string
  level_addendum?: string
  issue?: SchemaIssue
}