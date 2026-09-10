import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin';
import { getMaintenanceSummary } from '../../services/maintenanceService';

const router = Router();
router.use(requireAdmin);

router.get('/summary', async (_req, res) => {
  try {
    const summary = await getMaintenanceSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Synthèse maintenance indisponible',
    });
  }
});

export default router;
