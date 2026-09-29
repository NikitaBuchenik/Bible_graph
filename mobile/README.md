# Библейский граф — мобильное приложение

Frontend: React Native / Expo / JavaScript.
Backend: Node.js / Express / TypeScript.

## Backend

```bash
cd backend
npm install
npm run dev
```

API по умолчанию: `http://localhost:3000`.

## Android

Для Android-эмулятора frontend использует `http://10.0.2.2:3000`.

Для реального телефона укажи LAN-адрес компьютера:

```bash
$env:EXPO_PUBLIC_API_URL="http://192.168.1.100:3000"
npm start
```

Оба устройства должны быть в одной Wi-Fi сети.
