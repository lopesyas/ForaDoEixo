import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

export interface SttOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const Output = z.object({ text: z.string() });
const MAX_BYTES = 3 * 1024 * 1024;
const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

/**
 * Transcrição de voz (reserva do ditado do navegador). Recebe o áudio gravado e devolve o texto.
 * O áudio não é guardado: só é repassado ao provedor para transcrever e descartado.
 */
export function transcribeRoutes(stt: SttOptions | null) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
  router.post('/transcribe', limiter, express.raw({ type: 'audio/*', limit: MAX_BYTES }), async (req, res) => {
    if (!stt) {
      res.status(501).json({ error: 'A transcrição de voz está desativada neste servidor.' });
      return;
    }
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length < 800) {
      res.status(400).json({ error: 'Áudio inválido ou muito curto.' });
      return;
    }
    const mime = (req.headers['content-type'] ?? 'audio/webm').split(';')[0]!.trim();
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(body)], { type: mime }), `audio.${EXT[mime] ?? 'webm'}`);
      form.append('model', stt.model);
      form.append('language', 'pt');
      form.append('temperature', '0');
      form.append('response_format', 'json');
      form.append('prompt', 'Pedido em português do Brasil a uma farmácia: produtos, remédios sem receita, preços em reais.');
      const doFetch = stt.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
      const upstream = await doFetch(`${stt.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stt.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok) {
        res.status(502).json({ error: 'Não consegui transcrever agora.' });
        return;
      }
      const { text } = Output.parse(await upstream.json());
      res.json({ text: text.trim().slice(0, 500) });
    } catch {
      res.status(502).json({ error: 'Não consegui transcrever agora.' });
    }
  });
  return router;
}
