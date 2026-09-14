import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRepository,
  flattenExpectedTree,
  normalizePath
} from './auditor.mjs';

const expectedTree = [
  {
    path: 'Fase 1',
    type: 'directory',
    children: [
      {
        path: 'Evidencias Grupales',
        type: 'directory',
        children: [
          {
            path: 'Presentación idea de proyecto.pptx',
            type: 'file'
          }
        ]
      }
    ]
  },
  {
    path: 'README.md',
    type: 'file'
  },
  {
    path: 'index.html',
    type: 'file'
  }
];

test('normalizePath keeps evidence names and normalizes separators', () => {
  assert.equal(
    normalizePath(' Fase 1\\Evidencias Grupales\\Presentación idea de proyecto.pptx '),
    'Fase 1/Evidencias Grupales/Presentación idea de proyecto.pptx'
  );
});

test('flattenExpectedTree preserves ordered full paths', () => {
  const entries = flattenExpectedTree(expectedTree);

  assert.deepEqual(
    entries.map((entry) => entry.path),
    [
      'Fase 1',
      'Fase 1/Evidencias Grupales',
      'Fase 1/Evidencias Grupales/Presentación idea de proyecto.pptx',
      'README.md',
      'index.html'
    ]
  );
});

test('auditRepository reports a complete repository', () => {
  const expected = flattenExpectedTree(expectedTree);
  const actual = expected.map(({ path, type }) => ({ path, type }));

  const report = auditRepository(expected, actual);

  assert.equal(report.summary.missing, 0);
  assert.equal(report.summary.extra, 0);
  assert.equal(report.summary.correct, expected.length);
  assert.equal(report.summary.compliance, 100);
});

test('auditRepository reports entries outside the base structure', () => {
  const expected = flattenExpectedTree(expectedTree);
  const actual = [
    ...expected.map(({ path, type }) => ({ path, type })),
    { path: 'assets', type: 'directory' },
    { path: 'package.json', type: 'file' }
  ];

  const report = auditRepository(expected, actual);

  assert.deepEqual(
    report.extra.map((entry) => entry.path),
    ['assets', 'package.json']
  );
});

test('auditRepository accepts an empty tracked folder when it contains project files', () => {
  const expected = flattenExpectedTree([
    {
      path: 'Fase 2',
      type: 'directory',
      children: [
        {
          path: 'Evidencias de sistema',
          type: 'directory',
          children: [
            {
              path: '.gitkeep',
              type: 'file',
              gitkeepForEmptyDirectory: true
            }
          ]
        }
      ]
    }
  ]);
  const actual = [
    { path: 'Fase 2', type: 'directory' },
    { path: 'Fase 2/Evidencias de sistema', type: 'directory' },
    { path: 'Fase 2/Evidencias de sistema/app.js', type: 'file' }
  ];

  const report = auditRepository(expected, actual);

  assert.equal(report.missing.some((entry) => entry.path.endsWith('.gitkeep')), false);
});
