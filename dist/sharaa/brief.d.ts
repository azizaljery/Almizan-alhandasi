// شرعاء V2 — مخطط ArchitecturalBrief (مطابق لمواصفة المالك §3؛ الإضافات معلَّمة «إضافة»). المستودع .mjs؛ هذا الملف للتوثيق والفحص فقط.
export type Source = 'land_step' | 'client_free_text' | 'client_answer' | 'client_confirmed' | 'ai_inference' | 'design_default' | 'verified_regulation';
export type Priority = 'mandatory' | 'preferred' | 'flexible';
export type Verification = 'confirmed' | 'needs_confirmation' | 'not_verified' | 'unsupported';
export interface BriefField<T> { value: T | null; source: Source; priority: Priority; verification: Verification; originalText?: string; }
export interface LandContext {
  landId: string; revision: number; areaM2?: number;
  widthM?: number;   // العرض: شرق/غرب
  depthM?: number;   // الطول: شمال/جنوب
  streets?: Array<{ side: string; widthM?: number }>;
  orientation?: string; // غير مدعوم: لا يُملأ
  setbacks?: { front?: number; rear?: number; left?: number; right?: number; verified: boolean };
  // إضافة
  entries?: string[]; floors?: number; coverageMaxPct?: number; engineLand?: object;
}
export interface SpaceRequirement {
  id: string; type: string; count: number; floorPreference?: number | null; minClearWidthM?: number; minClearDepthM?: number;
  priority: Priority; source: Source; verification: Verification;
  // إضافة
  originalText?: string; dimTolerance?: number; options?: { bath?: boolean; ext?: boolean; noBath?: boolean }; partOf?: string; needsRecheck?: boolean; history?: object[]; priorityCapped?: boolean;
}
export interface SpatialRelation {
  from: string; to: string; relation: 'near' | 'direct_access' | 'separate' | 'avoid_visibility' | 'same_floor' | 'different_floor';
  priority: Priority; source: Source; verification: Verification;
  // إضافة
  id?: string; detail?: 'far' | 'apart' | 'adjacent'; originalText?: string; active?: boolean; history?: object[];
}
export interface Placement { id: string; space: string; side: string; mode: 'zone' | 'touch' | 'avoid' | 'center'; priority: Priority; source: Source; verification: Verification; originalText?: string; active?: boolean; } // إضافة
export interface ArchitecturalBrief {
  version: 'sharaa-2.0';
  land: LandContext;
  interaction: { mode: 'free' | 'guided'; currentTopic?: string; completedTopics: string[]; path?: string; asked?: string[] };
  household: { currentMembers?: number; futureMembers?: number; specialNeeds?: string[] };
  spaces: SpaceRequirement[];
  relations: SpatialRelation[];
  placements: Placement[]; // إضافة
  preferences: { privacy?: string; kitchenStyle?: string; naturalLight?: string; parkingCount?: number; budgetRange?: { min?: number; max?: number; currency: 'SAR' }; features?: Record<string, unknown> };
  decisions: Array<{ id: string; description: string; status: 'pending' | 'confirmed' | 'rejected'; conflictId?: string }>;
  conflicts: Array<{ id: string; reason: string; affectedRequirements: string[]; type?: string; mandatory?: boolean; options?: Array<{ id: string; ar: string }> }>;
  engineReadiness: { supported: string[]; partiallySupported: string[]; unsupported: string[] };
  // إضافات
  provenance: Record<string, { source: Source; priority: Priority; verification: Verification; originalText?: string; history?: object[] }>;
  recheck: Array<{ id: string; reason: string }>;
  log: Array<{ seq: number; op: string; [k: string]: unknown }>;
}
