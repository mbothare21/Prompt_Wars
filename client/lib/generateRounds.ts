// /lib/generateRounds.ts
import type { Round } from "./types";

export function generateRounds(): Round[] {
    return [
        // ── Round 1: CLASSIFY ──────────────────────────────────────────
        {
            roundNumber: 1,
            type: "CLASSIFY",
            instruction: "A senior prompt engineer wrote the complex system prompt below. Identify the specific Prompt Engineering technique used in each block.",
            input: "Identify the 4 techniques used in the prompt.",
            promptParts: [
                {
                    id: "q1",
                    text: "You are acting as a strategic advisor to a rapidly scaling startup operating in a highly competitive and fast-evolving digital ecosystem. Your goal is to help the team identify practical, high-impact actions that can improve long-term user engagement and retention.",
                    options: ["Few-Shot Prompting", "Role Prompting", "Chain of Thought", "Negative Prompting"],
                    answer: "Role Prompting"
                },
                {
                    id: "q2",
                    text: "Before arriving at your final answer, take a moment to carefully analyze the problem from multiple angles. Consider user psychology, product design, behavioral patterns, and business constraints. Internally reason through different possible approaches, weigh trade-offs, and refine your thinking before presenting a response.",
                    options: ["Output Constraints", "Role Prompting", "Chain of Thought", "Zero-Shot Prompting"],
                    answer: "Chain of Thought"
                },
                {
                    id: "q3",
                    text: "To guide your thinking, review the following reference patterns:\nCase A\nInput: Reduce churn\nOutput: Improve onboarding experience, provide proactive support during the first week, and personalize user journeys based on behavior\nCase B\nInput: Increase conversions\nOutput: Simplify checkout flow, introduce trust signals such as reviews, and optimize pricing presentation for clarity\nCase C\nInput: Improve feature adoption\nOutput: Introduce contextual tooltips, guide users with walkthroughs, and highlight value through real-time feedback",
                    options: ["Few-Shot Prompting", "Context Setting", "Negative Prompting", "Meta-Prompting"],
                    answer: "Few-Shot Prompting"
                },
                {
                    id: "q4",
                    text: "Now address the following scenario:\nProblem: Users sign up for productivity applications with high initial intent but gradually lose interest after a few days, resulting in low long-term engagement and retention.\n\nWhile responding, keep the following in mind:\n- Ensure your response is organized in a logical and easy-to-follow manner\n- Focus on practical, actionable strategies rather than abstract ideas\n- Keep the explanation concise, but do not oversimplify important details\n- Avoid unnecessary jargon unless absolutely required\n- Balance creativity with realism in your suggestions\n\nAdditionally, consider edge cases such as:\n- Users who drop off after initial onboarding\n- Users who engage inconsistently\n- Users who find the product useful but not habit-forming\n\nYour response should:\n- Clearly present key strategies in a structured format\n- Be easy to scan and understand at a glance\n- Maintain clarity and coherence throughout\n- Conclude with a short, impactful closing line that reinforces the overall strategy",
                    options: ["Few-Shot Prompting", "Role Prompting", "Output Constraints", "Chain of Thought"],
                    answer: "Output Constraints"
                }
            ],
            constraints: {
                requiredAccuracy: "75% (3 out of 4 correct)"
            }
        },

        // ── Round 2: IMPROVE ───────────────────────────────────────────
        {
            roundNumber: 2,
            type: "IMPROVE",
            instruction:
                "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to produce the desired structured output. Improve the given prompt to extract structured highlights (Conflicts, Decisions, Dependencies, Next Steps) in ≤90 words.",
            originalPrompt: "Summarize this",
            input: `The quarterly strategy meeting for the upcoming product launch was held on Monday and brought together stakeholders from product management, marketing, operations, customer success, and regional sales teams. While the meeting was initially intended to finalize the launch timeline and align on execution priorities, it quickly became evident that there were several unresolved dependencies and differing viewpoints that prevented clear decision-making.

The product team began by presenting the current development status, noting that while most core features were complete, two critical modules were still undergoing quality assurance testing. They indicated that although the issues identified so far were not major, there remained a non-negligible risk of defects surfacing if timelines were compressed further. Despite this, the marketing team strongly advocated for adhering to the originally proposed launch date, emphasizing that the timing aligned with a seasonal demand spike and a planned multi-channel campaign involving digital ads, influencer collaborations, and email outreach.

This created an early tension in the discussion, with product prioritizing stability and marketing prioritizing speed and market opportunity. The situation was further complicated by the absence of the finance team, which meant that budget approvals for the proposed campaigns and contingency planning could not be confirmed. As a result, multiple conversations around marketing spend, return on investment, and risk mitigation remained speculative and inconclusive.

Operations contributed by highlighting potential supply chain challenges, particularly with one key vendor facing delays in a specific region. While they noted that alternative arrangements could be explored, no concrete mitigation plan was presented during the meeting. Customer success representatives raised concerns about the impact of a rushed launch on user experience, pointing out that early defects or delays could lead to increased support tickets and potential reputational damage.

Throughout the meeting, several participants attempted to steer the discussion toward actionable outcomes, but the conversation frequently diverged into side topics, including long-term product roadmap considerations and comparisons with competitor launches. This lack of focus made it difficult to consolidate viewpoints or prioritize decisions. Some team members expressed frustration over the recurring pattern of discussions without closure, noting that similar issues had been raised in previous meetings without resolution.

Interestingly, a subset of participants argued that delaying the launch by a few weeks could actually strengthen the overall product quality and allow for more robust marketing preparation. However, others countered that missing the current market window could reduce the campaign's effectiveness and potentially allow competitors to gain an advantage. This highlighted a broader strategic trade-off between short-term opportunity capture and long-term brand positioning.

Another point of discussion was the lack of clearly defined ownership for key tasks. While various ideas and concerns were raised, there was no structured approach to assigning responsibilities or tracking follow-ups. This contributed to a sense of ambiguity and reduced accountability across teams. Additionally, no formal mechanism was used to document decisions or action items during the meeting, further complicating post-meeting alignment.

By the end of the session, it became clear that the primary objective of finalizing the launch plan had not been achieved. No firm decisions were made regarding the timeline, budget allocation, or risk mitigation strategies. The group agreed to schedule a follow-up meeting later in the week, ideally with finance representatives present, to address outstanding questions and attempt to reach alignment. However, no specific agenda or prioritization framework was established for this next discussion.

Overall, the meeting reflected strong engagement from all teams but lacked the structure and decisiveness needed to translate discussion into action. While key risks, dependencies, and strategic considerations were surfaced, the absence of alignment, ownership, and clarity left the product launch plan in an uncertain state.`,
            expectedOutput: `
Decisions
No decisions were finalized
2. Key Conflicts & Trade-offs
Product (quality/stability) vs Marketing (speed/seasonal opportunity)
Short-term market capture vs long-term brand/reliability
Campaign readiness vs product readiness
3. Risks & Dependencies
QA risk in 2 critical modules
Supply chain/vendor delays (region-specific)
Potential customer experience impact
Missing finance input (budget, ROI, contingencies)
4. Unknowns / Gaps
No clear ownership or accountability
No defined mitigation plans
Unconfirmed budget approvals
Lack of structured decision framework
5. Next Steps
Schedule follow-up with finance team
Define agenda, priorities, and decision criteria
Assign ownership for risks, QA, and supply chain mitigation
      `,
            constraints: {
                maxWords: 90,
                requiredSections: [
                    "Conflicts",
                    "Decisions",
                    "Dependencies",
                    "Next Steps",
                ],
            },
        },

        // ── Round 3: REVERSE ───────────────────────────────────────────
        {
            roundNumber: 3,
            type: "REVERSE",
            instruction:
                "Write a prompt that would generate the following structured startup idea.",
            expectedOutput: `Startup: Smart Habit AI

Problem:
People fail to build consistent habits due to lack of personalization and accountability.

Solution:
AI tracks behavior patterns and dynamically adjusts habit plans with nudges and feedback.

Audience:
Young professionals, students

Features:
- Behavior tracking
- Adaptive habit plans
- Gamified streaks
- Accountability reminders

Revenue:
Subscription + premium insights

Differentiator:
Real-time behavioral adaptation

Tagline:
"Build better habits, effortlessly."

Risks:
User drop-off after initial engagement`,
            constraints: {
                requiredSections: [
                    "Problem",
                    "Solution",
                    "Audience",
                    "Features",
                    "Revenue",
                    "Differentiator",
                    "Tagline",
                    "Risks",
                ],
            },
        },

        // ── Round 4: OPTIMIZE ──────────────────────────────────────────
        {
            roundNumber: 4,
            type: "OPTIMIZE",
            instruction:
                "Write the SHORTEST prompt (≤15 words) to explain a complex concept simply using an analogy.",
            input:
                "Explain a complex concept in a simple way using an analogy",
            expectedOutput:
                "AI is like a trained cricketer who has seen millions of deliveries and uses that experience to decide how to play the next ball.\u200B",
            constraints: { maxWords: 15 },
        },

        // ── Round 5: STRUCTURED ────────────────────────────────────────
        {
            roundNumber: 5,
            type: "STRUCTURED",
            instruction:
                "Design a prompt that forces the AI to think step-by-step and produce a structured solution.",
            input: `A man needs to cross a river with a wolf, a goat, and a cabbage.

Rules:
- He can carry only one item at a time
- The wolf cannot be left alone with the goat
- The goat cannot be left alone with the cabbage`,
            expectedOutput: "Step-by-step solution with final structured answer",
            constraints: { requireSteps: true },
        },

        // ── Round 6: BONUS (Meta-Prompting) ────────────────────────────
        {
            roundNumber: 6,
            type: "BONUS",
            instruction:
                "You are given a scenario and a target output. Write a meta-prompt: a prompt that, when given to an AI along with the scenario, will generate a much more detailed and constraint-aware prompt. Then, write the final improved prompt yourself. Your final prompt's output will be evaluated against the ideal target. The constraints are NOT listed — you must infer what makes a strong output through meta-prompting.",
            input: `A software team is 2 weeks behind schedule on a critical feature (Project Phoenix — internal billing system migration) due to unexpected breaking changes in a third-party payment API (Stripe v2 → v3). The team has identified a workaround using an adapter pattern but it requires 3 additional sprint cycles (6 weeks). The original deadline was end of Q2 (June 30). Key stakeholders include the VP of Engineering, Finance Director, and the CTO. The billing system processes $4.2M in monthly transactions. Two junior developers were recently onboarded to help. Integration tests are currently at 62% coverage (target: 90%). The team is also managing tech debt from the legacy system that causes ~3 incidents/week.`,
            targetOutput: `Subject: Project Phoenix — Status Update & Revised Timeline

Dear Stakeholders,

Executive Summary:
Project Phoenix (billing system migration) is currently 2 weeks behind the original Q2 deadline due to breaking changes in Stripe's API (v2 → v3). We have identified a viable path forward using an adapter pattern, with a revised delivery date of August 11.

Current Status:
- Migration progress: Core modules complete; payment integration blocked by API changes
- Test coverage: 62% (target: 90%) — dedicated sprint planned to close gap
- Team: 2 junior developers onboarded; ramping on codebase and adapter pattern
- Legacy incidents: ~3/week — temporary monitoring escalation in place

Root Cause Analysis:
Stripe's v2 → v3 migration introduced undocumented breaking changes in webhook signatures and idempotency handling. Our existing integration assumed backward compatibility, which was not maintained. Discovery occurred during integration testing phase.

Impact Assessment:
- Timeline: +6 weeks (3 sprint cycles) from original June 30 deadline
- Financial risk: $4.2M/month in transactions processed through billing system
- Operational: Legacy system incidents may increase without mitigation
- Resource: Junior developer ramp-up adds short-term velocity cost

Proposed Path Forward:
1. Sprint 7-8: Implement adapter pattern for Stripe v3 compatibility
2. Sprint 9: Integration testing push to reach 90% coverage target
3. Parallel track: Legacy incident reduction through targeted hotfixes
4. Weekly stakeholder syncs every Tuesday at 2 PM

Revised Timeline:
| Milestone | Original Date | Revised Date |
|-----------|--------------|--------------|
| API adapter complete | N/A | July 14 |
| Test coverage ≥ 90% | June 16 | July 28 |
| Staging deployment | June 23 | August 4 |
| Production go-live | June 30 | August 11 |

Risk Mitigation:
- Fallback: Maintain legacy system in parallel until 2 weeks post-migration
- Monitoring: PagerDuty alerts for transaction anomalies during cutover
- Rollback plan: Feature flag enables instant revert to legacy billing

Next Steps:
- [ ] Finalize adapter pattern design review (by Friday)
- [ ] Schedule load testing for revised architecture
- [ ] Establish weekly metrics dashboard for stakeholder visibility
- [ ] Junior developer pair programming schedule with senior engineers

Please let me know if you'd like to discuss any of these points in detail. I recommend we schedule a 30-minute review this Thursday to align on the revised timeline.

Best regards,
Engineering Lead — Project Phoenix`,
            expectedOutput: "A well-structured project status email with clear sections, professional tone, specific details, and actionable next steps.",
            constraints: {},
        }
    ];
}
