import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MapPin,
  Clock,
  Plus,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "../../shared/lib/supabase";
import { useAuth } from "../../shared/lib/AuthContext";
import { staggerContainer, staggerItem } from "../../shared/lib/motion";
import { useReports, refreshReports, fetchAvailableLocations } from "../../shared/lib/repositories/reports";
import { onSyncTrigger } from "../../shared/lib/appLifecycle";
import CachedImage from "../../shared/components/CachedImage";
import SyncStateChip from "../../shared/components/SyncStateChip";

const STATUS_STYLES = {
  open: "bg-status-open-bg text-status-open-text",
  claimed: "bg-status-claimed-bg text-status-claimed-text",
  approved: "bg-status-approved-bg text-status-approved-text",
  resolved: "bg-status-resolved-bg text-status-resolved-text",
};

const CATEGORIES = [
  "Electronics",
  "IDs & Cards",
  "Bags",
  "Clothing",
  "Books & Notes",
  "Keys",
  "Wallet",
  "Jewelry",
  "Documents",
  "Other",
];

// Module-level, not component state, so it survives HomePage unmounting -
// AppShell's <main> is shared across routes and forces scrollTop back to 0
// whenever a report detail page mounts, so without this a student who
// scrolled down, opened a report, then hit back would land on the top of
// the list (the newest report) instead of back where they were - reading
// as if the report they'd been looking at had vanished.
let savedHomeScrollTop = 0;

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ReportCard({ report }) {
  const thumbnail = report.thumbnail;
  return (
    <motion.div {...staggerItem}>
      <Link
        to={`/reports/${report.id}`}
        className="flex gap-3 bg-surface-card rounded-2xl border border-border p-3.5 active:scale-[0.98] transition-transform"
      >
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden bg-surface-muted flex items-center justify-center border border-border">
          {thumbnail ? (
            <CachedImage
              src={thumbnail}
              cacheKey={thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-surface-muted flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-dashed border-border-strong rounded-md" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary leading-snug flex-1 truncate">
              {report.title}
            </h3>
            {report._syncStatus ? (
              <SyncStateChip status={report._syncStatus} />
            ) : (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[report.status] ?? ""}`}
              >
                {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {report.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{report.location}</span>
              </span>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <Clock size={11} aria-hidden="true" />
              {timeAgo(report.created_at)}
            </span>
          </div>
          {report.category && (
            <span className="inline-block mt-1.5 text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
              {report.category}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default function HomePage() {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [locationFilter, setLocationFilter] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 600);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocation(locationFilter), 350);
    return () => clearTimeout(t);
  }, [locationFilter]);

  // Reads reactively from the local cache (works offline); refreshReports
  // below keeps the cache in sync with Supabase whenever we're online.
  const reports = useReports({
    search: debouncedSearch,
    category: selectedCategory,
    location: debouncedLocation,
    status: selectedStatus,
  });
  const loading = reports === undefined;

  // Track scroll position on the shared <main> container continuously (not
  // just on unmount) since navigating away is a route change, not always a
  // clean unmount-with-cleanup-time-to-spare.
  //
  // Guarded by a live ref (not the `loading` closure captured when this
  // effect first attached) because a background data refresh can bounce
  // `loading` back to true later in the session too, not just on the very
  // first mount. Whenever the skeleton is showing, the list is only 3-4
  // short placeholder rows - clearing the real list's DOM to show it makes
  // the browser reset scrollTop to 0 on its own, and without this guard
  // that spurious 0 gets recorded as if the student had scrolled there,
  // permanently overwriting the real saved position with garbage. That's
  // what produced the "looks right for a second, then flicks to the top"
  // report: the position was fine until this corrupted it, and the very
  // next restore faithfully (and now wrongly) put it back at 0.
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function handleScroll() {
      if (loadingRef.current) return;
      savedHomeScrollTop = main.scrollTop;
    }
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore it once the list has actually rendered (right after `loading`
  // flips to false) - restoring any earlier would have nothing to scroll to.
  // useLayoutEffect (not useEffect) matters here: useEffect runs after the
  // browser has already painted the freshly-loaded list at scrollTop 0, so
  // a student would see it flash at the top for a frame before snapping
  // down - useLayoutEffect applies the scroll position before that paint,
  // so the list never visibly touches the top at all.
  //
  // A single assignment isn't enough on a real touchscreen, though: tapping
  // a report that isn't right at the bottom of the list often lands while
  // the fling from scrolling to it is still gently decelerating (tapping
  // the very last report, by contrast, only happens after the scroll has
  // hit its hard boundary and fully stopped) - that residual native
  // momentum can keep nudging <main>'s scrollTop for a few more frames
  // after we set it, independently of React, undoing the restore. Keep
  // reasserting the target for a short window to win that fight.
  useLayoutEffect(() => {
    if (loading) return;
    const main = document.querySelector("main");
    if (!main) return;
    const target = savedHomeScrollTop;
    main.scrollTop = target;
    let cancelled = false;
    const deadline = Date.now() + 300;
    function reassert() {
      if (cancelled) return;
      if (main.scrollTop !== target) main.scrollTop = target;
      if (Date.now() < deadline) requestAnimationFrame(reassert);
    }
    const rafId = requestAnimationFrame(reassert);
    // If the student actually starts interacting, stop fighting them -
    // this loop is only meant to win against leftover momentum from the
    // *previous* scroll, never to override a new one of their own.
    function stopOnInteraction() {
      cancelled = true;
    }
    main.addEventListener("touchstart", stopOnInteraction, { passive: true });
    main.addEventListener("wheel", stopOnInteraction, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      main.removeEventListener("touchstart", stopOnInteraction);
      main.removeEventListener("wheel", stopOnInteraction);
    };
  }, [loading]);

  useEffect(() => {
    const filters = {
      search: debouncedSearch,
      category: selectedCategory,
      location: debouncedLocation,
      status: selectedStatus,
    };
    refreshReports(filters);
    fetchAvailableLocations().then(setAvailableLocations);

    const channelName = "home-reports";
    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        () => {
          setTimeout(() => refreshReports(filters), 2000);
          setTimeout(() => refreshReports(filters), 5000);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reports" },
        () => { refreshReports(filters); },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reports" },
        () => { refreshReports(filters); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "report_photos" },
        () => { setTimeout(() => refreshReports(filters), 800); },
      )
      .subscribe();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshReports(filters);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const unsubscribeSync = onSyncTrigger(() => refreshReports(filters));

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribeSync();
    };
  }, [debouncedSearch, selectedCategory, debouncedLocation, selectedStatus]);

  function clearFilters() {
    setSelectedCategory(null);
    setLocationFilter("");
    setSelectedStatus(null);
  }

  const activeFilterCount =
    (selectedCategory ? 1 : 0) + (debouncedLocation.trim() ? 1 : 0) + (selectedStatus ? 1 : 0);
  const hasActiveQuery = debouncedSearch || activeFilterCount > 0;

  const firstName = profile?.first_name ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-brand-600 px-5 pb-6 sticky top-0 z-10" style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top) + 1.5rem)' }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4"
        >
          <h1 className="text-white text-2xl font-bold">CampusFind</h1>
          <p className="text-white/60 text-xs mt-0.5">NwSSU Lost & Found</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search lost items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-10 text-sm rounded-xl bg-surface-card border-0 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-white text-brand-600"
                : "bg-white/15 text-white"
            }`}
            aria-label="Filters"
          >
            <SlidersHorizontal size={17} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-rejected-text text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </motion.div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-surface-card rounded-xl p-3.5 mt-3 flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                    Category
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() =>
                          setSelectedCategory((c) => (c === cat ? null : cat))
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selectedCategory === cat
                            ? "bg-brand-600 text-white border-brand-600"
                            : "border-border-strong text-text-secondary hover:border-brand-400"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status filter */}
                <div>
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: "open", label: "Open", style: "bg-status-open-bg text-status-open-text border-status-open-text/30" },
                      { value: "claimed", label: "Claimed", style: "bg-status-claimed-bg text-status-claimed-text border-status-claimed-text/30" },
                      { value: "approved", label: "Approved", style: "bg-status-approved-bg text-status-approved-text border-status-approved-text/30" },
                      { value: "resolved", label: "Resolved", style: "bg-status-resolved-bg text-status-resolved-text border-status-resolved-text/30" },
                    ].map(({ value, label, style }) => (
                      <button
                        key={value}
                        onClick={() => setSelectedStatus((s) => s === value ? null : value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          selectedStatus === value
                            ? style + " ring-2 ring-offset-1 ring-current"
                            : "border-border-strong text-text-secondary hover:border-brand-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                    Location
                  </p>
                  <div className="relative">
                    <MapPin
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      type="text"
                      placeholder="e.g. Library, CICT Building…"
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
                      list="location-suggestions"
                    />
                    <datalist id="location-suggestions">
                      {availableLocations.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-status-rejected-bg text-status-rejected-text text-xs font-semibold self-start hover:opacity-80 transition-opacity"
                  >
                    <X size={13} />
                    Clear {activeFilterCount} filter
                    {activeFilterCount > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-surface-card rounded-2xl border border-border p-4 animate-pulse"
              >
                <div className="h-4 bg-surface-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-surface-muted rounded w-full mb-1" />
                <div className="h-3 bg-surface-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center text-center py-16"
          >
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4">
              <Search size={24} className="text-text-muted" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">
              {hasActiveQuery ? "No results found" : "No reports yet"}
            </p>
            <p className="text-xs text-text-muted max-w-xs mb-6">
              {hasActiveQuery
                ? "Try different keywords, or adjust your filters."
                : "Lost something? File a report and let the campus help you find it."}
            </p>
            {hasActiveQuery ? (
              <button
                onClick={() => { setSearch(""); clearFilters(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border-strong text-text-secondary text-sm font-semibold"
              >
                Clear search & filters
              </button>
            ) : (
              <Link
                to="/reports/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold"
              >
                <Plus size={16} aria-hidden="true" /> File a report
              </Link>
            )}
          </motion.div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary">
                {hasActiveQuery
                  ? `${reports.length} result${reports.length === 1 ? "" : "s"}`
                  : "Recent reports"}
              </p>
            </div>
            <motion.div
              className="flex flex-col gap-3"
              {...staggerContainer}
              initial="initial"
              animate="animate"
            >
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}