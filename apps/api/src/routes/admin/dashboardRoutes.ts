import { Router } from 'express';
import { getDashboardStats } from '../../services/dashboardService';
import { requireAdmin } from '../../middleware/requireAdmin';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Dashboard indisponible' });
  }
});

export default router;
