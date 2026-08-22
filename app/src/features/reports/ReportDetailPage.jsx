import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Clock,
  User,
  MessageSquare,
  Lightbulb,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Star,
  CornerUpLeft,
  Pencil,
  Trash2,
  Camera,
  Share2,
  Link as LinkIcon,
  ImagePlus,
} from "lucide-react";
import { supabase } from "../../shared/lib/supabase";
import { useAuth } from "../../shared/lib/AuthContext";
import MessageThread from "../claims/MessageThread";
import ProxyRequestForm from "./ProxyRequestForm";
import ConfirmationRequestBanner from "./ConfirmationRequestBanner";
import TrustScoreDialog from "../../shared/components/TrustScoreDialog";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

function getScrollContainer() {
  return document.querySelector("main") ?? window;
}

function scrollContainerTo(top) {
  const el = document.querySelector("main");
  if (el) {
    el.scrollTop = top;
  } else {
    window.scrollTo({ top, behavior: "instant" });
  }
}

function getScrollTop() {
  const el = document.querySelector("main");
  return el ? el.scrollTop : window.scrollY;
}

function TipCard({
  tip,
  isOwn,
  onReply,
  isReply,
  credited,
  onConvert,
  isHighlighted,
}) {
  const name = tip.users
    ? `${tip.users.first_name} ${tip.users.last_name}`
    : "Anonymous";
  const firstName = tip.users?.first_name ?? "?";
  const lastName = tip.users?.last_name ?? "";
  const initials = `${firstName[0]}${lastName[0] ?? ""}`.toUpperCase();
  const trustScore = tip.users?.trust_score ?? 100;

  return (
    <div
      id={`tip-${tip.id}`}
      className={isReply ? "pl-4 border-l-2 border-brand-200 ml-1" : ""}
    >
      <div
        className={`rounded-xl p-3 transition-colors ${
          credited
            ? "bg-status-open-bg border border-status-open-text/20"
            : isHighlighted
              ? "bg-brand-100 border-2 border-brand-400"
              : isOwn
                ? "bg-brand-50 border border-brand-100"
                : isReply
                  ? "bg-white border border-border"
                  : "bg-surface-muted"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
              isOwn
                ? "bg-brand-600 text-white"
                : "bg-border-strong text-text-secondary"
            }`}
          >
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] font-semibold text-text-primary">
                  {name}
                </p>
                <span className="flex items-center gap-0.5 text-[10px] text-status-open-text">
                  <Star size={9} />
                  {trustScore}
                </span>
                {isOwn && (
                  <span className="text-[10px] text-brand-600 font-medium">
                    · You
                  </span>
                )}
                {credited && (
                  <span className="flex items-center gap-0.5 text-[10px] text-status-open-text font-medium">
                    <CheckCircle2 size={9} /> Helped recovery
                  </span>
                )}
                {tip.converted_to_claim_id && (
                  <span className="flex items-center gap-0.5 text-[10px] text-brand-600 font-medium">
                    <Camera size={9} /> Converted to claim
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onConvert && !credited && !tip.converted_to_claim_id && (
                  <button
                    type="button"
                    onClick={onConvert}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-brand-400 bg-surface-page text-[10px] font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Camera size={10} />I can prove this
                  </button>
                )}
                {!isReply && !credited && onReply && (
                  <button
                    type="button"
                    onClick={onReply}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-strong bg-surface-page text-[10px] font-semibold text-text-secondary hover:border-brand-400 hover:text-brand-600 transition-colors"
                  >
                    <CornerUpLeft size={10} />
                    Reply
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-text-primary leading-relaxed">
              {tip.text}
            </p>
            <p className="text-[10px] text-text-muted mt-1">
              {timeAgo(tip.created_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  open: "bg-status-open-bg text-status-open-text",
  claimed: "bg-status-claimed-bg text-status-claimed-text",
  approved: "bg-status-approved-bg text-status-approved-text",
  resolved: "bg-status-resolved-bg text-status-resolved-text",
};

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

export default function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [report, setReport] = useState(null);
  const [reporter, setReporter] = useState(null);
  const [claim, setClaim] = useState(null);
  const [claimant, setClaimant] = useState(null);
  const [tips, setTips] = useState([]);
  const [tipText, setTipText] = useState("");
  const [parentTipId, setParentTipId] = useState(null);
  const [submittingTip, setSubmittingTip] = useState(false);
  const [tipError, setTipError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actioning, setActioning] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [trustToast, setTrustToast] = useState({
    visible: false,
    delta: 0,
    newScore: 100,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [highlightedTipId, setHighlightedTipId] = useState(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolvePhoto, setResolvePhoto] = useState(null);
  const [resolvePhotoPreview, setResolvePhotoPreview] = useState(null);
  const [resolving, setResolving] = useState(false);
  const resolveFileRef = useRef(null);

  const claimantIdRef = useRef(null);
  const prevScoreRef = useRef(null);
  
  useEffect(() => {
    claimantIdRef.current = claim?.claimant_id ?? null;
  }, [claim]);

  // Read tip_id from URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tipId = params.get("tip_id");
    if (tipId) setHighlightedTipId(tipId);
  }, []);

  async function showTrustToast(expectedDelta, reason = "") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const { data } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", session.user.id)
      .single();
    const newScore = data?.trust_score ?? 100;
    const actualDelta =
      prevScoreRef.current !== null
        ? newScore - prevScoreRef.current
        : expectedDelta;
    prevScoreRef.current = newScore;
    setTrustToast({ visible: true, delta: actualDelta, newScore, reason });
  }

  useEffect(() => {
    fetchAll();

    const channelName = `report-detail-${id}`;
    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reports",
          filter: `id=eq.${id}`,
        },
        async (payload) => {
          const newStatus = payload.new?.status;
          if (
            newStatus === "resolved" &&
            claimantIdRef.current === session?.user?.id
          ) {
            await showTrustToast(
              5,
              "The item was recovered. Thank you for your honesty!",
            );
          }
          setTimeout(() => fetchAll(true), 500);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${session?.user?.id}`,
        },
        async (payload) => {
          if (payload.new?.type === "tip_credited") {
            await new Promise((r) => setTimeout(r, 500));
            const { data } = await supabase
              .from("users")
              .select("trust_score")
              .eq("id", session.user.id)
              .single();
            const newScore = data?.trust_score ?? 100;
            const actualDelta =
              prevScoreRef.current !== null
                ? newScore - prevScoreRef.current
                : 2;
            prevScoreRef.current = newScore;
            setTrustToast({
              visible: true,
              delta: actualDelta,
              newScore,
              reason: "Your tip was credited for helping recover this item.",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "claims",
        },
        (payload) => {
          if (payload.new?.report_id === id) fetchAll(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "claims",
          filter: `report_id=eq.${id}`,
        },
        async (payload) => {
          const newStatus = payload.new?.status;
          const claimantId = payload.new?.claimant_id;
          fetchAll(true);
          if (
            claimantId === session?.user?.id ||
            claimantIdRef.current === session?.user?.id
          ) {
            if (newStatus === "rejected") {
              await showTrustToast(
                -5,
                "Your claim was declined by the reporter.",
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tips",
        },
        (payload) => {
          if (payload.new?.report_id === id) fetchAll(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tips",
        },
        (payload) => {
          if (payload.new?.report_id === id) fetchAll(true);
        },
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  // Scroll to top or section after loading
  useEffect(() => {
    if (!loading) {
      if (window.location.hash) {
        const el = document.querySelector(window.location.hash);
        if (el) {
          setTimeout(() => {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
        }
      } else if (!highlightedTipId) {
        scrollContainerTo(0);
      }
    }
  }, [loading]);

  // Scroll to and highlight specific tip
  useEffect(() => {
    if (!loading && highlightedTipId) {
      const el = document.getElementById(`tip-${highlightedTipId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => setHighlightedTipId(null), 5000);
        }, 400);
      }
    }
  }, [loading, highlightedTipId]);

  async function fetchAll(silent = false) {
    const scrollY = silent ? getScrollTop() : 0;
    if (!silent) setLoading(true);
    if (!silent) setClaim(null);
    if (!silent) setClaimant(null);

    if (session?.user?.id && prevScoreRef.current === null) {
      const { data: userData } = await supabase
        .from("users")
        .select("trust_score")
        .eq("id", session.user.id)
        .single();
      prevScoreRef.current = userData?.trust_score ?? 100;
    }

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setError("Report not found.");
      if (!silent) setLoading(false);
      return;
    }
    setReport(data);

    const { data: reportPhotos } = await supabase
      .from("report_photos")
      .select("storage_path")
      .eq("report_id", id)
      .order("position", { ascending: true });
    const photoUrls = (reportPhotos ?? []).map((p) => {
      const {
        data: { publicUrl },
      } = supabase.storage.from("report-photos").getPublicUrl(p.storage_path);
      return publicUrl;
    });

    let walkinFinderName = null;
    if (data.type === "found_walkin" && data.walkin_finder_ref) {
      const { data: finder } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("student_id", data.walkin_finder_ref)
        .maybeSingle();
      if (finder) {
        walkinFinderName = `${finder.first_name} ${finder.last_name}`;
      }
    }

    setReport({ ...data, photoUrls, walkin_finder_name: walkinFinderName });

    if (data.reporter_id) {
      const { data: user } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", data.reporter_id)
        .single();
      setReporter(user);
    }

    let activeClaim = null;
    if (data.status === "claimed" || data.status === "approved") {
      const { data: claimData } = await supabase
        .from("claims")
        .select("*")
        .eq("report_id", id)
        .in("status", ["pending", "approved"])
        .maybeSingle();

      if (claimData) {
        activeClaim = claimData;
        setClaim(claimData);

        const { data: claimPhotos } = await supabase
          .from("claim_photos")
          .select("storage_path")
          .eq("claim_id", claimData.id)
          .order("position", { ascending: true });
        const photoUrls = (claimPhotos ?? []).map((p) => {
          const {
            data: { publicUrl },
          } = supabase.storage
            .from("report-photos")
            .getPublicUrl(p.storage_path);
          return publicUrl;
        });

        const { data: msgs } = await supabase
          .from("claim_messages")
          .select("body")
          .eq("claim_id", claimData.id);
        const dropOffChosen = (msgs ?? []).some((m) =>
          m.body?.startsWith("📍"),
        );
        setClaim({ ...claimData, photoUrls, drop_off_chosen: dropOffChosen });

        const { data: claimantData } = await supabase
          .from("users")
          .select("first_name, last_name, trust_score, student_id")
          .eq("id", claimData.claimant_id)
          .single();
        setClaimant(claimantData);
      }
    }

    if (session?.user?.id) {
      const { data: rejectedClaim } = await supabase
        .from("claims")
        .select("id, status, claimant_id")
        .eq("report_id", id)
        .eq("claimant_id", session.user.id)
        .eq("status", "rejected")
        .maybeSingle();
      if (rejectedClaim && !activeClaim) {
        setClaim(rejectedClaim);
      }
    }

    const { data: tipsData } = await supabase
      .from("tips")
      .select(
        "id, text, created_at, user_id, parent_tip_id, credited, converted_to_claim_id, users(first_name, last_name, trust_score)",
      )
      .eq("report_id", id)
      .order("created_at", { ascending: true });
    setTips(tipsData ?? []);

    if (!silent) setLoading(false);
    if (silent) {
      requestAnimationFrame(() => {
        scrollContainerTo(scrollY);
      });
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/reports/${id}`;
    const title =
      report?.type === "found_walkin"
        ? `Found: ${report.title}`
        : `Lost: ${report.title}`;
    const text = [
      report?.description ?? "",
      report?.location ? `📍 ${report.location}` : "",
      "Help find this item on CampusFind — NwSSU Lost & Found",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: "Share this report" });
    } catch {
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
        } catch (err) {
          if (err.name !== "AbortError") await copyFallback(url);
        }
      } else {
        await copyFallback(url);
      }
    }
  }

  async function copyFallback(url) {
    try {
      const { Clipboard } = await import("@capacitor/clipboard");
      await Clipboard.write({ string: url });
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        window.prompt("Copy this link:", url);
      }
    }
  }

  async function handleClaimAction(action) {
    if (!claim) return;
    setActioning(true);
    try {
      await fetch(`${SERVER_URL}/claims/${claim.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error(err);
    }
    setActioning(false);
    fetchAll(true);
  }

  function handleResolveClick() {
    setResolvePhoto(null);
    setResolvePhotoPreview(null);
    setShowResolveDialog(true);
  }

  function handleResolvePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResolvePhoto(file);
    setResolvePhotoPreview(URL.createObjectURL(file));
  }

  async function handleMarkResolved() {
    if (!resolvePhoto) return;
    setResolving(true);
    try {
      const ext = resolvePhoto.name.split(".").pop();
      const path = `resolved/${id}/${Date.now()}.${ext}`;
      await supabase.storage.from("report-photos").upload(path, resolvePhoto);

      await fetch(`${SERVER_URL}/reports/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolvedVia: "handoff",
          resolvePhotoPath: path,
        }),
      });

      setShowResolveDialog(false);
      setResolvePhoto(null);
      setResolvePhotoPreview(null);
      fetchAll(true);
    } catch (err) {
      console.error(err);
    }
    setResolving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { data: photos } = await supabase
        .from("report_photos")
        .select("storage_path")
        .eq("report_id", id);

      const { data: claims } = await supabase
        .from("claims")
        .select("id")
        .eq("report_id", id);
      for (const claim of claims ?? []) {
        await supabase.from("claim_messages").delete().eq("claim_id", claim.id);
        await supabase.from("claim_photos").delete().eq("claim_id", claim.id);
      }

      await supabase.from("claims").delete().eq("report_id", id);
      await supabase.from("tips").delete().eq("report_id", id);

      if (photos?.length) {
        await supabase.storage
          .from("report-photos")
          .remove(photos.map((p) => p.storage_path));
      }

      await supabase.from("report_photos").delete().eq("report_id", id);

      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;

      navigate("/");
    } catch (err) {
      console.error("Delete error:", err);
      setDeleteError(
        err.message ?? "Failed to delete report. Please try again.",
      );
      setDeleting(false);
    }
  }

  function handleConvertTip(tip) {
    navigate(`/reports/${id}/claim?fromTip=${tip.id}`);
  }

  async function handleTipSubmit(e) {
    e.preventDefault();
    if (!tipText.trim()) return;
    if (tips.length >= 25)
      return setTipError("This report has reached the 25-tip limit.");
    setSubmittingTip(true);
    setTipError(null);
    const { data: newTip, error } = await supabase
      .from("tips")
      .insert({
        report_id: id,
        user_id: session.user.id,
        text: tipText.trim(),
        parent_tip_id: parentTipId ?? null,
      })
      .select()
      .single();
    if (error) setTipError(error.message);
    else {
      try {
        await fetch(`${SERVER_URL}/tips/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: id,
            tipAuthorId: session.user.id,
            parentTipId: parentTipId ?? null,
            tipId: newTip?.id ?? null,
          }),
        });
      } catch {
        /* ignore */
      }
      setTipText("");
      setParentTipId(null);
      fetchAll(true);
    }
    setSubmittingTip(false);
  }

  const isOwner = report?.reporter_id === session?.user.id;
  const isOpen = report?.status === "open";
  const isClaimed = report?.status === "claimed";
  const isApproved = report?.status === "approved";
  const isResolved = report?.status === "resolved";
  const canShare = isOpen || isResolved;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page safe-top">
        <div className="bg-brand-600 px-4 pt-12 pb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
        </div>
        <div className="px-4 py-5 flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface-card rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center px-6">
        <AlertCircle size={32} className="text-text-muted mb-3" />
        <p className="text-sm text-text-secondary">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-brand-600 font-medium"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-page safe-top safe-bottom">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full rounded-xl object-contain"
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            <ArrowLeft size={18} className="rotate-[135deg]" />
          </button>
        </div>
      )}

      <TrustScoreDialog
        delta={trustToast.delta}
        newScore={trustToast.newScore}
        reason={trustToast.reason}
        visible={trustToast.visible}
        onDismiss={() => setTrustToast((t) => ({ ...t, visible: false }))}
      />

      {/* Share copied toast */}
      {shareCopied && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-text-primary text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2"
        >
          <LinkIcon size={13} />
          Link copied to clipboard
        </motion.div>
      )}

      {/* Mark as resolved dialog */}
      {showResolveDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="w-10 h-10 rounded-full bg-status-open-bg flex items-center justify-center mb-3">
              <CheckCircle2 size={20} className="text-status-open-text" />
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-1">
              Mark as resolved
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Please take a photo of the recovered item as proof before marking
              this report as resolved.
            </p>

            <input
              ref={resolveFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleResolvePhotoChange}
            />

            {resolvePhotoPreview ? (
              <div className="relative mb-4">
                <img
                  src={resolvePhotoPreview}
                  alt="Resolve proof"
                  className="w-full h-40 object-cover rounded-xl border border-border"
                />
                <button
                  onClick={() => {
                    setResolvePhoto(null);
                    setResolvePhotoPreview(null);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white"
                >
                  <ArrowLeft size={14} className="rotate-[135deg]" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => resolveFileRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center gap-2 mb-4 hover:border-brand-400 transition-colors"
              >
                <ImagePlus size={24} className="text-text-muted" />
                <p className="text-xs text-text-muted">
                  Tap to take or upload a photo
                </p>
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowResolveDialog(false);
                  setResolvePhoto(null);
                  setResolvePhotoPreview(null);
                }}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkResolved}
                disabled={!resolvePhoto || resolving}
                className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {resolving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-surface-card rounded-2xl w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-status-rejected-bg flex items-center justify-center mb-3">
                <Trash2 size={22} className="text-status-rejected-text" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">
                Delete this report?
              </h3>
              <p className="text-xs text-text-secondary">
                This will permanently remove the report and all its tips and
                photos. This cannot be undone.
              </p>
            </div>
            {deleteError && (
              <p className="text-xs text-status-rejected-text bg-status-rejected-bg rounded-xl px-3 py-2 mb-3">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-status-rejected-text text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[report.status] ?? ""}`}
            >
              {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
            </span>

            {canShare && (
              <button
                onClick={handleShare}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Share report"
              >
                <Share2 size={16} className="text-white" />
              </button>
            )}

            {isOwner && isOpen && (
              <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                <Link
                  to={`/reports/${id}/edit`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </Link>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setDeleteError(null);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <h1 className="text-base font-bold text-white leading-snug">
          {report.title}
        </h1>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4 pb-28">
        {/* Photos */}
        {report.photoUrls?.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {report.photoUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => setLightboxUrl(url)}
                className="shrink-0"
              >
                <img
                  src={url}
                  alt=""
                  className="w-32 h-32 rounded-xl object-cover border border-border"
                />
              </button>
            ))}
          </motion.div>
        )}

        {/* Details */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-card rounded-2xl border border-border p-4 flex flex-col gap-3"
        >
          {report.description && (
            <p className="text-sm text-text-secondary leading-relaxed">
              {report.description}
            </p>
          )}
          <div className="flex flex-col gap-2 text-xs text-text-muted">
            {report.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-brand-600 shrink-0" />{" "}
                {report.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="shrink-0" /> Filed{" "}
              {timeAgo(report.created_at)}
            </span>
            {report.type === "found_walkin" ? (
              <span className="flex items-center gap-1.5">
                <User size={13} className="shrink-0" />
                Dropped off by:{" "}
                <span className="font-medium">
                  {report.walkin_finder_name ??
                    report.walkin_finder_ref ??
                    "Unknown"}
                </span>
              </span>
            ) : (
              reporter && (
                <span className="flex items-center gap-1.5">
                  <User size={13} className="shrink-0" /> {reporter.first_name}{" "}
                  {reporter.last_name}
                </span>
              )
            )}
            {report.category && (
              <span className="bg-surface-muted text-text-secondary px-2 py-0.5 rounded-full text-[11px] inline-flex w-fit">
                {report.category}
              </span>
            )}
          </div>
        </motion.div>

        {/* Reporter: claim review panel */}
        {isOwner && isClaimed && claim && (
          <motion.div
            id="claim"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-card rounded-2xl border border-status-claimed-text/20 p-4"
          >
            <p className="text-xs font-semibold text-status-claimed-text mb-3">
              Someone claims to have found your item
            </p>
            {claimant && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center">
                  <User size={14} className="text-text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {claimant.first_name} {claimant.last_name}
                  </p>
                  <div className="flex items-center gap-1">
                    <Star size={11} className="text-status-open-text" />
                    <p className="text-[11px] text-text-muted">
                      Trust score: {claimant.trust_score}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {claim.photoUrls?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
                {claim.photoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxUrl(url)}
                    className="shrink-0"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-24 h-24 rounded-xl object-cover border border-border"
                    />
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleClaimAction("approve")}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> Approve
              </button>
              <button
                onClick={() => handleClaimAction("reject")}
                disabled={actioning}
                className="flex-1 h-11 rounded-xl border border-status-rejected-text/30 text-status-rejected-text text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <XCircle size={16} /> Reject
              </button>
            </div>
          </motion.div>
        )}

        {/* Reporter: approved — mark as resolved (only when not drop-off) */}
        {isOwner && isApproved && !claim?.drop_off_chosen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-status-open-bg rounded-2xl border border-status-open-text/20 p-4"
          >
            <p className="text-xs font-semibold text-status-open-text mb-1">
              Claim approved!
            </p>
            <p className="text-xs text-status-open-text/80 mb-3">
              Once you've received your item, take a photo as proof and mark it
              as resolved.
            </p>
            <button
              onClick={handleResolveClick}
              disabled={actioning}
              className="w-full h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Camera size={16} /> Mark as resolved
            </button>
          </motion.div>
        )}

        {/* Approved: messaging thread + claimant notice */}
        {isApproved &&
          claim &&
          (isOwner || claim?.claimant_id === session?.user.id) && (
            <div id="messages" className="flex flex-col gap-4">
              {!isOwner && claim?.claimant_id === session?.user.id && (
                <div className="bg-status-approved-bg border border-status-approved-text/20 rounded-xl px-4 py-3 text-xs text-status-approved-text">
                  <p className="font-semibold mb-0.5">
                    Your claim was approved!
                  </p>
                  <p>
                    Use the thread below to arrange handoff with the reporter.
                  </p>
                </div>
              )}
              <MessageThread
                claim={claim}
                report={report}
                isReporter={isOwner}
              />
            </div>
          )}

        {/* Reporter: proxy pickup */}
        {isOwner && isApproved && claim?.drop_off_chosen && (
          <ProxyRequestForm
            reportId={id}
            reporterId={session?.user.id}
            claimantStudentId={claimant?.student_id}
          />
        )}

        {/* Reporter: proxy confirmation banner */}
        {isOwner && isApproved && claim?.drop_off_chosen && (
          <ConfirmationRequestBanner reportId={id} />
        )}

        {/* Resolved */}
        {isResolved && (
          <div className="bg-surface-muted rounded-2xl p-4 text-center">
            <CheckCircle2
              size={24}
              className="text-status-open-text mx-auto mb-2"
            />
            <p className="text-sm font-semibold text-text-primary">
              Item recovered!
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              This report has been resolved.
            </p>
          </div>
        )}

        {/* Non-owner: walk-in notice */}
        {!isOwner && report?.type === "found_walkin" && isOpen && (
          <div className="bg-status-open-bg border border-status-open-text/20 rounded-2xl px-4 py-4 flex flex-col gap-1">
            <p className="text-xs font-semibold text-status-open-text">
              This item is at the ISSC office
            </p>
            <p className="text-xs text-status-open-text/80">
              If this belongs to you, bring your valid school ID or Certificate
              of Registration (COR) to the ISSC office to claim it in person. No
              app submission needed.
            </p>
          </div>
        )}

        {/* Non-owner: claim button */}
        {!isOwner &&
          report?.type !== "found_walkin" &&
          (isOpen || report?.last_rejected_claimant_id === session?.user?.id) &&
          claim?.status !== "pending" &&
          claim?.status !== "approved" && (
            <Link
              to={`/reports/${id}/claim`}
              className="w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <MessageSquare size={16} /> I found this item
            </Link>
          )}

        {/* Non-owner: claim pending notice */}
        {!isOwner &&
          isClaimed &&
          (claim?.claimant_id === session?.user.id ? (
            <div className="bg-status-approved-bg border border-status-approved-text/20 rounded-xl px-4 py-3 text-xs text-status-approved-text">
              <p className="font-semibold mb-0.5">
                Your claim is under review.
              </p>
              <p>
                Your claim is pending the reporter's review. You'll be notified
                once a decision is made.
              </p>
            </div>
          ) : (
            <div className="bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-4 py-3 text-xs text-status-claimed-text">
              This item is currently under claim review. You may still submit a
              tip if you have relevant information.
            </div>
          ))}

        {/* Claimant: rejection feedback */}
        {!isOwner &&
          report?.last_rejected_claimant_id === session?.user?.id &&
          !isClaimed &&
          !isApproved &&
          !isResolved && (
            <div className="bg-status-rejected-bg border border-status-rejected-text/20 rounded-xl px-4 py-3 text-xs text-status-rejected-text">
              <p className="font-semibold mb-0.5">
                Your claim was not approved.
              </p>
              <p>
                The reporter has reviewed and declined your claim. The item is
                now open for new claims.
              </p>
            </div>
          )}

        {/* Others: reopened after rejected claim */}
        {!isOwner &&
          isOpen &&
          report.had_rejected_claim &&
          report.last_rejected_claimant_id !== session?.user.id && (
            <div className="bg-surface-muted border border-border rounded-xl px-4 py-3 text-xs text-text-secondary">
              A previous claim was reviewed and declined. This item is open
              again — submit a claim if you found it.
            </div>
          )}

        {/* Tips */}
        <div
          id="tips"
          className="bg-surface-card rounded-2xl border border-border p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <Lightbulb size={15} className="text-status-claimed-text" /> Tips
              & sightings
            </h2>
            <span
              className={`text-[11px] font-medium ${tips.length >= 25 ? "text-status-rejected-text" : "text-text-muted"}`}
            >
              {tips.length}/25
            </span>
          </div>

          {tips.length === 0 && (
            <p className="text-xs text-text-muted mb-3">
              No tips yet. If you've seen this item, leave a note below.
            </p>
          )}

          {tips.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {(() => {
                const parents = tips.filter((t) => !t.parent_tip_id);
                const repliesMap = tips.reduce((acc, t) => {
                  if (t.parent_tip_id) {
                    acc[t.parent_tip_id] = [...(acc[t.parent_tip_id] ?? []), t];
                  }
                  return acc;
                }, {});

                return parents.map((parent) => (
                  <div key={parent.id} className="flex flex-col gap-1.5">
                    <TipCard
                      tip={parent}
                      isOwn={parent.user_id === session?.user.id}
                      isReply={false}
                      isHighlighted={highlightedTipId === parent.id}
                      credited={parent.credited}
                      onConvert={
                        parent.user_id === session?.user.id &&
                        isOpen &&
                        claim?.status !== "pending" &&
                        claim?.status !== "approved" &&
                        !parent.converted_to_claim_id
                          ? () => handleConvertTip(parent)
                          : null
                      }
                      onReply={
                        parent.user_id !== session?.user.id
                          ? () => {
                              setParentTipId(parent.id);
                              setTipText(`@${parent.users?.first_name ?? ""} `);
                            }
                          : null
                      }
                    />
                    {(repliesMap[parent.id] ?? []).map((reply) => (
                      <TipCard
                        key={reply.id}
                        tip={reply}
                        isOwn={reply.user_id === session?.user.id}
                        isReply={true}
                        isHighlighted={highlightedTipId === reply.id}
                        credited={reply.credited}
                        onConvert={
                          reply.user_id === session?.user.id &&
                          isOpen &&
                          claim?.status !== "pending" &&
                          claim?.status !== "approved" &&
                          !reply.converted_to_claim_id
                            ? () => handleConvertTip(reply)
                            : null
                        }
                        onReply={
                          reply.user_id !== session?.user.id
                            ? () => {
                                setParentTipId(parent.id);
                                setTipText(
                                  `@${reply.users?.first_name ?? ""} `,
                                );
                              }
                            : null
                        }
                      />
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}

          {tips.length >= 25 ? (
            <div className="bg-surface-muted rounded-xl px-3 py-2.5 text-xs text-text-secondary text-center">
              This report has reached the maximum of 25 tips. No further tips
              can be submitted.
            </div>
          ) : (
            !isResolved && (
              <form onSubmit={handleTipSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Share a sighting or lead…"
                  value={tipText}
                  onChange={(e) => setTipText(e.target.value)}
                  maxLength={200}
                  className="flex-1 h-10 px-3 text-xs rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
                />
                <button
                  type="submit"
                  disabled={submittingTip || !tipText.trim()}
                  className="h-10 px-4 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            )
          )}

          {tipError && (
            <p className="text-[11px] text-status-rejected-text mt-2">
              {tipError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
