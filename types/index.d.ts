export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type LocalizedText = string | Record<string, string>;
export interface Scope {enabled: boolean; origin: string; paths: readonly string[]; privateRoots?: readonly string[];}
export type NativeRule = {id: string; match: string; op: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'MATCH_REGEX' | 'NOT_MATCH_REGEX' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL'; value: string;}
  | {id: string; action: 'clickListener'; settings: {selector: string; type: 'css' | 'xpath'; waitForTags: number}}
  | {id: string; action: 'timer'; settings: {interval: number; limit: number}}
  | {id: string; action: 'formSubmission'; settings: {selector: string; validate: boolean}}
  | {id: string; action: 'variableMatch'; settings: {variable: string; match: string}}
  | {id: string; action: 'scrollDepth'; settings: {positions: string}}
  | {id: string; action: 'elementVisibility'; settings: {selector: string}};
export interface NativeTrigger {name: string; system?: string; loadRules?: NativeRule[]; excludeRules?: NativeRule[];}
export interface NativeAction {actionType: string; firingTriggers: string[]; blockingTriggers?: string[]; data?: Record<string, JsonValue>; [key: string]: JsonValue | undefined;}
export interface NativeTool {
  type: string; component: string; name: string; defaultPurpose: string; enabled?: boolean;
  actions: Record<string, NativeAction>; settings?: Record<string, JsonValue>; blockingTriggers?: string[];
  [key: string]: JsonValue | Record<string, NativeAction> | undefined;
}
export interface ConfigInput {
  enabled?: boolean; origin: string; paths?: readonly string[]; privateRoots?: readonly string[];
  purposes?: Record<string, {name: LocalizedText; description: LocalizedText}>;
  tools?: Record<string, NativeTool>; triggers?: Record<string, NativeTrigger>;
  operator?: string; cookieName?: string; language?: string; intro?: LocalizedText; privacyUrl?: string;
  loaderTimeoutMs?: number; reloadOnWithdrawal?: boolean;
}
export interface Config extends Scope {
  purposes: Record<string, {name: Record<string, string>; description: Record<string, string>}>;
  tools: Record<string, NativeTool>; triggers: Record<string, NativeTrigger>;
  operator: string; cookieName: string; language: string; intro: Record<string, string>; privacyUrl?: string;
  loaderTimeoutMs: number; reloadOnWithdrawal: boolean;
}
export interface BrowserOptions extends Scope {
  purposeIds: readonly string[]; cookieName: string; loaderTimeoutMs: number; reloadOnWithdrawal: boolean;
}
export function defineConfig(input: ConfigInput): Readonly<Config>;
export function browserOptions(input: ConfigInput): Readonly<BrowserOptions>;
export function buildZarazConfiguration(base: Record<string, JsonValue>, input: ConfigInput): Record<string, JsonValue>;
export function scopeAllows(url: string | URL, config: Scope, privacy?: {globalPrivacyControl?: boolean; doNotTrack?: string | null}): boolean;
