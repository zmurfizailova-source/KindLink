(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.KINDLINK_CONFIG || {};
  const configured = Boolean(
    config.supabaseUrl && config.supabaseAnonKey &&
    !String(config.supabaseUrl).includes('YOUR_') &&
    !String(config.supabaseAnonKey).includes('YOUR_')
  );
  const db = configured && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;

  const demoProjects = [
    { id: 'demo-1', title: 'Чистый берег — чистое будущее', category: 'Экология', city: 'Бишкек', event_date: null, format: 'offline', participants_needed: 15, description: 'Присоединяйся к экологической инициативе: вместе мы наведём порядок на берегу, поговорим о бережном отношении к природе и покажем, что маленькие действия действительно важны.', organization: { organization_name: 'Эко-инициатива' } },
    { id: 'demo-2', title: 'Время учиться вместе', category: 'Образование', city: 'Бишкек', event_date: null, format: 'hybrid', participants_needed: 8, description: 'Ищем волонтёров, которые любят делиться знаниями. Помогай школьникам с учёбой, проводи творческие занятия и поддерживай интерес к новым открытиям.', organization: { organization_name: 'Открытые знания' } },
    { id: 'demo-3', title: 'Тёплая забота', category: 'Помощь людям', city: 'Ош', event_date: null, format: 'offline', participants_needed: 12, description: 'Команда готовит наборы первой необходимости и организует сбор полезных вещей для семей, которым нужна поддержка. Важны внимательность, командная работа и уважение.', organization: { organization_name: 'Рядом' } },
    { id: 'demo-4', title: 'Друзья для хвостиков', category: 'Животные', city: 'Бишкек', event_date: null, format: 'offline', participants_needed: 10, description: 'Помогай приюту с информационными публикациями, сбором необходимых вещей и организацией добрых событий. Все активности проходят вместе с ответственными координаторами.', organization: { organization_name: 'Лапа помощи' } },
    { id: 'demo-5', title: 'Цифровая грамотность для всех', category: 'Образование', city: 'Онлайн', event_date: null, format: 'online', participants_needed: 6, description: 'Помогай людям осваивать полезные цифровые навыки: работу с почтой, безопасное использование интернета и базовые онлайн-инструменты.', organization: { organization_name: 'Digital Dostuk' } },
    { id: 'demo-6', title: 'Зелёный двор', category: 'Экология', city: 'Каракол', event_date: null, format: 'offline', participants_needed: 20, description: 'Создаём уютное общественное пространство: планируем посадки, готовим информационные материалы и объединяем соседей вокруг заботы о своём районе.', organization: { organization_name: 'Жашыл Дем' } }
  ];

  const state = { user: null, profile: null, projects: [], category: 'all', query: '', authMode: 'login', activeProject: null, toastTimer: null };
  const symbols = { 'Экология': '✳', 'Образование': '✎', 'Помощь людям': '♡', 'Животные': '✿', 'Другое': '✦' };
  const palettes = { 'Экология': '#e7eddf', 'Образование': '#f4ebd2', 'Помощь людям': '#f1e5df', 'Животные': '#e7edf0', 'Другое': '#eee8f3' };

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }

  function formatDate(value) {
    if (!value) return 'Дата уточняется';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'Дата уточняется';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function formatMode(value) {
    return ({ offline: 'Офлайн', online: 'Онлайн', hybrid: 'Смешанный формат' })[value] || 'Формат уточняется';
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = true;
    if (!$$('.modal-backdrop').some(item => !item.hidden)) document.body.style.overflow = '';
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    $('#authMessage').textContent = '';
    $('#authMessage').classList.remove('error');
    $('#authForm').reset();
    toggleRoleFields();
    openModal('authModal');
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    $$('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authMode === mode));
    const signup = mode === 'signup';
    $('#signupFields').hidden = !signup;
    $('#authTitle').textContent = signup ? 'Давай знакомиться!' : 'Рады снова тебя видеть!';
    $('#authSubtitle').textContent = signup ? 'Создай аккаунт и стань частью добрых перемен.' : 'Войди, чтобы продолжить свой путь с KindLink.';
    $('#authSubmit').innerHTML = signup ? 'Создать аккаунт <span aria-hidden="true">↗</span>' : 'Войти <span aria-hidden="true">↗</span>';
    $('#authForm [name="password"]').autocomplete = signup ? 'new-password' : 'current-password';
    toggleRoleFields();
  }

  function toggleRoleFields() {
    const isOrg = $('#accountRole').value === 'organization';
    $('#orgNameField').hidden = !isOrg;
    $('#orgNameField input').required = isOrg && state.authMode === 'signup';
  }

  function renderProjects() {
    const query = state.query.trim().toLocaleLowerCase('ru');
    const filtered = state.projects.filter(project => {
      const categoryMatch = state.category === 'all' || project.category === state.category;
      const haystack = [project.title, project.city, project.description, project.organization?.organization_name, project.organization?.full_name].filter(Boolean).join(' ').toLocaleLowerCase('ru');
      return categoryMatch && (!query || haystack.includes(query));
    });

    $('#resultsCount').textContent = `${filtered.length} ${pluralize(filtered.length, 'проект', 'проекта', 'проектов')}`;
    $('#projectGrid').innerHTML = filtered.map(project => {
      const category = escapeHTML(project.category || 'Другое');
      const organizer = project.organization?.organization_name || project.organization?.full_name || 'Организация KindLink';
      const shortDescription = escapeHTML(project.description || 'Подробности проекта можно узнать у организаторов.');
      const city = escapeHTML(project.city || 'Город не указан');
      return `<article class="project-card">
        <div class="project-card-top" style="background:${palettes[project.category] || '#edf0e9'}">
          <span class="project-category">${category}</span><span class="project-symbol">${symbols[project.category] || '✦'}</span>
        </div>
        <div class="project-card-body">
          <div class="project-meta"><span>⌖ ${city}</span><span>◷ ${formatDate(project.event_date)}</span></div>
          <h3>${escapeHTML(project.title)}</h3><p>${shortDescription}</p>
          <div class="project-card-bottom"><span class="organizer">${escapeHTML(organizer)}</span><button class="card-link" data-project-id="${escapeHTML(project.id)}">Подробнее ↗</button></div>
        </div>
      </article>`;
    }).join('');
    $('#emptyState').hidden = filtered.length > 0;
    $('#projectGrid').hidden = filtered.length === 0;
    $$('#projectGrid [data-project-id]').forEach(button => button.addEventListener('click', () => showProject(button.dataset.projectId)));
  }

  function pluralize(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  async function loadProjects() {
    if (!db) {
      state.projects = demoProjects;
      renderProjects();
      return;
    }
    const { data, error } = await db.from('projects')
      .select('id,title,description,category,city,event_date,format,participants_needed,organization:profiles!projects_organization_id_fkey(full_name,organization_name,is_verified)')
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('loadProjects:', error);
      toast('Не удалось загрузить проекты. Проверь подключение Supabase и SQL-схему.');
      state.projects = [];
    } else {
      state.projects = data || [];
    }
    renderProjects();
  }

  async function refreshSession() {
    if (!db) return;
    const { data: { session }, error } = await db.auth.getSession();
    if (error) console.error(error);
    state.user = session?.user || null;
    await loadProfile();
    updateHeader();
    if (state.user) await renderDashboard();
  }

  async function loadProfile() {
    state.profile = null;
    if (!db || !state.user) return;
    const { data, error } = await db.from('profiles').select('id,full_name,role,organization_name,city,is_verified,bio').eq('id', state.user.id).maybeSingle();
    if (error) console.error('loadProfile:', error);
    state.profile = data || null;
  }

  function updateHeader() {
    const loggedIn = Boolean(state.user && state.profile);
    $('#navLogin').hidden = loggedIn;
    $('#navJoin').hidden = loggedIn;
    $('#userMenu').hidden = !loggedIn;
    if (loggedIn) {
      const displayName = state.profile.role === 'organization' ? (state.profile.organization_name || state.profile.full_name) : state.profile.full_name;
      $('#userGreeting').textContent = `Привет, ${displayName || 'друг'}!`;
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!db) {
      toast('Сначала подключи Supabase — смотри инструкцию в README.');
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const message = $('#authMessage');
    const submit = $('#authSubmit');
    message.textContent = 'Обрабатываем запрос…';
    message.classList.remove('error');
    submit.disabled = true;
    try {
      if (state.authMode === 'signup') {
        if (values.role === 'organization' && !values.organization_name?.trim()) throw new Error('Укажи название организации.');
        const metadata = {
          full_name: values.full_name.trim(), role: values.role,
          organization_name: values.organization_name?.trim() || null,
          city: values.city?.trim() || null
        };
        const { data, error } = await db.auth.signUp({
          email: values.email.trim(), password: values.password,
          options: { data: metadata }
        });
        if (error) throw error;
        if (data.session) {
          state.user = data.user;
          await loadProfile();
          updateHeader();
          closeModal('authModal');
          await renderDashboard();
          toast('Аккаунт создан. Добро пожаловать в KindLink!');
        } else {
          message.textContent = 'Проверь почту и подтверди адрес, затем войди в аккаунт.';
          form.reset();
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
        if (error) throw error;
        state.user = data.user;
        await loadProfile();
        updateHeader();
        closeModal('authModal');
        await renderDashboard();
        toast('Ты успешно вошёл в KindLink!');
      }
    } catch (error) {
      message.textContent = friendlyError(error.message);
      message.classList.add('error');
    } finally {
      submit.disabled = false;
    }
  }

  function friendlyError(message = '') {
    const text = String(message).toLowerCase();
    if (text.includes('already registered')) return 'Этот email уже зарегистрирован. Попробуй войти.';
    if (text.includes('invalid login credentials')) return 'Неверный email или пароль.';
    if (text.includes('password should be at least')) return 'Пароль должен содержать не менее 8 символов.';
    if (text.includes('email not confirmed')) return 'Сначала подтверди email по ссылке из письма.';
    return message || 'Что-то пошло не так. Попробуй ещё раз.';
  }

  async function signOut() {
    if (db) {
      const { error } = await db.auth.signOut();
      if (error) { toast('Не удалось выйти из аккаунта.'); return; }
    }
    state.user = null;
    state.profile = null;
    $('#dashboard').hidden = true;
    updateHeader();
    toast('Ты вышел из аккаунта. До встречи!');
  }

  function showProject(id) {
    const project = state.projects.find(item => String(item.id) === String(id));
    if (!project) return;
    state.activeProject = project;
    const category = escapeHTML(project.category || 'Другое');
    const organizer = project.organization?.organization_name || project.organization?.full_name || 'Организация KindLink';
    let action = '';
    if (!db) {
      action = '<p class="privacy-note">Это демонстрационный проект. Подключи Supabase, чтобы регистрироваться и отправлять заявки.</p>';
    } else if (!state.user) {
      action = '<button class="button form-submit" id="detailJoin">Войти и подать заявку ↗</button>';
    } else if (state.profile?.role === 'volunteer') {
      action = `<form id="applyForm" class="form-stack"><label>Почему тебе интересен этот проект? (необязательно)<textarea name="message" maxlength="800" rows="3" placeholder="Расскажи немного о своей мотивации. Не указывай телефон, адрес или другие личные данные."></textarea></label><button class="button form-submit" type="submit">Отправить заявку <span aria-hidden="true">↗</span></button><p class="form-message" id="applyMessage" role="status"></p></form>`;
    } else {
      action = '<p class="privacy-note">Аккаунт организации не может подавать заявки как волонтёр. Для участия используй волонтёрский аккаунт.</p>';
    }
    $('#projectModalBody').innerHTML = `<span class="project-detail-category">${category}</span><h2 class="project-detail-title" id="projectModalTitle">${escapeHTML(project.title)}</h2><div class="detail-facts"><span>⌖ ${escapeHTML(project.city || 'Город не указан')}</span><span>◷ ${formatDate(project.event_date)}</span><span>↗ ${formatMode(project.format)}</span><span>＋ ${Number(project.participants_needed) || '—'} мест</span></div><p class="project-detail-org">Организатор: <strong>${escapeHTML(organizer)}</strong></p><p class="project-detail-description">${escapeHTML(project.description || 'Описание пока не добавлено.')}</p>${action}<p class="privacy-note">Перед участием уточни у организатора условия, место и присутствие ответственного координатора. Не отправляй незнакомым людям документы, пароли или финансовые данные.</p>`;
    openModal('projectModal');
    $('#detailJoin')?.addEventListener('click', () => { closeModal('projectModal'); openAuth('login'); });
    $('#applyForm')?.addEventListener('submit', submitApplication);
  }

  async function submitApplication(event) {
    event.preventDefault();
    const message = $('#applyMessage');
    const button = $('#applyForm button[type="submit"]');
    if (!db || !state.user || !state.activeProject) return;
    button.disabled = true;
    message.textContent = 'Отправляем заявку…';
    message.classList.remove('error');
    const formData = new FormData(event.currentTarget);
    const { error } = await db.from('applications').insert({
      project_id: state.activeProject.id,
      volunteer_id: state.user.id,
      message: String(formData.get('message') || '').trim() || null
    });
    button.disabled = false;
    if (error) {
      message.textContent = error.code === '23505' ? 'Ты уже отправлял(а) заявку на этот проект.' : friendlyError(error.message);
      message.classList.add('error');
      return;
    }
    closeModal('projectModal');
    toast('Заявка отправлена! Организация увидит её в своём кабинете.');
    await renderDashboard();
  }

  async function createProject(event) {
    event.preventDefault();
    if (!db || !state.user || state.profile?.role !== 'organization') return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const message = $('#createMessage');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = 'Сохраняем проект…';
    message.classList.remove('error');
    const isVerified = Boolean(state.profile.is_verified);
    const payload = {
      organization_id: state.user.id,
      title: values.title.trim(), description: values.description.trim(),
      category: values.category, city: values.city.trim(),
      event_date: values.event_date || null, format: values.format,
      participants_needed: Number(values.participants_needed),
      status: isVerified ? 'published' : 'draft'
    };
    const { error } = await db.from('projects').insert(payload);
    button.disabled = false;
    if (error) {
      message.textContent = friendlyError(error.message);
      message.classList.add('error');
      return;
    }
    closeModal('createModal');
    form.reset();
    await loadProjects();
    await renderDashboard();
    toast(isVerified ? 'Проект опубликован!' : 'Черновик сохранён. Для публикации нужна проверка организации.');
  }

  async function renderDashboard() {
    const section = $('#dashboard');
    const content = $('#dashboardContent');
    if (!state.user || !state.profile || !db) { section.hidden = true; return; }
    section.hidden = false;
    $('#dashboardIntro').textContent = state.profile.role === 'organization'
      ? 'Управляй инициативами и смотри отклики участников.'
      : 'Следи за своими заявками и открывай новые возможности.';
    if (state.profile.role === 'volunteer') {
      const { data, error } = await db.from('applications')
        .select('id,status,created_at,project:projects(title,city,event_date,category)')
        .eq('volunteer_id', state.user.id).order('created_at', { ascending: false });
      if (error) { content.innerHTML = '<div class="dashboard-empty">Не удалось загрузить заявки. Попробуй обновить страницу.</div>'; return; }
      content.innerHTML = `<h3 class="dashboard-subhead">Мои заявки</h3>${(data || []).length ? `<div class="dashboard-list">${data.map(item => `<div class="dashboard-row"><div><strong>${escapeHTML(item.project?.title || 'Проект')}</strong><small>${escapeHTML(item.project?.city || '')} · ${formatDate(item.project?.event_date)}</small></div><span class="status-pill status-${escapeHTML(item.status)}">${statusLabel(item.status)}</span></div>`).join('')}</div>` : '<div class="dashboard-empty">Ты ещё не отправлял(а) заявки. Посмотри проекты выше и выбери то, что тебе интересно.</div>'}`;
    } else {
      const { data: projects, error } = await db.from('projects').select('id,title,status,city,event_date,created_at').eq('organization_id', state.user.id).order('created_at', { ascending: false });
      if (error) { content.innerHTML = '<div class="dashboard-empty">Не удалось загрузить проекты. Попробуй обновить страницу.</div>'; return; }
      const ids = (projects || []).map(item => item.id);
      let applications = [];
      if (ids.length) {
        const result = await db.from('applications').select('id,project_id,volunteer_id,status,message,created_at,volunteer:profiles!applications_volunteer_id_fkey(full_name,city)').in('project_id', ids).order('created_at', { ascending: false });
        if (result.error) console.error(result.error); else applications = result.data || [];
      }
      const applicationMarkup = applications.length ? applications.map(item => {
        const project = projects.find(p => p.id === item.project_id);
        const volunteerTag = item.volunteer?.full_name || `Участник ${String(item.volunteer_id).slice(0, 8).toUpperCase()}`;
        const controls = item.status === 'pending' ? `<div class="dashboard-actions"><button class="mini-button" data-app-status="accepted" data-app-id="${item.id}">Принять</button><button class="mini-button" data-app-status="rejected" data-app-id="${item.id}">Отклонить</button></div>` : '';
        return `<div class="dashboard-row"><div><strong>${escapeHTML(project?.title || 'Проект')} · ${escapeHTML(volunteerTag)}</strong><small>${item.volunteer?.city ? `${escapeHTML(item.volunteer.city)} · ` : ''}${item.message ? escapeHTML(item.message) : 'Без дополнительного сообщения'} · ${formatDate(item.created_at?.slice(0, 10))}</small></div><div class="dashboard-actions"><span class="status-pill status-${escapeHTML(item.status)}">${statusLabel(item.status)}</span>${controls}</div></div>`;
      }).join('') : '<div class="dashboard-empty">Пока нет заявок. Когда волонтёры откликнутся, они появятся здесь.</div>';
      const projectMarkup = (projects || []).length ? `<div class="dashboard-list">${projects.map(item => `<div class="dashboard-row"><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.city)} · ${formatDate(item.event_date)}</small></div><span class="status-pill">${item.status === 'published' ? 'Опубликован' : item.status === 'closed' ? 'Закрыт' : 'Черновик'}</span></div>`).join('')}</div>` : '<div class="dashboard-empty">Ты ещё не создал(а) проекты. Добавь первую инициативу.</div>';
      content.innerHTML = `<button class="button dashboard-create" id="dashboardCreate">＋ Создать проект</button>${!state.profile.is_verified ? '<div class="dashboard-empty">Профиль организации ещё не проверен. Проекты пока сохраняются как черновики. Свяжись с администратором платформы для проверки.</div>' : ''}<h3 class="dashboard-subhead">Мои проекты</h3>${projectMarkup}<h3 class="dashboard-subhead">Заявки волонтёров</h3><div class="dashboard-list">${applicationMarkup}</div>`;
      $('#dashboardCreate')?.addEventListener('click', () => openModal('createModal'));
      $$('[data-app-status]', content).forEach(button => button.addEventListener('click', () => updateApplicationStatus(button.dataset.appId, button.dataset.appStatus)));
    }
  }

  function statusLabel(status) {
    return ({ pending: 'На рассмотрении', accepted: 'Принята', rejected: 'Отклонена' })[status] || 'Статус неизвестен';
  }

  async function updateApplicationStatus(id, status) {
    const { error } = await db.rpc('set_application_status', { p_application_id: id, p_status: status });
    if (error) { toast(friendlyError(error.message)); return; }
    toast(status === 'accepted' ? 'Заявка принята.' : 'Заявка отклонена.');
    await renderDashboard();
  }

  function openCreateProject() {
    if (!db) { toast('Подключи Supabase, чтобы создавать проекты.'); return; }
    if (!state.user) { openAuth('signup'); return; }
    if (state.profile?.role !== 'organization') { toast('Создавать проекты могут аккаунты организаций.'); return; }
    openModal('createModal');
  }

  function bindEvents() {
    $('#navLogin').addEventListener('click', () => openAuth('login'));
    $('#navJoin').addEventListener('click', () => openAuth('signup'));
    $('#heroCreate').addEventListener('click', openCreateProject);
    $('#ctaJoin').addEventListener('click', () => openAuth('signup'));
    $('#suggestProject').addEventListener('click', openCreateProject);
    $('#dashboardBtn').addEventListener('click', () => { $('#dashboard').scrollIntoView({ behavior: 'smooth' }); });
    $('#logoutBtn').addEventListener('click', signOut);
    $('#authForm').addEventListener('submit', submitAuth);
    $('#createProjectForm').addEventListener('submit', createProject);
    $('#accountRole').addEventListener('change', toggleRoleFields);
    $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));
    $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
    $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop').forEach(modal => { if (!modal.hidden) closeModal(modal.id); }); });
    $('#searchInput').addEventListener('input', event => { state.query = event.target.value; renderProjects(); });
    $('#categoryFilters').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
      renderProjects();
    });
    $('#resetFilters').addEventListener('click', () => {
      state.category = 'all'; state.query = ''; $('#searchInput').value = '';
      $$('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.category === 'all'));
      renderProjects();
    });
    $('#menuToggle').addEventListener('click', () => {
      const open = $('#mainNav').classList.toggle('open');
      $('#menuToggle').setAttribute('aria-expanded', String(open));
    });
    $$('#mainNav a').forEach(link => link.addEventListener('click', () => $('#mainNav').classList.remove('open')));
  }

  async function init() {
    $('#yearNow').textContent = new Date().getFullYear();
    bindEvents();
    if (!configured || !db) $('#setupNotice').hidden = false;
    await loadProjects();
    await refreshSession();
    if (db) {
      db.auth.onAuthStateChange((_event, session) => {
        // Avoid awaiting Supabase calls inside this callback; refresh after the current event loop.
        setTimeout(async () => {
          state.user = session?.user || null;
          await loadProfile();
          updateHeader();
          if (state.user) await renderDashboard(); else $('#dashboard').hidden = true;
        }, 0);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
