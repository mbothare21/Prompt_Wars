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
                requiredAccuracy: 1
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
                "You are given a scenario and a target signature. Write a meta-prompt that will make an AI generate a far more detailed, constraint-aware final prompt. The hidden constraints are NOT listed — your job is to think of as many of them as possible so the compiled prompt produces the strongest output.",
            input: `The Aurora identity-platform migration is 3 weeks behind schedule after an external vendor schema change broke Okta SCIM provisioning. The fallback batch-sync job is now duplicating accounts in 4 of 12 regions. The original enterprise cutover date was May 15, and the revised target is June 9 if the team approves a phased rollout and a weekend production freeze. The platform serves 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC. The SSO uptime SLO is 99.95%, and there have been 9 Sev-2 authentication incidents in the last 30 days. Legal has raised GDPR concerns around EU log retention, and Security requires MFA enforcement before go-live. Customer Success needs a communication plan for 47 strategic accounts. Finance has capped additional spend at $180k, while an external identity consultant would cost $95k. The team currently has 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead. Automated regression coverage is 71% with a target of 92%. Key stakeholders are the CIO, CISO, VP Customer Success, Director of Compliance, and CFO. A go/no-go decision is needed by Wednesday at 4 PM, and any production cutover must happen during the Saturday 10 PM-2 AM maintenance window.`,
            expectedOutput: "An executive stakeholder update with quantified risks, explicit decisions, a revised timeline, and actionable next steps.",
            constraints: {},
        }
    ];
}
