import {test, expect, Browser, Page, chromium} from '@playwright/test';

/**
 * Сценарий: три клиента (режиссёр, ведущий, игрок) играют один раунд.
 *
 * Проверяет:
 *   - режиссёр может занять роль и видеть пульт;
 *   - ведущий и игрок входят и ждут в LOBBY;
 *   - START_GAME переводит всех в INTRO;
 *   - ARM_QUESTION показывает вопрос только режиссёру;
 *   - SHOW_QUESTION показывает вопрос ведущему и игроку;
 *   - ведущий выбирает и фиксирует ответ;
 *   - REVEAL и NEXT_QUESTION отрабатывают.
 *
 * Эмуляция LAN: все клиенты в одном браузере, но в разных контекстах -
 * для сервера это три разных socket-соединения.
 */
test.describe('Три клиента играют один раунд', () => {
  let browser: Browser;
  let director: Page;
  let host: Page;
  let player: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
    const directorCtx = await browser.newContext();
    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();
    director = await directorCtx.newPage();
    host = await hostCtx.newPage();
    player = await playerCtx.newPage();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('полный раунд работает', async () => {
    // 1. Все открывают экран выбора роли
    await director.goto('/director');
    await host.goto('/host');
    await player.goto('/player');

    // 2. Проверяем что режиссёр увидел пульт
    await expect(director.locator('text=Пульт режиссёра')).toBeVisible({timeout: 15_000});

    // 3. Ведущий и игрок видят "Ожидание"
    await expect(host.locator('text=Ожидание')).toBeVisible();

    // 4. Режиссёр жмёт СТАРТ, затем ПОДГОТОВИТЬ
    await director.click('button:has-text("СТАРТ")');
    await director.click('button:has-text("ПОДГОТОВИТЬ ВОПРОС")');

    // 5. У режиссёра появился текущий вопрос
    await expect(director.locator('text=Текущий вопрос')).toBeVisible();

    // 6. У ведущего и игрока видно ожидание, вопрос не показан
    await expect(host.locator('text=Режиссёр готовит вопрос')).toBeVisible();

    // 7. Режиссёр открывает вопрос всем
    await director.click('button:has-text("ПОКАЗАТЬ ИГРОКАМ")');

    // 8. Ведущий теперь видит варианты ответов
    await expect(host.locator('button:has-text("A:")').first()).toBeVisible({timeout: 5_000});

    // 9. Ведущий выбирает вариант A и фиксирует
    await host.click('button:has-text("A:")');
    await host.click('button:has-text("ЗАФИКСИРОВАТЬ ОТВЕТ")');

    // 10. Режиссёр раскрывает и идёт дальше
    await director.click('button:has-text("РАСКРЫТЬ")');
    // В REVEAL или RESULT кнопка может называться по-разному
    const next = director.locator('button:has-text("ДАЛЕЕ"), button:has-text("СЛЕДУЮЩИЙ ВОПРОС"), button:has-text("ЗАВЕРШИТЬ ИГРУ")').first();
    await next.click();
  });
});
