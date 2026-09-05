## 1. Зум от жеста

- [ ] 1.1 `zoomPan.ts`: `zoomFactor(deltaY, deltaMode, viewportHeight)` с тестами — щелчок
      мыши даёт ×1.25, мелкое приращение тачпада — плавно, направление сохраняется
- [ ] 1.2 `useZoomPan.ts`: колесо зовёт `zoomFactor` вместо фиксированного шага

## 2. Подписи на обзорном масштабе

- [ ] 2.1 `zoomPan.ts`: `LABELS_FROM` и `labelsVisible(k)` с тестом
- [ ] 2.2 `GraphCanvas.tsx` + `skin.css`: `data-labels` на слое прячет имена и заметки

## 3. Клавиатура

- [ ] 3.1 `zoomPan.ts`: `nextNodeInDirection()` с тестами (сектор направления, пустой сектор,
      ближайший по расстоянию)
- [ ] 3.2 `GraphCanvas.tsx`: фокус полотна, курсор по стрелкам с доводкой вида, Enter/Space
      выбирают, Escape снимает; `aria-activedescendant`, `id` и `data-focused` у узла
- [ ] 3.3 `GraphNodeCard.tsx` + `skin.css`: вид клавиатурного курсора
- [ ] 3.4 `en.json` / `ru.json`: подпись полотна для вспомогательных технологий

## 4. Проверка

- [ ] 4.1 jsdom-тест клавиатуры в `graph/__tests__/GraphCanvas.test.tsx`
- [ ] 4.2 `__tests__/visual/graph.visual.test.ts`: стрелки и Enter настоящей клавиатурой,
      подписи скрыты на «вписать» и видны на 1:1
- [ ] 4.3 `CHANGELOG.md` — запись в `[Unreleased]` (на английском)
- [ ] 4.4 `make verify`
