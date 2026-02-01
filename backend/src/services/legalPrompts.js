/**
 * Legal Prompts Module
 * 
 * Contains embedded legal knowledge and domain-specific prompts
 * for enhanced AI dispute resolution.
 */

// ============ INDIAN LEGAL FRAMEWORK ============

export const INDIAN_LEGAL_FRAMEWORK = `
INDIAN LEGAL FRAMEWORK FOR DISPUTE RESOLUTION

CONSTITUTIONAL PRINCIPLES:
1. Article 14 - Right to Equality: All parties must be treated equally before the law
2. Article 21 - Right to Life and Dignity: Solutions must protect dignity of all parties
3. Article 39A - Equal Justice: Ensure justice is accessible and fair
4. Natural Justice Principles:
   - Audi Alteram Partem (hear both sides)
   - Nemo Judex in Causa Sua (no one should be judge in their own cause)
   - Reasoned decisions

ALTERNATIVE DISPUTE RESOLUTION (ADR) IN INDIA:
- Arbitration and Conciliation Act, 1996
- Mediation is encouraged under Section 89 of CPC
- Lok Adalats for quick resolution
- Online Dispute Resolution (ODR) is legally recognized

KEY PRINCIPLES FOR FAIR RESOLUTION:
1. Proportionality - Remedy should match the harm
2. Restoration over Punishment - Focus on making things right
3. Future Prevention - Address root causes
4. Mutual Satisfaction - Both parties should find value
5. Enforceability - Solutions should be practically implementable
`;

// ============ CATEGORY-SPECIFIC LEGAL KNOWLEDGE ============

export const DISPUTE_CATEGORY_PROMPTS = {
    consumer: `
CONSUMER DISPUTE CONTEXT (Consumer Protection Act, 2019):

KEY LAWS:
- Consumer Protection Act, 2019 (replaced 1986 Act)
- Consumer rights: Right to safety, information, choice, be heard, redressal, education
- E-commerce rules apply to online transactions
- Product liability provisions

COMMON RESOLUTIONS:
- Full/partial refund within 15 days
- Replacement of defective goods
- Compensation for mental agony (typically Rs. 10,000-50,000)
- Service rectification with timeline
- Written apology for service failures

MONETARY JURISDICTION:
- District Commission: Up to Rs. 1 crore
- State Commission: Rs. 1-10 crore
- National Commission: Above Rs. 10 crore
`,

    property: `
PROPERTY DISPUTE CONTEXT (RERA and Property Laws):

KEY LAWS:
- Real Estate (Regulation and Development) Act, 2016 (RERA)
- Transfer of Property Act, 1882
- Registration Act, 1908
- Specific Relief Act, 1963

COMMON ISSUES:
- Delayed possession (entitled to interest/compensation)
- Quality defects (rectification + compensation)
- Title disputes (require clear chain of ownership)
- Boundary disputes (survey-based resolution)
- Rent disputes (Rent Control Acts)

RERA PROTECTIONS:
- 5-year structural defect liability on builders
- Interest on delays at SBI MCLR + 2%
- Right to information about project
- Carpet area-based pricing
`,

    contract: `
CONTRACT DISPUTE CONTEXT (Indian Contract Act, 1872):

KEY PRINCIPLES:
- Section 10: Valid contract requirements
- Section 23: Lawful consideration and object
- Section 73: Compensation for breach
- Section 74: Penalty as genuine pre-estimate

BREACH REMEDIES:
- Specific Performance (forcing contract completion)
- Damages (actual loss proven)
- Quantum Meruit (reasonable value for work done)
- Rescission (cancellation with restoration)
- Injunction (preventing further breach)

COMMON RESOLUTIONS:
- Payment of outstanding amounts with interest
- Extension of timelines with mutual agreement
- Partial performance with adjusted consideration
- Termination with settlement amount
`,

    employment: `
EMPLOYMENT DISPUTE CONTEXT (Labour Laws):

KEY LAWS:
- Industrial Disputes Act, 1947
- Payment of Wages Act, 1936
- Employees' Provident Fund Act, 1952
- Sexual Harassment of Women at Workplace Act, 2013
- New Labour Codes 2020

COMMON ISSUES:
- Wrongful termination (reinstatement or compensation)
- Unpaid wages (recovery with interest 6-12%)
- Harassment (internal committees, compensation)
- Non-compete violations (reasonableness test)
- PF/ESI non-deposit (legal action against employer)

RESOLUTION APPROACHES:
- Ex-gratia settlements for clean separation
- Full and final settlement calculations
- Reference letters and clearance documents
- Non-disclosure agreements for sensitive matters
`,

    financial: `
FINANCIAL DISPUTE CONTEXT (Banking and Finance Laws):

KEY LAWS:
- Banking Regulation Act, 1949
- RBI Guidelines and Circulars
- SARFAESI Act, 2002
- Consumer Protection Act for banking services
- Information Technology Act for digital transactions

COMMON ISSUES:
- Unauthorized transactions (zero liability within 3 days reporting)
- Loan disputes (EMI restructuring, one-time settlement)
- Credit card issues (charge-back provisions)
- Insurance claim rejections (IRDAI guidelines)
- Investment fraud (SEBI jurisdiction)

RBI OMBUDSMAN SCHEME:
- Free resolution mechanism
- Covers most banking complaints
- Decision binding on banks up to Rs. 20 lakh
`,

    harassment: `
HARASSMENT DISPUTE CONTEXT:

KEY LAWS:
- Indian Penal Code Sections 354, 509
- Sexual Harassment of Women at Workplace Act, 2013
- Information Technology Act, 2000 (cyber harassment)
- Protection of Women from Domestic Violence Act, 2005

WORKPLACE HARASSMENT:
- Internal Complaints Committee (ICC) mandatory
- 90-day inquiry timeline
- Confidentiality requirements
- No adverse action against complainant

RESOLUTIONS:
- Written apology and undertaking
- Transfer of parties if needed
- Counseling/training mandates
- Monetary compensation for trauma
- Warning letters/employment action
`,

    defamation: `
DEFAMATION DISPUTE CONTEXT:

KEY LAWS:
- IPC Sections 499, 500 (Criminal Defamation)
- Civil Defamation under Tort Law
- Information Technology (Intermediary Guidelines) Rules, 2021

DEFENSE AGAINST DEFAMATION:
- Truth as absolute defense
- Fair comment on matters of public interest
- Privilege (parliamentary, judicial, etc.)

COMMON RESOLUTIONS:
- Public apology/retraction
- Removal of defamatory content
- Undertaking not to repeat
- Monetary compensation (Rs. 1-25 lakh typical)
- Legal costs reimbursement
`,

    other: `
GENERAL DISPUTE RESOLUTION PRINCIPLES:

APPLICABLE FRAMEWORK:
- General principles of equity and fairness
- Relevant specific laws based on facts
- Constitutional fundamental rights
- Customary practices if applicable

RESOLUTION APPROACH:
- Interest-based negotiation over positions
- Identify underlying needs of both parties
- Creative solutions beyond monetary
- Future relationship considerations
- Practical enforceability
`
};

// ============ FAIRNESS PRINCIPLES ============

export const FAIRNESS_PRINCIPLES = `
FAIRNESS ASSESSMENT FRAMEWORK:

1. PROCEDURAL FAIRNESS:
   - Both parties had opportunity to present their case
   - All evidence was considered
   - No bias towards either party
   - Transparent decision-making process

2. SUBSTANTIVE FAIRNESS:
   - Remedy proportional to harm caused
   - No punitive measures beyond restoration
   - Consideration of both parties' circumstances
   - Balance between individual and collective interests

3. RESTORATIVE JUSTICE:
   - Focus on repairing harm over punishment
   - Acknowledgment of wrongdoing where appropriate
   - Paths to reconciliation if possible
   - Prevention of future conflicts

4. PRACTICAL CONSIDERATIONS:
   - Solutions must be implementable
   - Timeline must be realistic
   - Costs must be proportionate
   - Enforcement mechanisms clear
`;

// ============ SOLUTION TEMPLATES ============

export const SOLUTION_STRUCTURE = `
SOLUTION STRUCTURE REQUIREMENTS:

Each solution MUST contain:

1. ACKNOWLEDGMENT SECTION:
   - What happened according to evidence
   - Recognition of harm/grievance
   - No blame assignment, just facts

2. CORRECTIVE ACTIONS:
   - Specific actions to remedy the situation
   - Who does what, by when
   - Measurable outcomes

3. PREVENTIVE MEASURES:
   - How to prevent recurrence
   - Systems/processes to implement
   - Behavioral changes expected

4. FAIRNESS RATIONALE:
   - Why this solution is fair to ${"{plaintiff_name}"}
   - Why this solution is fair to ${"{defendant_name}"}
   - How it aligns with legal principles

5. IMPLEMENTATION:
   - Step-by-step implementation plan
   - Timeline with milestones
   - Verification mechanism

6. RESULT STATEMENT:
   - Clear outcome of implementing this solution
   - How the dispute is resolved
   - Status of the relationship going forward
`;

// ============ PROMPT BUILDER ============

/**
 * Build category-specific context for AI analysis
 * @param {string} category - Dispute category
 * @param {Object} profile - Case profile data
 * @returns {string} Formatted legal context
 */
export function buildLegalContext(category, profile = {}) {
    const categoryPrompt = DISPUTE_CATEGORY_PROMPTS[category] || DISPUTE_CATEGORY_PROMPTS.other;

    let context = `
${INDIAN_LEGAL_FRAMEWORK}

${categoryPrompt}

${FAIRNESS_PRINCIPLES}
`;

    // Add severity-specific guidance
    if (profile.severity === 'critical') {
        context += `
CRITICAL SEVERITY NOTICE:
This dispute involves serious matters that may require:
- Legal escalation if mediation fails
- Professional legal advice recommendation
- Documentation for potential court proceedings
- Careful consideration of all evidence
`;
    } else if (profile.severity === 'high') {
        context += `
HIGH SEVERITY NOTICE:
This dispute requires careful attention to:
- Detailed remedy calculations
- Clear timelines for resolution
- Strong enforcement mechanisms
- Professional approach to sensitive issues
`;
    }

    // Add monetary context if applicable
    if (profile.monetaryAmount) {
        context += `
MONETARY CLAIM: Rs. ${profile.monetaryAmount?.toLocaleString('en-IN')}
Consider:
- Interest calculations (typically 6-18% per annum)
- Payment timeline feasibility
- Partial payment options if needed
- Documentation requirements
`;
    }

    return context;
}

export default {
    INDIAN_LEGAL_FRAMEWORK,
    DISPUTE_CATEGORY_PROMPTS,
    FAIRNESS_PRINCIPLES,
    SOLUTION_STRUCTURE,
    buildLegalContext
};
