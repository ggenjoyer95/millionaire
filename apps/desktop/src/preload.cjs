// Минимальный preload для Electron.
// Сейчас клиент самодостаточен и не пользуется Electron API,
// но preload нужен для политики безопасности (contextIsolation).
// Тут можно будет добавить IPC если потребуется.
'use strict';
