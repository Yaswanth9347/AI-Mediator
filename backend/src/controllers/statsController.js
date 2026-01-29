
import { Op } from 'sequelize';
import { Dispute } from '../models/index.js';

export const getStats = async (req, res) => {
    try {
        let stats = {};
        if (req.user.role === 'Admin') {
            const [totalDisputes, activeDisputes, resolvedDisputes] = await Promise.all([
                Dispute.count(),
                Dispute.count({ where: { status: 'Active' } }),
                Dispute.count({ where: { status: 'Resolved' } })
            ]);
            stats = { totalDisputes, activeDisputes, resolvedDisputes };
        } else {
            const userId = req.user.id;
            const userStats = await Dispute.count({
                where: {
                    [Op.or]: [
                        { creatorId: userId },
                        { plaintiffEmail: req.user.email },
                        { respondentEmail: req.user.email }
                    ]
                }
            });
            stats = { myDisputes: userStats };
        }
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
