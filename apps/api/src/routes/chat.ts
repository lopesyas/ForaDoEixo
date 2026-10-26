import { Router } from 'express';
import { z } from 'zod';
import type { ChatService } from '../services/chat';

const Body = z
  .object({
    conversationId: z.string().min(8).max(64),
    text: z.string().trim().min(1).max(500).optional(),
    actionId: z.string().min(1).max(80).optional(),
    actionIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  })
  .refine((b) => b.text !== undefined || b.actionId !== undefined || (b.actionIds?.length ?? 0) > 0, { message: 'Envie um texto ou uma ação.' });

/** Rota fina: valida a entrada, chama o serviço e devolve o contrato de interface. Sem lógica de negócio aqui. */
export function chatRoutes(service: ChatService) {
  const router = Router();
  router.post('/chat', async (req, res, next) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Pedido inválido.' });
      return;
    }
    try {
      res.json(await service.handle(parsed.data));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
