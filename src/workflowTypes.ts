export type WorkflowModule = 'CONTRACT' | 'VENDOR' | 'ASSET' | 'DRIVER' | 'COMPLIANCE';
export type WorkflowPhase = 'CLASSIFY' | 'EXTRACT' | 'MATCH' | 'VALIDATE' | 'VERIFY' | 'ROUTE' | 'MONITOR';
export interface WorkflowInstruction { id: string; module: WorkflowModule; phase: WorkflowPhase; entityId: string; categoryId: string; prompt: string; requiredDocumentTypes: string[]; requiredFields: string[]; blocking: boolean; active: boolean }
export interface DocumentDefinition { id: string; module: WorkflowModule; code: string; label: string; fields: string[]; categoryIds: string[]; entityIds: string[]; active: boolean }
export interface WorkflowPack { version: number; publishedAt: string; instructions: WorkflowInstruction[]; documents: DocumentDefinition[] }
export interface WorkflowState { activeVersion: number; draft: WorkflowPack; history: WorkflowPack[] }
