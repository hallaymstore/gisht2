require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const os = require('os');
const { getState, updateSettings, patchChannel, removeChannel, addLog } = require('./src/store');
const { createAuthUrl, handleCallback, refreshChannel } = require('./src/youtube');
const { JobQueue } = require('./src/queue');
const { Scheduler } = require('./src/scheduler');
const { scanFiles, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, ffmpegPath, ffprobePath } = require('./src/media');
const { pickFolder } = require('./src/folder-picker');
const { geminiMetadata, ollamaMetadata, templateMetadata } = require('./src/ai');
const { localDateTimeKey, localDisplay } = require('./src/utils');
const panelAuth = require('./src/auth');

const app = express();
const PORT = Number(process.env.PORT || 3939);
const HOST = process.env.HOST || '127.0.0.1';
const STARTED_AT = new Date();
const queue = new JobQueue();
const scheduler = new Scheduler(queue);

app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/api/session', (req, res) => res.json({ authenticated: panelAuth.isAuthenticated(req), authRequired: panelAuth.enabled() }));
app.post('/api/login', panelAuth.login);
app.post('/api/logout', (req, res) => { panelAuth.clearCookie(res, req); res.json({ ok: true }); });
app.use('/api', panelAuth.requireApi);

app.get('/api/status', async (_req, res) => {
  const state = await getState();
  const publicChannels = state.channels.map(({ oauthEncrypted, ...c }) => ({ ...c, connected: Boolean(oauthEncrypted) }));
  const tz = state.settings.timezone;
  res.json({
    settings: state.settings, channels: publicChannels, jobs: state.jobs.slice(-120).reverse(), logs: state.logs.slice(-150).reverse(),
    queue: queue.snapshot(), scheduler: state.scheduler,
    time: { timezone: tz, serverUtc: new Date().toISOString(), localKey: localDateTimeKey(new Date(), tz), localDisplay: localDisplay(new Date(), tz), startedAt: STARTED_AT.toISOString(), uptimeSeconds: Math.round(process.uptime()) },
    remote: { authEnabled: panelAuth.enabled(), host: HOST, port: PORT, localAddresses: localAddresses(PORT), publicUrl: process.env.APP_URL || '' },
    env: { googleReady: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), geminiReady: Boolean(process.env.GEMINI_API_KEY), geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b', ffmpegPath, ffprobePath, stateStorage: process.env.DATABASE_URL ? 'postgres' : 'file', cloudMode: process.env.CLOUD_MODE === '1' }
  });
});

app.put('/api/settings', async (req, res) => { try { res.json(await updateSettings(req.body || {})); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/pick-folder', async (req, res) => { try { res.json({ path: await pickFolder(req.body?.title || 'Papka tanlang') }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.get('/api/scan', async (_req, res) => { try { const state = await getState(); const [clips, songs] = await Promise.all([scanFiles(state.settings.clipDir, VIDEO_EXTENSIONS), scanFiles(state.settings.musicDir, AUDIO_EXTENSIONS)]); res.json({ clips: clips.length, songs: songs.length, clipExamples: clips.slice(0, 5), songExamples: songs.slice(0, 5) }); } catch (error) { res.status(400).json({ error: error.message }); } });

app.get('/auth/google', panelAuth.requirePage, (_req, res) => { try { res.redirect(createAuthUrl().url); } catch (error) { res.redirect(`/?oauth=error&message=${encodeURIComponent(error.message)}`); } });
app.get('/auth/google/callback', async (req, res) => { try { await handleCallback({ code: req.query.code, state: req.query.state }); res.redirect('/?oauth=connected'); } catch (error) { res.redirect(`/?oauth=error&message=${encodeURIComponent(error.message)}`); } });

app.patch('/api/channels/:id', async (req, res) => { try { res.json(await patchChannel(req.params.id, req.body || {})); } catch (error) { res.status(400).json({ error: error.message }); } });
app.delete('/api/channels/:id', async (req, res) => { try { await removeChannel(req.params.id); res.json({ ok: true }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/channels/:id/refresh', async (req, res) => { try { res.json(await refreshChannel(req.params.id)); } catch (error) { res.status(400).json({ error: error.message }); } });

app.post('/api/jobs/enqueue', async (req, res) => { try { const state = await getState(); const channel = req.body?.channelId ? state.channels.find(c => c.channelId === req.body.channelId) : state.channels.filter(c => c.enabled).sort((a, b) => (a.order || 0) - (b.order || 0))[0]; if (!channel) throw new Error('Faol kanal topilmadi'); res.json(await queue.enqueue(channel.channelId, 'manual')); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/jobs/schedule', async (req, res) => { try { res.json(await queue.schedule(req.body?.channelId, req.body?.scheduledLocal)); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/jobs/:id/retry', async (req, res) => { try { res.json(await queue.retry(req.params.id)); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/jobs/:id/cancel', async (req, res) => { try { res.json(await queue.cancel(req.params.id)); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/scheduler/run-next', async (_req, res) => { try { res.json({ result: await scheduler.tick(true) }); } catch (error) { res.status(400).json({ error: error.message }); } });

app.post('/api/ai/test', async (req, res) => {
  try {
    const state = await getState();
    const channel = state.channels[0] || { title: 'Demo Channel', tags: ['music'], titleTemplate: '{song} | Official Music', descriptionTemplate: '{song}\n#music' };
    const input = { songName: req.body?.songName || 'Example Song', channel, settings: state.settings };
    let result;
    if (state.settings.aiProvider === 'gemini') result = await geminiMetadata(input); else if (state.settings.aiProvider === 'ollama') result = await ollamaMetadata(input); else result = templateMetadata(input);
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/doctor', async (_req, res) => {
  const state = await getState(); const checks = [];
  checks.push({ name: 'APP_SECRET', ok: (process.env.APP_SECRET || '').length >= 24, detail: 'OAuth tokenlarni shifrlash uchun' });
  checks.push({ name: 'Panel paroli', ok: panelAuth.enabled() || HOST === '127.0.0.1' || HOST === 'localhost', detail: panelAuth.enabled() ? 'Yoqilgan' : 'Remote rejimda PANEL_PASSWORD qo‘ying' });
  checks.push({ name: 'Google OAuth', ok: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), detail: 'YouTube kanal ulash uchun' });
  checks.push({ name: 'Clip papka', ok: Boolean(state.settings.clipDir && fs.existsSync(state.settings.clipDir)), detail: state.settings.clipDir || 'tanlanmagan' });
  checks.push({ name: 'Musiqa papka', ok: Boolean(state.settings.musicDir && fs.existsSync(state.settings.musicDir)), detail: state.settings.musicDir || 'tanlanmagan' });
  checks.push({ name: 'Output papka', ok: Boolean(state.settings.outputDir), detail: state.settings.outputDir || 'tanlanmagan' });
  checks.push({ name: 'AI', ok: state.settings.aiProvider === 'template' || (state.settings.aiProvider === 'gemini' ? Boolean(process.env.GEMINI_API_KEY) : true), detail: state.settings.aiProvider });
  res.json({ checks });
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: error.message || 'Server xatosi' }); });

function localAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const item of list || []) if (item.family === 'IPv4' && !item.internal) out.push(`http://${item.address}:${port}`);
  return out;
}

awaitStart();
async function awaitStart() {
  try {
    await getState(); await queue.recoverStartup(); scheduler.start(); queue.kick();
    app.listen(PORT, HOST, () => {
      console.log(`\nAutoMix YouTube AI: http://localhost:${PORT}`); console.log(`Host: ${HOST} | Scheduler + Recovery active`);
      if (HOST === '0.0.0.0') console.log('Telefon/LAN:', localAddresses(PORT).join(' | '));
      addLog('info', `Server ishga tushdi: http://localhost:${PORT} | recovery active`).catch(() => {});
    });
  } catch (error) { console.error('START XATO:', error); process.exitCode = 1; }
}
