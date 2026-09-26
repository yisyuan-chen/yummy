(function () {
  const STORAGE_KEY = 'yummy-pwa-v1';
  const $ = (selector) => document.querySelector(selector);

  let state = loadState();
  let route = { name: 'home' };

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { recipes: [], lists: [] };
    } catch {
      return { recipes: [], lists: [] };
    }
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

  function render() {
    if (route.name === 'editor') return renderEditor(route.recipeId);
    if (route.name === 'detail') return renderDetail(route.recipeId);
    if (route.name === 'lists') return renderLists();
    if (route.name === 'list') return renderHome(route.listId);
    if (route.name === 'settings') return renderSettings();
    return renderHome();
  }

  function recipeMatches(recipe, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return recipe.name.toLowerCase().includes(q) || recipe.ingredients.some((item) => item.toLowerCase().includes(q));
  }

  function filteredRecipes(listId) {
    const query = $('#search')?.value || '';
    const duration = $('#durationFilter')?.value || '';
    return state.recipes
      .filter((recipe) => !listId || recipe.listIds.includes(listId))
      .filter((recipe) => recipeMatches(recipe, query))
      .filter((recipe) => {
        if (!duration) return true;
        const minutes = recipe.durationMinutes;
        if (duration === 'lte10') return minutes <= 10;
        if (duration === 'gt10lte15') return minutes > 10 && minutes <= 15;
        if (duration === 'gt15lte30') return minutes > 15 && minutes <= 30;
        if (duration === 'gt30lt60') return minutes > 30 && minutes < 60;
        if (duration === 'gte60') return minutes >= 60;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function renderHome(listId) {
    const list = state.lists.find((item) => item.id === listId);
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <h1 class="title">${list ? escapeHtml(list.name) : 'Yummy'}</h1>
          <div class="row">
            <button class="pill-btn" id="listsBtn">Lists</button>
            <button class="pill-btn" id="settingsBtn">Settings</button>
          </div>
        </div>
        <div class="search-row">
          <input id="search" class="input" placeholder="搜索菜谱或食材" />
          <select id="durationFilter" class="select" aria-label="筛选">
            <option value="">筛选</option>
            <option value="lte10">≤10 分钟</option>
            <option value="gt10lte15">10 且 ≤15 分钟</option>
            <option value="gt15lte30">15 且 ≤30 分钟</option>
            <option value="gt30lt60">30 且 <60 分钟</option>
            <option value="gte60">≥60 分钟</option>
          </select>
        </div>
        <div id="recipes"></div>
        <button class="icon-btn fab" id="addBtn">＋</button>
      </main>
    `;
    $('#listsBtn').onclick = () => go({ name: 'lists' });
    $('#settingsBtn').onclick = () => go({ name: 'settings' });
    $('#addBtn').onclick = () => go({ name: 'editor' });
    $('#search').oninput = () => renderRecipeGrid(listId);
    $('#durationFilter').onchange = () => renderRecipeGrid(listId);
    renderRecipeGrid(listId);
  }

  function renderRecipeGrid(listId) {
    const recipes = filteredRecipes(listId);
    $('#recipes').innerHTML = recipes.length ? `
      <div class="grid">
        ${recipes.map((recipe) => `
          <article class="card" data-id="${recipe.id}">
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
    ` : `<div class="empty">${listId ? '这个 List 还没有菜谱' : '还没有菜谱'}</div>`;
    document.querySelectorAll('.card').forEach((card) => {
      card.onclick = () => go({ name: 'detail', recipeId: card.dataset.id });
    });
  }

  function renderDetail(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) return go({ name: 'home' });
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <button class="pill-btn" id="backBtn">返回</button>
          <button class="pill-btn" id="editBtn">编辑</button>
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
        <button class="danger-btn" id="deleteBtn">删除菜谱</button>
      </main>
    `;
    $('#backBtn').onclick = () => go({ name: 'home' });
    $('#editBtn').onclick = () => go({ name: 'editor', recipeId });
    $('#deleteBtn').onclick = () => {
      if (!confirm(`确定删除“${recipe.name}”吗？`)) return;
      state.recipes = state.recipes.filter((item) => item.id !== recipeId);
      saveState();
      go({ name: 'home' });
    };
  }

  function renderEditor(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    const steps = recipe?.steps?.length ? recipe.steps : [{ text: '', image: '' }];
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar">
          <button class="pill-btn" id="cancelBtn">取消</button>
          <button class="primary-btn" id="saveBtn">保存</button>
        </div>
        <div class="section">
          <label class="label">成品图</label>
          <input id="cover" type="file" accept="image/*" class="input" />
          <label class="label">名称</label>
          <input id="name" class="input" value="${escapeAttr(recipe?.name || '')}" placeholder="奶油蘑菇鸡" />
          <label class="label">所需时间</label>
          <input id="duration" class="input" type="number" value="${recipe?.durationMinutes || ''}" placeholder="25" />
          <label class="label">食材，每行一个</label>
          <textarea id="ingredients" class="textarea">${escapeHtml((recipe?.ingredients || []).join('\n'))}</textarea>
          <label class="label">工具，每行一个</label>
          <textarea id="tools" class="textarea">${escapeHtml((recipe?.tools || []).join('\n'))}</textarea>
          <div class="row">
            <label class="label">制作流程</label>
            <button class="pill-btn" id="addStepBtn" type="button">添加 Step</button>
          </div>
          <div id="stepRows">${renderStepEditorRows(steps)}</div>
        </div>
      </main>
    `;
    $('#cancelBtn').onclick = () => go(recipeId ? { name: 'detail', recipeId } : { name: 'home' });
    $('#addStepBtn').onclick = () => {
      $('#stepRows').insertAdjacentHTML('beforeend', renderStepEditorRows([{ text: '', image: '' }], document.querySelectorAll('.step-row').length));
      bindStepButtons();
    };
    bindStepButtons();
    $('#saveBtn').onclick = async () => {
      const name = $('#name').value.trim();
      const durationMinutes = Number($('#duration').value);
      if (!name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        alert('名称和时间必须有效');
        return;
      }
      const coverImage = await fileToDataUrl($('#cover').files[0]) || recipe?.coverImage || '';
      const next = {
        id: recipe?.id || id('recipe'),
        name,
        coverImage,
        durationMinutes,
        ingredients: lines($('#ingredients').value),
        tools: lines($('#tools').value),
        steps: await collectEditorSteps(),
        listIds: recipe?.listIds || [],
        createdAt: recipe?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.recipes = recipe ? state.recipes.map((item) => item.id === recipe.id ? next : item) : [next, ...state.recipes];
      saveState();
      go({ name: 'detail', recipeId: next.id });
    };
  }

  function renderStepEditorRows(steps, offset = 0) {
    return steps.map((step, index) => {
      const number = offset + index + 1;
      return `
        <div class="step-row list-item" data-existing-image="${escapeAttr(step.image || '')}">
          <div class="row">
            <strong>Step ${number}</strong>
            <button class="pill-btn remove-step-image" type="button">删除图片</button>
          </div>
          <textarea class="textarea step-text" placeholder="写下这一步怎么做">${escapeHtml(step.text || '')}</textarea>
          ${step.image ? `<img class="step-preview" src="${step.image}" alt="" />` : '<div class="muted">还没有步骤图片</div>'}
          <input type="file" accept="image/*" class="input step-image" />
        </div>
      `;
    }).join('');
  }

  function bindStepButtons() {
    document.querySelectorAll('.remove-step-image').forEach((button) => {
      button.onclick = () => {
        const row = button.closest('.step-row');
        row.dataset.existingImage = '';
        row.querySelector('.step-preview')?.remove();
        if (!row.querySelector('.muted')) {
          row.querySelector('.step-text').insertAdjacentHTML('afterend', '<div class="muted">还没有步骤图片</div>');
        }
      };
    });
  }

  async function collectEditorSteps() {
    const rows = Array.from(document.querySelectorAll('.step-row'));
    const steps = await Promise.all(rows.map(async (row) => {
      const text = row.querySelector('.step-text').value.trim();
      const image = await fileToDataUrl(row.querySelector('.step-image').files[0]) || row.dataset.existingImage || '';
      return text ? { text, image } : null;
    }));
    return steps.filter(Boolean);
  }

  function renderLists() {
    document.body.innerHTML = `
      <main class="screen">
        <div class="topbar"><button class="pill-btn" id="homeBtn">Home</button><h1 class="title">Lists</h1></div>
        <div class="search-row"><input id="listName" class="input" placeholder="新 List 名称" /><button class="icon-btn" id="addListBtn">＋</button></div>
        <div>${state.lists.map((list) => `<div class="list-item row"><span>${escapeHtml(list.name)}</span><button class="pill-btn" data-id="${list.id}">打开</button></div>`).join('') || '<div class="empty">还没有 List</div>'}</div>
      </main>
    `;
    $('#homeBtn').onclick = () => go({ name: 'home' });
    $('#addListBtn').onclick = () => {
      const name = $('#listName').value.trim();
      if (!name) return alert('List 名称不能为空');
      if (state.lists.some((list) => list.name.toLowerCase() === name.toLowerCase())) return alert('List 已存在');
      state.lists.push({ id: id('list'), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      saveState();
      renderLists();
    };
    document.querySelectorAll('[data-id]').forEach((button) => {
      button.onclick = () => go({ name: 'list', listId: button.dataset.id });
    });
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
    $('#exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify({ backupVersion: 1, state }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yummy-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
    $('#importBtn').onclick = async () => {
      const file = $('#importFile').files[0];
      if (!file) return alert('请选择备份文件');
      const backup = JSON.parse(await file.text());
      if (backup.backupVersion !== 1 || !backup.state) return alert('备份文件无效');
      if (!confirm('导入备份将替换当前 Yummy 数据。是否继续？')) return;
      state = backup.state;
      saveState();
      go({ name: 'home' });
    };
  }

  function lines(value) {
    return value.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  function go(nextRoute) {
    route = nextRoute;
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  render();
})();
