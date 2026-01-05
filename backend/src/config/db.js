import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
    },
    dialectOptions: {
        statement_timeout: 30000, // 30 seconds
        idle_in_transaction_session_timeout: 60000, // 60 seconds
    },
});

// Database health check function
export async function checkDatabaseHealth() {
    try {
        await sequelize.authenticate();
        const result = await sequelize.query('SELECT NOW() as now', { type: 'SELECT' });
        return {
            status: 'healthy',
            timestamp: result[0]?.now || new Date().toISOString(),
            pool: {
                total: sequelize.connectionManager.pool?._count || 0,
                idle: sequelize.connectionManager.pool?._availableObjectsCount || 0,
            }
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
        };
    }
}

// Add indexes after sync (for existing tables)
export async function addDatabaseIndexes() {
    try {
        // User indexes
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
            CREATE INDEX IF NOT EXISTS idx_users_verification ON users("verificationStatus");
        `).catch(() => {});

        // Dispute indexes
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
            CREATE INDEX IF NOT EXISTS idx_disputes_creator ON disputes("creatorId");
            CREATE INDEX IF NOT EXISTS idx_disputes_plaintiff_email ON disputes("plaintiffEmail");
            CREATE INDEX IF NOT EXISTS idx_disputes_respondent_email ON disputes("respondentEmail");
            CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes("createdAt");
            CREATE INDEX IF NOT EXISTS idx_disputes_forwarded ON disputes("forwardedToCourt");
            CREATE INDEX IF NOT EXISTS idx_disputes_resolution_status ON disputes("resolutionStatus");
        `).catch(() => {});

        // Message indexes
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_dispute ON messages("disputeId");
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages("senderId");
            CREATE INDEX IF NOT EXISTS idx_messages_created ON messages("createdAt");
        `).catch(() => {});

        console.log('✅ Database indexes verified/created');
    } catch (error) {
        console.error('⚠️ Some indexes could not be created:', error.message);
    }
}

export default sequelize;
