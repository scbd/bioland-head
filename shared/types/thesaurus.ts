/**
 * Thesaurus types
 * Types for thesaurus data from CBD API and static sources
 */

/**
 * Localized string object with language codes as keys
 */
export interface LString {
  en: string;
  [locale: string]: string;
}

/**
 * Raw thesaurus item from CBD API before sanitization
 */
export interface ThesaurusItem {
  identifier?: string;
  name?: LString | string;
  title?: string;
  shortTitle?: LString | string;
  description?: LString | string;
  narrowerTerms?: string[];
  broaderTerms?: string[];
  termSetId?: string;
  code?: string;
  goal?: string;
  [key: string]: any;
}

/**
 * Sanitized thesaurus item with localized strings resolved
 */
export interface SanitizedItem {
  identifier: string;
  name?: string;
  alternateName?: string;
  description?: string;
  image?: string;
  url?: string;
  narrowerTerms?: string[];
  children?: SanitizedItem[];
  termSetId?: string;
  '@type'?: string;
  '@context'?: string;
  [key: string]: any;
}

/**
 * Thesaurus term used for static data
 */
export interface ThesaurusTerm {
  identifier: string;
  name: LString;
  title?: LString;
}

/**
 * Ecosystem type from IUCN Global Ecosystem Typology
 */
export interface EcosystemType {
  identifier: string;
  name: Record<string, string>;
}

/**
 * Type for sanitizer functions
 */
export type ThesaurusSanitizer = (item: ThesaurusItem, locale?: string) => SanitizedItem | null;
