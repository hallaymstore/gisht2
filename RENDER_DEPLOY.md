# Render deploy

Bu versiya Render uchun moslashtirilgan.

Kerakli envlar:

- `HOST=0.0.0.0`
- `APP_URL=https://<service>.onrender.com`
- `GOOGLE_REDIRECT_URI=https://<service>.onrender.com/auth/google/callback`
- `APP_SECRET=<uzun-random-secret>`
- `PANEL_PASSWORD=<kuchli-parol>`
- `TRUST_PROXY=1`
- `FORCE_SECURE_COOKIE=1`
- `DATABASE_URL=<Render Postgres internal URL>`
- `CLOUD_MODE=1`
- `AI_PROVIDER=template` (Gemini key bo‘lmaguncha)

> Eslatma: Render free web service uxlab qolishi mumkin; 24/7 scheduler uchun paid always-on instance yoki alohida worker kerak.
> Media fayllar Render lokal diskida doimiy saqlanishi kafolatlanmaydi; production uchun R2/S3 yoki local worker tavsiya qilinadi.
