import {
  auditRepository,
  flattenExpectedTree,
  normalizePath
} from './auditor.mjs';

const form = document.querySelector('#audit-form');
const repoUrlInput = document.querySelector('#repo-url');
const submitButton = form.querySelector('button');
const message = document.querySelector('#message');
const report = document.querySelector('#report');

let expectedEntries = [];
let allowedExtraUnder = [];

init();

async function init() {
  try {
    const response = await fetch('index.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('No fue posible cargar index.json.');
    }

    const reference = await response.json();
    expectedEntries = flattenExpectedTree(reference.tree);
    allowedExtraUnder = reference.allowedExtraUnder ?? [];
  } catch (error) {
    showMessage(error.message, true);
    setFormDisabled(true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  report.hidden = true;
  report.innerHTML = '';
  showMessage('Revisando repositorio...');
  setFormDisabled(true);

  try {
    const repo = parseGitHubUrl(repoUrlInput.value);
    const actualEntries = await fetchRepositoryTree(repo);
    const audit = auditRepository(expectedEntries, actualEntries, { allowedExtraUnder });

    renderReport(audit, repo);
    showMessage('');
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setFormDisabled(false);
  }
});

function setFormDisabled(disabled) {
  repoUrlInput.disabled = disabled;
  submitButton.disabled = disabled;
}

function parseGitHubUrl(value) {
  let url;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Ingresa una URL valida de GitHub.');
  }

  if (url.hostname !== 'github.com') {
    throw new Error('La URL debe pertenecer a github.com.');
  }

  const [owner, name] = url.pathname.split('/').filter(Boolean);
  if (!owner || !name) {
    throw new Error('La URL debe incluir usuario u organizacion y nombre del repositorio.');
  }

  return {
    owner,
    name: name.replace(/\.git$/, '')
  };
}

async function fetchRepositoryTree(repo) {
  const repoResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`);

  if (!repoResponse.ok) {
    throwGitHubError(repoResponse);
  }

  const repoInfo = await repoResponse.json();
  const branch = repoInfo.default_branch;
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );

  if (!treeResponse.ok) {
    throwGitHubError(treeResponse);
  }

  const treeInfo = await treeResponse.json();
  if (treeInfo.truncated) {
    showMessage('GitHub entrego un arbol truncado; el reporte puede estar incompleto.');
  }

  return treeInfo.tree
    .filter((entry) => entry.type === 'tree' || entry.type === 'blob')
    .map((entry) => ({
      path: normalizePath(entry.path),
      type: entry.type === 'tree' ? 'directory' : 'file'
    }));
}

function throwGitHubError(response) {
  if (response.status === 404) {
    throw new Error('No se encontro el repositorio o no es publico.');
  }

  if (response.status === 403) {
    throw new Error('GitHub rechazo la solicitud. Puede ser limite de API.');
  }

  throw new Error(`GitHub respondio con estado ${response.status}.`);
}

function renderReport(audit, repo) {
  const { summary } = audit;
  const state = summary.missing === 0 && summary.typeMismatches === 0 && summary.extra === 0
    ? 'Cumple'
    : 'Requiere cambios';

  report.hidden = false;
  report.innerHTML = `
    <header class="report-header">
      <p>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</p>
      <strong>${state}</strong>
    </header>
    <div class="summary">
      <span><b>${summary.compliance}%</b> cumplimiento</span>
      <span><b>${summary.missing}</b> faltantes</span>
      <span><b>${summary.extra}</b> extras</span>
      <span><b>${summary.typeMismatches}</b> tipos incorrectos</span>
    </div>
    ${renderList('Faltantes', audit.missing, 'No hay elementos faltantes.')}
    ${renderList('Tipos incorrectos', audit.typeMismatches.map(({ expected, actual }) => ({
      path: `${expected.path} debe ser ${expected.type}, pero figura como ${actual.type}.`
    })), 'No hay tipos incorrectos.')}
    ${renderList('Fuera de estructura', audit.extra, 'No hay archivos o carpetas fuera de estructura.')}
  `;
}

function renderList(title, entries, emptyMessage) {
  const body = entries.length === 0
    ? `<p class="empty">${emptyMessage}</p>`
    : `<ul>${entries.map((entry) => `<li>${escapeHtml(entry.path)}</li>`).join('')}</ul>`;

  return `
    <section class="report-list">
      <h2>${title}</h2>
      ${body}
    </section>
  `;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? 'message error' : 'message';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
