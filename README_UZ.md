# AutoMix YouTube AI v1.1 — Mobile PWA + Power Recovery

AutoMix Studio video generator + YTAI ko‘p-kanalli YouTube OAuth uploader + AI metadata + persistent scheduler + telefon uchun PWA boshqaruv paneli. Windows PC/VPS render qiladi, telefon esa istalgan joydan boshqaradi.


## v1.1 dagi yangi imkoniyatlar

- Telefon uchun install qilinadigan PWA panel (`manifest + service worker`).
- Server vaqtini scheduler timezone bo‘yicha real vaqtda ko‘rsatish.
- `state.json` + avtomatik `state.json.bak` backup va atomic save.
- Tok/internet/dastur uzilgandan keyin interrupted render/metadata/upload recovery.
- 3 xil missed-slot recovery rejimi: catch-up, next-only, skip-missed.
- Aniq sana-vaqtga video rejalashtirish; server o‘chiq bo‘lsa restartda overdue reja ishlaydi.
- Telefon/LAN/remote panel uchun `PANEL_PASSWORD` cookie session himoyasi.
- `START_LAN_PHONE.bat` orqali bir xil Wi-Fi ichida telefon bilan boshqarish.
- Custom `FFMPEG_PATH` / `FFPROBE_PATH`.

Telefon/masofaviy ishlatish bo‘yicha batafsil: **MOBILE_REMOTE_UZ.md**.

## Nima qiladi?

1. `Clips` papkasidagi qisqa videolarni oladi.
2. `Music` papkasidan navbatdagi musiqani tanlaydi.
3. Musiqa davomiyligini FFprobe bilan aniqlaydi.
4. Kliplarni random tartibda, imkon qadar yonma-yon takrorlamasdan musiqaga teng uzunlikda yig‘adi.
5. FFmpeg bilan MP4 yaratadi.
6. Gemini API, Ollama yoki oddiy template orqali title/description/tags tayyorlaydi.
7. Tanlangan YouTube kanalga OAuth 2.0 orqali yuklaydi.
8. Scheduler kanal navbati bo‘yicha bu ishni avtomatik takrorlaydi.

## Tavsiya qilingan default rejim

- Scheduler mode: `Har kanalga kuniga 1`
- Start: `00:00`
- Interval: `60 minut`
- 24 kanal bo‘lsa: 00:00 dan 23:00 gacha har soatda boshqa kanalga bittadan video.
- 10 kanal bo‘lsa: dastlabki 10 slotda 10 kanalga bittadan video; shu kuni o‘sha kanallarga qayta yuklamaydi.
- `continuous-hourly` rejimi tanlansa, kanallar aylanib har intervalda davom etadi.

## 1. O‘rnatish

Windows’da:

1. Node.js 20+ o‘rnating: https://nodejs.org/
2. `INSTALL.bat` ni ikki marta bosing.
3. U `.env` yaratadi va Notepad’da ochadi.
4. Google OAuth qiymatlarini kiriting.
5. `START.bat` ni ishga tushiring.
6. Brauzer: http://localhost:3939

FFmpeg va FFprobe alohida o‘rnatilishi shart emas: npm paketlari orqali loyihaga birga o‘rnatiladi.

## 2. Google / YouTube OAuth sozlash

Google Cloud Console: https://console.cloud.google.com/

1. Project yarating.
2. `YouTube Data API v3` ni Enable qiling.
3. OAuth consent screen sozlang.
4. Credentials → Create credentials → OAuth client ID → **Web application**.
5. Authorized redirect URI sifatida aynan quyidagini kiriting:

`http://localhost:3939/auth/google/callback`

6. Client ID va Client Secret ni `.env` ga yozing:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3939/auth/google/callback
```

7. Serverni qayta ishga tushiring.
8. Dashboard’dan `+ YouTube kanal ulash` ni bosing.
9. Har bir kanal uchun OAuth oynasidan kerakli YouTube account/channel ni tanlang.

### Muhim YouTube cheklovi

2026-yil sentabr holatidagi Google hujjatlarida `videos.insert` uchun granular quota default 100 upload/kun deb ko‘rsatilgan. 24 upload/kun bunga sig‘adi. Kvotalar Google tomonidan o‘zgarishi mumkin.

Audit qilinmagan, 2020-07-28 dan keyin yaratilgan API project orqali `videos.insert` bilan yuklangan videolar private rejim bilan cheklanishi mumkin. Public avtomatlashtirish kerak bo‘lsa Google YouTube API compliance audit talab qilishi mumkin. Shu sabab yangi kanalning default privacy holati `private`.

Rasmiy hujjatlar:
- https://developers.google.com/youtube/v3/docs/videos/insert
- https://developers.google.com/youtube/v3/getting-started

## 3. Bepul AI

### Variant A — Gemini API free tier

API key: https://aistudio.google.com/app/apikey

`.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-3.1-flash-lite
```

Google’ning 2026-yilgi hujjatlarida `gemini-3.1-flash-lite` Gemini API free tier bilan mavjud deb ko‘rsatilgan. Free tier limitlari project/account bo‘yicha farq qilishi va o‘zgarishi mumkin.

### Variant B — mutlaqo bepul lokal Ollama

Ollama: https://ollama.com/

O‘rnatgandan keyin CMD:

```bat
ollama pull qwen2.5:1.5b
```

`.env`:

```env
AI_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b
```

Bu variant internet AI API kalitisiz ishlaydi. Kuchsiz kompyuterda 1.5B model nisbatan yengil.

### Variant C — API umuman bo‘lmasa

```env
AI_PROVIDER=template
```

Title/description/tags kanal template’idan olinadi. Video render va YouTube upload AI’siz ham ishlaydi.

## 4. Media papkalar

Dashboard’dan:

- Video bo‘laklar papkasi
- Musiqalar papkasi
- Output papka
- Thumbnail papka

ni belgilang. Windows’da `Tanlash` tugmasi native folder dialog ochadi.

Video: `.mp4 .mov .mkv .webm .avi .m4v`
Audio: `.mp3 .wav .m4a .aac .flac .ogg .opus`
Thumbnail: `.jpg .jpeg .png .webp`

## 5. Har kanal uchun sozlama

- Faol/o‘chiq
- Tartib raqami
- Privacy: private/unlisted/public
- Kunlik max upload
- YouTube Category ID (musiqa uchun 10)
- Title template
- Description template
- Tags

AI ishlaganda template fallback sifatida ham qoladi. AI xato qilsa upload to‘xtab qolmaydi — template metadata ishlatiladi.

## 6. Xavfsizlik

- Google/Youtube paroli saqlanmaydi.
- OAuth tokenlar `APP_SECRET` bilan AES-256-GCM shifrlab `data/state.json` ichida saqlanadi.
- `.env` `.gitignore` ichida.
- Server default `127.0.0.1` ga bind bo‘ladi. Telefon/LAN uchun `START_LAN_PHONE.bat` ishlatiladi va `PANEL_PASSWORD` majburiy. Internetga chiqarishda HTTPS + panel paroli ishlating.
- `.env` yoki `data/state.json` faylini internetga/GitHub’ga yuklamang.

Agar `APP_SECRET` ni almashtirsangiz, oldingi OAuth tokenlarni o‘qib bo‘lmaydi va kanallarni qayta ulash kerak bo‘ladi.

## 7. Queue va retry

- Bir vaqtning o‘zida bitta render/upload job ishlaydi — bu oddiy Windows PC’ni bosib yubormaydi.
- Internet/YouTube vaqtinchalik xatolarida upload qayta urinadi.
- Retry oldidan yaqinda aynan shu title bilan video paydo bo‘lganini tekshirib, oddiy duplicate holatini kamaytiradi.
- Failed job dashboard’dan `Retry` qilinadi.

## 8. Autostart qilish

Windows Task Scheduler’da `START.bat` ni foydalanuvchi login bo‘lganda ishga tushadigan task sifatida qo‘shish mumkin. Kompyuter o‘chiq yoki uyquda bo‘lsa upload bajarilmaydi, lekin v1.1 scheduler/job tarixini diskda saqlaydi va qayta yoqilganda recovery qoidasi bo‘yicha davom etadi.

## 9. 24/7 uchun tavsiya

- Windows Sleep = Never.
- Barqaror internet.
- Yetarli disk joy.
- `keepRendered=false` qilsangiz muvaffaqiyatli upload’dan keyin tayyor MP4 o‘chadi.
- Uzun videolar uchun `quality=fast/balanced` va `parallelSegments=1–2` kuchsiz PC’da yaxshi.

## 10. Test

```bat
TEST.bat
```

yoki:

```bat
npm run check
npm test
```

## Kontent bo‘yicha eslatma

Avtomatlashtirish YouTube qoidalarini bekor qilmaydi. Foydalanishga huquqingiz bo‘lgan musiqa/video bo‘laklardan foydalaning. Bir xil yoki juda takroriy kontentni ko‘p kanallarga spam shaklida yuborish o‘rniga har kanal uchun haqiqiy farqlanuvchi kontent, metadata va auditoriya strategiyasidan foydalanish tavsiya etiladi.
