import express, {Request, Response} from 'express';
import {REST_ROUTES, HealthResponse, SHARED_VERSION} from '@millu/shared';
import {QuestionLoader} from '../questions/QuestionLoader.js';
import {EventLog} from '../logging/EventLog.js';

/**
 * REST-эндпоинты для вспомогательных операций.
 *   GET  /api/health               проверка доступности
 *   GET  /api/questions/packs      список пакетов
 *   GET  /api/questions/packs/:id  содержимое пакета
 *   POST /api/questions/packs      загрузка нового пакета
 */
export function buildRestRouter(
  loader: QuestionLoader,
  log: EventLog,
  startTime: number,
) {
  const router = express.Router();
  router.use(express.json({limit: '2mb'}));
  router.use(express.raw({type: 'text/plain', limit: '2mb'}));

  router.get(REST_ROUTES.health, (_req: Request, res: Response) => {
    const body: HealthResponse = {
      ok: true,
      serverTime: Date.now(),
      version: SHARED_VERSION,
      uptime: Math.round((Date.now() - startTime) / 1000),
    };
    res.json(body);
  });

  router.get(REST_ROUTES.packs, (_req: Request, res: Response) => {
    try {
      res.json({ok: true, packs: loader.listPacks()});
    } catch (err) {
      log.error('rest.packs', String(err));
      res.status(500).json({ok: false, error: 'Ошибка чтения пакетов'});
    }
  });

  router.get('/api/questions/packs/:id', (req: Request, res: Response) => {
    try {
      const result = loader.loadByFilename(req.params.id);
      res.json({ok: true, ...result});
    } catch (err) {
      res.status(404).json({ok: false, error: String(err)});
    }
  });

  router.post(REST_ROUTES.uploadPack, (req: Request, res: Response) => {
    try {
      const filename = typeof req.query.name === 'string' ? req.query.name : 'uploaded.txt';
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      const savedAs = loader.savePack(filename, body);
      const result = loader.loadByFilename(savedAs);
      log.info('rest.upload', `загружен пакет "${savedAs}" (${result.pack.questionCount} вопросов)`);
      res.json({ok: true, savedAs, ...result});
    } catch (err) {
      log.error('rest.upload', String(err));
      res.status(400).json({ok: false, error: String(err)});
    }
  });

  return router;
}
