import { useEffect, useState, useRef } from "react";
import { supabase } from "../../shared/lib/supabase";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export default function ProxyRequestForm({
  reportId,
  reporterId,
  claimantStudentId,
}) {
  const [proxyStudentId, setProxyStudentId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [verifiedName, setVerifiedName] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [existingRequest, setExistingRequest] = useState(null);
  const validateRef = useRef(null);

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

      // Look up the student
      const res = await fetch(
        `${SERVER_URL}/accounts?search=${encodeURIComponent(inputId)}&limit=5`,
      );
      const body = await res.json();
      const exact = (body.accounts ?? []).find((a) => a.student_id === inputId);

      if (exact) {
        setValidation("valid");
        setVerifiedName(`${exact.first_name} ${exact.last_name}`);
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
      const { error: insertError } = await supabase
        .from("proxy_requests")
        .insert({
          report_id: reportId,
          reporter_id: reporterId,
          proxy_name: verifiedName,
          proxy_student_id: proxyStudentId.trim().toUpperCase(),
        });
      if (insertError) throw insertError;
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
              className={`w-full h-10 px-3 text-sm rounded-xl border bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 ${
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                Checking…
              </span>
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
          disabled={submitting || validation !== "valid"}
          className="w-full h-10 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {submitting ? "Registering…" : "Register proxy pickup"}
        </button>
      </form>
    </div>
  );
}
