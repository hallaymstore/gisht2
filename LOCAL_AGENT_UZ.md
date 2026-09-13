# AutoMix Local Agent — Windows

Bu versiyada katta media fayllar Render serverga yuborilmaydi. Video bo‘laklar, musiqa, FFmpeg render va YouTube upload foydalanuvchining Windows kompyuterida bajariladi. Render sayti esa masofaviy boshqaruv, scheduler, kanal holati, Analytics va taqqoslash paneli sifatida ishlaydi.

## Ishga tushirish

1. GitHub reposini ZIP qilib yuklab oling va oddiy papkaga oching.
2. `INSTALL_LOCAL_AGENT.bat` ni bir marta ishga tushiring.
3. `START_LOCAL_AGENT.bat` ni ishga tushiring.
4. Brauzerda `http://127.0.0.1:3940` ochiladi.
5. Render panel → **Local Agent** sahifasidan pairing kodini nusxalang.
6. Lokal panelda Render URL va pairing kodini kiriting.
7. Video bo‘laklar, musiqa, output va ixtiyoriy thumbnail papkalarini **Tanlash** orqali belgilang.
8. **Ulanishni tekshirish** ni bosing. Kanallar soni ko‘rinsa agent ulangan.

## Muhim

- Lokal agent oynasi yopilsa render/upload to‘xtaydi.
- `local-agent/data/config.json` qurilma sozlamalarini saqlaydi.
- `local-agent/data/runtime.json` tok/dastur uzilishida davom ettirish uchun joriy ish holatini saqlaydi.
- `local-agent/data/history.json` mahalliy upload tarixini saqlaydi.
- Render paneldagi qo‘lda ishga tushirish va scheduler buyruqlari Local Agent tomonidan olinadi.
- Tayyor MP4 Render orqali o‘tmaydi; PC → YouTube to‘g‘ridan-to‘g‘ri upload bo‘ladi.

## YouTube Analytics

Analytics sahifasi `yt-analytics.readonly` OAuth ruxsatini ishlatadi. Oldin ulangan kanal bu scope bilan ulanmagan bo‘lsa, kanalni Render paneldan bir marta qayta ulang.

Public subscriber, total views va video count ko‘rsatkichlari batch tarzda yangilanadi. Detailed watch time/retention YouTube Analytics API ma’lumoti tayyor bo‘lishiga bog‘liq va mutlaq real-time bo‘lmasligi mumkin.
