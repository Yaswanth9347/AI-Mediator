
import { runMigrations } from '../config/migrator.js';

console.log('🔄 Running migrations...');
runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    });
