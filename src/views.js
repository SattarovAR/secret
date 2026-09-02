const statusLabels = {
  active: ['Активна', 'status-active'],
  revealed: ['Прочитана', 'status-read'],
  expired: ['Истекла', 'status-expired'],
  deleted: ['Удалена', 'status-deleted'],
  missing: ['Не найдена', 'status-deleted'],
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
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <div class="orb orb-one"></div><div class="orb orb-two"></div>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Secret Spark">
      <span class="brand-mark">✦</span><span>Secret Spark</span>
    </a>
    ${navigation ? '<nav><a href="/">Создать</a><a href="/audit">Аудит</a></nav>' : ''}
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
        <p class="warning">Не отправляйте ссылку управления получателю: с её помощью секрет можно удалить.</p>
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
            <button class="danger wide" type="submit">Удалить секрет сейчас</button>
          </form>` : ''}
      </section>`,
  });
}

export function auditView({ records, now, formatDate, message }) {
  const rows = records.map((record) => {
    const state = record.revealed_at ? 'revealed'
      : record.deleted_at ? 'deleted'
        : record.expires_at <= now ? 'expired' : 'active';
    return `<tr>
      <td><code>${escapeHtml(record.id)}</code></td>
      <td>${statusBadge(state)}</td>
      <td>${date(record.created_at, formatDate)}</td>
      <td>${date(record.revealed_at, formatDate)}</td>
      <td>${date(record.expires_at, formatDate)}</td>
      <td>${state === 'active' ? `<form action="/audit/${escapeHtml(record.id)}/delete" method="post"><button class="small danger" type="submit">Удалить</button></form>` : '—'}</td>
    </tr>`;
  }).join('');

  return layout({
    title: 'Аудит',
    navigation: true,
    body: `
      <section class="audit-head">
        <div><div class="eyebrow">ЖУРНАЛ</div><h1>Аудит ссылок</h1><p>Только даты и состояния — содержимое секретов здесь никогда не хранится.</p></div>
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

export function errorView(message) {
  return layout({
    title: 'Что-то пошло не так',
    navigation: true,
    body: `<section class="card reveal-card unavailable"><div class="empty-icon">⚡</div><h1>Не получилось</h1><p>${escapeHtml(message)}</p><a class="button" href="/">Вернуться</a></section>`,
  });
}
