
import { DataTypes } from 'sequelize';

/**
 * Migration: Add AI Feature Tables and Columns
 * 
 * This migration adds:
 * 1. New fields to the disputes table for structured case profiles
 * 2. ConversationSummaries table for conversation memory
 * 3. LegalKnowledges table for RAG system
 */

export const up = async (queryInterface, Sequelize) => {
    console.log('Running migration: 02_add_ai_feature_tables');

    // ========== 1. ADD NEW COLUMNS TO DISPUTES TABLE ==========
    const disputeColumns = [
        { name: 'category', type: DataTypes.STRING, defaultValue: 'other' },
        { name: 'monetaryAmount', type: DataTypes.DECIMAL(15, 2), allowNull: true },
        { name: 'monetaryCurrency', type: DataTypes.STRING, defaultValue: 'INR' },
        { name: 'timeline', type: DataTypes.JSONB, allowNull: true },
        { name: 'severity', type: DataTypes.STRING, defaultValue: 'medium' },
        { name: 'keyIssues', type: DataTypes.JSONB, allowNull: true },
        { name: 'partiesAnalysis', type: DataTypes.JSONB, allowNull: true },
        { name: 'caseProfileGenerated', type: DataTypes.BOOLEAN, defaultValue: false },
        { name: 'caseProfileGeneratedAt', type: DataTypes.DATE, allowNull: true },
        { name: 'caseProfileVersion', type: DataTypes.INTEGER, defaultValue: 0 }
    ];

    for (const col of disputeColumns) {
        try {
            await queryInterface.addColumn('disputes', col.name, {
                type: col.type,
                allowNull: col.allowNull !== false,
                defaultValue: col.defaultValue
            });
            console.log(`Added column: disputes.${col.name}`);
        } catch (err) {
            if (err.message.includes('already exists')) {
                console.log(`Column already exists: disputes.${col.name}`);
            } else {
                console.error(`Failed to add column ${col.name}:`, err.message);
            }
        }
    }

    // ========== 2. CREATE CONVERSATIONSUMMARIES TABLE ==========
    try {
        await queryInterface.createTable('conversationsummaries', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            disputeId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'disputes',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            summaryType: {
                type: DataTypes.STRING,
                defaultValue: 'incremental'
            },
            content: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            messagesFrom: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            messagesTo: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            messageCount: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            keyPoints: {
                type: DataTypes.JSONB,
                defaultValue: []
            },
            overallTone: {
                type: DataTypes.STRING
            },
            version: {
                type: DataTypes.INTEGER,
                defaultValue: 1
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
        console.log('Created table: conversationsummaries');
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('Table already exists: conversationsummaries');
        } else {
            console.error('Failed to create conversationsummaries:', err.message);
        }
    }

    // ========== 3. CREATE LEGALKNOWLEDGES TABLE ==========
    try {
        await queryInterface.createTable('legalknowledges', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false
            },
            category: {
                type: DataTypes.STRING,
                allowNull: false
            },
            title: {
                type: DataTypes.STRING,
                allowNull: false
            },
            content: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            summary: {
                type: DataTypes.TEXT
            },
            jurisdiction: {
                type: DataTypes.STRING,
                defaultValue: 'India'
            },
            embedding: {
                type: DataTypes.JSONB
            },
            metadata: {
                type: DataTypes.JSONB,
                defaultValue: {}
            },
            isActive: {
                type: DataTypes.BOOLEAN,
                defaultValue: true
            },
            usageCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            lastUsedAt: {
                type: DataTypes.DATE
            },
            createdAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
        console.log('Created table: legalknowledges');
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('Table already exists: legalknowledges');
        } else {
            console.error('Failed to create legalknowledges:', err.message);
        }
    }

    // ========== 4. ADD INDEXES ==========
    try {
        await queryInterface.addIndex('conversationsummaries', ['disputeId']);
        await queryInterface.addIndex('legalknowledges', ['category']);
        await queryInterface.addIndex('legalknowledges', ['type']);
        console.log('Added indexes');
    } catch (err) {
        console.log('Index creation skipped (may already exist)');
    }

    console.log('Migration 02_add_ai_feature_tables completed');
};

export const down = async (queryInterface, Sequelize) => {
    // Remove columns from disputes
    const columnsToRemove = [
        'category', 'monetaryAmount', 'monetaryCurrency', 'timeline',
        'severity', 'keyIssues', 'partiesAnalysis', 'caseProfileGenerated',
        'caseProfileGeneratedAt', 'caseProfileVersion'
    ];

    for (const col of columnsToRemove) {
        try {
            await queryInterface.removeColumn('disputes', col);
        } catch (err) {
            console.log(`Column ${col} may not exist, skipping`);
        }
    }

    // Drop tables
    await queryInterface.dropTable('conversationsummaries');
    await queryInterface.dropTable('legalknowledges');

    console.log('Migration 02_add_ai_feature_tables reverted');
};
