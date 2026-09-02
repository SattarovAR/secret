const statusLabels = {
  active: ['Активна', 'status-active'],
  revealed: ['Прочитана', 'status-read'],
  expired: ['Истекла', 'status-expired'],
  deleted: ['Удалена', 'status-deleted'],
  missing: ['Не найдена', 'status-deleted'],
};

const eventLabels = {
  created: 'Создана',
  requested: 'Страница запрошена',
  revealed: 'Секрет раскрыт',
  deleted: 'Удалена',
};

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function layout({ title, body, navigation = false }) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHtml(title)} · Secret Spark</title>
  <link rel="stylesheet" href="/style.css?v=20260902-1">
  <script src="/app.js" defer></script>
</head>
<body>
  <div class="orb orb-one"></div><div class="orb orb-two"></div>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Secret Spark">
      <span class="brand-mark">✦</span><span>Secret Spark</span>
    </a>
    ${navigation ? '<nav><a href="/">Создать</a><a href="/security">Безопасность</a><a href="/audit">Аудит</a></nav>' : ''}
  </header>
  <main>${body}</main>
  <footer>Секрет исчезает, метаданные остаются ✨</footer>
</body>
</html>`;
}

function date(value, formatDate) {
  return value ? `<time datetime="${new Date(value).toISOString()}">${escapeHtml(formatDate(value))}</time>` : '—';
}

function statusBadge(state) {
  const [label, className] = statusLabels[state] ?? statusLabels.missing;
  return `<span class="status ${className}">${label}</span>`;
}

export function homeView({ ttlOptions, defaultTtl }) {
  const options = ttlOptions.map(({ value, label }) =>
    `<option value="${value}"${value === defaultTtl ? ' selected' : ''}>${escapeHtml(label)}</option>`,
  ).join('');

  return layout({
    title: 'Новая секретная ссылка',
    navigation: true,
    body: `
      <section class="hero">
        <div class="eyebrow">ОДИН РАЗ — И ИСЧЕЗЛО</div>
        <h1>Передайте секрет<br><span>без следа в чате</span></h1>
        <p>Вставьте пароль, ключ или приватную заметку. Получатель увидит её только один раз.</p>
      </section>
      <section class="card create-card">
        <form action="/create" method="post">
          <label for="secret">Секрет</label>
          <textarea id="secret" name="secret" rows="7" maxlength="32768" required autofocus placeholder="Пароль, API-ключ или приватная заметка…"></textarea>
          <div class="form-row">
            <div>
              <label for="ttl">Ссылка активна</label>
              <select id="ttl" name="ttl">${options}</select>
            </div>
            <button type="submit">Создать ссылку <span>→</span></button>
          </div>
        </form>
      </section>
      <section class="features">
        <div><b>①</b><span><strong>Без превью-ловушек</strong>Telegram не прочитает секрет вместо коллеги.</span></div>
        <div><b>②</b><span><strong>Ровно одно чтение</strong>После показа содержимое удаляется.</span></div>
        <div><b>③</b><span><strong>Можно отозвать</strong>Удалите активную ссылку в любой момент.</span></div>
      </section>`,
  });
}

export function createdView({ shareUrl, manageUrl, expiresAt, formatDate }) {
  return layout({
    title: 'Ссылка создана',
    navigation: true,
    body: `
      <section class="card result-card">
        <div class="success-icon">✓</div>
        <div class="eyebrow">ГОТОВО</div>
        <h1>Ссылка зажглась!</h1>
        <p>Отправьте её коллеге в Telegram или другом мессенджере.</p>
        <label for="share-url">Ссылка получателя</label>
        <div class="copy-row"><input id="share-url" class="url-field" value="${escapeHtml(shareUrl)}" readonly><button class="copy-button" type="button" data-copy="share-url">Копировать</button></div>
        <p class="hint">Активна до ${date(expiresAt, formatDate)}. Обычное превью ссылки секрет не раскрывает.</p>
        <div class="divider"></div>
        <label for="manage-url">Ссылка управления</label>
        <div class="copy-row"><input id="manage-url" class="url-field" value="${escapeHtml(manageUrl)}" readonly><button class="copy-button" type="button" data-copy="manage-url">Копировать</button></div>
        <p class="warning">Не отправляйте ссылку управления получателю. Для удаления потребуется админ-авторизация.</p>
        <div class="actions"><a class="button secondary" href="/">Создать ещё</a><a class="button" href="${escapeHtml(manageUrl)}">Управление →</a></div>
      </section>`,
  });
}

export function revealView({ token, expiresAt, formatDate }) {
  return layout({
    title: 'Вам передали секрет',
    body: `
      <section class="card reveal-card">
        <div class="gift-icon">✦</div>
        <div class="eyebrow">СЕКРЕТНАЯ ДОСТАВКА</div>
        <h1>Вам передали секрет</h1>
        <p>После нажатия содержимое будет показано один раз и навсегда удалено.</p>
        <form action="/s/${escapeHtml(token)}/reveal" method="post">
          <button class="wide" type="submit">Показать секрет <span>→</span></button>
        </form>
        <p class="hint">Ссылка действует до ${date(expiresAt, formatDate)}</p>
      </section>`,
  });
}

export function secretView(plaintext) {
  return layout({
    title: 'Секрет показан',
    body: `
      <section class="card reveal-card">
        <div class="eyebrow">ПОКАЗАНО ОДИН РАЗ</div>
        <h1>Сохраните прямо сейчас</h1>
        <p>После закрытия страницы восстановить содержимое будет невозможно.</p>
        <label for="secret-value">Содержимое</label>
        <textarea id="secret-value" class="secret-value" rows="8" readonly autofocus>${escapeHtml(plaintext)}</textarea>
        <p class="warning">Ссылка уже уничтожена и больше не откроется.</p>
      </section>`,
  });
}

export function unavailableView(state = 'missing') {
  const copy = {
    expired: ['Время вышло', 'Срок действия ссылки истёк, а содержимое удалено.'],
    revealed: ['Секрет уже прочитан', 'Эта ссылка сработала один раз и больше недоступна.'],
    deleted: ['Ссылка отозвана', 'Отправитель удалил секрет до его прочтения.'],
    missing: ['Секрет не найден', 'Возможно, ссылка неверная или уже недоступна.'],
  }[state] ?? ['Секрет недоступен', 'Эта ссылка больше не работает.'];

  return layout({
    title: copy[0],
    body: `
      <section class="card reveal-card unavailable">
        <div class="empty-icon">☁</div>
        <h1>${copy[0]}</h1><p>${copy[1]}</p>
      </section>`,
  });
}

export function manageView({ record, burnToken, formatDate, message }) {
  return layout({
    title: 'Управление ссылкой',
    body: `
      <section class="card manage-card">
        <div class="eyebrow">УПРАВЛЕНИЕ</div>
        <h1>Состояние секрета</h1>
        ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
        <dl>
          <div><dt>Статус</dt><dd>${statusBadge(record?.state ?? 'missing')}</dd></div>
          <div><dt>Создана</dt><dd>${record ? date(record.created_at, formatDate) : '—'}</dd></div>
          <div><dt>Прочитана</dt><dd>${record ? date(record.revealed_at, formatDate) : '—'}</dd></div>
          <div><dt>Истекает</dt><dd>${record ? date(record.expires_at, formatDate) : '—'}</dd></div>
        </dl>
        ${record?.state === 'active' ? `
          <form action="/manage/${escapeHtml(burnToken)}/delete" method="post">
            <button class="danger wide" type="submit">Удалить секрет (требуется вход)</button>
          </form>` : ''}
      </section>`,
  });
}

export function auditView({ records, now, formatDate, message }) {
  const rows = records.map((record) => {
    const state = record.revealed_at ? 'revealed'
      : record.deleted_at ? 'deleted'
        : record.expires_at <= now ? 'expired' : 'active';
    const events = record.events ?? [];
    const eventItems = events.map((event) => `<li>
      <div class="event-main"><strong>${escapeHtml(eventLabels[event.event_type] ?? event.event_type)}</strong>${date(event.occurred_at, formatDate)}</div>
      <div class="event-meta">
        <span><b>IP</b> <code>${escapeHtml(event.ip_address ?? 'не определён')}</code></span>
        <span><b>User-Agent</b> ${escapeHtml(event.user_agent ?? 'не передан')}</span>
        ${event.accept_language ? `<span><b>Язык</b> ${escapeHtml(event.accept_language)}</span>` : ''}
        ${event.referrer_origin ? `<span><b>Источник</b> ${escapeHtml(event.referrer_origin)}</span>` : ''}
      </div>
    </li>`).join('');
    return `<tr>
      <td><code>${escapeHtml(record.id)}</code></td>
      <td>${statusBadge(state)}</td>
      <td>${date(record.created_at, formatDate)}</td>
      <td>${date(record.revealed_at, formatDate)}</td>
      <td>${date(record.expires_at, formatDate)}</td>
      <td>${state === 'active' ? `<form action="/audit/${escapeHtml(record.id)}/delete" method="post"><button class="small danger" type="submit">Удалить</button></form>` : '—'}</td>
    </tr>
    <tr class="events-row"><td colspan="6">
      <details class="event-details">
        <summary>Технический журнал · ${events.length}</summary>
        ${eventItems ? `<ol class="event-list">${eventItems}</ol>` : '<p class="event-empty">События не записаны: ссылка создана до включения расширенного аудита.</p>'}
      </details>
    </td></tr>`;
  }).join('');

  return layout({
    title: 'Аудит',
    navigation: true,
    body: `
      <section class="audit-head">
        <div><div class="eyebrow">ЖУРНАЛ</div><h1>Аудит ссылок</h1><p>События, IP и данные браузера — содержимое секретов здесь никогда не хранится.</p></div>
        <a class="button" href="/">+ Новый секрет</a>
      </section>
      ${message ? `<div class="notice page-notice">${escapeHtml(message)}</div>` : ''}
      <section class="table-card">
        ${records.length ? `<div class="table-scroll"><table>
          <thead><tr><th>ID</th><th>Статус</th><th>Создана</th><th>Прочитана</th><th>Истекает</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<div class="empty-table">Пока ни одной ссылки. Самое время создать первую ✦</div>'}
      </section>`,
  });
}

export function securityView() {
  return layout({
    title: 'Как защищены секреты',
    navigation: true,
    body: `
      <article class="security-page">
        <section class="security-hero">
          <div class="eyebrow">БЕЗОПАСНОСТЬ БЕЗ МАГИИ</div>
          <h1>Что происходит<br><span>с секретом</span></h1>
          <p>Техническое описание жизненного цикла Secret Spark: где находятся данные, как они передаются и что остаётся после единственного чтения.</p>
          <div class="security-pills">
            <span>1 успешное раскрытие</span><span>AES-256-GCM</span><span>HTTPS</span><span>TTL 15 минут — 7 дней</span>
          </div>
        </section>

        <section class="security-callout good">
          <b>Короткий ответ</b>
          <p>Секрет хранится на нашем VPS только в зашифрованном виде. Обычное открытие ссылки показывает кнопку и не расходует секрет. Первый успешный POST «Показать секрет» расшифровывает его, отправляет получателю и удаляет шифротекст из активной записи. Настройки нескольких просмотров нет.</p>
        </section>

        <section class="security-section">
          <div class="section-heading"><span>01</span><div><h2>Жизненный цикл</h2><p>От формы создателя до необратимого завершения.</p></div></div>
          <ol class="lifecycle">
            <li><b>Создание</b><p>Браузер отправляет текст методом POST по HTTPS. Node.js кратковременно получает открытый текст в памяти процесса.</p></li>
            <li><b>Шифрование</b><p>Для каждой записи создаётся случайный 12-байтовый IV. Текст шифруется AES-256-GCM; отдельно сохраняется authentication tag.</p></li>
            <li><b>Ожидание</b><p>В SQLite лежат ciphertext, IV и tag. Сырой токен ссылки в базе не хранится — только его SHA-256-хеш.</p></li>
            <li><b>Запрос страницы</b><p>GET по ссылке возвращает лишь экран подтверждения. Telegram-превью тоже делает GET, поэтому само по себе секрет не раскрывает.</p></li>
            <li><b>Единственное чтение</b><p>POST выполняется в блокирующей транзакции SQLite. Только один конкурентный запрос может успешно получить текст.</p></li>
            <li><b>Завершение</b><p>После чтения, ручного удаления или TTL поля ciphertext, IV и tag становятся NULL. Метаданные аудита остаются.</p></li>
          </ol>
        </section>

        <section class="security-section">
          <div class="section-heading"><span>02</span><div><h2>Как данные идут по сети</h2><p>Граница TLS и видимость каждого участка.</p></div></div>
          <div class="network-flow" aria-label="Схема передачи данных">
            <div><i>①</i><b>Браузер</b><small>Открытый текст внутри устройства</small></div>
            <em>HTTPS / TLS</em>
            <div><i>②</i><b>nginx</b><small>TLS завершается на нашем VPS</small></div>
            <em>HTTP / Docker network</em>
            <div><i>③</i><b>Node.js</b><small>Шифрование и одноразовая выдача</small></div>
            <em>AES-256-GCM</em>
            <div><i>④</i><b>SQLite</b><small>Зашифрованное содержимое</small></div>
          </div>
          <div class="security-grid two">
            <div class="security-card"><h3>Интернет-участок</h3><p>Трафик между браузером и nginx защищён сертификатом Let’s Encrypt. Провайдер видит соединение с сервером и домен, но не тело секрета и не путь URL внутри HTTPS.</p></div>
            <div class="security-card"><h3>Внутри VPS</h3><p>После TLS nginx передаёт запрос приложению по HTTP через Docker-сеть <code>proxy-net</code>. Порт приложения не опубликован в интернет, но администратор или компрометация VPS остаются в доверенной границе.</p></div>
          </div>
        </section>

        <section class="security-section">
          <div class="section-heading"><span>03</span><div><h2>Где и как оседают данные</h2><p>Секрет и следы ссылки — не одно и то же.</p></div></div>
          <div class="storage-table">
            <div class="storage-head"><b>Данные</b><b>Где</b><b>Сколько живут</b></div>
            <div><strong>Открытый секрет</strong><span>Память браузера и Node.js во время запроса/ответа</span><span>До завершения обработки; после показа остаётся на стороне получателя</span></div>
            <div><strong>Зашифрованный секрет</strong><span><code>secrets.sqlite</code> в Docker volume, возможен SQLite WAL/backup</span><span>До первого чтения, удаления или истечения TTL</span></div>
            <div><strong>Ключ AES</strong><span><code>/root/secret/.env</code> с правами 0600 и environment контейнера</span><span>Пока эксплуатируется установка</span></div>
            <div><strong>Токены ссылок</strong><span>Полный токен — в URL; в SQLite только SHA-256-хеш</span><span>URL может остаться в чате, истории браузера и nginx access-log</span></div>
            <div><strong>Метаданные</strong><span>SQLite: даты, статус, IP, User-Agent, язык, origin источника</span><span>После исчезновения секрета остаются для аудита</span></div>
          </div>
          <div class="security-callout warn"><b>Важный нюанс журналов</b><p>Тело секрета nginx не журналирует, но текущий access-log содержит полный путь запроса, включая одноразовый токен. Поэтому доступ к логам VPS равнозначен доступу к ещё активным ссылкам. Встроенный аудит хранит только ID записи и хеш токена.</p></div>
        </section>

        <section class="security-section">
          <div class="section-heading"><span>04</span><div><h2>Ровно одно чтение</h2><p>Это не счётчик просмотров, а смена состояния.</p></div></div>
          <div class="once-diagram">
            <div class="state active-state"><b>ACTIVE</b><span>ciphertext присутствует</span></div>
            <div class="arrow">первый успешный POST →</div>
            <div class="state done-state"><b>REVEALED</b><span>ciphertext = NULL</span></div>
          </div>
          <p class="security-note">Если два человека нажмут кнопку одновременно, SQLite выполняет операции последовательно: первый получает секрет, второй — страницу «уже прочитан». Установить два или больше просмотров нельзя.</p>
        </section>

        <section class="security-section">
          <div class="section-heading"><span>05</span><div><h2>Что остаётся в аудите</h2><p>Технические признаки, но не содержимое.</p></div></div>
          <div class="security-grid four">
            <div class="mini-card"><b>Создана</b><span>время и клиент создателя</span></div>
            <div class="mini-card"><b>Запрошена</b><span>каждый GET, включая preview</span></div>
            <div class="mini-card"><b>Раскрыта</b><span>успешный POST получателя</span></div>
            <div class="mini-card"><b>Удалена</b><span>действие администратора</span></div>
          </div>
          <p class="security-note">Записываются IP, User-Agent, Accept-Language и только origin Referer без пути. До 100 событий запроса на ссылку. Эти признаки помогают расследованию, но не доказывают личность человека.</p>
        </section>

        <section class="security-section threat-section">
          <div class="section-heading"><span>06</span><div><h2>Границы защиты</h2><p>От каких рисков система не обещает защитить.</p></div></div>
          <div class="security-grid two">
            <div class="security-card risk"><h3>Ссылка — это ключ доступа</h3><p>Любой, кто получил URL, может первым раскрыть секрет. Пересылка, скриншот или утечка истории браузера передают это право другому человеку.</p></div>
            <div class="security-card risk"><h3>Это не end-to-end encryption</h3><p>VPS содержит и ключ AES, и базу. Root-доступ, вредоносный код в приложении или компрометация хоста позволяют получить активные секреты.</p></div>
            <div class="security-card risk"><h3>Публичное создание</h3><p>Создавать ссылки можно без авторизации. Сейчас нет CAPTCHA и rate limit, поэтому возможны спам и расход диска; размер одного секрета ограничен 32 768 символами.</p></div>
            <div class="security-card risk"><h3>Получатель отвечает за копию</h3><p>После показа текст находится в DOM и памяти его браузера. Буфер обмена, скриншоты, расширения и заражённое устройство сервис контролировать не может.</p></div>
          </div>
        </section>

        <section class="security-summary">
          <div><span>Подходит</span><b>Для временной передачи паролей, ключей и приватных заметок вместо открытого текста в чате.</b></div>
          <div><span>Не заменяет</span><b>Корпоративный password manager, управление доступами, E2E-канал и защищённое устройство получателя.</b></div>
        </section>
      </article>`,
  });
}

export function errorView(message) {
  return layout({
    title: 'Что-то пошло не так',
    navigation: true,
    body: `<section class="card reveal-card unavailable"><div class="empty-icon">⚡</div><h1>Не получилось</h1><p>${escapeHtml(message)}</p><a class="button" href="/">Вернуться</a></section>`,
  });
}
