// /lib/generateRounds.ts
import type { Round, PromptPart, BonusEvalConfig } from "./types";

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
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Before arriving at your final answer, take a moment to carefully analyze the problem from multiple angles. Consider user psychology, product design, behavioral patterns, and business constraints. Internally reason through different possible approaches, weigh trade-offs, and refine your thinking before presenting a response.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Chain of Thought"
        },
        {
            id: "q3",
            text: "To guide your thinking, review the following reference patterns:\nCase A\nInput: Reduce churn\nOutput: Improve onboarding experience, provide proactive support during the first week, and personalize user journeys based on behavior\nCase B\nInput: Increase conversions\nOutput: Simplify checkout flow, introduce trust signals such as reviews, and optimize pricing presentation for clarity\nCase C\nInput: Improve feature adoption\nOutput: Introduce contextual tooltips, guide users with walkthroughs, and highlight value through real-time feedback",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q4",
            text: "Now address the following scenario:\nProblem: Users sign up for productivity applications with high initial intent but gradually lose interest after a few days, resulting in low long-term engagement and retention.\n\nWhile responding, keep the following in mind:\n- Ensure your response is organized in a logical and easy-to-follow manner\n- Focus on practical, actionable strategies rather than abstract ideas\n- Keep the explanation concise, but do not oversimplify important details\n- Avoid unnecessary jargon unless absolutely required\n- Balance creativity with realism in your suggestions\n\nAdditionally, consider edge cases such as:\n- Users who drop off after initial onboarding\n- Users who engage inconsistently\n- Users who find the product useful but not habit-forming\n\nYour response should:\n- Clearly present key strategies in a structured format\n- Be easy to scan and understand at a glance\n- Maintain clarity and coherence throughout\n- Conclude with a short, impactful closing line that reinforces the overall strategy",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Output Constraints"
        }
    ],

    // ── Set 2 (SaaS Retention) ────────────────────────────────────────
    [
        {
            id: "q1",
            text: "You are a senior product consultant helping a subscription-based SaaS company improve user retention while balancing business goals, technical feasibility, and customer experience.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Before answering, think carefully about possible causes, business impact, implementation effort, and long-term effects. Consider multiple perspectives before deciding on the strongest recommendation.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Chain of Thought"
        },
        {
            id: "q3",
            text: "Consider the following examples before responding:\n\nExample A\nProblem: Low onboarding completion\nRecommendation: Simplify setup and introduce guided walkthroughs.\n\nExample B\nProblem: High churn\nRecommendation: Improve engagement through personalized reminders.\n\nExample C\nProblem: Poor feature adoption\nRecommendation: Add contextual tips and product education.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q4",
            text: "Your response should:\n- Stay under 120 words\n- Use bullet points\n- Avoid technical jargon\n- End with one practical recommendation",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Output Constraints"
        }
    ],

    // ── Set 3 (Healthcare Engagement) ─────────────────────────────────
    [
        {
            id: "q1",
            text: "You are helping the leadership team of a healthcare startup improve patient engagement while ensuring recommendations remain practical and easy to implement.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Role Prompting"
        },
        {
            id: "q2",
            text: "Review these examples before responding:\n\nCase A\nProblem: Low customer trust\nRecommendation: Add testimonials and transparent pricing.\n\nCase B\nProblem: High abandonment\nRecommendation: Reduce friction during onboarding.\n\nCase C\nProblem: Poor retention\nRecommendation: Introduce reminders and personalized nudges.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Few-Shot Prompting"
        },
        {
            id: "q3",
            text: "Think through the problem step-by-step before answering. Consider causes, trade-offs, risks, and practical implications before finalizing your response.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Chain of Thought"
        },
        {
            id: "q4",
            text: "Do not use vague language, avoid technical jargon, and avoid repeating the problem statement in your answer.",
            options: ["Role Prompting", "Chain of Thought", "Few-Shot Prompting", "Output Constraints", "Zero-Shot Prompting", "Persona Prompting", "Negative Prompting"],
            answer: "Negative Prompting"
        }
    ]
];

const ROUND_2_SETS = [
    // ── Set 1 (Original — Product Launch Strategy) ────────────────────
    {
        instruction:
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to extract structured highlights which include Decisions, Key Conflicts and Trade Offs, Risks and Dependencies, Unknown Gaps and Next Steps. Use only the input data, do not add information of your own and the output summary should not contain more than 200 words.",
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
            maxWords: 200,
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
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to extract key business insights which identify Conflicts, Decisions made, Dependencies, Risks, Next steps. Use only the input data, do not add information of your own and the output summary should not contain more than 200 words.",
        originalPrompt: "Give me the key points",
        input: `The quarterly strategy review meeting focused heavily on the growing concerns around customer retention and declining renewal rates in the company's subscription business. Marketing leadership argued that customers were abandoning the platform because the onboarding experience was confusing and lacked clear activation milestones. They pointed to survey feedback indicating that many users did not fully understand the platform's value during their first two weeks.

However, Product leadership disagreed and argued that churn was primarily driven by poor long-term feature engagement rather than onboarding. They highlighted internal analytics showing that even users who completed onboarding often disengaged due to low usage of premium capabilities. This disagreement created tension around where investment should be prioritized in the next quarter.

Engineering teams raised concerns that several planned retention improvements could not begin immediately due to unresolved dependencies on third-party integrations and analytics vendors. Some infrastructure work was blocked pending approvals from external partners, delaying roadmap execution.

Leadership ultimately decided to prioritize onboarding redesign for the next quarter while approving a limited pilot program focused on retaining high-risk customers through personalized engagement campaigns. Budget discussions became contentious, with Marketing requesting increased acquisition spending while Product argued for stronger investment in user experience improvements.

Risks discussed included increasing churn, lower annual contract renewals, negative customer sentiment, and rising acquisition costs if retention issues remained unresolved. Teams agreed to perform a deeper churn analysis, redesign onboarding journeys, review premium feature adoption, and revisit roadmap prioritization during the next strategy cycle.`,
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
            maxWords: 200,
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
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to generate a concise operational summary which identifies Conflicts, Decisions made, Dependencies, Risks, Next steps. Use only the input data, do not add information of your own and the output summary should not contain more than 200 words.",
        originalPrompt: "Tell me the important parts",
        input: `During the monthly operational review meeting, leadership teams discussed recurring delays in customer issue resolution and growing dissatisfaction among enterprise accounts. Support leadership argued that engineering response times had slowed considerably, resulting in unresolved customer escalations and longer turnaround times. They presented examples where urgent customer incidents remained open for several days because technical investigations were delayed.

Engineering leadership disagreed and argued that incomplete issue documentation from support teams was the root cause of delays. They highlighted that unclear reproduction steps and inconsistent logging often forced engineering teams to spend additional time diagnosing issues before work could begin. This disagreement led to tension regarding accountability and ownership.

Several automation initiatives were proposed to reduce manual operational overhead, including automated incident categorization and intelligent routing systems. However, implementation could not proceed immediately because compliance approvals and infrastructure dependencies remained unresolved. Leadership expressed concern that these blockers were slowing down transformation efforts.

After discussion, leadership decided to prioritize improvements for high-severity incident handling while postponing lower-priority operational changes until the next quarter. Risks identified included increasing customer dissatisfaction, SLA breaches, employee burnout among support staff, and reputational damage for enterprise clients if response times continued to worsen.

Teams agreed to standardize incident documentation, redesign escalation workflows, improve communication between departments, and revisit automation opportunities after approvals and infrastructure dependencies were resolved.`,
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
            maxWords: 200,
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
        instruction: "Write a prompt that will generate the Startup Idea given below. The output should be structured with clear sections and concise content.",
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
        instruction: "Write a prompt that will generate an Incident Report given below. The output should be structured with clear sections and concise content.",
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
        instruction: "Write a prompt that will generate the Product Requirements Document given below. The output should be a structured with clear sections and concise content.",
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
        input: `A river-crossing scenario requires transporting a wolf, a goat, and a cabbage across to the opposite bank.

Objective:
Move all three items across the river without any rule violations.

Rules:
- Only one item may be carried at a time
- The wolf cannot be left alone with the goat
- The goat cannot be left alone with the cabbage

Goal:
Determine the exact sequence of crossings needed to complete the task safely and correctly.`,
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

const ROUND_6_SETS: Array<{
    input: string;
    expectedOutput: string;
    constraints: Record<string, never>;
    bonusEvalConfig: BonusEvalConfig;
}> = [
    {
        input: `The Aurora identity-platform migration is 3 weeks behind schedule after an external vendor schema change broke Okta SCIM provisioning. The fallback batch-sync job is now duplicating accounts in 4 of 12 regions. The original enterprise cutover date was May 15, and the revised target is June 9 if the team approves a phased rollout and a weekend production freeze. The platform serves 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC. The SSO uptime SLO is 99.95%, and there have been 9 Sev-2 authentication incidents in the last 30 days. Legal has raised GDPR concerns around EU log retention, and Security requires MFA enforcement before go-live. Customer Success needs a communication plan for 47 strategic accounts. Finance has capped additional spend at $180k, while an external identity consultant would cost $95k. The team currently has 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead. Automated regression coverage is 71% with a target of 92%. Key stakeholders are the CIO, CISO, VP Customer Success, Director of Compliance, and CFO. A go/no-go decision is needed by Wednesday at 4 PM, and any production cutover must happen during the Saturday 10 PM-2 AM maintenance window.`,
        expectedOutput: "A BI-style operations report with stats, analysis, insights, and recommended actions.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the scenario into a BI-style operations report with stats, analysis, insights, and recommended actions.",
            requiredSections: ["Overview", "Stats Snapshot", "Analysis", "BI Insights", "Recommended Actions"],
            targetOutput: `Aurora BI Operations Report

Overview:
Aurora's identity migration is still 3 weeks behind schedule, but the program remains recoverable if the team clears the SCIM defect, finalizes MFA readiness, and keeps the phased June 9 cutover path alive.

Stats Snapshot:
- 38,000 employee accounts and 6,200 contractor accounts are in scope
- 4 of 12 regions are duplicating accounts
- 9 Sev-2 authentication incidents have occurred in the last 30 days
- Regression coverage is 71% against a 92% target
- Additional spend is capped at $180k, and the consultant option is $95k
- Customer Success has 47 strategic accounts to cover before release

Analysis:
The vendor schema change broke Okta SCIM provisioning and pushed the fallback batch-sync path into duplicate-account behavior. The largest concentration of risk is operational: test coverage is below target, MFA enforcement is not yet complete, and the migration still depends on a narrow maintenance window.

BI Insights:
- Data quality issues are concentrated in 4 regions rather than across the full estate
- The test gap is 21 percentage points, which is the clearest readiness bottleneck
- Compliance and security readiness still gate the cutover more than pure engineering throughput
- Customer communication load is high enough to require a dedicated rollout plan for the 47 strategic accounts

Recommended Actions:
1. Stabilize SCIM mappings in the affected regions
2. Close the regression coverage gap from 71% to 92%
3. Finish MFA and GDPR checks before production cutover
4. Prepare customer communications for the 47 strategic accounts
5. Use the Saturday maintenance window for phased rollout only if the operational checks are clean

Best regards,
Program Analytics Team`,
            promptChecks: [
                { label: "BI report framing", test: (t) => /\b(report|dashboard|brief|summary)\b/i.test(t) && /\b(bi|business intelligence|insights|metrics)\b/i.test(t) },
                { label: "stats or metrics instruction", test: (t) => /\b(statistics|stats?|metrics|numbers?|figures|coverage|counts?)\b/i.test(t) },
                { label: "analysis or insights instruction", test: (t) => /\b(analysis|insight|insights|trend|trends)\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured|explicit)\b/i.test(t) || /\b(overview|stats snapshot|analysis|bi insights|recommended actions)\b/i.test(t) },
                { label: "operational recommendations", test: (t) => /\b(recommend|action|steps?|stabilize|close|prepare|finish)\b/i.test(t) },
                { label: "security and compliance context", test: (t) => /\b(gdpr|compliance|security|mfa|retention)\b/i.test(t) },
                { label: "customer impact context", test: (t) => /\b(customer|accounts?|communications?|rollout)\b/i.test(t) },
                { label: "professional tone", test: (t) => /\b(concise|professional|clear|executive)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "title or subject", test: (t) => /\bAurora BI Operations Report\b/i.test(t) || /^subject:/im.test(t) },
                { label: "delay and recovery path", test: (t) => /\b3 weeks behind\b/i.test(t) && /\bjune 9\b/i.test(t) },
                { label: "SCIM root cause and affected regions", test: (t) => /\bokta\b/i.test(t) && /\bscim\b/i.test(t) && /\bschema change\b/i.test(t) && /\b4 of 12 regions\b/i.test(t) },
                { label: "account scope and regional coverage", test: (t) => /38,?000/.test(t) && /6,?200/.test(t) && /\b(us|eu|apac)\b/i.test(t) },
                { label: "reliability and coverage metrics", test: (t) => /99\.95%/.test(t) && /\b9\s+sev-2\b/i.test(t) && /71%/.test(t) && /92%/.test(t) },
                { label: "compliance and security requirements", test: (t) => /\bgdpr\b/i.test(t) && /\bmfa\b/i.test(t) && /\blog retention\b/i.test(t) },
                { label: "budget and consultant tradeoff", test: (t) => /\b180k\b/i.test(t) && /\b95k\b/i.test(t) },
                { label: "customer communication scope", test: (t) => /\b47 strategic accounts?\b/i.test(t) || (/\b47\b/.test(t) && /\bcustomer/i.test(t)) },
                { label: "maintenance window or phased rollout", test: (t) => /\bphased rollout\b/i.test(t) || /\bsaturday\b/i.test(t) || /\b10 ?pm\b/i.test(t) },
                { label: "structured bullets or list", test: (t) => /\|.+\|/.test(t) || (/^\d+\./m.test(t) && (t.match(/^\d+\./gm) ?? []).length >= 3) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
            structureChecks: [
                { label: "titled report", test: (t) => /\b(bi operations report|operations report|report)\b/i.test(t) },
                { label: "multiple sections with headings", test: (t) => (t.match(/^[A-Z][^\n:]{2,40}:/gm) ?? []).length >= 4 },
                { label: "bullets or numbered items", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
        },
    },
    {
        input: `A multinational fintech company is facing suspicious authentication activity across Europe and North America. Over the past 72 hours, 18,400 enterprise customer accounts have been in scope, with 6,200 failed MFA attempts recorded across 14 regions. The activity triggered 1,480 credential reset requests, 42 risk alerts in the last 24 hours, and repeated failure loops across 11 login clusters, while 17 enterprise customers are threatening escalation and about 28% of daily enterprise login volume could be affected. Security teams suspect credential stuffing, but the forensic evidence is incomplete, and Engineering is concerned that restrictive controls could disrupt real-time financial reporting and automated payment processing. Legal and compliance teams have raised concerns around communication obligations, temporary restrictions, and incident disclosure timelines, and leadership needs a recommendation within 4 hours.`,
        expectedOutput: "A BI-style incident report with stats, analysis, insights, and recommended actions.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the security incident scenario into a BI-style incident report with stats, analysis, insights, and recommended actions.",
            requiredSections: ["Overview", "Stats Snapshot", "Analysis", "BI Insights", "Recommended Actions"],
            targetOutput: `Security BI Incident Report

Overview:
Monitoring shows unusual authentication failures across enterprise accounts in Europe and North America over the last 72 hours. The pattern suggests a coordinated abuse campaign, but the forensic picture is not yet complete.

Stats Snapshot:
- 18,400 enterprise customer accounts affected
- 6,200 failed MFA attempts recorded over 72 hours
- 14 regions with geographically inconsistent login behavior
- 1,480 elevated credential reset requests
- 42 accounts triggered risk alerts in the last 24 hours
- 11 login clusters showed repeated failure loops
- 17 enterprise customers are escalating
- 28% of daily enterprise login volume could be impacted

Analysis:
The signal is consistent with credential stuffing or another automated login-abuse pattern. The main operational tradeoff is whether to contain aggressively now or preserve enterprise customer access while more evidence is gathered.

BI Insights:
- The issue spans both Europe and North America, so response coordination must be region-aware
- MFA failures plus inconsistent geography are stronger indicators than any single alert by itself
- Temporary access restrictions could disrupt real-time financial reporting and automated payment processing
- The 4-hour response window makes this an urgent triage decision
- Compliance and customer communication need to move in parallel with engineering investigation

Recommended Actions:
1. Apply step-up authentication to suspicious sessions
2. Isolate the accounts showing repeated failure patterns
3. Prepare customer communication templates for both containment and monitoring paths
4. Align Security, Legal, and Customer Success on disclosure triggers
5. Keep a 24-hour follow-up review on the monitoring dashboard

Best regards,
Security Operations Team`,
            promptChecks: [
                { label: "BI report framing", test: (t) => /\b(report|dashboard|summary|brief)\b/i.test(t) && /\b(bi|business intelligence|insights|metrics)\b/i.test(t) },
                { label: "stats or metrics instruction", test: (t) => /\b(statistics|stats?|metrics|counts?|signals|monitoring)\b/i.test(t) },
                { label: "analysis or insights instruction", test: (t) => /\b(analysis|insight|insights|pattern|trend)\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured|explicit)\b/i.test(t) || /\b(overview|stats snapshot|analysis|bi insights|recommended actions)\b/i.test(t) },
                { label: "security and compliance context", test: (t) => /\b(mfa|credential|security|compliance|legal|regulatory)\b/i.test(t) },
                { label: "business continuity context", test: (t) => /\b(business continuity|operations?|payment|reporting|access)\b/i.test(t) },
                { label: "recommended actions", test: (t) => /\b(recommend|action|step|contain|monitor|isolate)\b/i.test(t) },
                { label: "professional tone", test: (t) => /\b(concise|professional|clear|executive)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "title or subject", test: (t) => /\bSecurity BI Incident Report\b/i.test(t) || /^subject:/im.test(t) },
                { label: "MFA failure or authentication anomaly", test: (t) => /\bmfa\b/i.test(t) && /\b(failure|anomal|abnormal|suspicious)\b/i.test(t) },
                { label: "credential stuffing mention", test: (t) => /\bcredential stuffing\b/i.test(t) || /\bstuffing\b/i.test(t) },
                { label: "regional scope: Europe and North America", test: (t) => /\b(europe|eu)\b/i.test(t) && /\b(north america|us|united states)\b/i.test(t) },
                { label: "monitoring window", test: (t) => /\b72 hours\b/i.test(t) },
                { label: "business continuity impact", test: (t) => /\b(real-time financial reporting|automated payment processing|business continuity)\b/i.test(t) },
                { label: "compliance consideration", test: (t) => /\b(compliance|regulatory|legal|disclosure)\b/i.test(t) },
                { label: "recommended actions listed", test: (t) => /\brecommended actions?\b/i.test(t) || (/\d+\./.test(t) && /\b(step-up|isolate|prepare|align|review)\b/i.test(t)) },
                { label: "structured bullets or list", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
            structureChecks: [
                { label: "titled report", test: (t) => /\b(bi incident report|incident report|report)\b/i.test(t) },
                { label: "multiple sections with headings", test: (t) => (t.match(/^[A-Z][^\n:]{2,40}:/gm) ?? []).length >= 4 },
                { label: "bullets or numbered items", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
        },
    },
    {
        input: `A global electronics manufacturer is managing a supply chain disruption tied to a semiconductor supplier. Shortages may continue for 5 to 7 weeks, 3 launch lines already show delay risk, inventory coverage is 68% for critical components, Finance has frozen $12M in procurement spending, 2 alternate suppliers are being evaluated, and the next supplier checkpoint is in 9 days. Inventory commitments span North America, Europe, and Asia, and supplier production instability is creating overlap between procurement constraints and launch dependencies. Delaying lower-priority product lines could protect flagship launches but may push other commitments further out, while legal, procurement, and compliance approvals may slow mitigation options and customer success teams are already managing strategic enterprise account pressure.`,
        expectedOutput: "A BI-style supply chain report with stats, analysis, insights, and recommended actions.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the supply chain disruption scenario into a BI-style supply chain report with stats, analysis, insights, and recommended actions.",
            requiredSections: ["Overview", "Stats Snapshot", "Analysis", "BI Insights", "Recommended Actions"],
            targetOutput: `Supply Chain BI Report

Overview:
A semiconductor supplier has reported production instability, putting multiple product launches at risk and forcing the team to reassess inventory, spending, and customer commitments.

Stats Snapshot:
- Shortages may continue for 5 to 7 weeks
- 3 launch lines are already showing delay risk
- Inventory coverage is 68% for critical components
- Finance has frozen $12M in procurement spending
- 2 alternate suppliers are under review
- The next supplier checkpoint is in 9 days
- Inventory commitments span North America, Europe, and Asia

Analysis:
The disruption is strongest where supplier concentration, procurement constraints, and launch dependencies overlap. The biggest operational risk is that preserving supply for flagship launches could push lower-priority products and customer commitments further out.

BI Insights:
- Supplier instability is the primary signal, but the downstream impact is financial and customer-facing
- Alternative supplier work is constrained by legal, procurement, and spending approvals
- Enterprise relationship risk increases when shipment delays hit long-term purchasing agreements
- The next 9 days are the clearest window for corrective action
- The launch portfolio should be prioritized by business value rather than treated as one uniform queue

Recommended Actions:
1. Confirm the supplier recovery timeline and the likely duration of shortages
2. Fast-track qualification of alternate suppliers where legal risk is manageable
3. Review procurement spend exceptions with Finance for critical components
4. Brief enterprise accounts on expected shipment timing changes
5. Present scenario-based launch options to leadership for prioritization

Best regards,
Supply Chain Analytics Team`,
            promptChecks: [
                { label: "BI report framing", test: (t) => /\b(report|dashboard|summary|brief)\b/i.test(t) && /\b(bi|business intelligence|insights|metrics)\b/i.test(t) },
                { label: "stats or metrics instruction", test: (t) => /\b(statistics|stats?|metrics|numbers?|figures|inventory|launch)\b/i.test(t) },
                { label: "analysis or insights instruction", test: (t) => /\b(analysis|insight|insights|trend|implication)\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured|explicit)\b/i.test(t) || /\b(overview|stats snapshot|analysis|bi insights|recommended actions)\b/i.test(t) },
                { label: "supply chain and operational context", test: (t) => /\b(supply chain|supplier|procurement|launch|inventory)\b/i.test(t) },
                { label: "financial or customer impact", test: (t) => /\b(financ|spend|customer|enterprise|account|revenue)\b/i.test(t) },
                { label: "recommended actions", test: (t) => /\b(recommend|action|step|priorit|brief|confirm)\b/i.test(t) },
                { label: "professional tone", test: (t) => /\b(concise|professional|clear|executive)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "title or subject", test: (t) => /\bSupply Chain BI Report\b/i.test(t) || /^subject:/im.test(t) },
                { label: "semiconductor or supplier mention", test: (t) => /\bsemiconductor\b/i.test(t) || /\bsupplier\b/i.test(t) },
                { label: "product launch delay", test: (t) => /\b(product launch|launch|delay)\b/i.test(t) },
                { label: "finance freeze or budget constraints", test: (t) => /\b(financ|budget|spending freeze|frozen)\b/i.test(t) },
                { label: "enterprise account consideration", test: (t) => /\b(enterprise|customer success|account|customer)\b/i.test(t) },
                { label: "multi-region scope", test: (t) => /\b(north america|europe|asia)\b/i.test(t) },
                { label: "shortage duration", test: (t) => /\bweeks?\b/i.test(t) },
                { label: "supplier or mitigation mention", test: (t) => /\b(alternative|supplier|mitigation|contingency|qualif)\b/i.test(t) },
                { label: "actionable recommendations", test: (t) => /\brecommended actions?\b/i.test(t) || (/\d+\./.test(t) && /\b(confirm|fast-track|review|brief|present)\b/i.test(t)) },
                { label: "structured bullets or list", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) || /\|.+\|/.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
            structureChecks: [
                { label: "titled report", test: (t) => /\b(bi report|report)\b/i.test(t) },
                { label: "multiple sections with headings", test: (t) => (t.match(/^[A-Z][^\n:]{2,40}:/gm) ?? []).length >= 4 },
                { label: "bullets or numbered items", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely|team)\b/i.test(t) },
            ],
        },
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

export function getRoundSetIndex(sessionId: string, round: number): number {
    const count = ROUND_SET_COUNTS[round];
    if (!count || count <= 0) return 0;
    return sessionHash(sessionId, `r${round}`) % count;
}

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
                instruction: "Write an optimized prompt that will explain any concept using an analogy of your choice.",
                referenceExample: `Example only: "Explain recursion using a cooking recipe analogy."`,
                constraints: { maxPromptWords: 30, minOutputWords: 50 },
            };
        case 5: {
            const s = ROUND_5_SETS[setIndex % ROUND_5_SETS.length];
            return {
                roundNumber: 5,
                type: "STRUCTURED",
                instruction: "Design a prompt that forces the AI to think step-by-step and produce a structured solution of the puzzle given below",
                ...s,
            };
        }
        case 6: {
            const s = ROUND_6_SETS[setIndex % ROUND_6_SETS.length];
            return {
                roundNumber: 6,
                type: "BONUS",
                instruction: "Write a meta-prompt that instructs an AI to create a prompt that turns that scenario into a BI-style report. The sections of the report must be identified based on the input given.",
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
                "Write an optimized prompt that will explain any concept using an analogy of your choice.",
            referenceExample:
                "Example only: \"Explain recursion using a cooking recipe analogy.\"",
            constraints: { maxPromptWords: 30, minOutputWords: 50 },
        },

        // ── Round 5: STRUCTURED ────────────────────────────────────────
        {
            roundNumber: 5,
            type: "STRUCTURED",
            instruction:
                "Design a prompt that forces the AI to think step-by-step and produce a structured solution of the puzzle given below",
            ...pick(sessionId, 5, ROUND_5_SETS),
        },

        // ── Round 6: BONUS (Meta-Prompting) ────────────────────────────
        {
            roundNumber: 6,
            type: "BONUS",
            instruction:
                "Write a meta-prompt that will make an AI generate a final prompt whose job is to produce a BI-style report from the scenario. The sections of the report must be identified based on the input given.",
            ...pick(sessionId, 6, ROUND_6_SETS),
        }
    ];
}
