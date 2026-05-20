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
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to produce the desired structured output. Improve the given prompt to extract structured highlights (Conflicts, Decisions, Dependencies, Next Steps). The output summary must be ≤200 words.",
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
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to extract key business insights (Conflicts, Decisions made, Dependencies, Risks, Next steps). The output summary must be ≤200 words.",
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
            "The original prompt below was given to the AI, but it did not produce an ideal output. Your task is to improve this prompt to generate a concise operational summary (Conflicts, Decisions made, Dependencies, Risks, Next steps). The output summary must be ≤200 words.",
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

const ROUND_6_SETS: Array<{
    input: string;
    expectedOutput: string;
    constraints: Record<string, never>;
    bonusEvalConfig: BonusEvalConfig;
}> = [
    // ── Set 1 (Aurora Identity Migration) ────────────────────────────
    {
        input: `The Aurora identity-platform migration is 3 weeks behind schedule after an external vendor schema change broke Okta SCIM provisioning. The fallback batch-sync job is now duplicating accounts in 4 of 12 regions. The original enterprise cutover date was May 15, and the revised target is June 9 if the team approves a phased rollout and a weekend production freeze. The platform serves 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC. The SSO uptime SLO is 99.95%, and there have been 9 Sev-2 authentication incidents in the last 30 days. Legal has raised GDPR concerns around EU log retention, and Security requires MFA enforcement before go-live. Customer Success needs a communication plan for 47 strategic accounts. Finance has capped additional spend at $180k, while an external identity consultant would cost $95k. The team currently has 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead. Automated regression coverage is 71% with a target of 92%. Key stakeholders are the CIO, CISO, VP Customer Success, Director of Compliance, and CFO. A go/no-go decision is needed by Wednesday at 4 PM, and any production cutover must happen during the Saturday 10 PM-2 AM maintenance window.`,
        expectedOutput: "An executive stakeholder update with quantified risks, explicit decisions, a revised timeline, and actionable next steps.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the scenario into an executive stakeholder update.",
            requiredSections: ["Executive Summary", "Current Status", "Root Cause Analysis", "Impact Assessment", "Decision Required", "Recovery Plan", "Revised Timeline", "Risk Mitigation", "Next Steps"],
            targetOutput: `Subject: Aurora Identity Migration - Status Update and Go/No-Go Recommendation

Dear Stakeholders,

Executive Summary:
Aurora is currently 3 weeks behind the original May 15 enterprise cutover due to an Okta SCIM provisioning failure caused by a vendor schema change. We can still reach a revised June 9 cutover if we approve a phased rollout, lock a weekend change freeze, and finalize the go/no-go decision by Wednesday at 4 PM.

Current Status:
- Scope: Identity migration for 38,000 employee accounts and 6,200 contractor accounts across the US, EU, and APAC
- Coverage: Automated regression coverage is 71% against a 92% target
- Reliability: 9 Sev-2 authentication incidents in the last 30 days against a 99.95% uptime SLO
- Team: 3 senior IAM engineers, 2 newly onboarded contractors, and 1 QA lead
- Customer impact planning: Customer Success needs outreach for 47 strategic accounts

Root Cause Analysis:
An external vendor schema change broke Okta SCIM provisioning, and the fallback batch-sync process is now duplicating accounts in 4 of 12 regions.

Impact Assessment:
- Timeline: The original May 15 cutover is no longer achievable; the revised target is June 9
- Security and compliance: MFA enforcement remains mandatory before go-live, and Legal has flagged GDPR concerns around EU log retention
- Operational risk: Continued identity instability increases the likelihood of missing the 99.95% uptime SLO
- Financial: Additional spend is capped at $180k, and the external identity consultant would cost $95k
- Customer risk: 47 strategic accounts require proactive communication before any phased rollout

Decision Required:
Please approve by Wednesday 4 PM:
1. A phased regional rollout instead of a single global cutover
2. A Saturday 10 PM-2 AM production maintenance-window freeze
3. The $95k consultant engagement within the $180k contingency cap

Recovery Plan:
1. Stabilize SCIM mappings and stop duplicate account creation in the 4 affected regions
2. Raise regression coverage from 71% to 92% before final cutover
3. Complete MFA readiness checks and validate GDPR-compliant EU log retention
4. Prepare Customer Success communications for all 47 strategic accounts
5. Use the Saturday maintenance window for phased production release

Risk Mitigation:
- Maintain a rollback path to the legacy identity flow for one full maintenance cycle
- Add regional checkpoints with Security and Compliance signoff before expansion
- Run war-room monitoring during cutover to protect the 99.95% uptime SLO

Revised Timeline:
| Milestone | Original Date | Revised Date |
|-----------|---------------|--------------|
| SCIM fix complete | May 1 | May 22 |
| Regression coverage >= 92% | May 8 | May 29 |
| MFA + GDPR signoff | May 10 | June 3 |
| Strategic account communications sent | May 12 | June 5 |
| Production cutover | May 15 | June 9 |

Next Steps:
- [ ] Finalize the go/no-go recommendation deck for Wednesday 4 PM
- [ ] Confirm consultant contract and budget approval
- [ ] Complete the regional duplicate-account remediation plan
- [ ] Publish the customer communication draft for the 47 strategic accounts
- [ ] Confirm Saturday 10 PM-2 AM cutover staffing and war-room ownership

Best regards,
Program Lead, Aurora Identity Migration`,
            promptChecks: [
                { label: "executive stakeholder email", test: (t) => /\b(email|update|memo|status)\b/i.test(t) && /\b(stakeholder|executive|leadership)\b/i.test(t) },
                { label: "subject line instruction", test: (t) => /\bsubject\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured output|explicit sections?)\b/i.test(t) || /\b(executive summary|root cause|impact assessment|recovery plan)\b/i.test(t) },
                { label: "quantified facts and dates", test: (t) => /\b(exact|specific|quantified|numeric|numbers?|metrics|dates?)\b/i.test(t) || /(38,?000|6,?200|71%|92%|99\.95%|180k|95k|47 strategic|may 15|june 9)/i.test(t) },
                { label: "timeline or milestone table", test: (t) => /\b(table|timeline|milestone)\b/i.test(t) },
                { label: "risk mitigation and rollback", test: (t) => /\b(risk|mitigation|rollback|fallback|monitoring)\b/i.test(t) },
                { label: "compliance and security requirements", test: (t) => /\b(gdpr|compliance|security|mfa|retention)\b/i.test(t) },
                { label: "decision request and deadline", test: (t) => /\b(decision|approve|go\/?no-go|recommendation|deadline)\b/i.test(t) || /\b(wednesday|4 ?pm)\b/i.test(t) },
                { label: "customer communications", test: (t) => /\b(customer success|strategic accounts?|customer communication|outreach)\b/i.test(t) },
                { label: "phased rollout and maintenance window", test: (t) => /\b(phased rollout|regional rollout|maintenance window|change freeze|cutover window)\b/i.test(t) },
                { label: "professional tone", test: (t) => /\b(professional|clear|concise|executive tone)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "subject line", test: (t) => /^subject:\s*aurora identity migration/i.test(t.trim()) },
                { label: "delay and revised cutover", test: (t) => /\b3 weeks behind\b/i.test(t) && /\bmay 15\b/i.test(t) && /\bjune 9\b/i.test(t) },
                { label: "SCIM root cause and affected regions", test: (t) => /\bokta\b/i.test(t) && /\bscim\b/i.test(t) && /\bschema change\b/i.test(t) && /\bduplicate\w*\b/i.test(t) && /\b4 of 12 regions\b/i.test(t) },
                { label: "account scope and regional coverage", test: (t) => /38,?000/.test(t) && /6,?200/.test(t) && /\b(us|eu|apac)\b/i.test(t) },
                { label: "reliability and test metrics", test: (t) => /99\.95%/.test(t) && /\b9\s+sev-2\b/i.test(t) && /71%/.test(t) && /92%/.test(t) },
                { label: "compliance and security requirements", test: (t) => /\bgdpr\b/i.test(t) && /\beu\b/i.test(t) && /\blog retention\b/i.test(t) && /\bmfa\b/i.test(t) },
                { label: "budget and consultant tradeoff", test: (t) => /\b180k\b/i.test(t) && /\b95k\b/i.test(t) && /\bconsultant\b/i.test(t) },
                { label: "customer communication scope", test: (t) => /\b47 strategic accounts?\b/i.test(t) || (/\b47\b/.test(t) && /\bcustomer/i.test(t)) },
                { label: "decision deadline and maintenance window", test: (t) => /\bwednesday\b/i.test(t) && /\b4 ?pm\b/i.test(t) && /\bsaturday\b/i.test(t) && /\b10 ?pm\b/i.test(t) && /\b2 ?am\b/i.test(t) },
                { label: "phased rollout recommendation", test: (t) => /\bphased rollout\b/i.test(t) },
                { label: "timeline table", test: (t) => /\|.*milestone.*original date.*revised date.*\|/i.test(t) || (/\bmilestone\b/i.test(t) && /\brevised date\b/i.test(t)) },
                { label: "checklist-style next steps", test: (t) => /\[[ xX]?\]/.test(t) || /\bnext steps:\b/i.test(t) },
            ],
            structureChecks: [
                { label: "salutation", test: (t) => /\bdear stakeholders\b/i.test(t) },
                { label: "closing", test: (t) => /\b(best regards|regards|sincerely)\b/i.test(t) },
                { label: "multiple paragraphs", test: (t) => t.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length >= 4 },
                { label: "table formatting", test: (t) => /\|.+\|/.test(t) },
                { label: "checklist formatting", test: (t) => /\[[ xX]?\]/.test(t) },
            ],
        },
    },

    // ── Set 2 (Fintech Security — MFA / Credential Stuffing) ─────────
    {
        input: `A multinational fintech company operating across Europe and North America has detected an unusual increase in suspicious authentication failures affecting enterprise customer accounts over the past 72 hours. Internal monitoring systems flagged repeated failed MFA attempts, geographically inconsistent login behavior, and elevated credential reset requests originating from multiple regions.

Security teams suspect a coordinated credential stuffing attack but cannot yet confirm the source due to incomplete forensic evidence. Engineering teams are concerned that aggressively restricting account access could disrupt business-critical operations for enterprise customers, particularly those relying on real-time financial reporting and automated payment processing.

Meanwhile, legal and compliance teams have raised concerns regarding regulatory obligations in different jurisdictions, especially around customer communication, temporary access restrictions, and incident disclosure timelines. Customer success teams are also reporting increasing anxiety among major accounts, with some enterprise customers threatening escalation unless immediate action is taken.

Executive leadership needs a clear recommendation on whether to temporarily restrict access for affected users, implement selective mitigations, or wait for additional evidence. They require a concise but highly structured executive update that balances business continuity, security posture, compliance obligations, customer trust, and operational feasibility.`,
        expectedOutput: "An executive stakeholder update with risks, decisions, mitigation strategy, timeline, and recommended actions.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the security incident scenario into an executive stakeholder update covering risks, decisions, and recommended actions.",
            requiredSections: ["Executive Summary", "Incident Overview", "Risk Assessment", "Decision Required", "Mitigation Strategy", "Timeline", "Recommended Actions"],
            targetOutput: `Subject: Security Alert — Suspicious Login Activity Affecting Enterprise Accounts

Dear Stakeholders,

Executive Summary:
Security monitoring has detected abnormal MFA failure rates across enterprise accounts in Europe and North America. Engineering suspects a credential stuffing attack, though confirmation is pending. Leadership must issue a go/no-go decision on temporarily restricting access for affected users while maintaining business continuity.

Incident Overview:
- Affected scope: Enterprise customers in Europe and North America
- Anomaly type: Abnormal MFA failure rates on enterprise accounts
- Suspected vector: Credential stuffing attack (under active investigation)
- Current status: Incident response team engaged; investigation ongoing

Risk Assessment:
- Security risk: Potential unauthorized access to enterprise customer accounts if credential stuffing is confirmed
- Business continuity risk: Temporary access restriction may disrupt enterprise customer workflows
- Compliance risk: EU regulatory obligations may require disclosure and breach notification
- Reputational risk: Delayed or inadequate response could erode enterprise customer trust

Decision Required:
Go/No-Go: Temporarily restrict access for affected enterprise users in Europe and North America pending investigation confirmation.

Mitigation Strategy:
- Immediate: Flag and monitor all affected accounts; enforce step-up authentication for suspicious sessions
- If Go: Notify affected customers with estimated resolution timeline; activate dedicated support escalation path
- If No-Go: Deploy enhanced real-time monitoring controls and define clear escalation triggers
- Parallel track: Engineering to confirm or rule out credential stuffing within 4 hours

Timeline:
- T+0: Anomaly detected; incident response team activated
- T+2h: Preliminary engineering investigation report complete
- T+4h: Go/No-Go decision required from leadership
- T+6h: Access restriction or enhanced monitoring controls implemented
- T+24h: Full incident report and customer communication issued

Recommended Actions:
1. Convene Security, Legal, and Engineering teams immediately for joint situation assessment
2. Prepare customer notification templates for both Go and No-Go scenarios
3. Confirm regional compliance obligations with Legal for EU-affected accounts
4. Activate real-time monitoring dashboard for continuous oversight
5. Schedule leadership briefing at T+4h for final go/no-go decision

Best regards,
Security Incident Response Team`,
            promptChecks: [
                { label: "executive stakeholder communication", test: (t) => /\b(email|update|brief|status)\b/i.test(t) && /\b(stakeholder|executive|leadership)\b/i.test(t) },
                { label: "subject line instruction", test: (t) => /\bsubject\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured|explicit)\b/i.test(t) || /\b(executive summary|incident|risk assessment|mitigation|recommended actions)\b/i.test(t) },
                { label: "risk assessment and impact", test: (t) => /\b(risk|impact|threat|exposure)\b/i.test(t) },
                { label: "go/no-go decision framing", test: (t) => /\b(decision|go\/?no-go|recommend|approve|action)\b/i.test(t) },
                { label: "mitigation strategy", test: (t) => /\b(mitigat|contain|remediat|response|restrict)\b/i.test(t) },
                { label: "timeline or urgency", test: (t) => /\b(timeline|urgency|timeframe|deadline|hours?|schedule)\b/i.test(t) },
                { label: "compliance and regional obligations", test: (t) => /\b(compliance|regulatory|gdpr|legal|obligation|regional)\b/i.test(t) },
                { label: "business continuity balance", test: (t) => /\b(business continuity|operations?|availability|disruption|balance)\b/i.test(t) },
                { label: "professional tone", test: (t) => /\b(professional|clear|concise|executive)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "subject line present", test: (t) => /^subject:/im.test(t) },
                { label: "MFA failure or authentication anomaly", test: (t) => /\bmfa\b/i.test(t) && /\b(failure|anomal|abnormal|suspicious)\b/i.test(t) },
                { label: "credential stuffing mention", test: (t) => /\bcredential stuffing\b/i.test(t) || /\b(attack vector|stuffing)\b/i.test(t) },
                { label: "regional scope: Europe and North America", test: (t) => /\b(europe|eu)\b/i.test(t) && /\b(north america|us|united states)\b/i.test(t) },
                { label: "risk articulation", test: (t) => (t.match(/\b(risk|threat|exposure)\b/gi) ?? []).length >= 2 },
                { label: "decision recommendation", test: (t) => /\b(decision|go\/?no-go|recommend|approve)\b/i.test(t) },
                { label: "mitigation actions listed", test: (t) => /\b(mitigat|restrict|monitor|step-up|authentication|contain)\b/i.test(t) },
                { label: "timeline or urgency markers", test: (t) => /\b(t\+\d|hours?|timeline|urgent|immediately|within)\b/i.test(t) },
                { label: "compliance consideration", test: (t) => /\b(compliance|regulatory|gdpr|legal|obligation)\b/i.test(t) },
                { label: "business continuity", test: (t) => /\b(business continuity|operations?|disruption|continuity)\b/i.test(t) },
                { label: "recommended actions listed", test: (t) => /\brecommended actions?\b/i.test(t) || (/\b(action|step)\b/i.test(t) && /\d+\./.test(t)) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely)\b/i.test(t) },
            ],
            structureChecks: [
                { label: "subject line", test: (t) => /^subject:/im.test(t) },
                { label: "professional salutation", test: (t) => /\bdear\b/i.test(t) },
                { label: "multiple sections with headings", test: (t) => (t.match(/^[A-Z][^\n:]{2,40}:/gm) ?? []).length >= 3 },
                { label: "bullet points or numbered items", test: (t) => /^[-*]\s+/m.test(t) || /^\d+\.\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|sincerely)\b/i.test(t) },
            ],
        },
    },

    // ── Set 3 (Semiconductor Supply Chain Disruption) ─────────────────
    {
        input: `A global electronics manufacturer preparing for multiple high-profile product launches is facing a growing supply chain disruption after a major semiconductor supplier unexpectedly reported production instability. Initial reports suggest that shortages may continue for several weeks, affecting inventory commitments across North America, Europe, and Asia.

Operations teams have proposed delaying lower-priority product lines to preserve supply for flagship launches, while finance leadership has temporarily frozen additional procurement spending until cost implications become clearer. Product leadership believes launch timelines should remain unchanged to avoid reputational damage and competitive disadvantage.

Customer success and enterprise account teams have raised concerns that delayed shipments could significantly affect strategic enterprise relationships, particularly for customers with long-term purchasing agreements and deployment deadlines. Meanwhile, procurement teams are investigating alternate suppliers, but legal teams have warned that switching vendors may introduce compliance and contractual risks.

Executive leadership requires an updated rollout recommendation that quantifies risks, evaluates operational dependencies, considers financial and customer impact, and provides a practical mitigation plan. The final communication must be concise, executive-friendly, and action-oriented.`,
        expectedOutput: "A concise executive briefing with risks, dependencies, revised timeline, and actionable next steps.",
        constraints: {},
        bonusEvalConfig: {
            baselineMetaPrompt: "Write a prompt that turns the supply chain disruption scenario into a concise executive briefing covering risks, revised timeline, and next steps.",
            requiredSections: ["Situation Summary", "Risk Assessment", "Dependencies", "Revised Timeline", "Next Steps"],
            targetOutput: `Executive Briefing: Semiconductor Supply Chain Disruption

Situation Summary:
A critical semiconductor supplier has reported production issues, placing multiple product launches at risk. Finance has frozen additional spending, limiting near-term mitigation options. Customer success teams are managing enterprise account escalations. Leadership requires a revised rollout plan and a quantified risk assessment to determine the path forward.

Risk Assessment:
- Product launch risk: High — multiple launches face delays of 4–12 weeks depending on supplier recovery
- Revenue impact: Significant — delayed launches reduce near-term revenue and may affect annual targets
- Enterprise account risk: Medium-High — escalations may lead to contract renegotiation or churn without proactive communication
- Financial risk: Constrained — spending freeze limits alternative supplier onboarding options
- Supplier dependency risk: High concentration risk amplifies the blast radius of any continued production disruption

Dependencies:
- Product launches depend on semiconductor component availability from the affected supplier
- Alternative supplier qualification depends on procurement lead time and Finance approval for emergency spend
- Customer communication plans depend on confirmed revised launch timelines
- Leadership rollout decisions depend on supplier recovery confirmation

Revised Timeline:
| Initiative | Original Target | Revised Estimate | Confidence |
|---|---|---|---|
| Supplier recovery confirmation | — | 2 weeks | Low |
| Alternative supplier qualified | — | 6–8 weeks | Medium |
| Product A launch | Per roadmap | +4–8 weeks | Medium |
| Product B launch | Per roadmap | +6–12 weeks | Low |
| Enterprise account briefings | Immediate | This week | High |

Next Steps:
1. Obtain confirmed recovery timeline and full production impact scope from supplier
2. Identify and fast-track qualification of alternative semiconductor suppliers
3. Request Finance to evaluate emergency spend approval for supplier diversification
4. Direct Customer Success to proactively brief enterprise accounts with preliminary timeline updates
5. Present scenario-based rollout options to leadership for decision by end of week

Best regards,
Supply Chain Risk Management Team`,
            promptChecks: [
                { label: "executive briefing format", test: (t) => /\b(brief|report|update|summary)\b/i.test(t) && /\b(executive|leadership|stakeholder)\b/i.test(t) },
                { label: "explicit sections or headings", test: (t) => /\b(section|heading|structured|explicit)\b/i.test(t) || /\b(situation|risk|dependenc|timeline|next steps)\b/i.test(t) },
                { label: "risk quantification", test: (t) => /\b(risk|quantif|assess|measur|impact)\b/i.test(t) },
                { label: "dependencies identification", test: (t) => /\bdependenc\b/i.test(t) },
                { label: "revised timeline or schedule", test: (t) => /\b(timeline|revised|schedule|delay|date)\b/i.test(t) },
                { label: "next steps or action items", test: (t) => /\b(next steps?|action|recommend|priorit)\b/i.test(t) },
                { label: "financial or budget impact", test: (t) => /\b(financ|budget|spend|cost|revenue)\b/i.test(t) },
                { label: "customer or enterprise account consideration", test: (t) => /\b(customer|enterprise|account|client)\b/i.test(t) },
                { label: "structured output format", test: (t) => /\b(table|structured|format|list|bullet)\b/i.test(t) },
                { label: "concise professional tone", test: (t) => /\b(concise|professional|clear|brief|executive)\b/i.test(t) },
            ],
            outputFactChecks: [
                { label: "semiconductor or supplier mention", test: (t) => /\bsemiconductor\b/i.test(t) || /\bsupplier\b/i.test(t) },
                { label: "product launch delay", test: (t) => /\b(product launch|launch|delay)\b/i.test(t) },
                { label: "finance freeze or budget constraints", test: (t) => /\b(financ|budget|spending freeze|frozen)\b/i.test(t) },
                { label: "enterprise account escalation", test: (t) => /\b(enterprise|customer success|account|escalat)\b/i.test(t) },
                { label: "risk quantification or severity", test: (t) => (t.match(/\b(risk|impact|high|medium|low|critical)\b/gi) ?? []).length >= 3 },
                { label: "dependency analysis", test: (t) => /\bdependenc\b/i.test(t) },
                { label: "revised timeline included", test: (t) => /\b(revised|timeline|schedule|estimate|weeks?)\b/i.test(t) },
                { label: "alternative supplier or mitigation", test: (t) => /\b(alternative|supplier|mitigation|diversif|contingency)\b/i.test(t) },
                { label: "actionable next steps", test: (t) => /\bnext steps?\b/i.test(t) || (/\d+\./.test(t) && /\b(confirm|identify|prepare|request|direct|present)\b/i.test(t)) },
                { label: "leadership decision support", test: (t) => /\b(leadership|decision|approval|executive|recommend)\b/i.test(t) },
                { label: "structured table or list", test: (t) => /\|.+\|/.test(t) || (/^\d+\./m.test(t) && (t.match(/^\d+\./gm) ?? []).length >= 3) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|team|management)\b/i.test(t) },
            ],
            structureChecks: [
                { label: "titled executive briefing", test: (t) => /\b(executive briefing|briefing|executive report)\b/i.test(t) },
                { label: "multiple sections with headings", test: (t) => (t.match(/^[A-Z][^\n:]{2,40}:/gm) ?? []).length >= 3 },
                { label: "table or structured data", test: (t) => /\|.+\|/.test(t) },
                { label: "numbered or bulleted items", test: (t) => /^\d+\.\s+/m.test(t) || /^[-*]\s+/m.test(t) },
                { label: "professional closing", test: (t) => /\b(best regards|regards|team|management)\b/i.test(t) },
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
                constraints: { maxWords: 15, minWords: 50 },
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
            constraints: { maxWords: 15, minWords: 50 },
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
