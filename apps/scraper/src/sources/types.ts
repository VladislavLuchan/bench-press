import type { JobListing, SourceName } from '@bench-press/shared';

/** A listing plus the description when the source ships it inline (RSS and JSON APIs do). */
export interface DiscoveredJob extends JobListing {
  description: string | null;
  /** Years of experience printed on the listing card, when the board shows it. */
  experienceYears?: number | null;
}

export interface FetchOptions {
  /** First run: widen date windows to catch up on the last week. */
  backfill: boolean;
}

export interface SearchRequest {
  url: string;
  init?: RequestInit;
}

/** One independent query on a board, paginated until a short page or `maxPages`. */
export interface Search {
  name: string;
  maxPages: number;
  /** Expected items per full page; a shorter page ends the pagination. */
  pageSize: number;
  request(page: number): SearchRequest;
}

/**
 * A job board. Sources only describe requests and how to parse responses; fetching is
 * done by the pipeline, which keeps parsers pure and testable against saved fixtures.
 */
export interface Source {
  name: SourceName;
  /** Treat a well-formed but empty result across all searches as a block signal. */
  emptyMeansBlocked?: boolean;
  searches(options: FetchOptions): readonly Search[];
  parseListings(body: string, pageUrl: string): DiscoveredJob[];
  /** URL of the page that carries the full description, or null if not needed. */
  descriptionUrl(listing: JobListing): string | null;
  parseDescription(body: string): string;
}
