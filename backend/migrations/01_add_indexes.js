
export const up = async (queryInterface, Sequelize) => {
    // User indexes
    await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_verification ON users("verificationStatus");
    `);

    // Dispute indexes
    await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
        CREATE INDEX IF NOT EXISTS idx_disputes_creator ON disputes("creatorId");
        CREATE INDEX IF NOT EXISTS idx_disputes_plaintiff_email ON disputes("plaintiffEmail");
        CREATE INDEX IF NOT EXISTS idx_disputes_respondent_email ON disputes("respondentEmail");
        CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes("createdAt");
        CREATE INDEX IF NOT EXISTS idx_disputes_forwarded ON disputes("forwardedToCourt");
        CREATE INDEX IF NOT EXISTS idx_disputes_resolution_status ON disputes("resolutionStatus");
    `);

    // Message indexes
    await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_dispute ON messages("disputeId");
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages("senderId");
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages("createdAt");
    `);

    console.log('✅ Database indexes created via migration');
};

export const down = async (queryInterface, Sequelize) => {
    // Drop indexes in reverse order
    await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS idx_messages_created;
        DROP INDEX IF EXISTS idx_messages_sender;
        DROP INDEX IF EXISTS idx_messages_dispute;
        DROP INDEX IF EXISTS idx_disputes_resolution_status;
        DROP INDEX IF EXISTS idx_disputes_forwarded;
        DROP INDEX IF EXISTS idx_disputes_created;
        DROP INDEX IF EXISTS idx_disputes_respondent_email;
        DROP INDEX IF EXISTS idx_disputes_plaintiff_email;
        DROP INDEX IF EXISTS idx_disputes_creator;
        DROP INDEX IF EXISTS idx_disputes_status;
        DROP INDEX IF EXISTS idx_users_verification;
        DROP INDEX IF EXISTS idx_users_role;
        DROP INDEX IF EXISTS idx_users_email;
    `);
    console.log('✅ Database indexes dropped via migration');
};
