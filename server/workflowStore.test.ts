import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('publishing and restoring one Prompt Studio preserves other modules and their drafts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-studio-test-'));
  const previous = process.env.PLATFORM_DATA_DIR;
  process.env.PLATFORM_DATA_DIR = directory;
  try {
    const { workflowStore } = await import('./workflowStore.ts');
    const initial = await workflowStore.view();
    const asset = initial.draft.instructions.find(item => item.module === 'ASSET' && item.phase === 'EXTRACT')!;
    const driver = initial.draft.instructions.find(item => item.module === 'DRIVER' && item.phase === 'EXTRACT')!;
    const vendor = initial.draft.instructions.find(item => item.module === 'VENDOR' && item.phase === 'EXTRACT')!;
    await workflowStore.saveDraftInstruction({ ...asset, prompt: 'New asset reading instructions' });
    await workflowStore.saveDraftInstruction({ ...driver, prompt: 'New driver reading instructions' });
    await workflowStore.saveDraftInstruction({ ...vendor, prompt: 'Pending vendor draft' });

    await workflowStore.publishModule('ASSET');
    const afterAssetPublish = await workflowStore.view();
    const active = afterAssetPublish.history.find(item => item.version === afterAssetPublish.activeVersion)!;
    assert.equal(active.instructions.find(item => item.id === asset.id)?.prompt, 'New asset reading instructions');
    assert.equal(active.instructions.find(item => item.id === driver.id)?.prompt, 'New driver reading instructions');
    assert.equal(active.instructions.find(item => item.id === vendor.id)?.prompt, vendor.prompt);
    assert.equal(afterAssetPublish.draft.instructions.find(item => item.id === vendor.id)?.prompt, 'Pending vendor draft');

    await workflowStore.rollbackModule('ASSET', initial.activeVersion);
    const afterRestore = await workflowStore.view();
    const restored = afterRestore.history.find(item => item.version === afterRestore.activeVersion)!;
    assert.equal(restored.instructions.find(item => item.id === asset.id)?.prompt, asset.prompt);
    assert.equal(restored.instructions.find(item => item.id === driver.id)?.prompt, driver.prompt);
    assert.equal(afterRestore.draft.instructions.find(item => item.id === vendor.id)?.prompt, 'Pending vendor draft');

    const document = afterRestore.draft.documents.find(item => item.module === 'ASSET')!;
    await workflowStore.saveDraftDocument({ ...document, label: 'Updated asset evidence' });
    assert.equal((await workflowStore.view()).draft.documents.find(item => item.id === document.id)?.label, 'Updated asset evidence');
    await assert.rejects(() => workflowStore.saveDraftDocument({ ...document, id: 'another-id' }), /already exists/);

    const duplicate = { ...vendor, id: 'duplicate-scope', prompt: 'Conflicting vendor instructions' };
    await workflowStore.saveDraftInstruction(duplicate);
    await assert.rejects(() => workflowStore.publishModule('VENDOR'), /More than one active instruction/);
    await workflowStore.saveDraftInstruction({ ...duplicate, active: false });
    await workflowStore.publishModule('VENDOR');
    const afterVendorPublish = await workflowStore.view();
    assert.equal(afterVendorPublish.history.find(item => item.version === afterVendorPublish.activeVersion)?.instructions.find(item => item.id === vendor.id)?.prompt, 'Pending vendor draft');
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_DATA_DIR;
    else process.env.PLATFORM_DATA_DIR = previous;
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('workflow-studio-test-')) await fs.rm(directory, { recursive: true, force: true });
  }
});
