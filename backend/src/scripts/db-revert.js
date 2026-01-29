
import { revertMigration } from '../config/migrator.js';

console.log('🔄 Reverting last migration...');
revertMigration()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Revert failed:', err);
        process.exit(1);
    });
