/**
 * RAG Service (Retrieval-Augmented Generation)
 * 
 * Provides legal knowledge retrieval using embeddings:
 * - Generate embeddings using Gemini
 * - Store and search legal precedents
 * - Query relevant knowledge before AI analysis
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LegalKnowledge } from '../models/index.js';
import { logInfo, logError } from './logger.js';
import { Op } from 'sequelize';

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'API_KEY_MISSING';
const genAI = new GoogleGenerativeAI(API_KEY);

// Embedding model
const EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Generate embedding for text using Gemini
 * @param {string} text - Text to embed
 * @returns {Array} Embedding vector
 */
export async function generateEmbedding(text) {
    if (API_KEY === 'API_KEY_MISSING') {
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        logError('RAG: Embedding generation failed', { error: error.message });
        return null;
    }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array} a - First vector
 * @param {Array} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Index legal knowledge into the database with embedding
 * @param {Object} data - Knowledge data
 * @returns {Object} Created record
 */
export async function indexLegalKnowledge(data) {
    try {
        const { type, category, title, content, summary, jurisdiction, metadata } = data;

        // Generate embedding from combined text
        const textToEmbed = `${title}\n${summary || ''}\n${content}`;
        const embedding = await generateEmbedding(textToEmbed);

        const record = await LegalKnowledge.create({
            type,
            category,
            title,
            content,
            summary: summary || content.substring(0, 500),
            jurisdiction: jurisdiction || 'India',
            embedding,
            metadata: metadata || {}
        });

        logInfo('RAG: Indexed legal knowledge', { id: record.id, title });
        return record;

    } catch (error) {
        logError('RAG: Indexing failed', { error: error.message });
        return null;
    }
}

/**
 * Search for relevant legal knowledge
 * @param {string} query - Search query (dispute context)
 * @param {Object} options - Search options
 * @returns {Array} Relevant knowledge items with scores
 */
export async function searchRelevantKnowledge(query, options = {}) {
    const { topK = 5, category = null, type = null, minScore = 0.3 } = options;

    try {
        // Generate query embedding
        const queryEmbedding = await generateEmbedding(query);
        if (!queryEmbedding) {
            return [];
        }

        // Build filter conditions
        const where = { isActive: true };
        if (category) where.category = category;
        if (type) where.type = type;

        // Fetch all matching records (with embeddings)
        const records = await LegalKnowledge.findAll({
            where,
            attributes: ['id', 'type', 'category', 'title', 'content', 'summary', 'embedding', 'metadata']
        });

        // Calculate similarity scores
        const scored = records
            .filter(r => r.embedding)
            .map(r => ({
                id: r.id,
                type: r.type,
                category: r.category,
                title: r.title,
                content: r.content,
                summary: r.summary,
                metadata: r.metadata,
                score: cosineSimilarity(queryEmbedding, r.embedding)
            }))
            .filter(r => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        // Update usage stats for retrieved items
        if (scored.length > 0) {
            const ids = scored.map(r => r.id);
            await LegalKnowledge.update(
                {
                    usageCount: LegalKnowledge.sequelize.literal('usage_count + 1'),
                    lastUsedAt: new Date()
                },
                { where: { id: { [Op.in]: ids } } }
            );
        }

        logInfo('RAG: Search completed', {
            query: query.substring(0, 50) + '...',
            resultsCount: scored.length
        });

        return scored;

    } catch (error) {
        logError('RAG: Search failed', { error: error.message });
        return [];
    }
}

/**
 * Build RAG context for dispute analysis
 * @param {Object} dispute - Dispute object
 * @param {string} conversationSummary - Summary of conversation
 * @returns {string} Formatted legal context
 */
export async function buildRAGContext(dispute, conversationSummary = '') {
    try {
        // Build search query from dispute data
        const searchQuery = `
            ${dispute.title}
            ${dispute.description}
            ${dispute.category || 'general dispute'}
            ${conversationSummary}
        `.trim();

        // Search for relevant knowledge
        const relevantKnowledge = await searchRelevantKnowledge(searchQuery, {
            topK: 5,
            category: dispute.category, // Prioritize same category
            minScore: 0.25
        });

        if (relevantKnowledge.length === 0) {
            return '';
        }

        // Format as context
        let context = '\n=== RELEVANT LEGAL PRECEDENTS & KNOWLEDGE ===\n\n';

        relevantKnowledge.forEach((item, index) => {
            context += `[${index + 1}] ${item.title} (${item.type})\n`;
            context += `Category: ${item.category} | Relevance: ${(item.score * 100).toFixed(1)}%\n`;
            context += `${item.summary || item.content.substring(0, 300)}...\n`;
            if (item.metadata?.citation) {
                context += `Citation: ${item.metadata.citation}\n`;
            }
            context += '\n';
        });

        context += 'Note: Use these precedents as guidance, not binding rules. Each case has unique circumstances.\n';

        return context;

    } catch (error) {
        logError('RAG: Context building failed', { error: error.message });
        return '';
    }
}

/**
 * Seed initial legal knowledge base
 * Call this once to populate the database with foundational legal knowledge
 */
export async function seedLegalKnowledge() {
    try {
        // Check if already seeded
        const existing = await LegalKnowledge.count();
        if (existing > 0) {
            logInfo('RAG: Knowledge base already seeded', { count: existing });
            return;
        }

        const initialKnowledge = [
            // Consumer Protection
            {
                type: 'law_article',
                category: 'consumer',
                title: 'Consumer Protection Act 2019 - Key Provisions',
                content: `The Consumer Protection Act 2019 replaced the 1986 Act and provides enhanced protection to consumers. Key features include:
                
1. Consumer Rights: Right to be protected against marketing of goods and services hazardous to life and property; Right to be informed about quality, quantity, potency, purity, standard and price; Right to be assured access to a variety of goods and services at competitive prices; Right to be heard and be assured that consumer interests will receive due consideration; Right to seek redressal against unfair trade practices; Right to consumer awareness.

2. E-Commerce: Specific provisions for e-commerce including requirement for disclosure of return/refund/exchange policies, country of origin, seller details.

3. Product Liability: Manufacturers, sellers, and service providers can be held liable for defective products or deficient services.

4. Unfair Contracts: Central Consumer Protection Authority can declare contract terms unfair if they cause significant imbalance.

5. Pecuniary Jurisdiction: District Commission up to Rs. 1 crore, State Commission Rs. 1-10 crore, National Commission above Rs. 10 crore.`,
                metadata: { citation: 'Consumer Protection Act, 2019 (Act No. 35 of 2019)', year: 2019 }
            },

            // Property - RERA
            {
                type: 'law_article',
                category: 'property',
                title: 'RERA 2016 - Homebuyer Protections',
                content: `Real Estate (Regulation and Development) Act, 2016 (RERA) protects homebuyers:

1. Registration: All projects with land over 500 sq.m. or 8 apartments must register with RERA.

2. Advance Payment: Builders cannot take more than 10% as advance without a written agreement.

3. Carpet Area: Sale must be on carpet area basis, not super built-up area.

4. Structural Defects: Developer liable for structural defects for 5 years after possession.

5. Delayed Possession: If builder delays possession, they must pay interest at SBI MCLR + 2% to buyer.

6. False Promises: Advertisements and brochures are part of the agreement; builder must deliver as promised.

7. Compensation: Buyers can seek compensation without paying court fees through RERA tribunals.`,
                metadata: { citation: 'Real Estate (Regulation and Development) Act, 2016', year: 2016 }
            },

            // Contract Law
            {
                type: 'law_article',
                category: 'contract',
                title: 'Indian Contract Act 1872 - Breach Remedies',
                content: `When a contract is breached, the Indian Contract Act 1872 provides several remedies:

1. Damages (Section 73): Compensation for any loss or damage caused naturally in the usual course of things from the breach. Must prove actual loss.

2. Special Damages: Damages for loss arising from special circumstances known to both parties at the time of contract.

3. Liquidated Damages (Section 74): Pre-agreed compensation amount. Court may reduce if it finds the amount unreasonable.

4. Quantum Meruit: Payment for work done before breach, based on reasonable value of services rendered.

5. Specific Performance: Court order to perform the contract. Granted when damages are inadequate remedy.

6. Injunction: Court order preventing a party from doing something that would breach the contract.

7. Rescission: Cancellation of contract with parties restored to original position.`,
                metadata: { citation: 'Indian Contract Act, 1872', year: 1872 }
            },

            // Employment
            {
                type: 'law_article',
                category: 'employment',
                title: 'Wrongful Termination - Legal Remedies in India',
                content: `Wrongful termination in India is addressed through multiple laws:

1. Industrial Disputes Act 1947: Applies to 'workmen' (non-managerial). Retrenchment requires notice, compensation (15 days per year of service), and prior permission for establishments with 100+ workers.

2. Shops & Establishments Acts: State laws governing employment conditions, notice periods, termination procedures for shop workers.

3. Standing Orders: Certified standing orders define conditions of employment including termination procedures.

4. Remedies Available:
   - Reinstatement with back wages if termination violates natural justice
   - Compensation in lieu of reinstatement (typically 6-12 months salary)
   - Gratuity, earned leave encashment, notice pay if not given proper notice
   
5. Due Process: Employer must follow 'hire and fire' with proper notice and adherence to employment terms. Stigmatic termination (without inquiry) can be challenged.`,
                metadata: { citation: 'Industrial Disputes Act, 1947', year: 1947 }
            },

            // Financial
            {
                type: 'law_article',
                category: 'financial',
                title: 'RBI Circular on Unauthorized Digital Transactions',
                content: `RBI Master Circular on Limiting Liability of Customers in Unauthorized Electronic Banking Transactions:

1. Zero Liability: Customer has zero liability if unauthorized transaction occurs due to contributory fraud/negligence by bank and third party breach where deficiency lies neither with bank nor customer.

2. Limited Liability: Customer liability is limited to transaction value or Rs. 25,000 (whichever is lower) if third party breach and customer reports within 4-7 days.

3. Customer Liability: Customer bears liability only if negligence proven (sharing OTP, PIN, password) or delayed reporting beyond 7 days.

4. Reporting Timeline:
   - Within 3 days: Zero liability
   - 4-7 days: Liability capped as per nature of transaction
   - Beyond 7 days: As per bank policy, but bank must demonstrate customer fault

5. Burden of Proof: Bank must prove customer's negligence or delayed reporting.

6. Credit Back Period: Bank must credit the amount within 10 days of customer notification if liability is on bank.`,
                metadata: { citation: 'RBI/2017-18/15, DBR.No.Leg.BC.78/09.07.005/2017-18', year: 2017 }
            },

            // Precedent - Consumer
            {
                type: 'precedent',
                category: 'consumer',
                title: 'Delayed Delivery Compensation Principle',
                content: `Past Resolution Principle - Delayed Delivery Cases:

When a seller/service provider delays delivery beyond the agreed timeline, standard resolution approaches include:

1. If delay is 0-7 days: No compensation typically, unless time was essence of contract.

2. If delay is 7-30 days: Partial refund (10-20% of order value) or equivalent store credit.

3. If delay exceeds 30 days: Full refund option must be provided. If customer still wants product, compensation of 20-30% or equivalent benefits.

4. Additional considerations:
   - Perishable goods: Stricter timeline
   - Custom/made-to-order items: Reasonable flexibility allowed
   - Force majeure: Genuine delays due to unforeseen circumstances treated differently

5. Mental agony compensation: Rs. 5,000-25,000 depending on impact and duration of harassment.`,
                metadata: { source: 'Aggregated from consumer forum resolutions', type: 'principle' }
            },

            // Precedent - Property
            {
                type: 'precedent',
                category: 'property',
                title: 'Construction Quality Defects Resolution',
                content: `Past Resolution Principle - Construction Quality Issues:

Standard approaches for resolving construction quality disputes:

1. Minor Defects (leakage, paint peeling, fitting issues):
   - Developer rectification within 30 days
   - If not rectified, buyer can get it done and recover cost from developer
   - Compensation for inconvenience: Rs. 10,000-50,000

2. Major Defects (structural cracks, waterlogging, electrical safety):
   - Independent third-party assessment
   - Developer bears repair costs + 10-20% of repair cost as compensation
   - Extended warranty for rectified portions
   - If irreparable: Partial refund (5-15% of property value)

3. Material Substitution (cheaper materials used than agreed):
   - Price difference to be refunded
   - Additional compensation of 5-10% of difference as penalty

4. Delayed Completion:
   - Interest at MCLR + 2% for delay period
   - Rent reimbursement if buyer incurred rental expense`,
                metadata: { source: 'RERA tribunal resolutions', type: 'principle' }
            },

            // Principle - Natural Justice
            {
                type: 'principle',
                category: 'other',
                title: 'Principles of Natural Justice in Dispute Resolution',
                content: `Foundational principles to be applied in all dispute resolutions:

1. Audi Alteram Partem (Hear the Other Side):
   - Both parties must have opportunity to present their case
   - No decision without hearing affected party
   - Adequate time and information for preparation

2. Nemo Judex in Causa Sua (No One Should Judge Their Own Case):
   - Decision maker must be impartial
   - No conflict of interest
   - Appearance of bias equally important as actual bias

3. Reasoned Decision:
   - Every decision must be supported by reasons
   - Reasons must address the key arguments of both parties
   - Decision must be proportionate to the issue

4. Proportionality:
   - Remedy should match the harm
   - Excessive remedies undermine fairness
   - Consider ability of parties to comply

5. Good Faith:
   - Assume parties act in good faith unless proven otherwise
   - Give benefit of doubt where evidence is ambiguous
   - Focus on resolution, not punishment`,
                metadata: { source: 'Constitutional principles under Articles 14, 21', type: 'principle' }
            }
        ];

        // Index all knowledge items
        for (const item of initialKnowledge) {
            await indexLegalKnowledge(item);
        }

        logInfo('RAG: Initial knowledge base seeded', { count: initialKnowledge.length });

    } catch (error) {
        logError('RAG: Seeding failed', { error: error.message });
    }
}

export default {
    generateEmbedding,
    indexLegalKnowledge,
    searchRelevantKnowledge,
    buildRAGContext,
    seedLegalKnowledge
};
