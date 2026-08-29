import { useEffect, useState, useRef } from "react";
import { supabase } from "../../shared/lib/supabase";
import { useOnlineStatus } from "../../shared/lib/network";

export default function ProxyRequestForm({
  reportId,
  reporterId,
  claimantStudentId,
}) {
  const [proxyStudentId, setProxyStudentId] = useState("");
  const [validating, setValidating]         = useState(false);
  const [validation, setValidation]         = useState(null);
  const [verifiedName, setVerifiedName]     = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [error, setError]                   = useState(null);
  const [existingRequest, setExistingRequest] = useState(null);
  const validateRef = useRef(null);
  // This form validates and registers a proxy against the live student
  // directory, so - like login - it requires connectivity rather than
  // going through the offline write queue.
  const isOnline = useOnlineStatus();

  useEffect(() => {
    checkExisting();
  }, [reportId]);

  async function checkExisting() {
    const { data } = await supabase
      .from("proxy_requests")
      .select("*")
      .eq("report_id", reportId)
      .maybeSingle();
    if (data) setExistingRequest(data);
  }

  function handleStudentIdChange(value) {
    setProxyStudentId(value);
    setValidation(null);
    setVerifiedName(null);
    clearTimeout(validateRef.current);
    if (!value.trim()) return;
    validateRef.current = setTimeout(() => validateStudentId(value), 600);
  }

  async function validateStudentId(studentId) {
    setValidating(true);
    try {
      const inputId = studentId.trim().toUpperCase();

      // Block owner's own Student ID
      const { data: owner } = await supabase
        .from("users")
        .select("student_id")
        .eq("id", reporterId)
        .single();

      if (owner?.student_id?.toUpperCase() === inputId) {
        setValidation("is_owner");
        setVerifiedName(null);
        setValidating(false);
        return;
      }

      // Block the finder/claimant from being proxy
      if (claimantStudentId && claimantStudentId.toUpperCase() === inputId) {
        setValidation("is_finder");
        setVerifiedName(null);
        setValidating(false);
        return;
      }

      // FIX: was calling SERVER_URL/accounts (dead Express server)
      // Now queries Supabase directly
      const { data: user } = await supabase
        .from("users")
        .select("id, first_name, last_name, student_id")
        .eq("student_id", inputId)
        .maybeSingle();

      if (user) {
        setValidation("valid");
        setVerifiedName(`${user.first_name} ${user.last_name}`);
      } else {
        setValidation("invalid");
        setVerifiedName(null);
      }
    } catch {
      setValidation(null);
      setVerifiedName(null);
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (validation !== "valid" || !verifiedName) return;
    setSubmitting(true);
    setError(null);
    try {
      const proxyId = proxyStudentId.trim().toUpperCase();

      // Check if proxy_request already exists — upsert
      const { data: existing } = await supabase
        .from("proxy_requests")
        .select("id")
        .eq("report_id", reportId)
        .eq("reporter_id", reporterId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("proxy_requests")
          .update({
            proxy_name: verifiedName,
            proxy_student_id: proxyId,
            status: "pending",
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("proxy_requests").insert({
          report_id: reportId,
          reporter_id: reporterId,
          proxy_name: verifiedName,
          proxy_student_id: proxyId,
        });
      }

      // FIX: was relying on Express route for admin notification — now inserts directly
      // notifications table is global admin-only (no user_id column)
      await supabase.from("notifications").insert({
        type: "proxy_request",
        title: "Proxy Pickup Registered",
        body: `${verifiedName} (${proxyId}) has been authorized to pick up an item on the owner's behalf.`,
        report_id: reportId,
        read: false,
      });

      setSubmitted(true);
      checkExisting();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (existingRequest || submitted) {
    return (
      <div className="bg-surface-card rounded-2xl border border-border p-4">
        <p className="text-xs font-semibold text-text-primary mb-1">
          Proxy pickup registered
        </p>
        <p className="text-xs text-text-muted">
          <span className="font-medium text-text-primary">
            {existingRequest?.proxy_name ?? verifiedName}
          </span>{" "}
          ({existingRequest?.proxy_student_id ?? proxyStudentId.toUpperCase()})
          is authorized to pick up this item on your behalf. The ISSC office has
          been notified.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4">
      <p className="text-xs font-semibold text-text-primary mb-0.5">
        Send someone to pick up the item?
      </p>
      <p className="text-xs text-text-muted mb-3">
        Enter their Student ID to authorize a proxy pickup at the ISSC office.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!isOnline && (
          <p className="text-[11px] text-status-rejected-text bg-status-rejected-bg rounded-lg px-2.5 py-2">
            Registering a proxy pickup requires an internet connection.
          </p>
        )}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">
            Proxy's Student ID{" "}
            <span className="text-status-rejected-text">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. 18-00045"
              value={proxyStudentId}
              onChange={(e) => handleStudentIdChange(e.target.value)}
              maxLength={8}
              disabled={!isOnline}
              className={`w-full h-10 px-3 text-sm rounded-xl border bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50 ${
                validation === "valid"
                  ? "border-status-open-text"
                  : validation === "invalid" ||
                      validation === "is_owner" ||
                      validation === "is_finder"
                    ? "border-status-rejected-text"
                    : "border-border-strong"
              }`}
            />
            {validating && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {validation === "valid" && verifiedName && (
            <p className="text-[11px] text-status-open-text mt-1 flex items-center gap-1">
              ✓ <span className="font-semibold">{verifiedName}</span> — verified
            </p>
          )}
          {validation === "invalid" && (
            <p className="text-[11px] text-status-rejected-text mt-1">
              Student ID not found in the system.
            </p>
          )}
          {validation === "is_owner" && (
            <p className="text-[11px] text-status-rejected-text mt-1">
              That's your own Student ID. Enter someone else's ID.
            </p>
          )}
          {validation === "is_finder" && (
            <p className="text-[11px] text-status-rejected-text mt-1">
              The finder cannot be the proxy — they already handed in the item.
            </p>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-status-rejected-text">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || validation !== "valid" || !isOnline}
          className="w-full h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {submitting ? "Registering…" : "Register proxy pickup"}
        </button>
      </form>
    </div>
  );
}