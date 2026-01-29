import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
        idle: parseInt(process.env.DB_POOL_IDLE || '10000'),
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



export default sequelize;
