import type {BrowserOptions} from './index.js';
import type {CookieDescriptor} from './browser.js';
export function sameOriginPost(request: Request, options: BrowserOptions): boolean;
export function requestPrivacyDenied(request: Request): boolean;
export function readRequestCookie(request: Request, name: string): string | undefined;
export function readStoredChoices(request: Request, options: BrowserOptions): Record<string, boolean>;
export function submissionConsentGranted(request: Request, formData: FormData, options: BrowserOptions, fields: {purpose: string; consentField?: string; pageField?: string}): boolean;
export function expireCookiesAfterWithdrawal(request: Request, response: Response, options: BrowserOptions, cookies: CookieDescriptor[]): Response;
