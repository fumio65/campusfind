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
    const { error: resolveError } = await supabaseAdmin
      .from("reports")
      .update({ status: "resolved", resolved_via: "tip_credited" })
      .eq("id", reportId);
  }

  res.json({ ok: true });
});

export default router;
