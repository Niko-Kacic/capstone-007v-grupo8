export function normalizePath(path) {
  return String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

export function flattenExpectedTree(nodes, parentPath = '') {
  return nodes.flatMap((node) => {
    const path = normalizePath(parentPath ? `${parentPath}/${node.path}` : node.path);
    const entry = {
      path,
      type: node.type,
      required: node.required !== false,
      gitkeepForEmptyDirectory: Boolean(node.gitkeepForEmptyDirectory)
    };
    const children = Array.isArray(node.children)
      ? flattenExpectedTree(node.children, path)
      : [];

    return [entry, ...children];
  });
}

export function auditRepository(expectedEntries, actualEntries, options = {}) {
  const normalizedExpected = expectedEntries.map(normalizeEntry);
  const normalizedActual = actualEntries.map(normalizeEntry);
  const expectedPathMap = new Map(normalizedExpected.map((entry) => [entry.path, entry]));
  const actualPathMap = new Map(normalizedActual.map((entry) => [entry.path, entry]));
  const actualPaths = new Set(normalizedActual.map((entry) => entry.path));
  const allowedExtraUnder = (options.allowedExtraUnder ?? []).map(normalizePath);

  const correct = [];
  const missing = [];
  const typeMismatches = [];

  for (const expected of normalizedExpected) {
    const actual = actualPathMap.get(expected.path);

    if (actual) {
      if (actual.type === expected.type) {
        correct.push(expected);
      } else {
        typeMismatches.push({ expected, actual });
      }
      continue;
    }

    if (isSatisfiedByDirectoryContent(expected, actualPaths, normalizedExpected)) {
      correct.push(expected);
      continue;
    }

    if (expected.required) {
      missing.push(expected);
    }
  }

  const extra = normalizedActual.filter((entry) => {
    if (expectedPathMap.has(entry.path)) {
      return false;
    }

    return !allowedExtraUnder.some((allowedPath) => {
      return entry.path === allowedPath || entry.path.startsWith(`${allowedPath}/`);
    });
  });

  const expectedRequiredCount = normalizedExpected.filter((entry) => entry.required).length;
  const compliance = expectedRequiredCount === 0
    ? 100
    : Math.round((correct.length / expectedRequiredCount) * 100);

  return {
    summary: {
      expected: expectedRequiredCount,
      correct: correct.length,
      missing: missing.length,
      typeMismatches: typeMismatches.length,
      extra: extra.length,
      compliance: Math.max(0, Math.min(100, compliance))
    },
    correct,
    missing,
    typeMismatches,
    extra
  };
}

function normalizeEntry(entry) {
  return {
    ...entry,
    path: normalizePath(entry.path),
    type: entry.type === 'tree' ? 'directory' : entry.type,
    required: entry.required !== false,
    gitkeepForEmptyDirectory: Boolean(entry.gitkeepForEmptyDirectory)
  };
}

function isSatisfiedByDirectoryContent(expected, actualPaths, expectedEntries) {
  if (expected.type === 'directory') {
    return hasDescendant(actualPaths, expected.path);
  }

  if (!expected.gitkeepForEmptyDirectory) {
    return false;
  }

  const directoryPath = expected.path.replace(/\/\.gitkeep$/, '');
  const expectedSiblingPaths = new Set(
    expectedEntries
      .filter((entry) => entry.path.startsWith(`${directoryPath}/`) && entry.path !== expected.path)
      .map((entry) => entry.path)
  );

  return [...actualPaths].some((path) => {
    return path.startsWith(`${directoryPath}/`) && !expectedSiblingPaths.has(path);
  });
}

function hasDescendant(paths, directoryPath) {
  return [...paths].some((path) => path.startsWith(`${directoryPath}/`));
}
