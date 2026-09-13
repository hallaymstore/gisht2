# Telefon va masofaviy ishlatish

## Eng tavsiya qilinadigan sxema

Telefon render qilmaydi. Telefon — PWA boshqaruv paneli. Render, AI va YouTube upload Windows PC yoki 24/7 server/VPS'da bajariladi.

Bu yondashuvda telefon o'chishi, zaryad tugashi yoki Android fon rejimini yopishi schedulerga ta'sir qilmaydi.

## 1) Bir xil Wi‑Fi/LAN ichida

1. PC'da `.env` ichiga `PANEL_PASSWORD=...` yozing.
2. `START_LAN_PHONE.bat` ni ishga tushiring.
3. Dashboard → Scheduler qismida `Telefon uchun LAN manzil` ko'rinadi, masalan `http://192.168.1.25:3939`.
4. Shu manzilni telefonda Chrome'da oching.
5. Panel parolini kiriting.
6. Chrome menyusi → **Add to Home screen / Install app**.

Google OAuth kanallarini birinchi marta PC'dagi `http://localhost:3939` orqali ulash eng oson. Ulangan tokenlar serverda saqlanadi, keyin telefon faqat boshqaradi.

## 2) Har joydan, mobil internetdan

Haqiqiy masofaviy ishlash uchun server internetda doim online bo'lishi kerak. Eng to'g'ri variant: Windows/VPS/uy server + HTTPS domen/reverse proxy.

`.env` namunasi:

```env
HOST=0.0.0.0
APP_URL=https://automix.example.com
PANEL_PASSWORD=JUDA_KUCHLI_PAROL
TRUST_PROXY=1
FORCE_SECURE_COOKIE=1
GOOGLE_REDIRECT_URI=https://automix.example.com/auth/google/callback
```

Google Cloud OAuth'da ham aynan shu HTTPS callback Authorized redirect URI sifatida qo'shiladi.

Router portini bevosita internetga parolsiz ochmang. HTTPS va `PANEL_PASSWORD` ishlating.

## 3) Elektr yoki internet uzilsa

- Barcha kanallar, joblar, upload tarixi, scheduler slotlari va aniq-vaqt rejalar `data/state.json` da saqlanadi.
- Har save'da `data/state.json.bak` backup ishlatiladi.
- Atomic write sabab yarim yozilgan JSON xavfi kamayadi.
- Render/metadata/upload o'rtasida dastur yopilsa, `resumeInterrupted=true` bo'lsa qayta startda tiklanadi.
- Tayyor MP4 mavjud bo'lsa, upload bosqichiga yaqin joydan davom ettirishga urinadi.
- Recovery upload oldidan yaqindagi bir xil title tekshiriladi — tok aynan upload tugagan paytda o'chgan bo'lsa duplicate xavfi kamayadi.

## 4) Scheduler recovery rejimlari

- **Bugungi qolganlarini ketma-ket bajar** — tavsiya. O'tib ketgan bugungi slotlarni `recoverySpacingMinutes` oralig'ida qayta navbatga oladi.
- **Faqat eng keyingi qolganini bajar** — uzoq vaqt o'chib qolgan bo'lsa birdan ko'p upload qilmaydi.
- **O'tib ketgan vaqtlarni tashlab ket** — faqat keyingi normal slotdan davom etadi.

`maxCatchUp` bir kunda qancha recovery upload bo'lishini cheklaydi.

## 5) Aniq vaqtga rejalashtirish

Dashboard → **Aniq vaqtga rejalashtirish**:

- kanalni tanlang;
- sana/vaqtni kiriting;
- `Rejaga qo'shish` ni bosing.

Bu job diskka yoziladi. Server o'sha vaqtda o'chgan bo'lsa, keyingi ishga tushishda overdue reja navbatga o'tadi.

## 6) Androidning o'zida render qilish

Node.js + Termux + FFmpeg bilan texnik jihatdan mumkin, lekin 1080p uzun render telefonni qizdiradi, batareyani tez tugatadi va Android fon jarayonini o'ldirishi mumkin. 24/7 scheduler uchun tavsiya qilinmaydi.

Agar sinov uchun Termux ishlatilsa, tizim `FFMPEG_PATH` va `FFPROBE_PATH` env qiymatlarini qo'llab-quvvatlaydi. Ishonchli 24/7 rejim uchun PC/VPS server afzal.
