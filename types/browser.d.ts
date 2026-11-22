import type {BrowserOptions, JsonValue} from './index.js';
export type ControllerState = 'idle' | 'ineligible' | 'existing-loader' | 'bootstrap-requested' | 'bootstrap-loaded' | 'bootstrap-error' | 'consent-api-timeout' | 'consent-api-error' | 'consent-ready' | 'connector-error' | 'dispatch-error' | 'disposed';
export interface CookieDescriptor {name: string; purpose: string; path?: string; domain?: string; httpOnly?: boolean;}
export interface ConsentChange {purpose: string; granted: boolean; previousGranted: boolean; reason: string;}
export interface Connector {id: string; purpose: string; cookies?: CookieDescriptor[]; onConsentChange?: (change: Readonly<ConsentChange>) => void; onDispose?: () => void;}
export interface Snapshot {readonly state: ControllerState; readonly ready: boolean; readonly choices: Readonly<Record<string, boolean>>;}
export interface Controller {
  getSnapshot(): Snapshot; refresh(): Snapshot; openSettings(): boolean;
  track(name: string, properties: Record<string, JsonValue>, purpose: string): boolean;
  destroy(): void;
}
export function installConsentController(options: BrowserOptions, environment?: {
  window?: Window; document?: Document; connectors?: Connector[];
  settingsElement?: HTMLElement | null; statusElement?: HTMLElement | null;
  onState?: (snapshot: Snapshot) => void; onChoices?: (choices: Readonly<Record<string, boolean>>) => void;
}): Controller;
