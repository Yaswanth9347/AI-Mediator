
import { Umzug, SequelizeStorage } from 'umzug';
import sequelize from './db.js';
import path from 'path';

export const migrator = new Umzug({
    migrations: {
        glob: path.join(process.cwd(), 'migrations/*.js'),
        resolve: ({ name, path, context }) => {
            // Dynamic import for migration files
            const migration = import(path);
            return {
                name,
                up: async () => (await migration).up(context, sequelize.Sequelize),
                down: async () => (await migration).down(context, sequelize.Sequelize),
            };
        },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
});

export const runMigrations = async () => {
    try {
        await migrator.up();
        console.log('✅ Migrations executed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
};

export const revertMigration = async () => {
    try {
        await migrator.down();
        console.log('✅ Migration reverted successfully');
    } catch (error) {
        console.error('❌ Migration revert failed:', error);
        throw error;
    }
};
