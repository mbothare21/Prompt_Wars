// /lib/generateRounds.ts
import type { Round, PromptPart } from "./types";

function sessionHash(sessionId: string, salt: string): number {
  let h = 5381;
  const s = sessionId + salt;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(sessionId: string, round: number, sets: T[]): T {
  return sets[sessionHash(sessionId, `r${round}`) % sets.length];
}

const ROUND_1_QUESTION_SETS: PromptPart[][] = [
    // ── Set 1 (Original) ──────────────────────────────────────────────
    [
        {
            id: "q1",
            text: "You are acting as a strategic advisor to a rapidly scaling startup operating in a highly competitive and fast-evolving digital ecosystem. Your goal is to help the team identify practical, high-impact actions that can improve long-term user engagement and retention.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Before arriving at your final answer, take a moment to carefully analyze the problem from multiple angles. Consider user psychology, product design, behavioral patterns, and business constraints. Internally reason through different possible approaches, weigh trade-offs, and refine your thinking before presenting a response.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Chain of Thought"
        },
        {
            id: "q3",
            text: "To guide your thinking, review the following reference patterns:\nCase A\nInput: Reduce churn\nOutput: Improve onboarding experience, provide proactive support during the first week, and personalize user journeys based on behavior\nCase B\nInput: Increase conversions\nOutput: Simplify checkout flow, introduce trust signals such as reviews, and optimize pricing presentation for clarity\nCase C\nInput: Improve feature adoption\nOutput: Introduce contextual tooltips, guide users with walkthroughs, and highlight value through real-time feedback",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q4",
            text: "Now address the following scenario:\nProblem: Users sign up for productivity applications with high initial intent but gradually lose interest after a few days, resulting in low long-term engagement and retention.\n\nWhile responding, keep the following in mind:\n- Ensure your response is organized in a logical and easy-to-follow manner\n- Focus on practical, actionable strategies rather than abstract ideas\n- Keep the explanation concise, but do not oversimplify important details\n- Avoid unnecessary jargon unless absolutely required\n- Balance creativity with realism in your suggestions\n\nAdditionally, consider edge cases such as:\n- Users who drop off after initial onboarding\n- Users who engage inconsistently\n- Users who find the product useful but not habit-forming\n\nYour response should:\n- Clearly present key strategies in a structured format\n- Be easy to scan and understand at a glance\n- Maintain clarity and coherence throughout\n- Conclude with a short, impactful closing line that reinforces the overall strategy",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Output Constraints"
        }
    ],

    // ── Set 2 (SaaS Retention) ────────────────────────────────────────
    [
        {
            id: "q1",
            text: "You are a senior product consultant helping a subscription-based SaaS company improve user retention while balancing business goals, technical feasibility, and customer experience.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Before answering, think carefully about possible causes, business impact, implementation effort, and long-term effects. Consider multiple perspectives before deciding on the strongest recommendation.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Chain of Thought"
        },
        {
            id: "q3",
            text: "Consider the following examples before responding:\n\nExample A\nProblem: Low onboarding completion\nRecommendation: Simplify setup and introduce guided walkthroughs.\n\nExample B\nProblem: High churn\nRecommendation: Improve engagement through personalized reminders.\n\nExample C\nProblem: Poor feature adoption\nRecommendation: Add contextual tips and product education.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q4",
            text: "Your response should:\n- Stay under 120 words\n- Use bullet points\n- Avoid technical jargon\n- End with one practical recommendation",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Output Constraints"
        }
    ],

    // ── Set 3 (Healthcare Engagement) ─────────────────────────────────
    [
        {
            id: "q1",
            text: "You are helping the leadership team of a healthcare startup improve patient engagement while ensuring recommendations remain practical and easy to implement.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Review these examples before responding:\n\nCase A\nProblem: Low customer trust\nRecommendation: Add testimonials and transparent pricing.\n\nCase B\nProblem: High abandonment\nRecommendation: Reduce friction during onboarding.\n\nCase C\nProblem: Poor retention\nRecommendation: Introduce reminders and personalized nudges.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q3",
            text: "Think through the problem step-by-step before answering. Consider causes, trade-offs, risks, and practical implications before finalizing your response.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Step-by-Step Reasoning"
        },
        {
            id: "q4",
            text: "Do not use vague language, avoid technical jargon, and avoid repeating the problem statement in your answer.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Step-by-Step Reasoning", "Negative Prompting"],
            answer: "Negative Prompting"
        }
    ]
];

const ROUND_2_SETS = [
    // ── Set 1 (Original — Product Launch Strategy) ────────────────────
    {
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

    // ── Set 2 (Customer Retention Review) ─────────────────────────────
    {
        instruction:
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to extract key business insights (Conflicts, Decisions made, Dependencies, Risks, Next steps) in ≤90 words.",
        originalPrompt: "Give me the key points",
        input: `The quarterly strategy meeting focused on declining customer retention in the company's subscription business. Marketing argued that churn was caused primarily by poor onboarding experiences, while Product believed the issue was related to lack of feature engagement. Engineering highlighted that several planned improvements could not begin due to unresolved dependencies on third-party integrations. Leadership decided to prioritize onboarding redesign over feature expansion for the next quarter and approved a pilot retention initiative for high-risk users. However, there were disagreements regarding budget allocation between marketing campaigns and product-led improvements. Risks discussed included increasing churn, lower annual renewals, and growing customer dissatisfaction if no immediate action was taken. Teams agreed to conduct a detailed churn analysis, redesign onboarding journeys, and revisit feature adoption metrics in the next review cycle.`,
        expectedOutput: `Conflicts:
Marketing blamed onboarding issues for churn, while Product believed low feature engagement was the main cause. Budget allocation disagreements remained unresolved.

Decisions made:
Leadership prioritized onboarding redesign and approved a retention pilot.

Dependencies:
Engineering improvements depend on unresolved third-party integrations.

Risks:
Higher churn, reduced renewals, customer dissatisfaction.

Next steps:
Conduct churn analysis, redesign onboarding, review feature adoption metrics.`,
        constraints: {
            maxWords: 90,
            requiredSections: [
                "Conflicts",
                "Decisions made",
                "Dependencies",
                "Risks",
                "Next steps",
            ],
        },
    },

    // ── Set 3 (Operational Review — Support Delays) ───────────────────
    {
        instruction:
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to generate a concise operational summary (Conflicts, Decisions made, Dependencies, Risks, Next steps) in ≤90 words.",
        originalPrompt: "Tell me the important parts",
        input: `During the operational review meeting, teams discussed recurring delays in customer issue resolution. Support leadership argued that engineering response times were slowing down resolution efforts, while Engineering stated that incomplete issue documentation from support teams caused unnecessary delays. Several automation initiatives were proposed, but implementation was blocked due to pending approvals from compliance and infrastructure teams. Leadership decided to prioritize high-severity issue handling while postponing lower-priority process changes until the next quarter. Concerns were raised regarding rising customer dissatisfaction, potential SLA breaches, and burnout among support staff due to increasing workloads. It was agreed that teams would standardize incident documentation, improve escalation workflows, and revisit automation opportunities after dependencies were resolved.`,
        expectedOutput: `Conflicts:
Support blamed engineering delays, while Engineering cited poor issue documentation.

Decisions made:
Leadership prioritized high-severity issue handling and delayed lower-priority changes.

Dependencies:
Automation efforts depend on compliance and infrastructure approvals.

Risks:
Customer dissatisfaction, SLA breaches, staff burnout.

Next steps:
Standardize documentation, improve escalation workflows, revisit automation later.`,
        constraints: {
            maxWords: 90,
            requiredSections: [
                "Conflicts",
                "Decisions made",
                "Dependencies",
                "Risks",
                "Next steps",
            ],
        },
    },
];

const ROUND_3_SETS = [
    // ── Set 1 (Original — Smart Habit AI Startup) ─────────────────────
    {
        instruction: "Write a prompt that would generate the following structured startup idea.",
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

    // ── Set 2 (Payment Gateway Incident Postmortem) ───────────────────
    {
        instruction: "Write a prompt that would generate the following structured incident postmortem.",
        expectedOutput: `Incident Report: Payment Gateway Service Disruption

Incident Summary:
On March 14, the Payment Gateway Service experienced a major disruption affecting online transactions across North America and parts of Europe. Approximately 38% of payment attempts failed over a 2-hour window, resulting in delayed order confirmations and customer frustration.

Root Cause:
The incident was traced to an infrastructure configuration change during a scheduled deployment. A misconfigured load balancer rule incorrectly routed traffic to outdated service instances, causing transaction failures and timeout errors.

Timeline:
09:00 AM – Infrastructure deployment initiated
09:18 AM – Error rates increased significantly
09:32 AM – Customer complaints began escalating
09:45 AM – Engineering identified abnormal routing behavior
10:10 AM – Rollback initiated
11:05 AM – Service fully restored

Impact:
- 38% failed payment attempts
- Delayed order confirmations
- Increased customer support tickets
- Revenue impact during peak hours

Actions Taken:
- Rolled back infrastructure changes
- Activated incident response team
- Increased monitoring thresholds
- Added validation checks to deployment process

Risks:
Repeated configuration failures may reduce customer trust and increase financial losses.

Next Steps:
Introduce automated rollback triggers, improve deployment validation, and strengthen incident monitoring.`,
        constraints: {
            requiredSections: [
                "Incident Summary",
                "Root Cause",
                "Timeline",
                "Impact",
                "Actions Taken",
                "Risks",
                "Next Steps",
            ],
        },
    },

    // ── Set 3 (Smart Study Planner PRD) ───────────────────────────────
    {
        instruction: "Write a prompt that would generate the following structured product requirements document.",
        expectedOutput: `Product Requirements Document: Smart Study Planner

Problem Statement:
Students often struggle to maintain effective study schedules due to inconsistent routines, lack of personalization, and difficulty prioritizing subjects based on urgency and difficulty.

Objective:
Build an AI-powered study planning assistant that helps students create adaptive study schedules, improve consistency, and optimize learning outcomes.

Target Audience:
- University students
- Competitive exam aspirants
- Working professionals pursuing certifications

Core Features:
- AI-generated personalized study schedules
- Automatic priority adjustment based on deadlines
- Progress tracking and completion analytics
- Smart reminders and habit nudges
- Focus session recommendations

Functional Requirements:
- Users should be able to add subjects and deadlines
- AI should dynamically update plans
- Progress must be visually trackable
- Notifications should adapt to missed sessions

Success Metrics:
- 25% increase in study consistency
- Improved task completion rate
- Higher daily engagement

Risks:
Over-complex recommendations may reduce adoption. Users may abandon plans without sufficient personalization.

Timeline:
MVP delivery in 8 weeks.`,
        constraints: {
            requiredSections: [
                "Problem Statement",
                "Objective",
                "Target Audience",
                "Core Features",
                "Success Metrics",
                "Risks",
                "Timeline",
            ],
        },
    },
];

const ROUND_5_SETS = [
    // ── Set 1 (Original — River Crossing) ─────────────────────────────
    {
        input: `A man needs to cross a river with a wolf, a goat, and a cabbage.

Rules:
- He can carry only one item at a time
- The wolf cannot be left alone with the goat
- The goat cannot be left alone with the cabbage`,
        expectedOutput: "Step-by-step solution with final structured answer",
        constraints: { requireSteps: true },
    },

    // ── Set 2 (Water Bucket Puzzle) ────────────────────────────────────
    {
        input: `A remote campsite has run into a problem while preparing drinking water for a medical supply station. The team only has access to two measuring buckets and no measuring scale.

Available Equipment:
- One 5-liter bucket
- One 3-liter bucket

Objective:
The campsite leader urgently needs exactly 4 liters of water for a treatment process. Neither more nor less is acceptable.

Available Actions:
- You have access to an unlimited water source nearby
- You may fill any bucket completely
- You may empty any bucket completely
- You may transfer water between buckets

Important Note:
Water can only be measured using the available buckets. No markings, external measuring tools, or estimation techniques are allowed.

Goal:
Determine the exact sequence of actions required to measure exactly 4 liters of water.`,
        expectedOutput: "Step-by-step solution with final structured answer",
        constraints: { requireSteps: true },
    },

    // ── Set 3 (Bridge and Torch Puzzle) ───────────────────────────────
    {
        input: `A group of four travelers must cross an old wooden bridge late at night during an emergency evacuation. The bridge is unstable, visibility is poor, and there is only one flashlight available for safe passage.

The travelers walk at different speeds:

Crossing Times:
- Traveler A: 1 minute
- Traveler B: 2 minutes
- Traveler C: 7 minutes
- Traveler D: 10 minutes

Bridge Rules:
- At most two people can cross at the same time
- The flashlight is mandatory for anyone crossing
- Someone must always carry the flashlight back for others
- When two people cross together, they move at the speed of the slower person

Objective:
The group wants to cross the bridge in the shortest total time possible while following all constraints.

Goal:
Find the optimal sequence of crossings and returns that minimizes the total time taken.`,
        expectedOutput: "Step-by-step solution with final structured answer",
        constraints: { requireSteps: true },
    },
];

const ROUND_6_SETS = [
    // ── Set 1 (Original — Aurora Identity Migration) ──────────────────
    {
        input: `The Aurora identity-platform migration is 3 weeks behind schedule after an external vendor schema change broke Okta SCIM provisioning. The fallback batch-sync job is now duplicating accounts in 4 of 12 regions. The original enterprise cutover date was May 15, and the revised target is June 9 if the team approves a phased rollout and a weekend production freeze. The platform serves 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC. The SSO uptime SLO is 99.95%, and there have been 9 Sev-2 authentication incidents in the last 30 days. Legal has raised GDPR concerns around EU log retention, and Security requires MFA enforcement before go-live. Customer Success needs a communication plan for 47 strategic accounts. Finance has capped additional spend at $180k, while an external identity consultant would cost $95k. The team currently has 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead. Automated regression coverage is 71% with a target of 92%. Key stakeholders are the CIO, CISO, VP Customer Success, Director of Compliance, and CFO. A go/no-go decision is needed by Wednesday at 4 PM, and any production cutover must happen during the Saturday 10 PM-2 AM maintenance window.`,
        expectedOutput: "An executive stakeholder update with quantified risks, explicit decisions, a revised timeline, and actionable next steps.",
        constraints: {},
    },

    // ── Set 2 (Fintech Security Incident — MFA / Credential Stuffing) ─
    {
        input: `A fintech company detected suspicious login attempts affecting enterprise customers in Europe and North America. Security monitoring flagged abnormal MFA failures, while legal teams raised concerns around regional compliance obligations. Engineering suspects credential stuffing but lacks confirmation. Leadership needs a go/no-go recommendation on temporarily restricting access for affected users while balancing business continuity.`,
        expectedOutput: "An executive stakeholder update with risks, decisions, mitigation strategy, timeline, and recommended actions.",
        constraints: {},
    },

    // ── Set 3 (Semiconductor Supply Chain Disruption) ─────────────────
    {
        input: `A global electronics manufacturer is facing delays after a critical semiconductor supplier reported production issues. Multiple product launches may be impacted, finance has frozen additional spending, and customer success teams are concerned about enterprise account escalations. Leadership needs a revised rollout plan and quantified risk assessment.`,
        expectedOutput: "A concise executive briefing with risks, dependencies, revised timeline, and actionable next steps.",
        constraints: {},
    },
];

export const ROUND_SET_COUNTS: Record<number, number> = {
    1: ROUND_1_QUESTION_SETS.length,
    2: ROUND_2_SETS.length,
    3: ROUND_3_SETS.length,
    4: 1,
    5: ROUND_5_SETS.length,
    6: ROUND_6_SETS.length,
};

export function getAdminPreviewRound(roundNumber: number, setIndex: number): Round {
    switch (roundNumber) {
        case 1: {
            const s = ROUND_1_QUESTION_SETS[setIndex % ROUND_1_QUESTION_SETS.length];
            return {
                roundNumber: 1,
                type: "CLASSIFY",
                instruction: "A senior prompt engineer wrote the complex system prompt below. Identify the specific Prompt Engineering technique used in each block.",
                input: "Identify the 4 techniques used in the prompt.",
                promptParts: s,
                constraints: { requiredAccuracy: 1 },
            };
        }
        case 2: {
            const s = ROUND_2_SETS[setIndex % ROUND_2_SETS.length];
            return { roundNumber: 2, type: "IMPROVE", ...s };
        }
        case 3: {
            const s = ROUND_3_SETS[setIndex % ROUND_3_SETS.length];
            return { roundNumber: 3, type: "REVERSE", ...s };
        }
        case 4:
            return {
                roundNumber: 4,
                type: "OPTIMIZE",
                instruction: "Write the SHORTEST prompt (≤15 words) that still makes the AI explain any concept clearly using an analogy.",
                input: "Explain any concept in simple terms using an analogy.",
                referenceExample: `Example only: if the concept were AI, you could say "AI is like a cricket batter who has faced thousands of balls, learned the patterns, and uses that experience to decide the next shot.`,
                constraints: { maxWords: 15 },
            };
        case 5: {
            const s = ROUND_5_SETS[setIndex % ROUND_5_SETS.length];
            return {
                roundNumber: 5,
                type: "STRUCTURED",
                instruction: "Design a prompt that forces the AI to think step-by-step and produce a structured solution.",
                ...s,
            };
        }
        case 6: {
            const s = ROUND_6_SETS[setIndex % ROUND_6_SETS.length];
            return {
                roundNumber: 6,
                type: "BONUS",
                instruction: "You are given a scenario and a target signature. Write a meta-prompt that will make an AI generate a far more detailed, constraint-aware final prompt. The hidden constraints are NOT listed — your job is to think of as many of them as possible so the compiled prompt produces the strongest output.",
                ...s,
            };
        }
        default:
            return { roundNumber };
    }
}

export function generateRounds(sessionId: string): Round[] {
    return [
        // ── Round 1: CLASSIFY ──────────────────────────────────────────
        {
            roundNumber: 1,
            type: "CLASSIFY",
            instruction: "A senior prompt engineer wrote the complex system prompt below. Identify the specific Prompt Engineering technique used in each block.",
            input: "Identify the 4 techniques used in the prompt.",
            promptParts: pick(sessionId, 1, ROUND_1_QUESTION_SETS),
            constraints: {
                requiredAccuracy: 1
            }
        },

        // ── Round 2: IMPROVE ───────────────────────────────────────────
        {
            roundNumber: 2,
            type: "IMPROVE",
            ...pick(sessionId, 2, ROUND_2_SETS),
        },

        // ── Round 3: REVERSE ───────────────────────────────────────────
        {
            roundNumber: 3,
            type: "REVERSE",
            ...pick(sessionId, 3, ROUND_3_SETS),
        },

        // ── Round 4: OPTIMIZE ──────────────────────────────────────────
        {
            roundNumber: 4,
            type: "OPTIMIZE",
            instruction:
                "Write the SHORTEST prompt (≤15 words) that still makes the AI explain any concept clearly using an analogy.",
            input:
                "Explain any concept in simple terms using an analogy.",
            referenceExample:
                "Example only: if the concept were AI, you could say \"AI is like a cricket batter who has faced thousands of balls, learned the patterns, and uses that experience to decide the next shot.",
            constraints: { maxWords: 15 },
        },

        // ── Round 5: STRUCTURED ────────────────────────────────────────
        {
            roundNumber: 5,
            type: "STRUCTURED",
            instruction:
                "Design a prompt that forces the AI to think step-by-step and produce a structured solution.",
            ...pick(sessionId, 5, ROUND_5_SETS),
        },

        // ── Round 6: BONUS (Meta-Prompting) ────────────────────────────
        {
            roundNumber: 6,
            type: "BONUS",
            instruction:
                "You are given a scenario and a target signature. Write a meta-prompt that will make an AI generate a far more detailed, constraint-aware final prompt. The hidden constraints are NOT listed — your job is to think of as many of them as possible so the compiled prompt produces the strongest output.",
            ...pick(sessionId, 6, ROUND_6_SETS),
        }
    ];
}
