# Библейский граф

Проект теперь содержит две части:

- **web/** — существующая рабочая веб-версия; её логика не переписывается.
- **backend/** — Node.js + TypeScript API.
- **mobile/** — React Native + JavaScript приложение для Android/iOS.

## Мобильная архитектура

Граф рисуется через React Native Skia одним нативным Canvas-представлением, а не десятками тысяч SVG/DOM-элементов. Это позволяет масштабировать и двигать большой граф без браузерного D3-рендера. React Native Skia рассчитан на высокопроизводительную 2D-графику и поддерживает Path/Group transforms.

### Backend

```powershell
cd backend
npm install
npm run dev
```

API:

```
http://localhost:3000/api/health
http://localhost:3000/api/graph
http://localhost:3000/api/verses
http://localhost:3000/api/verse/Ин%203:16
```

Backend берёт исходные файлы проекта:

- `bible_gece_graph.json`
- `rst_fixed.json`

и выполняет подготовку графа на сервере.

### Android

```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL="http://192.168.1.100:3000"
npm start
```

Вместо `192.168.1.100` поставь LAN-IP компьютера. Телефон и компьютер должны находиться в одной Wi-Fi сети.

Для Android-эмулятора:

```powershell
$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:3000"
npm start
```

### Что сохранено

Мобильная версия рассчитана на сохранение существующей логики:

- поиск стихов;
- выбор стиха;
- подсветка связей;
- просмотр текста;
- переход по связанным стихам;
- статистика;
- pan/zoom графа;
- центрирование графа.

Старая web-версия остаётся отдельно и не используется как renderer мобильного приложения.
