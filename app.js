(function () {
  'use strict';

  const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const WEEKDAYS = [
    'Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'
  ];

  // Роли музыкантов и эмодзи для отчёта в Telegram
  const ROLES = [
    { id: 'lead', name: 'Ведущий' },
    { id: 'keys', name: 'Клавиши' },
    { id: 'guitar', name: 'Гитара' },
    { id: 'backvocal', name: 'Бэк-вокал' },
    { id: 'bass', name: 'Бас' },
    { id: 'drums', name: 'Барабаны' }
  ];
  const ROLE_EMOJI = {
    lead: '🎤',
    keys: '🎹',
    guitar: '🎸',
    backvocal: '🎵',
    bass: '🎸',
    drums: '🥁'
  };

  const STORAGE_USERS = 'miniapp_users';
  const STORAGE_SCHEDULE = 'miniapp_schedule';
  const SCHEDULE_PASSWORD = '7';

  let currentYear = 2026;
  let currentMonth = 1;
  let selectedSlot = null; // { dateKey, roleId }

  const $ = (id) => document.getElementById(id);
  const screens = {
    main: $('screen-main'),
    schedule: $('screen-schedule'),
    role: $('screen-role'),
    songs: $('screen-songs'),
    settings: $('screen-settings')
  };

  const monthLabel = $('month-label');
  const datesList = $('dates-list');
  const selectedDateText = $('selected-date-text');
  const roleScreenTitle = $('role-screen-title');
  const stepUsers = $('step-users');
  const stepRoles = $('step-roles');
  const usersList = $('users-list');
  const noUsersHint = $('no-users-hint');
  const selectedUserText = $('selected-user-text');
  const rolesList = $('roles-list');
  const stepBackvocal = $('step-backvocal');
  const backvocalUsersList = $('backvocal-users-list');
  const backvocalCount = $('backvocal-count');
  let backvocalSelectedIds = [];

  function getUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }

  function getSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_SCHEDULE);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // Расписание: schedule[dateKey] = { roleId: userId или строка (для бэк-вокала — имена через запятую) }
  function getRoleAssignment(dateKey, roleId) {
    const day = getSchedule()[dateKey];
    return (day && day[roleId]) ?? null;
  }

  function setRoleAssignment(dateKey, roleId, value) {
    const schedule = getSchedule();
    if (!schedule[dateKey]) schedule[dateKey] = {};
    schedule[dateKey][roleId] = value;
    localStorage.setItem(STORAGE_SCHEDULE, JSON.stringify(schedule));
  }

  function removeRoleAssignment(dateKey, roleId) {
    const schedule = getSchedule();
    if (schedule[dateKey]) {
      delete schedule[dateKey][roleId];
      if (Object.keys(schedule[dateKey]).length === 0) delete schedule[dateKey];
      localStorage.setItem(STORAGE_SCHEDULE, JSON.stringify(schedule));
    }
  }

  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      screens[key].classList.toggle('active', key === name);
    });
  }

  function formatDateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function isPastDate(dateKey) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const todayKey = formatDateKey(y, m, d);
    return dateKey < todayKey;
  }

  // Только вторники (2) и воскресенья (0), без прошедших дат; сгруппированы: сначала воскресенья, потом вторники
  function getDaysInMonth(year, month) {
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 2) continue;
      const dateKey = formatDateKey(year, month, d);
      if (isPastDate(dateKey)) continue;
      days.push({
        day: d,
        weekday: WEEKDAYS[dayOfWeek],
        dateKey,
        dayOfWeek
      });
    }
    // Сначала воскресенья (0), потом вторники (2); внутри группы по числу
    days.sort((a, b) => a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.day - b.day);
    return days;
  }

  function renderDates() {
    monthLabel.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
    const days = getDaysInMonth(currentYear, currentMonth);
    const users = getUsers();
    const schedule = getSchedule();

    function getUserName(id) {
      const u = users.find((x) => x.id === id);
      return u ? u.name : '?';
    }
    function getRoleName(id) {
      const r = ROLES.find((x) => x.id === id);
      return r ? r.name : '?';
    }

    const sundays = days.filter((d) => d.dayOfWeek === 0);
    const tuesdays = days.filter((d) => d.dayOfWeek === 2);

    function renderDayItems(dayList) {
      return dayList.map((d) => {
        const rolesHtml = ROLES.map((role) => {
          const val = getRoleAssignment(d.dateKey, role.id);
          const isBackvocalArray = role.id === 'backvocal' && Array.isArray(val);
          const isBackvocalString = role.id === 'backvocal' && typeof val === 'string';
          const empty = !val || (isBackvocalArray && val.length === 0);
          const label = empty ? 'пусто' : (isBackvocalArray ? val.map((id) => getUserName(id)).join(', ') : (isBackvocalString ? val : getUserName(val)));
          return `
            <li class="slot ${empty ? 'slot-empty' : ''}">
              <span><strong>${role.name}</strong> — ${label}</span>
              <span class="slot-actions">
                <button type="button" class="slot-btn" data-date="${d.dateKey}" data-role-id="${role.id}" data-empty="${empty}">${empty ? 'Назначить' : 'Изменить'}</button>
                ${!empty ? `<button type="button" class="slot-btn cancel" data-date="${d.dateKey}" data-role-id="${role.id}" data-clear="1">Отменить</button>` : ''}
              </span>
            </li>
          `;
        }).join('');

        return `
          <li class="date-item" data-date="${d.dateKey}">
            <button type="button" class="date-item-header">
              <span>${d.weekday} ${d.day} ${MONTHS[currentMonth].toLowerCase()}</span>
              <span class="chevron">▾</span>
            </button>
            <div class="date-item-body">
              <ul class="slots-list">${rolesHtml}</ul>
            </div>
          </li>
        `;
      }).join('');
    }

    let html = '';
    if (sundays.length > 0) {
      html += '<li class="dates-group-label">Воскресенья</li>' + renderDayItems(sundays);
    }
    if (tuesdays.length > 0) {
      html += '<li class="dates-group-label">Вторники</li>' + renderDayItems(tuesdays);
    }
    datesList.innerHTML = html;

    datesList.querySelectorAll('.date-item').forEach((el) => {
      const header = el.querySelector('.date-item-header');
      header.addEventListener('click', () => el.classList.toggle('expanded'));
    });

    datesList.querySelectorAll('.slot-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dateKey = btn.dataset.date;
        const roleId = btn.dataset.roleId;
        if (btn.dataset.clear === '1') {
          selectedSlot = { dateKey };
          removeRoleAssignment(dateKey, roleId);
          renderDates();
        } else if (btn.dataset.empty === 'true') {
          openAssignScreen(dateKey, roleId);
        } else {
          openAssignScreen(dateKey, roleId);
        }
      });
    });

    // Держим редактируемую дату развёрнутой и в фокусе (прокрутка к ней)
    if (selectedSlot && selectedSlot.dateKey) {
      const el = datesList.querySelector(`.date-item[data-date="${selectedSlot.dateKey}"]`);
      if (el) {
        el.classList.add('expanded');
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      selectedSlot = null;
    }
  }

  function openAssignScreen(dateKey, roleId) {
    selectedSlot = { dateKey, roleId };
    const roleName = ROLES.find((r) => r.id === roleId).name;

    const [y, m, day] = dateKey.split('-');
    const monthName = MONTHS[parseInt(m, 10) - 1].toLowerCase();
    selectedDateText.textContent = `${day} ${monthName} ${y}`;

    stepRoles.classList.add('hidden');

    if (roleId === 'backvocal') {
      stepUsers.classList.add('hidden');
      noUsersHint.classList.add('hidden');
      stepBackvocal.classList.remove('hidden');
      roleScreenTitle.textContent = `Бэк-вокал: ${day} ${monthName} ${y}`;
      const current = getRoleAssignment(dateKey, 'backvocal');
      backvocalSelectedIds = Array.isArray(current) ? [...current] : [];
      updateBackvocalList();
      showScreen('role');
      return;
    }

    stepBackvocal.classList.add('hidden');
    roleScreenTitle.textContent = `Кто на «${roleName}»?`;
    selectedUserText.textContent = `Дата: ${day} ${monthName} ${y}`;

    const users = getUsers();
    noUsersHint.classList.toggle('hidden', users.length > 0);
    usersList.classList.toggle('hidden', users.length === 0);
    stepUsers.classList.remove('hidden');

    usersList.innerHTML = users.map((u) => `
      <button type="button" class="user-item" data-user-id="${u.id}">${u.name}</button>
    `).join('');

    usersList.querySelectorAll('.user-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        setRoleAssignment(dateKey, roleId, userId);
        showScreen('schedule');
        renderDates();
      });
    });

    showScreen('role');
  }

  function updateBackvocalCount() {
    backvocalCount.textContent = `Выбрано: ${backvocalSelectedIds.length} из 3`;
  }

  function updateBackvocalList() {
    const users = getUsers();
    backvocalCount.classList.toggle('hidden', users.length === 0);
    backvocalUsersList.classList.toggle('hidden', users.length === 0);
    updateBackvocalCount();
    backvocalUsersList.innerHTML = users.map((u) => {
      const selected = backvocalSelectedIds.includes(u.id);
      return `<button type="button" class="user-item ${selected ? 'user-item-selected' : ''}" data-user-id="${u.id}">${u.name}</button>`;
    }).join('');
    backvocalUsersList.querySelectorAll('.user-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.userId;
        if (backvocalSelectedIds.includes(id)) {
          backvocalSelectedIds = backvocalSelectedIds.filter((x) => x !== id);
        } else if (backvocalSelectedIds.length < 3) {
          backvocalSelectedIds.push(id);
        }
        updateBackvocalList();
      });
    });
  }

  function saveBackvocalAndReturn() {
    if (!selectedSlot || selectedSlot.roleId !== 'backvocal') return;
    if (backvocalSelectedIds.length === 0) {
      alert('Выберите от 1 до 3 человек.');
      return;
    }
    setRoleAssignment(selectedSlot.dateKey, 'backvocal', backvocalSelectedIds);
    showScreen('schedule');
    renderDates();
  }

  function initSettings() {
    const input = $('settings-user-name');
    const list = $('settings-users-list');

    function renderUsers() {
      const users = getUsers();
      list.innerHTML = users.map((u) => `
        <li class="settings-user-item">
          <span>${u.name}</span>
          <button type="button" class="btn-remove-user" data-user-id="${u.id}">Удалить</button>
        </li>
      `).join('');

      list.querySelectorAll('.btn-remove-user').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.userId;
          saveUsers(getUsers().filter((u) => u.id !== id));
          renderUsers();
        });
      });
    }

    $('btn-add-user').addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) return;
      const users = getUsers();
      users.push({ id: 'u' + Date.now(), name });
      saveUsers(users);
      input.value = '';
      renderUsers();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-add-user').click();
    });

    renderUsers();
  }

  function expandAll() {
    datesList.querySelectorAll('.date-item').forEach((el) => el.classList.add('expanded'));
  }

  function collapseAll() {
    datesList.querySelectorAll('.date-item').forEach((el) => el.classList.remove('expanded'));
  }

  // Даты вторников и воскресений в ближайшие 7 дней (включая сегодня)
  function getDateKeysForWeek() {
    const today = new Date();
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 2) {
        result.push(formatDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }
    return result;
  }

  function getUserNameById(users, id) {
    const u = users.find((x) => x.id === id);
    return u ? u.name : '?';
  }

  // Готовый текст отчёта для отправки в Telegram (с эмодзи у ролей для наглядности)
  function buildReportText(dateKeys, schedule, users, roles, title) {
    const lines = [title, ''];
    dateKeys.forEach((dateKey) => {
      const [y, m, day] = dateKey.split('-');
      const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10));
      const weekday = WEEKDAYS[date.getDay()];
      const monthName = MONTHS[parseInt(m, 10) - 1].toLowerCase();
      lines.push(`${day} ${monthName} (${weekday}):`);
      const daySchedule = schedule[dateKey];
      if (!daySchedule || Object.keys(daySchedule).length === 0) {
        lines.push('  — нет назначений');
      } else {
        roles.forEach((role) => {
          const val = daySchedule[role.id];
          if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return;
          const name = role.id === 'backvocal'
            ? (Array.isArray(val) ? val.map((id) => getUserNameById(users, id)).join(', ') : val)
            : getUserNameById(users, val);
          const emoji = ROLE_EMOJI[role.id] || '';
          lines.push(`  ${emoji} ${role.name} — ${name}`);
        });
      }
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function sendReportToBot(payload) {
    const out = { ...payload, ready_to_send: true };
    const data = JSON.stringify(out);
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && typeof window.Telegram.WebApp.sendData === 'function') {
      window.Telegram.WebApp.sendData(data);
    } else {
      alert('Отчёт сформирован. Откройте мини-приложение из Telegram — бот предложит выбрать, кому отправить график.\n\nТекст отчёта:\n' + (out.text || '').slice(0, 500) + (out.text && out.text.length > 500 ? '…' : ''));
    }
  }

  function reportMonth() {
    const schedule = getSchedule();
    const users = getUsers();
    const last = new Date(currentYear, currentMonth + 1, 0);
    const dateKeys = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(currentYear, currentMonth, d);
      if (date.getDay() === 0 || date.getDay() === 2) dateKeys.push(formatDateKey(currentYear, currentMonth, d));
    }
    const monthSchedule = {};
    dateKeys.forEach((key) => {
      if (schedule[key]) monthSchedule[key] = schedule[key];
    });
    const monthTitle = MONTHS[currentMonth] + ' ' + currentYear;
    const text = buildReportText(dateKeys, schedule, users, ROLES, '📅 График на месяц: ' + monthTitle);
    sendReportToBot({
      action: 'report_month',
      year: currentYear,
      month: currentMonth + 1,
      schedule: monthSchedule,
      users,
      roles: ROLES,
      text
    });
    try {
      if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
        window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Выберите в боте, кому отправить график на месяц.' });
      }
    } catch (err) { /* popup не поддерживается */ }
  }

  function reportWeek() {
    const dateKeys = getDateKeysForWeek();
    const schedule = getSchedule();
    const users = getUsers();
    const weekSchedule = {};
    dateKeys.forEach((key) => {
      if (schedule[key]) weekSchedule[key] = schedule[key];
    });
    const text = buildReportText(dateKeys, schedule, users, ROLES, '📅 График на ближайшую неделю');
    sendReportToBot({
      action: 'report_week',
      dateKeys,
      schedule: weekSchedule,
      users,
      roles: ROLES,
      text
    });
    try {
      if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
        window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Выберите в боте, кому отправить график на неделю.' });
      }
    } catch (err) { /* popup не поддерживается */ }
  }

  function openScheduleWithPassword() {
    const overlay = $('schedule-password-overlay');
    const input = $('schedule-password-input');
    const errorEl = $('schedule-password-error');
    overlay.classList.remove('hidden');
    input.value = '';
    errorEl.classList.add('hidden');
    input.focus();
  }

  function checkSchedulePassword() {
    const input = $('schedule-password-input');
    const errorEl = $('schedule-password-error');
    const value = String(input.value).trim();
    if (value === SCHEDULE_PASSWORD) {
      $('schedule-password-overlay').classList.add('hidden');
      currentYear = new Date().getFullYear();
      currentMonth = new Date().getMonth();
      renderDates();
      showScreen('schedule');
    } else {
      errorEl.classList.remove('hidden');
    }
  }

  document.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'schedule') {
        openScheduleWithPassword();
      } else if (action === 'songs') {
        showScreen('songs');
      } else if (action === 'settings') {
        initSettings();
        showScreen('settings');
      }
    });
  });

  $('schedule-password-submit').addEventListener('click', checkSchedulePassword);
  $('schedule-password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkSchedulePassword();
  });

  $('btn-close-schedule').addEventListener('click', () => showScreen('main'));
  $('btn-back-schedule').addEventListener('click', () => showScreen('main'));
  $('btn-back-role').addEventListener('click', () => showScreen('schedule'));
  $('backvocal-save').addEventListener('click', saveBackvocalAndReturn);
  $('btn-back-songs').addEventListener('click', () => showScreen('main'));
  $('btn-back-settings').addEventListener('click', () => showScreen('main'));

  $('month-prev').addEventListener('click', () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }
    renderDates();
  });

  $('month-next').addEventListener('click', () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
    renderDates();
  });

  $('expand-all').addEventListener('click', expandAll);
  $('collapse-all').addEventListener('click', collapseAll);

  // Кнопки отчётов — прямая привязка (элементы уже в DOM в конце body)
  var reportMonthEl = document.getElementById('report-month');
  var reportWeekEl = document.getElementById('report-week');
  if (reportMonthEl) reportMonthEl.addEventListener('click', function (e) { e.preventDefault(); reportMonth(); });
  if (reportWeekEl) reportWeekEl.addEventListener('click', function (e) { e.preventDefault(); reportWeek(); });
})();
