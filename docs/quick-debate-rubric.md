# Quick Debate advisory rubric — quick-v1

Scope: a user's saved Quick Debate transcript. A final ballot requires completion; in-progress snapshots provide an argument map and coaching without a ballot. This is practice feedback, not an official competition ballot or an objective measurement of ability. Model choice, prompt interpretation and reruns can change scores.

| Dimension | Weight | What is assessed                                                                                                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reasoning | 30%    | Connected causal steps, warranted inference, explicit assumptions, counterfactuals and explanatory depth.                                                                       |
| Evidence  | 20%    | Relevant support, quality/scope of available evidence and honest qualification. Assertion or an invented citation is not verified support. Basic analysis has no research tool. |
| Structure | 20%    | Clear claims, links from reasons to conclusions, signposting, prioritization and comparative impact weighing. Length and ornate vocabulary are not proxies for quality.         |
| Rebuttal  | 30%    | Fair engagement with the strongest available opposing reasoning, direct answers and explanation of why the response changes the comparison. Do not reward straw-man arguments.  |

For each dimension: 0 means absent in the available text; 1–3 weak or largely asserted; 4–6 developing with gaps; 7–8 clear, supported and comparative where relevant; 9–10 sustained, precise and well tested against alternatives. Early-finished debates provide limited opportunities, particularly for rebuttal: rationale and uncertainty must acknowledge this. Missing opportunities do not establish general inability. Every dimension cites an exact excerpt from the relevant speaker; this validates attribution, not the quality of the numerical judgment.

Weighted total = reasoning × 3 + evidence × 2 + structure × 2 + rebuttal × 3, out of 100. PostgreSQL computes both totals. A difference of at most three points produces a close/draw result; otherwise the higher total leads. This margin is a product convention, not a formal debate rule. The model supplies explanation/clashes and uncertainty; it cannot override the stored arithmetic.

Delivery is unassessed. Optional audio remains local and is unavailable to the evaluator. No pace, fluency, pronunciation or vocal-delivery score is inferred from text. Model-reported confidence is not a calibrated probability.

Coaching is stored separately from the ballot: strengths, weaknesses, exact excerpts, actions, illustrative rewrites and drill recommendations. A dimension below 6/10 in at least two of the latest 30 eligible evaluations is a recurring focus, not a diagnosis. All-time averages use the latest nonsimulated final evaluation per debate. Rerunning one debate does not add a data point; simulations are excluded. Model differences and small samples limit trend interpretation.

Drills use `drill-v1` criteria from the catalog. Each of three criteria is 0 (absent), 1 (partial) or 2 (clear and explained), total 0–6. Feedback must quote the actual response and remains advisory. A saved nonsimulated attempt earns completion credit regardless of score. Achievements reflect saved activity, not certified proficiency.

Other formal formats remain disabled; they need their own researched and validated rules/rubrics.
