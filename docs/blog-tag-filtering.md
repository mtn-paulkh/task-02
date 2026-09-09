# Фильтрация блога по тегам — теория и best practices

Документ для задачи: добавить поиск/фильтрацию по тегам на странице блога (`sections/main-blog.liquid`).

Теги уже заданы на статьях в Admin → **не нужно** дублировать их в metafields или custom data.

---

## 1. Как Shopify фильтрует статьи по тегам

### URL-модель (path, не query string)

Shopify использует **сегмент пути**, а не `?tag=`:

```
/blogs/{blog-handle}                          → все статьи
/blogs/{blog-handle}/tagged/{tag-handle}      → одна статья с этим тегом
/blogs/{blog-handle}/tagged/tag-a+tag-b       → AND: статьи с обоими тегами
```

`tag-handle` — handleized версия тега (`"New York"` → `new-york`).

**Пагинация** добавляется query-параметром поверх tagged URL:

```
/blogs/news/tagged/recipes?page=2
```

### Liquid-объекты

| Объект | Что даёт |
|--------|----------|
| `blog.all_tags` | Все теги блога (для списка фильтров) |
| `blog.tags` | Только теги **текущего отфильтрованного** набора статей |
| `current_tags` | Массив активных тегов на текущей странице |
| `article.tags` | Теги конкретной статьи |
| `blog.articles` | Уже **отфильтрованный** список (если URL tagged) |

**Важно:** для UI фильтров используй `blog.all_tags`, иначе после выбора тега исчезнут остальные пункты меню.

### Liquid-фильтры (готовые ссылки)

Shopify генерирует правильные URL:

```liquid
{% for tag in blog.all_tags %}
  {% if current_tags contains tag %}
    {{ tag | link_to_remove_tag: tag }}
  {% else %}
    {{ tag | link_to_add_tag: tag }}
  {% endif %}
{% endfor %}
```

- `link_to_tag` — перейти к одному тегу
- `link_to_add_tag` — добавить тег к текущим (AND)
- `link_to_remove_tag` — снять тег

Документация:
- [Filter articles by tag](https://shopify.dev/docs/storefronts/themes/architecture/templates/blog)
- [current_tags](https://shopify.dev/docs/api/liquid/objects/current_tags)
- [link_to_add_tag / link_to_remove_tag](https://shopify.dev/docs/api/liquid/filters/link_to_add_tag)

### Поведение Shopify при «битых» тегах

Если тег в URL не используется ни одной статьёй, Shopify **редиректит** на URL без этого тега. Учитывай при тестах.

---

## 2. Как это стыкуется с вашей темой

Сейчас блог устроен так:

```
sections/main-blog.liquid
  └── <custom-blog-posts-list section-id="...">
        └── {% paginate blog.articles by N %}
              └── ref="grid" + ref="cards[]"
              └── кнопки Prev/Next → CustomBlogPostsList
```

JS (`assets/paginated-list.js`):

1. Fetch HTML секции через **Section Rendering API**:
   `getSectionHTML(sectionId, cache, url)`
2. Внутри `section-renderer.js` к URL **добавляется** `section_id=...`
3. Из ответа парсятся карточки `[ref="cards[]"]` и подменяется grid
4. `history.pushState` обновляет адресную строку (сейчас в основном `?page=N`)

### Ключевой момент для тегов

**Фильтр живёт в path (`/tagged/...`), пагинация — в query (`?page=...`).**

При AJAX-fetch URL для Section Rendering API должен повторять **полный контекст страницы**:

```
/blogs/news/tagged/recipes?page=2&section_id=template--xxx__main
         ↑ фильтр в path      ↑ page   ↑ добавляет section-renderer
```

Если fetch идёт только с `?page=2` на текущем path без `/tagged/...`, Shopify вернёт **неотфильтрованные** статьи.

`PaginatedList.#getPage()` строит URL из `window.location.href` — **если pushState/path корректны, пагинация подхватит тег автоматически**. Если path не обновляется при смене тега — сломается.

---

## 3. Два подхода к реализации UI фильтров

### Подход A — Native navigation (ссылки)

```liquid
<a href="{{ blog.url }}/tagged/{{ tag | handle }}">{{ tag }}</a>
```

или через `link_to_add_tag`.

| Плюсы | Минусы |
|-------|--------|
| Работает без JS | Полная перезагрузка страницы |
| SEO, shareable URL | Нет SPA-ощущения |
| Простейшая отладка | Нужно заново инициализировать JS |

**Best practice:** даже при AJAX всегда ставь `href` на нативный tagged URL — fallback и accessibility.

### Подход B — Section Rendering API (как коллекция)

Паттерн из `assets/facets.js`:

1. Клик по тегу → `preventDefault`
2. `sectionRenderer.renderSection(sectionId, { url: taggedBlogUrl })` **или** morph всей секции
3. `history.pushState` с новым path (`/tagged/...`) без `section_id` в адресной строке
4. Сброс `page` на 1 при смене тега
5. Очистка кэша `pages` в `PaginatedList` (аналог `#handleFilterUpdate` для collection)

| Плюсы | Минусы |
|-------|--------|
| Без full reload | Больше JS-сложности |
| Консистентно с collection/search | Нужен popstate для Back/Forward |
| Prefetch соседних страниц сохраняется | Нужно синхронизировать UI тегов + grid + pagination |

**Для вашего стека** логичнее **B**, потому что пагинация уже на `PaginatedList` + Section Rendering API.

### Подход C — Client-side filter в DOM

```javascript
cards.filter(card => card.dataset.tags.includes(selectedTag))
```

**Не делать** как основной механизм (см. раздел «Антипаттерны»).

---

## 4. Рекомендуемая архитектура для `main-blog.liquid`

```
main-blog.liquid
├── blog-tag-filters (snippet или block)
│     └── список blog.all_tags
│     └── active state через current_tags
│     └── on:click → CustomBlogPostsList/onTagClick (если AJAX)
│     └── href на native URL (fallback)
│
├── custom-blog-posts-list
│     └── paginate blog.articles (уже отфильтрован Shopify по URL)
│     └── grid + pagination buttons
│
└── CustomBlogPostsList (JS)
      ├── onTagClick → fetch section с tagged URL, page=1
      ├── pages.clear() при смене тега
      ├── обновить data-last-page на grid
      └── #updatePaginationButtons()
```

### Чеклист при смене тега

- [ ] URL path → `/blogs/{handle}/tagged/{tag-handle}` (или `+` для multi-tag)
- [ ] Убрать `page` из query (сброс на 1)
- [ ] Очистить `this.pages` Map в `PaginatedList`
- [ ] Перерисовать grid (replace, у вас `replacesPageContent = true`)
- [ ] Обновить active-состояние кнопок/чипов тегов
- [ ] Обновить `data-last-page` (число страниц меняется!)
- [ ] Disabled-состояние Prev/Next

### Чеклист при пагинации с активным тегом

- [ ] Fetch URL = `{taggedPath}?page=N` (+ `section_id` в fetch, не в pushState)
- [ ] pushState обновляет только `?page=N`, path с `/tagged/...` сохраняется

---

## 5. Best practices

### URL и SEO

- Используй **нативные** `/tagged/{handle}` URL — Shopify уже индексирует и понимает их.
- В `<title>` и meta учитывай `current_tags` (у вас уже есть паттерн в `snippets/meta-tags.liquid`).
- Canonical: при фильтре canonical может указывать на filtered URL или на базовый blog — решай осознанно.

### UX

- Показывай **активный тег** и кнопку «Сбросить / Все статьи» → `blog.url`.
- При смене тега **скролль к grid** (или к фильтрам).
- Loading state на grid при AJAX.
- `aria-current="true"` на активном фильтре.

### Производительность

- `{% paginate blog.articles by N %}` обязателен — `blog.articles` без paginate тянет default page size (см. [Limit product queries](https://shopify.dev/docs/storefronts/themes/best-practices/performance/limit-product-queries-with-pagination)).
- Prefetch соседних страниц (`#fetchPage`) — ок, но **инвалидируй кэш** при смене тега.
- Не рендери все статьи в DOM «на всякий случай».

### Доступность и progressive enhancement

- Фильтры как `<a href="...">` или `<button>` + `<a href>` внутри.
- Работа без JS = обычные переходы по ссылкам.

### Multi-tag (AND)

- Shopify: `tag-a+tag-b` = **AND** (оба тега).
- UX: явно показывай, что фильтры сужают выбор, а не OR.
- Для OR нужна **своя** логика (не native) — обычно не стоит.

### Интеграция с PaginatedList

- `#handleFilterUpdate` в базовом классе заточен под `searchUpdate` / `collectionUpdate` — для блога, скорее всего, нужен **свой** обработчик смены тега в `CustomBlogPostsList`, не переиспользуй collection events вслепую.
- `replacesPageContent = true` — правильно для «одна страница карточек за раз».

---

## 6. Антипаттерны (как лучше НЕ делать)

### ❌ Фильтрация только на клиенте

Скрывать карточки через CSS/JS по `data-tags` без серверного фильтра:

- видны только статьи **текущей** paginated страницы;
- `data-last-page` не соответствует реальности;
- URL не shareable;
- SEO не видит filtered view.

### ❌ `?tag=recipes` вместо `/tagged/recipes`

Shopify Liquid **не** фильтрует `blog.articles` по произвольному query param. Придётся писать свой фильтр в Liquid:

```liquid
{% if article.tags contains 'recipes' %} ... {% endif %}
```

— это ломает paginate (фильтруешь уже paginated slice), не масштабируется.

### ❌ `blog.tags` для списка всех фильтров

После выбора тега `blog.tags` содержит только теги **видимых** статей — меню «сожмётся». Используй `blog.all_tags`.

### ❌ Забыть сбросить `page` при смене тега

`/tagged/recipes?page=5` при 2 статьях в теге → пустая страница.

### ❌ Кэш PaginatedList без инвалидации

`pages` Map хранит HTML для page 2 **без тега**. После фильтра отдаст старые карточки.

### ❌ Фильтровать в `{% for article in blog.articles %}` без понимания paginate

```liquid
{% paginate blog.articles by 6 %}
  {% for article in blog.articles %}
    {% if article.tags contains x %} ... {% endif %}
  {% endfor %}
{% endpaginate %}
```

Paginate считает страницы по **всем** статьям блога, а ты показываешь меньше — «дырявая» пагинация.

Правильно: фильтр через URL → Shopify сам отдаёт отфильтрованный `blog.articles`.

### ❌ Дублировать теги в metafields

Теги уже есть на `article`. Два источника правды = рассинхрон.

### ❌ Section_id в адресной строке

Как с пагинацией: `section_id` только в fetch (делает `section-renderer.js`), не в pushState.

### ❌ OR-фильтр через native tagged URL

`/tagged/a+b` = AND. OR только кастомом (отдельные landing pages, search, Storefront API).

---

## 7. Минимальный Liquid для фильтров (reference)

```liquid
{%- if blog.all_tags.size > 0 -%}
  <nav class="blog-tag-filters" aria-label="Filter by tag">
    <a
      href="{{ blog.url }}"
      class="blog-tag-filters__link{% unless current_tags %} blog-tag-filters__link--active{% endunless %}"
    >
      All
    </a>

    {%- for tag in blog.all_tags -%}
      {%- if current_tags contains tag -%}
        <span class="blog-tag-filters__link blog-tag-filters__link--active" aria-current="true">
          {{ tag | link_to_remove_tag: tag }}
        </span>
      {%- else -%}
        {{ tag | link_to_add_tag: tag | replace: '<a', '<a class="blog-tag-filters__link"' }}
      {%- endif -%}
    {%- endfor -%}
  </nav>
{%- endif -%}
```

Для AJAX замени `link_to_*` на кнопки с `on:click` + тот же `href` в `<a>` или используй `event.preventDefault()` только когда JS загружен.

---

## 8. План реализации (когда дойдёшь до кода)

1. **Liquid:** snippet `blog-tag-filters.liquid`, подключить в `main-blog.liquid` над grid.
2. **JS:** в `CustomBlogPostsList` — метод `navigateToTag(url)`:
   - `pages.clear()`
   - fetch через `sectionRenderer.getSectionHTML(sectionId, false, url)` или morph секции
   - replace grid + обновить `data-last-page`
   - `history.pushState` с новым path
   - `#updatePaginationButtons()`
3. **popstate:** слушатель для Back/Forward (сейчас не реализован — добавить вместе с тегами).
4. **Тесты:**
   - `/blogs/x` → все статьи
   - `/blogs/x/tagged/foo` → только с тегом
   - пагинация с активным тегом
   - смена тега с page>1 → сброс на page 1
   - reload страницы с tagged URL
   - без JS — клик по ссылке работает

---

## 9. Связанные файлы в проекте

| Файл | Роль |
|------|------|
| `sections/main-blog.liquid` | Разметка блога, paginate, grid |
| `assets/custom-blog-posts-list.js` | Кнопки Prev/Next, replace pagination |
| `assets/paginated-list.js` | Fetch/cache страниц, Section Rendering API |
| `assets/section-renderer.js` | `buildSectionRenderingURL`, morph |
| `assets/facets.js` | Reference для AJAX-фильтров на collection |
| `snippets/meta-tags.liquid` | Уже использует `current_tags` |

---

## 10. Краткий вывод

| Вопрос | Ответ |
|--------|--------|
| Где живёт фильтр? | Path: `/blogs/{handle}/tagged/{tag}` |
| Где живёт пагинация? | Query: `?page=N` |
| Нужен ли `section_id` в URL пользователя? | **Нет** — только в fetch |
| Откуда брать список тегов? | `blog.all_tags` |
| Как Shopify фильтрует статьи? | Автоматически по URL, `blog.articles` уже filtered |
| AJAX или ссылки? | Hybrid: native `href` + Section Rendering для UX |
| Главная ошибка? | Client-side filter / custom query params вместо `/tagged/` |

---

## 11. Реализация (вариант B) — что сделано

**Дата:** 2026-09-08

### Новые файлы

#### `snippets/blog-tag-filters.liquid`

- Nav с `ref="tagFilters"` и списком тегов из `blog.all_tags`.
- Ссылка **All** → `blog.url` (сброс фильтра).
- Каждый тег → native URL `{{ blog.url }}/tagged/{{ tag | handle }}`.
- Active state через `current_tags contains tag` + `aria-current="true"`.
- Стили pill-кнопок (`pills-styles`) в духе facets.
- `on:click="/onTagFilterClick"` на каждой ссылке + `href` для fallback без JS.
- Loading state: `custom-blog-posts-list[data-loading]` затемняет grid.

### Изменённые файлы

#### `sections/main-blog.liquid`

- Подключён `{% render 'blog-tag-filters', blog: blog %}` **над** grid, внутри `<custom-blog-posts-list>`.
- `articles_per_page` берётся из `section.settings.articles_per_page` (не хардкод).

#### `assets/custom-blog-posts-list.js`

- **`onTagFilterClick`** — `preventDefault`, вызывает `#applySectionFromUrl`.
- **`#applySectionFromUrl(url, { pushState })`**:
  1. Удаляет `page` из query (сброс на 1-ю страницу).
  2. `history.pushState` (если клик, не popstate).
  3. `clearPageCache()` — очистка `pages` Map.
  4. `sectionRenderer.renderSection(sectionId, { url, cache: false })` — morph секции.
  5. `#updatePaginationButtons()` + `prefetchAdjacentPages()`.
  6. Scroll к фильтрам.
- **`#onPopState`** — Back/Forward → `#applySectionFromUrl` без pushState.
- **`updatedCallback`** — после morph обновляет refs и кнопки пагинации.
- **`data-loading`** / `aria-busy` на grid во время fetch.
- Скрывает nav пагинации если `lastPage <= 1`.

#### `assets/paginated-list.js`

- **`clearPageCache()`** — public, очищает кэш и pending promises.
- **`prefetchAdjacentPages()`** — public, prefetch next/prev после смены контекста.
- Базовый `replacesPageContent = false` — коллекция не затронута.

### Flow при клике на тег

```
click <a href="/blogs/news/tagged/recipes">
  → preventDefault
  → pushState("/blogs/news/tagged/recipes")     // без section_id, без page
  → clearPageCache()
  → GET /blogs/news/tagged/recipes?section_id=… // Section Rendering API
  → morphSection(#shopify-section-…)
  → updatedCallback → refs + pagination buttons
  → prefetch page 2 (idle)
```

### Flow при пагинации с активным тегом

Path `/tagged/recipes` сохраняется в `window.location`. `PaginatedList.#getPage()` строит URL из `window.location.href` + `?page=N` — тег не теряется.

### Progressive enhancement

Без JS: обычный переход по `href` → full page load → Shopify рендерит filtered `blog.articles`.

### Что сознательно не делали

- Multi-tag AND через UI (`link_to_add_tag`) — каждый тег ведёт на exclusive `/tagged/{handle}`.
- Отдельный `BlogUpdateEvent` — morph секции достаточен.
- `section_id` в адресной строке — только в fetch.

### Чеклист из §4 — статус

- [x] URL path `/tagged/{handle}`
- [x] Сброс `page` при смене тега
- [x] Очистка `pages` Map
- [x] Replace grid (`replacesPageContent`)
- [x] Active state тегов (SSR + morph)
- [x] `data-last-page` обновляется через morph
- [x] Disabled Prev/Next
- [x] popstate (Back/Forward)
- [x] Native `href` fallback

### Как проверить

1. `/blogs/{handle}` — все статьи, All active.
2. Клик тег → AJAX, URL `/tagged/{tag}`, статьи отфильтрованы.
3. Next/Prev с активным тегом → URL `?page=2`, статьи тега.
4. All → сброс фильтра без reload (AJAX).
5. Back/Forward в браузере → контент синхронизирован с URL.
6. Disable JS → клик по ссылке = full page load.

### Файлы

| Файл | Изменение |
|------|-----------|
| `snippets/blog-tag-filters.liquid` | **новый** |
| `sections/main-blog.liquid` | render snippet, settings |
| `assets/custom-blog-posts-list.js` | tag filter + popstate |
| `assets/paginated-list.js` | `clearPageCache`, `prefetchAdjacentPages` |

---

*Источники: [Shopify blog template](https://shopify.dev/docs/storefronts/themes/architecture/templates/blog), [Tag filtering](https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/tag-filtering), [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering), код темы task-02.*
