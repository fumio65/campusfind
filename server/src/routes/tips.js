import { Router } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { adjustTrustScore } from "../lib/trustScore.js";
import { notifyUser } from "../lib/notifyUser.js";

const router = Router();

// PATCH /tips/:id/credit — reporter credits a tip for helping recovery
router.patch("/:id/credit", async (req, res) => {
  const { userId, reportId, resolveReport } = req.body;

  if (!userId || !reportId)
    return res.status(400).json({ error: "userId and reportId required" });

  const { data: tip } = await supabaseAdmin
    .from("tips")
    .select("id, user_id, report_id, reports(title)")
    .eq("id", req.params.id)
    .single();

  if (!tip) return res.status(404).json({ error: "Tip not found" });

  // Mark tip as credited
  await supabaseAdmin
    .from("tips")
    .update({ credited: true })
    .eq("id", req.params.id);

  // +2 trust score for the tip submitter
  await adjustTrustScore(
    userId,
    2,
    "tip credited with helping recover an item",
  );

  // Notify the tip submitter
  await notifyUser({
    userId,
    type: "tip_credited",
    title: "Your tip helped! +2 Trust Score",
    body: `The reporter confirmed your tip helped recover "${tip.reports?.title ?? "an item"}". You earned +2 trust score.`,
    reportId,
  });

  // Resolve the report via tip
  if (resolveReport === true || resolveReport === "true") {
    await supabaseAdmin
      .from("reports")
      .update({ status: "resolved", resolved_via: "tip_credited" })
      .eq("id", reportId);
  }

  res.json({ ok: true });
});

// POST /tips/notify — notify relevant users when a tip or reply is submitted
router.post("/notify", async (req, res) => {
  const { reportId, tipAuthorId, parentTipId } = req.body;
  if (!reportId || !tipAuthorId)
    return res.status(400).json({ error: "reportId and tipAuthorId required" });

  // Fetch report for title and reporter
  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("title, reporter_id")
    .eq("id", reportId)
    .single();

  if (!report) return res.status(404).json({ error: "Report not found" });

  const recipients = new Set();

  if (parentTipId) {
    // It's a reply — notify parent tip author and reporter
    const { data: parentTip } = await supabaseAdmin
      .from("tips")
      .select("user_id")
      .eq("id", parentTipId)
      .single();

    if (parentTip?.user_id) recipients.add(parentTip.user_id);
    if (report.reporter_id) recipients.add(report.reporter_id);

    // Also notify all previous tippers on this report
    const { data: previousTippers } = await supabaseAdmin
      .from("tips")
      .select("user_id")
      .eq("report_id", reportId);

    for (const tipper of previousTippers ?? []) {
      if (tipper.user_id) recipients.add(tipper.user_id);
    }
  } else {
    // It's a top-level tip — notify reporter and all previous tippers
    if (report.reporter_id) recipients.add(report.reporter_id);

    // Fetch all distinct users who have tipped on this report
    const { data: previousTippers } = await supabaseAdmin
      .from("tips")
      .select("user_id")
      .eq("report_id", reportId);

    for (const tipper of previousTippers ?? []) {
      if (tipper.user_id) recipients.add(tipper.user_id);
    }
  }

  // Remove the tip author — no self-notification
  recipients.delete(tipAuthorId);

  // Send notifications
  for (const userId of recipients) {
    await notifyUser({
      userId,
      type: parentTipId ? "tip_reply" : "tip_submitted",
      title: parentTipId ? "New reply on a tip" : "New tip on your report",
      body: parentTipId
        ? `Someone replied to a tip on "${report.title}".`
        : `Someone left a tip on "${report.title}".`,
      reportId,
    });
  }

  res.json({ ok: true });
});

export default router;