(function () {
  const STORAGE_KEY = 'yummy-pwa-v1';
  const $ = (selector) => document.querySelector(selector);

  let state = normalizeState(loadState());
  let route = { name: 'home' };
  let filters = { query: '', duration: '', min: '', max: '' };
  let draftDirty = false;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { recipes: [], lists: [] };
    } catch {
      return { recipes: [], lists: [] };
    }
  }

  function normalizeState(value) {
    return {
      recipes: (value.recipes || []).map((recipe) => ({
        ...recipe,
        ingredients: recipe.ingredients || [],
        tools: recipe.tools || [],
        steps: recipe.steps || [],
        listIds: recipe.listIds || []
      })),
      lists: value.lists || []
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function go(nextRoute) {
    route = nextRoute;
    draftDirty = false;
    render();
  }

  function render() {
    if (route.name === 'editor') return renderEditor(route.recipeId);
    if (route.name === 'detail') return renderDetail(route.recipeId);
    if (route.name === 'lists') return renderLists();
    if (route.name === 'list') return renderHome(route.listId);
    if (route.name === 'manageList') return renderListManager(route.listId);
    if (route.name === 'listSelector') return renderListSelector(route.recipeId, route.backRoute);
    if (route.name === 'settings') return renderSettings();
    return renderHome();
  }

  function listById(listId) {
    return state.lists.find((item) => item.id === listId);
  }

  function recipeById(recipeId) {
    return state.recipes.find((item) => item.id === recipeId);
  }

  function recipeRank(recipe, query) {
    const q = query.trim().toLowerCase();
    if (!q) return 99;
    const name = recipe.name.toLowerCase();
    const ingredients = recipe.ingredients.map((item) => item.toLowerCase());
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (ingredients.some((item) => item === q)) return 3;
    if (ingredients.some((item) => item.includes(q))) return 4;
    return 99;
  }

  function inDuration(recipe) {
    const minutes = recipe.durationMinutes;
    const min = Number(filters.min);
    const max = Number(filters.max);
    if (filters.min !== '' && (!Number.isFinite(min) || minutes < min)) return false;
    if (filters.max !== '' && (!Number.isFinite(max) || minutes > max)) return false;
    if (!filters.duration) return true;
    if (filters.duration === 'lte10') return minutes <= 10;
    if (filters.duration === 'gt10lte15') return minutes > 10 && minutes <= 15;
    if (filters.duration === 'gt15lte30') return minutes > 15 && minutes <= 30;
    if (filters.duration === 'gt30lt60') return minutes > 30 && minutes < 60;
    if (filters.duration === 'gte60') return minutes >= 60;
    return true;
  }

  function filteredRecipes(listId) {
    const query = filters.query.trim();
    return state.recipes
      .filter((recipe) => !listId || recipe.listIds.includes(listId))
      .map((recipe) => ({ recipe, rank: recipeRank(recipe, query) }))
      .filter((item) => !query || item.rank < 99)
      .filter((item) => inDuration(item.recipe))
      .sort((a, b) => a.rank - b.rank || b.recipe.createdAt.localeCompare(a.recipe.createdAt))
      .map((item) => item.recipe);
  }

  function filterLabel() {
    if (filters.min !== '' || filters.max !== '') return `${filters.min || 0}-${filters.max || '∞'} 分钟`;
    return ({
      lte10: '≤10 分钟',
      gt10lte15: '10 且 ≤15 分钟',
      gt15lte30: '15 且 ≤30 分钟',
      gt30lt60: '30 且 <60 分钟',
      gte60: '≥60 分钟'
    })[filters.duration] || '';
  }

  function renderHome(listId) {
    const list = listById(listId);
    const label = filterLabel();
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <button class="pill-btn" id="listsBtn">Lists</button>
          <h1 class="title">${list ? escapeHtml(list.name) : 'Yummy'}</h1>
          <button class="pill-btn" id="settingsBtn">Settings</button>
        </div>
        ${list ? `<div class="row"><button class="pill-btn" id="homeBtn">Home</button><button class="pill-btn" id="listMenuBtn">···</button></div>` : ''}
        <div class="search-row">
          <input id="search" class="input" placeholder="搜索菜谱或食材" value="${escapeAttr(filters.query)}" />
          <button class="pill-btn" id="filterBtn">筛选</button>
        </div>
        ${label ? `<div class="filter-chip">筛选：${escapeHtml(label)} <button id="clearFilterBtn">清除筛选</button></div>` : ''}
        <div id="recipes"></div>
        <button class="icon-btn fab" id="addBtn">＋</button>
        <div id="sheetHost"></div>
      </main>
    `;
    $('#listsBtn').onclick = () => go({ name: 'lists' });
    $('#settingsBtn').onclick = () => go({ name: 'settings' });
    $('#homeBtn') && ($('#homeBtn').onclick = () => go({ name: 'home' }));
    $('#addBtn').onclick = () => go({ name: 'editor' });
    $('#search').oninput = (event) => {
      filters.query = event.target.value;
      renderRecipeGrid(listId);
    };
    $('#filterBtn').onclick = () => openFilterSheet(listId);
    $('#clearFilterBtn') && ($('#clearFilterBtn').onclick = () => {
      filters.duration = '';
      filters.min = '';
      filters.max = '';
      renderHome(listId);
    });
    $('#listMenuBtn') && ($('#listMenuBtn').onclick = () => openListMenu(listId));
    renderRecipeGrid(listId);
  }

  function renderRecipeGrid(listId) {
    const recipes = filteredRecipes(listId);
    const empty = filters.query || filterLabel() ? '没有找到符合条件的菜谱' : (listId ? '这个 List 还没有菜谱' : '还没有菜谱');
    $('#recipes').innerHTML = recipes.length ? `
      <div class="grid">
        ${recipes.map((recipe) => `
          <article class="card" data-id="${recipe.id}">
            <button class="card-menu" data-menu="${recipe.id}">···</button>
            ${recipe.coverImage ? `<img class="card-img" src="${recipe.coverImage}" alt="" />` : `<div class="placeholder">Yummy</div>`}
            <div class="card-body">
              <h2 class="card-title">${escapeHtml(recipe.name)}</h2>
              <div class="muted">${escapeHtml(recipe.ingredients.slice(0, 3).join(', ') || '没有食材')}</div>
              <div class="muted">${escapeHtml(recipe.tools.slice(0, 3).join(', ') || '没有工具')}</div>
              <div class="accent">${recipe.durationMinutes} 分钟</div>
            </div>
          </article>
        `).join('')}
      </div>
    ` : `<div class="empty">${empty}<br><button class="primary-btn" id="emptyAddBtn">创建菜谱</button></div>`;
    document.querySelectorAll('.card').forEach((card) => {
      card.onclick = () => go({ name: 'detail', recipeId: card.dataset.id });
    });
    document.querySelectorAll('[data-menu]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        openRecipeMenu(button.dataset.menu, listId ? { name: 'list', listId } : { name: 'home' });
      };
    });
    $('#emptyAddBtn') && ($('#emptyAddBtn').onclick = () => go({ name: 'editor' }));
  }

  function openFilterSheet(listId) {
    $('#sheetHost').innerHTML = `
      <div class="sheet">
        <h2>筛选</h2>
        <select id="durationPick" class="select">
          <option value="">全部时间</option>
          <option value="lte10">≤10 分钟</option>
          <option value="gt10lte15">10 且 ≤15 分钟</option>
          <option value="gt15lte30">15 且 ≤30 分钟</option>
          <option value="gt30lt60">30 且 <60 分钟</option>
          <option value="gte60">≥60 分钟</option>
        </select>
        <div class="search-row">
          <input id="minMinutes" class="input" type="number" placeholder="最短" value="${escapeAttr(filters.min)}" />
          <input id="maxMinutes" class="input" type="number" placeholder="最长" value="${escapeAttr(filters.max)}" />
        </div>
        <div class="row"><button class="pill-btn" id="cancelFilter">取消</button><button class="primary-btn" id="applyFilter">确定</button></div>
      </div>
    `;
    $('#durationPick').value = filters.duration;
    $('#cancelFilter').onclick = () => $('#sheetHost').innerHTML = '';
    $('#applyFilter').onclick = () => {
      const min = $('#minMinutes').value.trim();
      const max = $('#maxMinutes').value.trim();
      if (min && max && Number(min) > Number(max)) return alert('最短时间不能大于最长时间');
      filters.duration = $('#durationPick').value;
      filters.min = min;
      filters.max = max;
      renderHome(listId);
    };
  }

  function openRecipeMenu(recipeId, backRoute) {
    const recipe = recipeById(recipeId);
    document.body.insertAdjacentHTML('beforeend', `
      <div class="sheet" id="menuSheet">
        <h2>${escapeHtml(recipe.name)}</h2>
        <button class="primary-btn full" id="addToListBtn">加入 List</button>
        <button class="pill-btn full" id="editRecipeBtn">编辑</button>
        <button class="danger-btn full" id="deleteRecipeBtn">删除</button>
        <button class="pill-btn full" id="closeMenuBtn">取消</button>
      </div>
    `);
    $('#closeMenuBtn').onclick = () => $('#menuSheet').remove();
    $('#addToListBtn').onclick = () => go({ name: 'listSelector', recipeId, backRoute });
    $('#editRecipeBtn').onclick = () => go({ name: 'editor', recipeId });
    $('#deleteRecipeBtn').onclick = () => deleteRecipe(recipeId);
  }

  function renderDetail(recipeId) {
    const recipe = recipeById(recipeId);
    if (!recipe) return go({ name: 'home' });
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <button class="pill-btn" id="backBtn">返回</button>
          <button class="pill-btn" id="menuBtn">···</button>
        </div>
        ${recipe.coverImage ? `<img class="card-img" src="${recipe.coverImage}" alt="" style="border-radius:24px" />` : `<div class="placeholder" style="border-radius:24px">Yummy</div>`}
        <h1 class="title">${escapeHtml(recipe.name)}</h1>
        <p class="accent">${recipe.durationMinutes} 分钟</p>
        <section class="section"><h2>食材</h2>${recipe.ingredients.map((item) => `<div>${escapeHtml(item)}</div>`).join('') || '没有食材'}</section>
        <section class="section"><h2>工具</h2>${recipe.tools.map((item) => `<div>${escapeHtml(item)}</div>`).join('') || '没有工具'}</section>
        <section class="section"><h2>制作流程</h2>${recipe.steps.map((step, index) => `
          <div class="list-item">
            <strong>Step ${index + 1}</strong>
            <p>${escapeHtml(step.text)}</p>
            ${step.image ? `<img class="card-img" src="${step.image}" alt="" style="border-radius:16px" />` : ''}
          </div>
        `).join('') || '没有步骤'}</section>
      </main>
    `;
    $('#backBtn').onclick = () => go({ name: 'home' });
    $('#menuBtn').onclick = () => openRecipeMenu(recipeId, { name: 'detail', recipeId });
  }

  function deleteRecipe(recipeId) {
    const recipe = recipeById(recipeId);
    if (!recipe || !confirm(`确定删除“${recipe.name}”吗？`)) return;
    state.recipes = state.recipes.filter((item) => item.id !== recipeId);
    saveState();
    go({ name: 'home' });
  }

  function renderEditor(recipeId) {
    const recipe = recipeById(recipeId);
    const steps = recipe?.steps?.length ? recipe.steps : [{ text: '', image: '' }];
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <button class="pill-btn" id="cancelBtn">取消</button>
          <button class="primary-btn" id="saveBtn">保存</button>
        </div>
        <div class="section" id="editor">
          <label class="label">成品图</label>
          ${recipe?.coverImage ? `<img class="step-preview" src="${recipe.coverImage}" alt="" />` : ''}
          <input id="cover" type="file" accept="image/*" class="input" />
          <label class="label">名称</label>
          <input id="name" class="input" value="${escapeAttr(recipe?.name || '')}" placeholder="奶油蘑菇鸡" />
          <label class="label">所需时间</label>
          <input id="duration" class="input" type="number" value="${recipe?.durationMinutes || ''}" placeholder="25" />
          ${renderItemEditor('食材', 'ingredients', recipe?.ingredients || [])}
          ${renderItemEditor('工具', 'tools', recipe?.tools || [])}
          <div class="row"><label class="label">制作流程</label><button class="pill-btn" id="addStepBtn" type="button">添加 Step</button></div>
          <div id="stepRows">${renderStepEditorRows(steps)}</div>
        </div>
      </main>
    `;
    $('#editor').oninput = () => draftDirty = true;
    $('#editor').onchange = () => draftDirty = true;
    $('#cancelBtn').onclick = () => {
      if (draftDirty && !confirm('有尚未保存的修改，确定离开吗？')) return;
      go(recipeId ? { name: 'detail', recipeId } : { name: 'home' });
    };
    bindEditorButtons();
    $('#saveBtn').onclick = async () => saveRecipe(recipe);
  }

  function renderItemEditor(label, key, items) {
    const rows = (items.length ? items : ['']).map((text) => renderItemRow(key, text)).join('');
    return `<div class="row"><label class="label">${label}</label><button class="pill-btn add-row" data-add="${key}" type="button">添加</button></div><div id="${key}Rows">${rows}</div>`;
  }

  function renderItemRow(key, text) {
    return `
      <div class="item-row" data-kind="${key}">
        <input class="input item-text" value="${escapeAttr(text)}" />
        <button class="pill-btn move-up" type="button">↑</button>
        <button class="pill-btn move-down" type="button">↓</button>
        <button class="pill-btn remove-row" type="button">删除</button>
      </div>
    `;
  }

  function renderStepEditorRows(steps) {
    return steps.map((step, index) => `
      <div class="step-row list-item" data-existing-image="${escapeAttr(step.image || '')}">
        <div class="row">
          <strong>Step ${index + 1}</strong>
          <div class="row">
            <button class="pill-btn move-up" type="button">↑</button>
            <button class="pill-btn move-down" type="button">↓</button>
            <button class="pill-btn remove-row" type="button">删除</button>
          </div>
        </div>
        <textarea class="textarea step-text" placeholder="写下这一步怎么做">${escapeHtml(step.text || '')}</textarea>
        ${step.image ? `<img class="step-preview" src="${step.image}" alt="" />` : '<div class="muted">还没有步骤图片</div>'}
        <input type="file" accept="image/*" class="input step-image" />
        <button class="pill-btn remove-step-image" type="button">删除图片</button>
      </div>
    `).join('');
  }

  function bindEditorButtons() {
    document.querySelectorAll('[data-add]').forEach((button) => {
      button.onclick = () => {
        $(`#${button.dataset.add}Rows`).insertAdjacentHTML('beforeend', renderItemRow(button.dataset.add, ''));
        draftDirty = true;
        bindEditorButtons();
      };
    });
    $('#addStepBtn') && ($('#addStepBtn').onclick = () => {
      $('#stepRows').insertAdjacentHTML('beforeend', renderStepEditorRows([{ text: '', image: '' }]));
      renumberSteps();
      draftDirty = true;
      bindEditorButtons();
    });
    document.querySelectorAll('.remove-row').forEach((button) => {
      button.onclick = () => {
        const row = button.closest('.item-row, .step-row');
        const parent = row.parentElement;
        row.remove();
        if (!parent.children.length && parent.id !== 'stepRows') parent.insertAdjacentHTML('beforeend', renderItemRow(parent.id.replace('Rows', ''), ''));
        renumberSteps();
        draftDirty = true;
        bindEditorButtons();
      };
    });
    document.querySelectorAll('.move-up, .move-down').forEach((button) => {
      button.onclick = () => {
        const row = button.closest('.item-row, .step-row');
        if (button.classList.contains('move-up') && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
        if (button.classList.contains('move-down') && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
        renumberSteps();
        draftDirty = true;
      };
    });
    document.querySelectorAll('.remove-step-image').forEach((button) => {
      button.onclick = () => {
        const row = button.closest('.step-row');
        row.dataset.existingImage = '';
        row.querySelector('.step-preview')?.remove();
        if (!row.querySelector('.muted')) row.querySelector('.step-text').insertAdjacentHTML('afterend', '<div class="muted">还没有步骤图片</div>');
        draftDirty = true;
      };
    });
  }

  function renumberSteps() {
    document.querySelectorAll('.step-row strong').forEach((item, index) => item.textContent = `Step ${index + 1}`);
  }

  async function saveRecipe(recipe) {
    const name = $('#name').value.trim();
    const durationMinutes = Number($('#duration').value);
    if (!name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return alert('名称和时间必须有效');
    const coverImage = await fileToDataUrl($('#cover').files[0]) || recipe?.coverImage || '';
    const next = {
      id: recipe?.id || id('recipe'),
      name,
      coverImage,
      durationMinutes,
      ingredients: collectItems('ingredients'),
      tools: collectItems('tools'),
      steps: await collectSteps(),
      listIds: recipe?.listIds || [],
      createdAt: recipe?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.recipes = recipe ? state.recipes.map((item) => item.id === recipe.id ? next : item) : [next, ...state.recipes];
    saveState();
    go({ name: 'detail', recipeId: next.id });
  }

  function collectItems(key) {
    return Array.from(document.querySelectorAll(`#${key}Rows .item-text`)).map((input) => input.value.trim()).filter(Boolean);
  }

  async function collectSteps() {
    const rows = Array.from(document.querySelectorAll('.step-row'));
    const steps = await Promise.all(rows.map(async (row) => {
      const text = row.querySelector('.step-text').value.trim();
      const image = await fileToDataUrl(row.querySelector('.step-image').files[0]) || row.dataset.existingImage || '';
      return text ? { id: row.dataset.id || id('step'), text, image } : null;
    }));
    return steps.filter(Boolean);
  }

  function renderLists() {
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar"><button class="pill-btn" id="homeBtn">Home</button><h1 class="title">Lists</h1></div>
        <div class="search-row"><input id="listName" class="input" placeholder="新 List 名称" /><button class="icon-btn" id="addListBtn">＋</button></div>
        <div>${state.lists.map((list) => `<div class="list-item row"><span>${escapeHtml(list.name)}</span><button class="pill-btn" data-open="${list.id}">打开</button></div>`).join('') || '<div class="empty">还没有 List</div>'}</div>
      </main>
    `;
    $('#homeBtn').onclick = () => go({ name: 'home' });
    $('#addListBtn').onclick = createList;
    document.querySelectorAll('[data-open]').forEach((button) => button.onclick = () => go({ name: 'list', listId: button.dataset.open }));
  }

  function createList() {
    const name = $('#listName').value.trim();
    if (!name) return alert('List 名称不能为空');
    if (state.lists.some((list) => list.name.toLowerCase() === name.toLowerCase())) return alert('List 已存在');
    state.lists.push({ id: id('list'), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    saveState();
    renderLists();
  }

  function openListMenu(listId) {
    const list = listById(listId);
    $('#sheetHost').innerHTML = `
      <div class="sheet">
        <h2>${escapeHtml(list.name)}</h2>
        <button class="primary-btn full" id="manageListBtn">管理</button>
        <button class="pill-btn full" id="renameListBtn">重命名 List</button>
        <button class="danger-btn full" id="deleteListBtn">删除 List</button>
        <button class="pill-btn full" id="closeListMenuBtn">取消</button>
      </div>
    `;
    $('#manageListBtn').onclick = () => go({ name: 'manageList', listId });
    $('#renameListBtn').onclick = () => renameList(listId);
    $('#deleteListBtn').onclick = () => deleteList(listId);
    $('#closeListMenuBtn').onclick = () => $('#sheetHost').innerHTML = '';
  }

  function renameList(listId) {
    const list = listById(listId);
    const name = prompt('输入新的 List 名称', list.name)?.trim();
    if (!name) return;
    if (state.lists.some((item) => item.id !== listId && item.name.toLowerCase() === name.toLowerCase())) return alert('List 已存在');
    list.name = name;
    list.updatedAt = new Date().toISOString();
    saveState();
    go({ name: 'list', listId });
  }

  function deleteList(listId) {
    const list = listById(listId);
    if (!confirm(`删除“${list.name}”？删除 List 不会删除其中的菜谱。`)) return;
    state.lists = state.lists.filter((item) => item.id !== listId);
    state.recipes.forEach((recipe) => recipe.listIds = recipe.listIds.filter((id) => id !== listId));
    saveState();
    go({ name: 'lists' });
  }

  function renderListManager(listId) {
    const list = listById(listId);
    const recipes = filteredRecipes(listId);
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar"><button class="pill-btn" id="cancelManageBtn">取消管理</button><h1 class="title">${escapeHtml(list.name)}</h1></div>
        <div class="row"><span id="selectedCount">已选择 0 项</span><button class="pill-btn" id="selectAllBtn">全选</button></div>
        <div>${recipes.map((recipe) => `<label class="list-item row"><span>${escapeHtml(recipe.name)}</span><input type="checkbox" class="manage-check" value="${recipe.id}" /></label>`).join('') || '<div class="empty">这个 List 还没有菜谱</div>'}</div>
        <button class="danger-btn full" id="removeFromListBtn">从此 List 移除</button>
      </main>
    `;
    $('#cancelManageBtn').onclick = () => go({ name: 'list', listId });
    $('#selectAllBtn').onclick = () => {
      const checks = Array.from(document.querySelectorAll('.manage-check'));
      const all = checks.every((check) => check.checked);
      checks.forEach((check) => check.checked = !all);
      updateSelectedCount();
    };
    document.querySelectorAll('.manage-check').forEach((check) => check.onchange = updateSelectedCount);
    $('#removeFromListBtn').onclick = () => {
      const ids = Array.from(document.querySelectorAll('.manage-check:checked')).map((check) => check.value);
      if (!ids.length) return alert('请选择要移除的菜谱');
      if (!confirm(`从“${list.name}”移除 ${ids.length} 个菜谱？菜谱本身不会被删除。`)) return;
      state.recipes.forEach((recipe) => {
        if (ids.includes(recipe.id)) recipe.listIds = recipe.listIds.filter((id) => id !== listId);
      });
      saveState();
      go({ name: 'list', listId });
    };
  }

  function updateSelectedCount() {
    $('#selectedCount').textContent = `已选择 ${document.querySelectorAll('.manage-check:checked').length} 项`;
  }

  function renderListSelector(recipeId, backRoute) {
    const recipe = recipeById(recipeId);
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar"><button class="pill-btn" id="cancelBtn">取消</button><h1 class="title">加入 List</h1></div>
        <div>${state.lists.map((list) => `
          <label class="list-item row">
            <span>${escapeHtml(list.name)}</span>
            <input type="checkbox" class="list-check" value="${list.id}" ${recipe.listIds.includes(list.id) ? 'checked' : ''} />
          </label>
        `).join('') || '<div class="empty">还没有 List</div>'}</div>
        <button class="primary-btn full" id="confirmListBtn">确定</button>
      </main>
    `;
    $('#cancelBtn').onclick = () => go(backRoute || { name: 'detail', recipeId });
    $('#confirmListBtn').onclick = () => {
      recipe.listIds = Array.from(document.querySelectorAll('.list-check:checked')).map((check) => check.value);
      recipe.updatedAt = new Date().toISOString();
      saveState();
      go(backRoute || { name: 'detail', recipeId });
    };
  }

  function renderSettings() {
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar"><button class="pill-btn" id="homeBtn">Home</button><h1 class="title">Settings</h1></div>
        <div class="section">
          <button class="primary-btn" id="exportBtn">导出备份</button>
          <input id="importFile" type="file" accept="application/json" class="input" />
          <button class="pill-btn" id="importBtn">导入备份</button>
        </div>
      </main>
    `;
    $('#homeBtn').onclick = () => go({ name: 'home' });
    $('#exportBtn').onclick = exportBackup;
    $('#importBtn').onclick = importBackup;
  }

  function exportBackup() {
    try {
      const blob = new Blob([JSON.stringify({ backupVersion: 1, state }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yummy-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('导出备份失败');
    }
  }

  async function importBackup() {
    try {
      const file = $('#importFile').files[0];
      if (!file) return alert('请选择备份文件');
      const backup = JSON.parse(await file.text());
      if (backup.backupVersion !== 1 || !backup.state || !Array.isArray(backup.state.recipes) || !Array.isArray(backup.state.lists)) return alert('备份文件无效');
      if (!confirm('导入备份将替换当前 Yummy 数据。是否继续？')) return;
      state = normalizeState(backup.state);
      saveState();
      go({ name: 'home' });
    } catch {
      alert('导入备份失败，请检查文件是否损坏');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  render();
})();
