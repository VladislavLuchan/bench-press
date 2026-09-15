import type { JobListing, SourceName } from '@bench-press/shared';

/** A listing plus the description when the source ships it inline (RSS feeds do). */
export interface DiscoveredJob extends JobListing {
  description: string | null;
}

/**
 * A job board. Sources only know URLs and how to parse responses; fetching is done by the
 * pipeline, which keeps parsers pure and testable against saved fixtures.
 */
export interface Source {
  name: SourceName;
  /** Pages to fetch for the listing step. */
  listingUrls: readonly string[];
  /** Treat a well-formed but empty listing page as a block signal (LinkedIn does this). */
  emptyMeansBlocked?: boolean;
  parseListings(body: string, pageUrl: string): DiscoveredJob[];
  /** URL of the page that carries the full description, or null if not needed. */
  descriptionUrl(listing: JobListing): string | null;
  parseDescription(body: string): string;
}
