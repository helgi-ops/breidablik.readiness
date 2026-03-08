// src/lib/postTraining/getPostTrainingRecommendations.ts

import { evaluatePostTrainingTemplateIds, type PostTrainingContext, type RuleRow } from "./evaluatePostTraining";
// ATH: Notaðu þinn supabase helper (þú ert með getSupabaseClient í projectinu)
import { getSupabaseClient } from "@/lib/supabaseClient";

type TemplateRow = {
  id: string;
  title: string;
  duration_min: number;
  tags: string[];
  structure: any; // jsonb
  is_active: boolean;
};

export async function getPostTrainingRecommendations(ctx: PostTrainingContext) {
  const supabase = getSupabaseClient();

  // 1) Rules
  const { data: rules, error: rulesErr } = await supabase
    .from("post_training_rules")
    .select("id, priority, when_clause, then_clause, is_active")
    .eq("is_active", true);

  if (rulesErr) throw rulesErr;

  const ruleRows = (rules ?? []) as RuleRow[];

  // 2) Decide template IDs
  // ✅ daily er nú valið inni í evaluatePostTrainingTemplateIds (rotation)
  const templateIds = evaluatePostTrainingTemplateIds(ctx, ruleRows);

  // 3) Templates
  const { data: templates, error: tmplErr } = await supabase
    .from("post_training_templates")
    .select("id, title, duration_min, tags, structure, is_active")
    .in("id", templateIds)
    .eq("is_active", true);

  if (tmplErr) throw tmplErr;

  // 4) Keep same order as templateIds
  const map = new Map((templates ?? []).map((t: any) => [t.id, t as TemplateRow]));
  return templateIds.map((id) => map.get(id)).filter(Boolean) as TemplateRow[];
}